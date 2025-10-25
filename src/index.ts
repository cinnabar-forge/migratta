import type {
  Args,
  Column,
  ColumnParams,
  ColumnType,
  LatestMigration,
  MigrationStep,
  Migratta,
  Settings,
  Table,
} from "./types";

const migrations: MigrationStep[][] = [];
const tables: Record<string, Table> = {};

let settings: Settings = {};

function setSettings(_settings?: Settings) {
  settings = _settings || {};
}

function resetContext(): void {
  migrations.length = 0;
  const props = Object.getOwnPropertyNames(tables);
  for (let i = 0; i < props.length; i++) {
    delete tables[props[i]];
  }
}

function createMigration(): void {
  migrations.push([
    {
      query: settings?.useOldMigrationTableQuery
        ? `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`
        : `INSERT INTO "migrations" ("id", "version", "timestamp") VALUES (?, ?, ?);`,
      args: [
        migrations.length + (settings?.firstMigrationId ?? 1),
        settings.appVersion || "-",
        Math.round(Date.now() / 1000),
      ],
    },
  ]);
}

function addSql(query: string, args?: Args[]): void {
  const currentMigration = migrations[migrations.length - 1];
  currentMigration.push({ query, args });
}

function addScript(callback: () => void): void {
  const currentMigration = migrations[migrations.length - 1];
  currentMigration.push({ callback });
}

function addAsyncScript(callbackPromise: () => Promise<void>): void {
  const currentMigration = migrations[migrations.length - 1];
  currentMigration.push({ callbackPromise });
}

function getColumnQueryPart(columnName: string, column: Column): string {
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

function getTableCreationSqlQuery(
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

    columnsQuery.push(getColumnQueryPart(columnName, column));
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

function createTable(name: string, columns: Record<string, Column>): void {
  if (tables[name] != null) {
    removeTable(name);
  }

  tables[name] = {
    columns: columns,
    params: {},
  };

  addSql(getTableCreationSqlQuery(name, columns));
}

function recreateTable(
  tableName: string,
  columns?: Record<string, Column> | null,
  fromId?: boolean,
): void {
  const newColumns = columns ?? tables[tableName].columns;
  const tempTableName = `${tableName}_tmp`;

  addSql(getTableCreationSqlQuery(tempTableName, newColumns));

  const recreatedColumnCurrent: string[] = [];
  const recreatedColumnPrevious: string[] = [];

  for (const columnName of Object.keys(newColumns)) {
    const column = tables[tableName].columns[columnName] ?? {};
    const params = tables[tableName].params[columnName] ?? {};

    if (fromId && column.type === "ID") {
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

  addSql(
    `INSERT INTO "${tempTableName}" (${recreatedColumnCurrent.join(
      ", ",
    )}) SELECT ${recreatedColumnPrevious.join(", ")} FROM "${tableName}";`,
  );

  addSql(`DROP TABLE "${tableName}";`);
  addSql(`ALTER TABLE "${tempTableName}" RENAME TO "${tableName}";`);
}

function renameTable(oldTableName: string, newTableName: string): void {
  addSql(`ALTER TABLE ${oldTableName} RENAME TO ${newTableName};";`);
}

function removeTable(tableName: string): void {
  delete tables[tableName];
  addSql(`DROP TABLE "${tableName}";`);
}

function addTableColumn(
  tableName: string,
  columnName: string,
  column: Column,
  params?: ColumnParams,
): void {
  tables[tableName].columns[columnName] = column;
  if (params != null) {
    tables[tableName].params[columnName] = params;
  }

  if (column.type === "ID" || column.primaryKey) {
    recreateTable(tableName, null, true);
  } else {
    const alterQuery = `ALTER TABLE "${tableName}" ADD COLUMN ${getColumnQueryPart(
      columnName,
      column,
    )};`;
    addSql(alterQuery);
  }
}

function renameTableColumn(
  tableName: string,
  columnName: string,
  newColumnName: string,
): void {
  tables[tableName].columns[newColumnName] =
    tables[tableName].columns[columnName];
  delete tables[tableName].columns[columnName];

  const query = `ALTER TABLE "${tableName}" RENAME COLUMN "${columnName}" TO "${newColumnName}";`;
  addSql(query);
}

function changeTableColumn(
  tableName: string,
  columnName: string,
  column?: Column,
  params?: ColumnParams,
): void {
  if (column != null) {
    tables[tableName].columns[columnName] = column;
  }
  if (params != null) {
    tables[tableName].params[columnName] = params;
  }
}

function deleteTableColumn(tableName: string, columnName: string): void {
  delete tables[tableName].columns[columnName];
}

function getMigrationTableSqlCreateQuery(): string {
  return `CREATE TABLE IF NOT EXISTS "migrations" ("id" INTEGER NOT NULL PRIMARY KEY, "version" TEXT NOT NULL, "timestamp" INTEGER NOT NULL);`;
}

function getLatestMigrationSqlSelectQuery(): string {
  return settings?.useOldMigrationTableQuery
    ? `SELECT MAX("revision") as "id", "app_version" AS "version", "date_migrated" AS "timestamp" FROM "migrations";`
    : `SELECT MAX("id") as "id", "version", "timestamp" FROM "migrations";`;
}

function getMigrationsSqlQueries(
  latestMigration?: LatestMigration,
): MigrationStep[] {
  const offset = settings?.firstMigrationId ?? 1;
  const target = migrations.length + offset - 1;

  const initial = -1 + offset;
  const latest = latestMigration?.id ?? initial;

  if (migrations.length === 0) {
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

  const queries: MigrationStep[] = [];

  if (!settings?.ignoreTransactionStatements) {
    queries.push({ query: "BEGIN TRANSACTION;" });
  }

  if (latest < target) {
    console.log(`[migratta] target migration ID: ${target}`);
    for (let migrationId = latest + 1; migrationId <= target; migrationId++) {
      if (migrations[migrationId - offset] != null) {
        queries.push(...migrations[migrationId - offset]);
      }
    }
  }

  if (!settings?.ignoreTransactionStatements) {
    queries.push({ query: "COMMIT TRANSACTION;" });
  }

  console.log(
    `[migratta] ...${queries.length} SQL query(ies) have been generated`,
  );

  return queries;
}

function getTypescriptTypesFile(): string {
  let typescriptFileContents = "// Database types, generated by Migratta\n\n";

  for (const [tableName, table] of Object.entries(tables)) {
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

function wrapValue(value: string | number): string | number {
  return typeof value === "string" ? `'${value}'` : value;
}

export default function (settings?: Settings): Migratta {
  setSettings(settings);
  resetContext();

  return {
    addAsyncScript,
    addScript,
    addSql,
    addTableColumn,
    changeTableColumn,
    createMigration,
    createTable,
    deleteTableColumn,
    getLatestMigrationSqlSelectQuery,
    getMigrationsSqlQueries,
    getMigrationTableSqlCreateQuery,
    getTypescriptTypesFile,
    recreateTable,
    removeTable,
    renameTable,
    renameTableColumn,
  };
}

export type {
  Args,
  Column,
  ColumnParams,
  ColumnType,
  LatestMigration,
  MigrationStep,
  Migratta,
  Settings,
  Table,
};
