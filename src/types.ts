export type ColumnType = "ID" | "INTEGER" | "TEXT" | "FOREIGN";

export type Args = string | number | boolean | null;

export interface Column {
  type: ColumnType;
  primaryKey?: boolean;
  autoIncrement?: boolean;
  notNull?: boolean;
  default?: string | number;
  unique?: boolean;
  table?: string;
}

export interface ColumnParams {
  fillFrom?: string;
  coalesce?: string | number;
}

export interface Table {
  columns: Record<string, Column>;
  params: Record<string, ColumnParams>;
}

export interface SqlMigrationStep {
  query?: string;
  args?: Args[];
  callback?: never;
  callbackPromise?: never;
}

export interface CallbackMigrationStep {
  callback?: () => void;
  callbackPromise?: () => Promise<void>;
  query?: never;
  args?: never;
}

export type MigrationStep = SqlMigrationStep | CallbackMigrationStep;

export interface LatestMigration {
  latest_revision: number | null;
  version: string;
  timestamp: number;
}

export interface Settings {
  appVersion?: string;
  firstRevisionId?: number;
  ignoreTransactionStatements?: boolean;
  useOldMigrationTableQuery?: boolean;
}

export type Migratta = {
  addAsyncScript: (callback: () => Promise<void>) => void;
  addScript: (callback: () => void) => void;
  addSql: (query: string, args?: Args[]) => void;
  addTableColumn: (
    tableName: string,
    columnName: string,
    column: Column,
    params?: ColumnParams,
  ) => void;
  changeTableColumn: (
    tableName: string,
    columnName: string,
    column?: Column,
    params?: ColumnParams,
  ) => void;
  createMigration: () => void;
  createTable: (name: string, columns: Record<string, Column>) => void;
  deleteTableColumn: (tableName: string, columnName: string) => void;
  getMigrationRevisionSqlSelectQuery: () => string;
  getMigrationsSqlQueries: (
    latestMigration?: LatestMigration,
  ) => MigrationStep[];
  getMigrationTableSqlCreateQuery: () => string;
  getTypescriptTypesFile: () => string;
  recreateTable: (
    tableName: string,
    columns?: Record<string, Column> | null,
    fromId?: boolean,
  ) => void;
  removeTable: (tableName: string) => void;
  renameTable: (oldTableName: string, newTableName: string) => void;
  renameTableColumn: (
    tableName: string,
    columnName: string,
    newColumnName: string,
  ) => void;
};
