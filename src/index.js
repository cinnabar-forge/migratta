let dialect;

let _appVersion;

const EMPTY_OBJECT = {};

const migrations = [];

const tables = {};

function resetContext() {
  migrations.length = 0;
  const props = Object.getOwnPropertyNames(tables);
  for (let i = 0; i < props.length; i++) {
    delete tables[props[i]];
  }
}

function getSqlDialect() {
  return dialect;
}

function setSqlDialect(value) {
  dialect = value;
}

function createMigration() {
  migrations.push([
    {
      args: [
        migrations.length,
        _appVersion || "-",
        Math.round(Date.now() / 1000),
      ],
      query: `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    },
  ]);
}

function addSql(query, args) {
  const currentMigration = migrations[migrations.length - 1];
  currentMigration.push({ args, query });
}

function getColumnQueryPart(columnName, column) {
  const columnQuery = [];
  columnQuery.push(`"${columnName}"`);
  if (column.type === "ID") {
    columnQuery.push("INTEGER PRIMARY KEY AUTOINCREMENT");
  } else if (column.type === "FOREIGN") {
    columnQuery.push("INTEGER");
  } else {
    columnQuery.push(column.type.toUpperCase());
    // if (column.primaryKey) {
    //   columnQuery.push("PRIMARY KEY");
    // }
    if (column.autoIncrement) {
      columnQuery.push("AUTOINCREMENT");
    }
    if (column.notNull) {
      columnQuery.push("NOT NULL");
    }
    if (column.default != null) {
      columnQuery.push(`DEFAULT ${wrapValue(column.default)}`);
    } else if (column.notNull && !column.unique) {
      throw new Error(
        "'notNull' argument should be used with 'default' argument",
      );
    }
  }

  return columnQuery.join(" ");
}

function getTableCreationSqlQuery(name, columns) {
  const columnsQuery = [];

  const primaryKeys = [];
  const uniques = [];
  const foreigns = [];

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

function createTable(name, columns) {
  if (tables[name] != null) {
    removeTable(name);
  }

  tables[name] = {
    columns: columns,
    params: {},
  };

  addSql(getTableCreationSqlQuery(name, columns));
}

function recreateTable(tableName, columns, fromId) {
  let newColumns;
  if (columns == null) {
    newColumns = tables[tableName].columns;
  }

  const tempTableName = `${tableName}_tmp`;

  addSql(getTableCreationSqlQuery(tempTableName, newColumns));

  const recreatedColumnCurrent = [];
  const recreatedColumnPrevious = [];

  for (const columnName of Object.keys(newColumns)) {
    const column = tables[tableName].columns[columnName] ?? EMPTY_OBJECT;
    const params = tables[tableName].params[columnName] ?? EMPTY_OBJECT;

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

function removeTable(tableName) {
  delete tables[tableName];
  addSql(`DROP TABLE "${tableName}";`);
}

function addTableColumn(tableName, columnName, column, params) {
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

function renameTableColumn(tableName, columnName, newColumnName) {
  tables[tableName].columns[newColumnName] =
    tables[tableName].columns[columnName];
  delete tables[tableName].columns[columnName];

  const query = `ALTER TABLE "${tableName}" RENAME COLUMN "${columnName}" TO "${newColumnName}";`;
  addSql(query);
}

function changeTableColumn(tableName, columnName, column, params) {
  if (column != null) {
    tables[tableName].columns[columnName] = column;
  }
  if (params != null) {
    tables[tableName].params[columnName] = params;
  }
}

function deleteTableColumn(tableName, columnName) {
  delete tables[tableName].columns[columnName];
}

function getMigrationTableSqlCreateQuery() {
  return `CREATE TABLE IF NOT EXISTS "migrations" ("revision" INTEGER NOT NULL PRIMARY KEY, "app_version" TEXT NOT NULL, "date_migrated" INTEGER NOT NULL);`;
}

function getMigrationRevisionSqlSelectQuery() {
  return `SELECT MAX(revision) as "latest_revision", "app_version", "date_migrated" FROM "migrations";`;
}

function getMigrationsSqlQueries(latestMigration) {
  if (latestMigration.latest_revision != null) {
    console.log(
      `Last database migration: ${new Date(
        latestMigration.date_migrated * 1000,
      ).toISOString()} (r${latestMigration.latest_revision}, v${
        latestMigration.app_version
      })`,
    );
  } else {
    latestMigration.latest_revision = -1;
    console.log("Migration history is empty");
  }

  if (
    latestMigration.latest_revision != null &&
    latestMigration.latest_revision === migrations.length - 1
  ) {
    console.log("Database is up-to-date");
    return [];
  }

  const queries = [];

  queries.push({ query: "BEGIN TRANSACTION;" });

  if (latestMigration.latest_revision < migrations.length) {
    console.log(`Target migration revision ID: ${migrations.length - 1}`);
    for (
      let revision = latestMigration.latest_revision + 1;
      revision < migrations.length;
      revision++
    ) {
      if (migrations[revision] != null) {
        queries.push(...migrations[revision]);
      }
    }
  }

  queries.push({ query: "COMMIT TRANSACTION;" });
  queries.push({ query: "VACUUM;" });

  console.log(`...${queries.length} SQL query(ies) have been generated`);

  return queries;
}

function getTypescriptTypesFile() {
  let typescriptFileContents = "// Database types, generated by Migratta\n\n";

  for (const [tableName, table] of Object.entries(tables)) {
    const className = `${tableName.charAt(0).toUpperCase() + tableName.slice(1)}TableItem`;
    typescriptFileContents += `export class ${className} {\n`;

    for (const [columnName, column] of Object.entries(table.columns)) {
      const notNull = !column.notNull && column.type !== "ID" ? "?" : "";
      let type;
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

function wrapValue(value) {
  return typeof value === "string" ? `'${value}'` : value;
}

export default function (appVersion) {
  _appVersion = appVersion;
  resetContext();
  return {
    addSql,
    addTableColumn,
    changeTableColumn,
    createMigration,
    createTable,
    deleteTableColumn,
    getMigrationRevisionSqlSelectQuery,
    getMigrationTableSqlCreateQuery,
    getMigrationsSqlQueries,
    getSqlDialect,
    getTypescriptTypesFile,
    recreateTable,
    removeTable,
    renameTableColumn,
    setSqlDialect,
  };
}
