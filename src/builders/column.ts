import type { MigrationContext } from "../contexts/migration.js";
import type { Column, ColumnParams } from "../types.js";
import type { TableBuilder } from "./table.js";

export class ColumnBuilder {
  constructor(
    private context: MigrationContext,
    private tableName: string,
    private columnName: string,
    private parentBuilder: TableBuilder,
  ) {}

  create(column: Column, params?: ColumnParams): TableBuilder {
    this.context.addTableAction(this.tableName, {
      type: "addColumn",
      columnName: this.columnName,
      column,
      params,
    });
    return this.parentBuilder;
  }

  change(column?: Column, params?: ColumnParams): TableBuilder {
    this.context.addTableAction(this.tableName, {
      type: "changeColumn",
      columnName: this.columnName,
      column,
      params,
    });
    return this.parentBuilder;
  }

  drop(): TableBuilder {
    this.context.addTableAction(this.tableName, {
      type: "dropColumn",
      columnName: this.columnName,
    });
    return this.parentBuilder;
  }

  rename(newName: string): TableBuilder {
    this.context.addTableAction(this.tableName, {
      type: "renameColumn",
      oldName: this.columnName,
      newName,
    });
    return this.parentBuilder;
  }
}
