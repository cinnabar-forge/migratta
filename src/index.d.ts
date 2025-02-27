declare module "migratta" {
  export type Column = {
    type: "NULL" | "INTEGER" | "REAL" | "TEXT" | "BLOB" | "ID";
    primaryKey?: boolean;
    autoIncrement?: boolean;
    notNull?: boolean;
    unique?: boolean;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    default?: any;
  };
  export type ColumnAdditionParams = {
    fillFrom?: string;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    coalesce?: any;
  };
  export type LastMigration = {
    latest_revision: string;
    app_version: string;
    date_migrated: number;
  };
  // biome-ignore lint/suspicious/noExplicitAny: <explanation>
  export type Query = { query: string; args: any[] };
  export type MigrationBuilder = {
    resetContext: () => void;
    getSqlDialect: () => string;
    setSqlDialect: (value: string) => void;
    createMigration: () => void;
    // biome-ignore lint/suspicious/noExplicitAny: <explanation>
    addSql: (query: string, params?: any[]) => void;
    createTable: (name: string, columns: Record<string, Column>) => void;
    recreateTable: (name: string, columns?: Record<string, Column>) => void;
    removeTable: (name: string) => void;
    addTableColumn: (
      tableName: string,
      columnName: string,
      column: Column,
      params?: ColumnAdditionParams,
    ) => void;
    renameTableColumn: (
      tableName: string,
      columnName: string,
      newColumnName: string,
    ) => void;
    changeTableColumn: (
      tableName: string,
      columnName: string,
      column?: Column,
      params?: ColumnAdditionParams,
    ) => void;
    deleteTableColumn: (tableName: string, columnName: string) => void;
    getMigrationTableSqlCreateQuery: () => string;
    getMigrationRevisionSqlSelectQuery: () => string;
    getMigrationsSqlQueries: (latestMigration: LastMigration) => Query[];
    getTypescriptTypesFile: () => string;
  };

  export default function (appVersion: string): MigrationBuilder;
}
