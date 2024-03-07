/**
 * @typedef Column
 * @type {object}
 * @property {"NULL" | "INTEGER" | "REAL" | "TEXT" | "BLOB" | "ID"} type
 * @property {boolean} primaryKey
 * @property {boolean} autoIncrement
 * @property {boolean} notNull
 * @property {boolean} unique
 * @property {any} default
 */

/**
 * @typedef ColumnAdditionParams
 * @type {object}
 * @property {string} fillFrom
 * @property {any} coalesce
 */

/**
 * @typedef LastMigration
 * @type {object}
 * @property {string} latest_revision
 * @property {string} app_version
 * @property {number} date_migrated
 */

/**
 * @typedef Query
 * @type {object}
 * @property {string} query
 * @property {any[]} args
 */

/**
 * @typedef MigrationBuilder
 * @type {object}
 */

let dialect;

let versionColumnName;

const EMPTY_OBJECT = {};

const migrations = [];

const tables = {};

/**
 * Clears all previous migration data
 */
function resetContext() {
  migrations.length = 0;
  const props = Object.getOwnPropertyNames(tables);
  for (const prop of props) {
    delete tables[prop];
  }
}

/**
 * Gets currently set dialect
 * @returns {string} SQL dialect
 */
function getSqlDialect() {
  return dialect;
}

/**
 * Sets SQL dialect of choice
 * @param {"sqlite"} value SQL dialect
 */
function setSqlDialect(value) {
  dialect = value;
}

/**
 * Starts a new migration revision
 */
function createMigration() {
  migrations.push([
    {
      args: [
        migrations.length,
        process.env.npm_package_version,
        Math.round(Date.now() / 1000),
      ],
      query: `INSERT INTO "migrations" ("revision", "${versionColumnName}", "date_migrated") VALUES (?, ?, ?);`,
    },
  ]);
}

/**
 * Adds custom SQL query
 * @param {string} query SQL query
 * @param {Array} args arguments to SQL query
 */
function addSql(query, args) {
  const currentMigration = migrations[migrations.length - 1];
  currentMigration.push({ args, query });
}

/**
 * Forms query part to be used in CREATE or ALTER statements
 * @param {string} columnName
 * @param column
 * @returns {string}
 */
function getColumnQueryPart(columnName, column) {
  const columnQuery = [];
  columnQuery.push(`"${columnName}"`);
  if (column.type === "ID") {
    columnQuery.push("INTEGER PRIMARY KEY AUTOINCREMENT");
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

/**
 *
 * @param name
 * @param columns
 */
function getTableCreationSqlQuery(name, columns) {
  const columnsQuery = [];

  const primaryKeys = [];
  const uniques = [];

  for (const [columnName, column] of Object.entries(columns)) {
    if (column.type !== "ID" && column.primaryKey) {
      primaryKeys.push(`"${columnName}"`);
    }

    if (column.unique) {
      uniques.push(`"${columnName}"`);
    }

    columnsQuery.push(getColumnQueryPart(columnName, column));
  }

  if (primaryKeys.length > 0) {
    columnsQuery.push(`PRIMARY KEY(${primaryKeys.join(", ")})`);
  }

  if (uniques.length > 0) {
    columnsQuery.push(`UNIQUE(${uniques.join(", ")})`);
  }

  return `CREATE TABLE "${name}" (${columnsQuery.join(", ")});`;
}

/**
 *
 * @param name
 * @param columns
 */
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

/**
 *
 * @param tableName
 * @param columns
 * @param fromId
 */
function recreateTable(tableName, columns, fromId) {
  if (columns == null) {
    columns = tables[tableName].columns;
  }

  const tempTableName = tableName + "_tmp";

  addSql(getTableCreationSqlQuery(tempTableName, columns));

  const recreatedColumnCurrent = [];
  const recreatedColumnPrevious = [];

  for (const columnName of Object.keys(columns)) {
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

/**
 *
 * @param tableName
 */
function removeTable(tableName) {
  addSql(`DROP TABLE "${tableName}";`);
}

/**
 *
 * @param tableName
 * @param columnName
 * @param column
 * @param params
 */
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

/**
 *
 * @param tableName
 * @param columnName
 * @param newColumnName
 */
function renameTableColumn(tableName, columnName, newColumnName) {
  tables[tableName].columns[newColumnName] =
    tables[tableName].columns[columnName];
  delete tables[tableName].columns[columnName];

  const query = `ALTER TABLE "${tableName}" RENAME COLUMN "${columnName}" TO "${newColumnName}";`;
  addSql(query);
}

/**
 *
 * @param tableName
 * @param columnName
 * @param column
 * @param params
 */
function changeTableColumn(tableName, columnName, column, params) {
  if (column != null) {
    tables[tableName].columns[columnName] = column;
  }
  if (params != null) {
    tables[tableName].params[columnName] = params;
  }
}

/**
 *
 * @param tableName
 * @param columnName
 */
function deleteTableColumn(tableName, columnName) {
  delete tables[tableName].columns[columnName];
}

/**
 *
 */
function getMigrationTableSqlCreateQuery() {
  return `CREATE TABLE IF NOT EXISTS "migrations" ("revision" INTEGER NOT NULL PRIMARY KEY, "${versionColumnName}" TEXT NOT NULL, "date_migrated" INTEGER NOT NULL);`;
}

/**
 *
 */
function getMigrationRevisionSqlSelectQuery() {
  return `SELECT MAX(revision) as "latest_revision", "${versionColumnName}", "date_migrated" FROM "migrations";`;
}

/**
 *
 * @param latestMigration
 */
function getMigrationsSqlQueries(latestMigration) {
  if (latestMigration.latest_revision != null) {
    console.log(
      `Last database migration: ${new Date(
        latestMigration.date_migrated * 1000,
      ).toISOString()} (r${latestMigration.latest_revision}, v${
        latestMigration[versionColumnName]
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

/**
 *
 * @param value
 */
function wrapValue(value) {
  return typeof value === "string" ? `'${value}'` : value;
}

/**
 *
 * @param _versionColumnName
 */
export default function (_versionColumnName) {
  resetContext();
  versionColumnName = _versionColumnName ?? "app_version";
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
    recreateTable,
    removeTable,
    renameTableColumn,
    setSqlDialect,
  };
}
