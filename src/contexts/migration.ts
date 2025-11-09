import type {
  Column,
  ColumnParams,
  Config,
  MigrationEntry,
  QueryValue,
  Step,
} from "../types.js";
import { wrapColumn, wrapValue } from "../utils.js";

interface DialectCapabilities {
  canDropColumn: boolean;
  canRenameColumn: boolean;
  canRenameTable: boolean;
}

interface TableState {
  name: string;
  columns: Record<string, Column>;
  params: Record<string, ColumnParams>;
  renameMappings?: Record<string, string>;
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
  | {
      type: "dropColumn";
      columnName: string;
      column: Column;
    }
  | { type: "renameColumn"; oldName: string; newName: string };

export class MigrationContext {
  private migrations: Step[][] = [];
  private tables: Record<string, TableState> = {};
  private currentMigration: Step[] | null = null;
  private pendingTableActions: Map<string, TableAction[]> = new Map();

  constructor(private config: Config) {}

  private log(...args: unknown[]): void {
    if (this.config?.silent) return;
    console.log("[migratta]", ...args);
  }

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
      const parts = (version || "3.0.0").split(".").map((v) => Number(v) || 0);
      const [major = 3, minor = 0] = parts;

      return {
        canDropColumn: major > 3 || (major === 3 && minor >= 35), // SQLite 3.35.0+
        canRenameColumn: major > 3 || (major === 3 && minor >= 25), // SQLite 3.25.0+
        canRenameTable: major > 3 || (major === 3 && minor >= 25), // SQLite 3.25.0+
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

    for (const [tableName, actions] of Array.from(
      this.pendingTableActions.entries(),
    )) {
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
    let requires = false;
    for (const action of actions) {
      switch (action.type) {
        case "create":
          break;
        case "drop":
          break;
        case "dropColumn":
          if (!capabilities.canDropColumn) requires = true;
          else if (
            action.column.type === "ID" ||
            action.column.type === "FOREIGN" ||
            action.column.primaryKey
          )
            requires = true;
          break;
        case "renameColumn":
          if (!capabilities.canRenameColumn) requires = true;
          break;
        case "rename":
          if (!capabilities.canRenameTable) requires = true;
          break;
        case "addColumn":
          if (
            action.column.type === "ID" ||
            action.column.primaryKey ||
            action.params?.fillFrom != null
          ) {
            requires = true;
          }
          break;
        case "changeColumn":
          // column changes always need recreation in SQLite
          requires = true;
          break;
      }
      if (requires) break;
    }
    return requires;
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
        } else {
          throw new Error(
            `Dialect does not support DROP COLUMN for table "${tableName}".`,
          );
        }
        break;
      case "renameColumn":
        if (capabilities.canRenameColumn) {
          this.renameColumn(tableName, action.oldName, action.newName);
        } else {
          throw new Error(
            `Dialect does not support RENAME COLUMN for table "${tableName}".`,
          );
        }
        break;
    }
  }

