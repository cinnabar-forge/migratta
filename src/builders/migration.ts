import type { MigrationContext } from "../contexts/migration.js";
import type { Migratta } from "../migratta.js";
import type { QueryValue } from "../types.js";
import { TableBuilder } from "./table.js";

export class MigrationBuilder {
  constructor(
    private context: MigrationContext,
    private parentBuilder: Migratta,
  ) {}

  table(tableName: string): TableBuilder {
    return new TableBuilder(this.context, tableName, this);
  }

  sql(query: string, values?: QueryValue[]): MigrationBuilder {
    this.context.addSql(query, values);
    return this;
  }

  script(callback: () => void): MigrationBuilder {
    this.context.addScript(callback);
    return this;
  }

  asyncScript(callbackPromise: () => Promise<void>): MigrationBuilder {
    this.context.addAsyncScript(callbackPromise);
    return this;
  }

  migrate(): MigrationBuilder {
    return this.parentBuilder.migrate();
  }

  toContext(): Migratta {
    return this.parentBuilder;
  }
}
