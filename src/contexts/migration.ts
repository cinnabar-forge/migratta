import type {
  Column,
  ColumnParams,
  Config,
  MigrationEntry,
  QueryValue,
  Step,
} from "../types.js";
import { wrapValue } from "../utils.js";

interface DialectCapabilities {
  canDropColumn: boolean;
  canRenameColumn: boolean;
  canRenameTable: boolean;
}

interface TableState {
  name: string;
  columns: Record<string, Column>;
  params: Record<string, ColumnParams>;
}

type TableAction =
  | { type: "create"; columns: Record<string, Column> }
  | { type: "drop" }
  | { type: "rename"; newName: string }
  | {
      type: "addColumn";
      columnName: string;
      column: Column;
      params?: ColumnParams;
    }
  | {
      type: "changeColumn";
      columnName: string;
      column?: Column;
      params?: ColumnParams;
    }
  | { type: "dropColumn"; columnName: string }
  | { type: "renameColumn"; oldName: string; newName: string };

export class MigrationContext {
  private migrations: Step[][] = [];
  private tables: Record<string, TableState> = {};
  private currentMigration: Step[] | null = null;
  private pendingTableActions: Map<string, TableAction[]> = new Map();

  constructor(private config: Config) {}

  startMigration(): void {
    this.flushPendingActions();

    this.currentMigration = [
      {
        query: this.config?.useOldMigrationTableQuery
          ? `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`
          : `INSERT INTO "migrations" ("id", "version", "timestamp") VALUES (?, ?, ?);`,
        values: [
          this.migrations.length + (this.config?.firstMigrationId ?? 1),
          this.config.appVersion || "-",
          Math.round(Date.now() / 1000),
        ],
      },
    ];
    this.migrations.push(this.currentMigration);
  }

  addTableAction(tableName: string, action: TableAction): void {
    if (!this.pendingTableActions.has(tableName)) {
      this.pendingTableActions.set(tableName, []);
    }
    this.pendingTableActions.get(tableName)?.push(action);
  }

  private getDialectCapabilities(
    dialect: string,
    version: string,
  ): DialectCapabilities {
    if (dialect === "sqlite") {
      const [major, minor] = version.split(".").map(Number);

      return {
        canDropColumn: major === 3 && minor >= 35, // SQLite 3.35.0+
        canRenameColumn: major === 3 && minor >= 25, // SQLite 3.25.0+
        canRenameTable: major === 3 && minor >= 25, // SQLite 3.25.0+
      };
    }

    return {
      canDropColumn: false,
      canRenameColumn: false,
      canRenameTable: false,
    };
  }

  flushPendingActions(): void {
    if (this.pendingTableActions.size === 0) return;

    const capabilities = this.getDialectCapabilities(
      this.config.dialect || "sqlite",
      this.config.dialectVersion || "3.0.0",
    );

    for (const [tableName, actions] of this.pendingTableActions) {
      this.processPendingTableActions(tableName, actions, capabilities);
    }

    this.pendingTableActions.clear();
  }

  private processPendingTableActions(
    tableName: string,
    actions: TableAction[],
    capabilities: DialectCapabilities,
  ): void {
    const needsRecreation = this.needsTableRecreation(actions, capabilities);

    if (needsRecreation) {
      this.recreateTableWithActions(tableName, actions);
    } else {
      for (const action of actions) {
        this.processTableAction(tableName, action, capabilities);
      }
    }
  }

  private needsTableRecreation(
    actions: TableAction[],
    capabilities: DialectCapabilities,
  ): boolean {
    for (const action of actions) {
      switch (action.type) {
        case "create":
          return false; // CREATE TABLE doesn't need recreation
        case "drop":
          return false; // DROP TABLE doesn't need recreation
        case "dropColumn":
          if (!capabilities.canDropColumn) return true;
          break;
        case "renameColumn":
          if (!capabilities.canRenameColumn) return true;
          break;
        case "rename":
          if (!capabilities.canRenameTable) return true;
          break;
        case "addColumn":
          if (
            action.column.type === "ID" ||
            action.column.primaryKey ||
            action.params?.fillFrom != null
          ) {
            return true;
          }
          break;
        case "changeColumn":
          // column changes always need recreation in SQLite
          return true;
      }
    }
    return false;
  }

  private processTableAction(
    tableName: string,
    action: TableAction,
    capabilities: DialectCapabilities,
  ): void {
    switch (action.type) {
      case "create":
        this.createTable(tableName, action.columns);
        break;
      case "drop":
        this.dropTable(tableName);
        break;
      case "rename":
        this.renameTable(tableName, action.newName);
        break;
      case "addColumn":
        this.addColumn(
          tableName,
          action.columnName,
          action.column,
          action.params,
        );
        break;
      case "dropColumn":
        if (capabilities.canDropColumn) {
          this.dropColumn(tableName, action.columnName);
        }
        break;
      case "renameColumn":
        if (capabilities.canRenameColumn) {
          this.renameColumn(tableName, action.oldName, action.newName);
        }
        break;
    }
  }

