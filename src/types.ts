// public

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

export type ColumnType = "ID" | "INTEGER" | "TEXT" | "FOREIGN";

export interface Config {
  appVersion?: string;
  dialect?: "sqlite";
  dialectVersion?: string;
  firstMigrationId?: number;
  ignoreTransactionStatements?: boolean;
  useOldMigrationTableQuery?: boolean;
  silent?: boolean;
}

export interface MigrationEntry {
  id: number | null;
  version: string;
  timestamp: number;
}

export type QueryValue = string | number | boolean | null;

export interface Table {
  columns: Record<string, Column>;
  params: Record<string, ColumnParams>;
}

// internal

export type Step = SqlStep | ScriptStep;

export interface SqlStep {
  query?: string;
  values?: QueryValue[];
  callback?: never;
  callbackPromise?: never;
}

export interface ScriptStep {
  callback?: () => void;
  callbackPromise?: () => Promise<void>;
  query?: never;
  values?: never;
}