  private recreateTableWithActions(
    tableName: string,
    actions: TableAction[],
  ): void {
    const original = this.tables[tableName] ?? {
      name: tableName,
      columns: {},
      params: {},
    };

    const workingState: TableState = {
      name: original.name,
      columns: { ...original.columns },
      params: { ...original.params },
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
      const column = workingState.columns[columnName];
      const params = workingState.params[columnName] ?? {};

      // save for possible option for flushing existing ids when recreating a table
      // if (column?.type === "ID") {
      //   continue;
      // }

      recreatedColumnCurrent.push(`"${columnName}"`);

      const previous = params.fillFrom ?? columnName;
      recreatedColumnPrevious.push(
        params.coalesce != null
          ? `COALESCE("${previous}", ${wrapValue(params.coalesce)})`
          : workingState.renameMappings?.[columnName] != null
            ? `${wrapColumn(workingState.renameMappings?.[columnName])} AS ${wrapColumn(columnName)}`
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
        if (!state.columns[action.oldName]) {
          // silently skip if old column missing to avoid crashing
          return;
        }
        state.columns[action.newName] = state.columns[action.oldName];
        delete state.columns[action.oldName];
        if (state.params[action.oldName]) {
          state.params[action.newName] = state.params[action.oldName];
          delete state.params[action.oldName];
        }
        if (state.renameMappings == null) {
          state.renameMappings = {};
        }
        state.renameMappings[action.newName] = action.oldName;
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
      throw new Error(`Table "${name}" exists`);
    }

    this.tables[name] = {
      name,
      columns: { ...columns },
      params: {},
    };

    this.addSql(this.getTableCreationSqlQuery(name, columns));
  }

  private dropTable(name: string): void {
    if (!this.tables[name]) {
      this.addSql(`DROP TABLE IF EXISTS "${name}";`);
      delete this.tables[name];
      return;
    }

    delete this.tables[name];
    this.addSql(`DROP TABLE "${name}";`);
  }

  private renameTable(oldName: string, newName: string): void {
    if (!this.tables[oldName]) {
      throw new Error(
        `Table "${oldName}" does not exist and cannot be renamed.`,
      );
    }

    const state = this.tables[oldName];
    this.tables[newName] = { ...state, name: newName };
    delete this.tables[oldName];

    if (this.pendingTableActions.has(oldName)) {
      const actions = this.pendingTableActions.get(oldName);
      if (actions != null) {
        this.pendingTableActions.delete(oldName);
        this.pendingTableActions.set(newName, actions);
      }
    }

    for (const [tblName, tblState] of Object.entries(this.tables)) {
      for (const [colName, col] of Object.entries(tblState.columns)) {
        if (col.type === "FOREIGN" && col.table === oldName) {
          col.table = newName;
        }
      }
    }

    this.addSql(`ALTER TABLE "${oldName}" RENAME TO "${newName}";`);
  }

  private addColumn(
    tableName: string,
    columnName: string,
    column: Column,
    params?: ColumnParams,
  ): void {
    const table = this.tables[tableName];
    if (!table) {
      throw new Error(
        `Table "${tableName}" does not exist. Cannot add column "${columnName}".`,
      );
    }

    table.columns[columnName] = column;
    if (params) {
      table.params[columnName] = params;
    }

    this.addSql(
      `ALTER TABLE "${tableName}" ADD COLUMN ${this.getColumnQueryPart(
        columnName,
        column,
      )};`,
    );
  }

  private dropColumn(tableName: string, columnName: string): void {
    const table = this.tables[tableName];
    if (!table) {
      throw new Error(
        `Table "${tableName}" does not exist. Cannot drop column "${columnName}".`,
      );
    }

    delete table.columns[columnName];
    delete table.params[columnName];
    this.addSql(`ALTER TABLE "${tableName}" DROP COLUMN "${columnName}";`);
  }

  private renameColumn(
    tableName: string,
    oldName: string,
    newName: string,
  ): void {
    const table = this.tables[tableName];
    if (!table) {
      throw new Error(
        `Table "${tableName}" does not exist. Cannot rename column "${oldName}".`,
      );
    }

    if (!table.columns[oldName]) {
      throw new Error(
        `Column "${oldName}" does not exist on table "${tableName}".`,
      );
    }

    table.columns[newName] = table.columns[oldName];
    delete table.columns[oldName];

    if (table.params?.[oldName]) {
      table.params[newName] = table.params[oldName];
      delete table.params[oldName];
    }

    this.addSql(
      `ALTER TABLE "${tableName}" RENAME COLUMN "${oldName}" TO "${newName}";`,
    );
  }

  private addSql(query: string, values?: QueryValue[]): void {
    if (!this.currentMigration) {
      throw new Error("No active migration. Call .migrate() first.");
    }
    this.currentMigration.push({ query, values });
  }

  addCustomSql(query: string, values?: QueryValue[]): void {
    if (!this.currentMigration) {
      throw new Error("No active migration. Call .migrate() first.");
    }
    this.flushPendingActions();
    this.currentMigration.push({ query, values });
  }

  addScript(callback: () => void): void {
    if (!this.currentMigration) {
      throw new Error("No active migration. Call .migrate() first.");
    }
    this.flushPendingActions();
    this.currentMigration.push({ callback });
  }

  addAsyncScript(callbackPromise: () => Promise<void>): void {
    if (!this.currentMigration) {
      throw new Error("No active migration. Call .migrate() first.");
    }
    this.flushPendingActions();
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
      columnQuery.push(String(column.type).toUpperCase());

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
      this.log("no migrations found");
      return [];
    }

    if (latestMigration?.id != null) {
      this.log(
        `last database migration: ${new Date(
          latestMigration.timestamp * 1000,
        ).toISOString()} (r${latestMigration.id}, v${latestMigration.version})`,
      );
    } else {
      this.log("migration history is empty");
    }

    if (latest != null && latest === target) {
      this.log("database is up-to-date");
      return [];
    }

    const steps: Step[] = [];

    if (!this.config?.ignoreTransactionStatements) {
      steps.push({ query: "PRAGMA foreign_keys = OFF;" });
      steps.push({ query: "BEGIN TRANSACTION;" });
    }

    if (latest < target) {
      this.log(`target migration ID: ${target}`);
      for (let migrationId = latest + 1; migrationId <= target; migrationId++) {
        const idx = migrationId - offset;
        if (this.migrations[idx] != null) {
          steps.push(...this.migrations[idx]);
        }
      }
    }

    if (!this.config?.ignoreTransactionStatements) {
      steps.push({ query: "COMMIT TRANSACTION;" });
      steps.push({ query: "PRAGMA foreign_keys = ON;" });
    }

    this.log(`...${steps.length} step(s) have been generated`);

    return steps;
  }

  getTypescriptTypesFile(): string {
    this.flushPendingActions();

    let typescriptFileContents = "// Database types, generated by Migratta\n\n";

    for (const [tableName, table] of Object.entries(this.tables)) {
      const className = `${tableName.charAt(0).toUpperCase() + tableName.slice(1)}TableItem`;
      typescriptFileContents += `export interface ${className} {\n`;

      for (const [columnName, column] of Object.entries(table.columns)) {
        const optional = column.notNull || column.type === "ID" ? "" : "?";
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

        typescriptFileContents += `  ${columnName}${optional}: ${type};\n`;
      }

      typescriptFileContents += "}\n\n";
    }

    typescriptFileContents += "// EOF\n";

    return typescriptFileContents;
  }
}
