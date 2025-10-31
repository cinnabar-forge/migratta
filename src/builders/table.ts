import type { MigrationContext } from "../contexts/migration.js";
import type { Migratta } from "../migratta.js";
import type { Column } from "../types.js";
import { ColumnBuilder } from "./column.js";
import type { MigrationBuilder } from "./migration.js";

export class TableBuilder {
  constructor(
    private context: MigrationContext,
    private tableName: string,
    private parentBuilder: MigrationBuilder,
  ) {}

  create(columns: Record<string, Column>): MigrationBuilder {
    this.context.addTableAction(this.tableName, {
      type: "create",
      columns,
    });
    return this.parentBuilder;
  }

  drop(): MigrationBuilder {
    this.context.addTableAction(this.tableName, {
      type: "drop",
    });
    return this.parentBuilder;
  }

  rename(newName: string): MigrationBuilder {
    this.context.addTableAction(this.tableName, {
      type: "rename",
      newName,
    });
    return this.parentBuilder;
  }

  column(columnName: string): ColumnBuilder {
    return new ColumnBuilder(this.context, this.tableName, columnName, this);
  }

  migrate(): MigrationBuilder {
    return this.parentBuilder.migrate();
  }

  toContext(): Migratta {
    return this.parentBuilder.toContext();
  }
}