  private recreateTableWithActions(
    tableName: string,
    actions: TableAction[],
  ): void {
    const workingState = {
      ...this.tables[tableName],
      columns: { ...this.tables[tableName].columns },
      params: { ...this.tables[tableName].params },
    };

    for (const action of actions) {
      this.applyActionToState(workingState, action);
    }

    const tempTableName = `${tableName}_tmp`;
    this.addSql(
      this.getTableCreationSqlQuery(tempTableName, workingState.columns),
    );

    const recreatedColumnCurrent: string[] = [];
    const recreatedColumnPrevious: string[] = [];

    for (const columnName of Object.keys(workingState.columns)) {
      const column = this.tables[tableName].columns[columnName];
      const params = workingState.params[columnName] ?? {};

      if (column?.type === "ID") {
        continue;
      }

      recreatedColumnCurrent.push(`"${columnName}"`);

      const previous = params.fillFrom ?? columnName;
      recreatedColumnPrevious.push(
        params.coalesce != null
          ? `COALESCE("${previous}", ${wrapValue(params.coalesce)})`
          : `"${previous}"`,
      );
    }

    this.addSql(
      `INSERT INTO "${tempTableName}" (${recreatedColumnCurrent.join(
        ", ",
      )}) SELECT ${recreatedColumnPrevious.join(", ")} FROM "${tableName}";`,
    );

    this.addSql(`DROP TABLE "${tableName}";`);
    this.addSql(`ALTER TABLE "${tempTableName}" RENAME TO "${tableName}";`);

    this.tables[tableName] = workingState;
  }

  private applyActionToState(state: TableState, action: TableAction): void {
    switch (action.type) {
      case "addColumn":
        state.columns[action.columnName] = action.column;
        if (action.params) {
          state.params[action.columnName] = action.params;
        }
        break;
      case "dropColumn":
        delete state.columns[action.columnName];
        delete state.params[action.columnName];
        break;
      case "renameColumn":
        state.columns[action.newName] = state.columns[action.oldName];
        delete state.columns[action.oldName];
        if (state.params[action.oldName]) {
          state.params[action.newName] = state.params[action.oldName];
          delete state.params[action.oldName];
        }
        break;
      case "changeColumn":
        if (action.column) {
          state.columns[action.columnName] = action.column;
        }
        if (action.params) {
          state.params[action.columnName] = action.params;
        }
        break;
    }
  }

  private createTable(name: string, columns: Record<string, Column>): void {
    if (this.tables[name] != null) {
      delete this.tables[name];
      this.addSql(`DROP TABLE IF EXISTS "${name}";`);
    }

    this.tables[name] = {
      name,
      columns: columns,
      params: {},
    };

    this.addSql(this.getTableCreationSqlQuery(name, columns));
  }

  private dropTable(name: string): void {
    delete this.tables[name];
    this.addSql(`DROP TABLE "${name}";`);
  }

  private renameTable(oldName: string, newName: string): void {
    this.tables[newName] = this.tables[oldName];
    this.tables[newName].name = newName;
    delete this.tables[oldName];
    this.addSql(`ALTER TABLE "${oldName}" RENAME TO "${newName}";`);
  }

  private addColumn(
    tableName: string,
    columnName: string,
    column: Column,
    params?: ColumnParams,
  ): void {
    this.tables[tableName].columns[columnName] = column;
    if (params) {
      this.tables[tableName].params[columnName] = params;
    }

    this.addSql(
      `ALTER TABLE "${tableName}" ADD COLUMN ${this.getColumnQueryPart(
        columnName,
        column,
      )};`,
    );
  }

  private dropColumn(tableName: string, columnName: string): void {
    delete this.tables[tableName].columns[columnName];
    delete this.tables[tableName].params[columnName];
    this.addSql(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}";`);
  }

  private renameColumn(
    tableName: string,
    oldName: string,
    newName: string,
  ): void {
    this.tables[tableName].columns[newName] =
      this.tables[tableName].columns[oldName];
    delete this.tables[tableName].columns[oldName];

    if (this.tables[tableName].params[oldName]) {
      this.tables[tableName].params[newName] =
        this.tables[tableName].params[oldName];
      delete this.tables[tableName].params[oldName];
    }

    this.addSql(
      `ALTER TABLE "${tableName}" RENAME COLUMN "${oldName}" TO "${newName}";`,
    );
  }

  addSql(query: string, values?: QueryValue[]): void {
    if (!this.currentMigration) {
      throw new Error("No active migration. Call .migration() first.");
    }
    this.currentMigration.push({ query, values });
  }

  addScript(callback: () => void): void {
    if (!this.currentMigration) {
      throw new Error("No active migration. Call .migration() first.");
    }
    this.currentMigration.push({ callback });
  }

  addAsyncScript(callbackPromise: () => Promise<void>): void {
    if (!this.currentMigration) {
      throw new Error("No active migration. Call .migration() first.");
    }
    this.currentMigration.push({ callbackPromise });
  }

