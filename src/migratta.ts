import { MigrationBuilder } from "./builders/migration.js";
import { MigrationContext } from "./contexts/migration.js";
import type { Config, MigrationEntry, Step } from "./types.js";

export class Migratta {
  private context: MigrationContext;
  private config?: Config;

  constructor(config?: Config) {
    this.config = config;
    this.context = new MigrationContext(config || {});
  }

  migrate(): MigrationBuilder {
    this.context.startMigration();
    return new MigrationBuilder(this.context, this);
  }

  toArray(latestMigration?: MigrationEntry): Step[] {
    return this.context.getSteps(latestMigration);
  }

  toTypeScript(): string {
    return this.context.getTypescriptTypesFile();
  }

  getMigrationTableCreateSql() {
    return `CREATE TABLE IF NOT EXISTS "migrations" ("id" INTEGER NOT NULL PRIMARY KEY, "version" TEXT NOT NULL, "timestamp" INTEGER NOT NULL);`;
  }

  getMigrationTableSelectSql(): string {
    const config = this.config;
    return config?.useOldMigrationTableQuery
      ? `SELECT MAX("revision") as "id", "app_version" AS "version", "date_migrated" AS "timestamp" FROM "migrations";`
      : `SELECT MAX("id") as "id", "version", "timestamp" FROM "migrations";`;
  }
}