  private getColumnQueryPart(columnName: string, column: Column): string {
    const columnQuery: string[] = [];
    columnQuery.push(`"${columnName}"`);

    if (column.type === "ID") {
      columnQuery.push("INTEGER PRIMARY KEY AUTOINCREMENT");
    } else if (column.type === "FOREIGN") {
      columnQuery.push("INTEGER");
    } else {
      columnQuery.push(column.type.toUpperCase());

      if (column.autoIncrement) {
        columnQuery.push("AUTOINCREMENT");
      }
      if (column.notNull) {
        columnQuery.push("NOT NULL");
      }
      if (column.default != null) {
        columnQuery.push(`DEFAULT ${wrapValue(column.default)}`);
      }
    }

    return columnQuery.join(" ");
  }

  private getTableCreationSqlQuery(
    name: string,
    columns: Record<string, Column>,
  ): string {
    const columnsQuery: string[] = [];
    const primaryKeys: string[] = [];
    const uniques: string[] = [];
    const foreigns: Array<{ column: string; table: string }> = [];

    for (const [columnName, column] of Object.entries(columns)) {
      if (column.type !== "ID" && column.primaryKey) {
        primaryKeys.push(`"${columnName}"`);
      }

      if (column.unique) {
        uniques.push(`"${columnName}"`);
      }

      if (column.type === "FOREIGN" && column.table) {
        foreigns.push({ column: columnName, table: column.table });
      }

      columnsQuery.push(this.getColumnQueryPart(columnName, column));
    }

    if (primaryKeys.length > 0) {
      columnsQuery.push(`PRIMARY KEY(${primaryKeys.join(", ")})`);
    }

    if (uniques.length > 0) {
      columnsQuery.push(`UNIQUE(${uniques.join(", ")})`);
    }

    if (foreigns.length > 0) {
      for (const foreign of foreigns) {
        columnsQuery.push(
          `FOREIGN KEY ("${foreign.column}") REFERENCES "${foreign.table}"("id")`,
        );
      }
    }

    return `CREATE TABLE "${name}" (${columnsQuery.join(", ")});`;
  }

  getMigrations(): Step[][] {
    this.flushPendingActions();
    return this.migrations;
  }

  getTables(): Record<string, TableState> {
    return this.tables;
  }

  getSteps(latestMigration?: MigrationEntry): Step[] {
    this.flushPendingActions();

    const offset = this.config?.firstMigrationId ?? 1;
    const target = this.migrations.length + offset - 1;
    const initial = -1 + offset;
    const latest = latestMigration?.id ?? initial;

    if (this.migrations.length === 0) {
      console.log("[migratta] no migrations found");
      return [];
    }

    if (latestMigration?.id != null) {
      console.log(
        `[migratta] last database migration: ${new Date(
          latestMigration.timestamp * 1000,
        ).toISOString()} (r${latestMigration.id}, v${latestMigration.version})`,
      );
    } else {
      console.log("[migratta] migration history is empty");
    }

    if (latest != null && latest === target) {
      console.log("[migratta] database is up-to-date");
      return [];
    }

    const steps: Step[] = [];

    steps.push({ query: "PRAGMA foreign_keys = OFF;" });

    if (!this.config?.ignoreTransactionStatements) {
      steps.push({ query: "BEGIN TRANSACTION;" });
    }

    if (latest < target) {
      console.log(`[migratta] target migration ID: ${target}`);
      for (let migrationId = latest + 1; migrationId <= target; migrationId++) {
        if (this.migrations[migrationId - offset] != null) {
          steps.push(...this.migrations[migrationId - offset]);
        }
      }
    }

    if (!this.config?.ignoreTransactionStatements) {
      steps.push({ query: "COMMIT TRANSACTION;" });
    }

    steps.push({ query: "PRAGMA foreign_keys = ON;" });

    console.log(`[migratta] ...${steps.length} step(s) have been generated`);

    return steps;
  }

  getTypescriptTypesFile(): string {
    this.flushPendingActions();

    let typescriptFileContents = "// Database types, generated by Migratta\n\n";

    for (const [tableName, table] of Object.entries(this.tables)) {
      const className = `${tableName.charAt(0).toUpperCase() + tableName.slice(1)}TableItem`;
      typescriptFileContents += `export class ${className} {\n`;

      for (const [columnName, column] of Object.entries(table.columns)) {
        const notNull = !column.notNull && column.type !== "ID" ? "?" : "";
        let type: string;
        switch (column.type) {
          case "ID":
          case "INTEGER":
          case "FOREIGN":
            type = "number";
            break;
          case "TEXT":
            type = "string";
            break;
          default:
            type = "unknown";
        }

        typescriptFileContents += `  ${columnName}${notNull}: ${type};\n`;
      }

      typescriptFileContents += "}\n\n";
    }

    typescriptFileContents += "// EOF\n";

    return typescriptFileContents;
  }
}
