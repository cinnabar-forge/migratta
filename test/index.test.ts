import assert from "node:assert";

import cfMigrations from "../src/index.js";

let migrations = cfMigrations();

function createBaseMigration() {
  migrations = cfMigrations({
    appVersion: "0.1.0",
    firstRevisionId: 0,
    useOldMigrationTableQuery: true,
  });
  migrations.createMigration();
  migrations.createTable("species", {
    id: { type: "ID" },
    name: { default: "Unnamed species", notNull: true, type: "TEXT" },
    origin: { type: "TEXT" },
    population: { type: "INTEGER" },
  });
}

describe("Static functions", () => {
  it("should return expected getMigrationTableSqlCreateQuery string", () => {
    assert.strictEqual(
      migrations.getMigrationTableSqlCreateQuery(),
      `CREATE TABLE IF NOT EXISTS "migrations" ("id" INTEGER NOT NULL PRIMARY KEY, "version" TEXT NOT NULL, "timestamp" INTEGER NOT NULL);`,
    );
  });
  it("should return expected getMigrationRevisionSqlSelectQuery string", () => {
    assert.strictEqual(
      migrations.getMigrationRevisionSqlSelectQuery(),
      `SELECT MAX("id") as "latest_revision", "version", "timestamp" FROM "migrations";`,
    );
  });
  it("should return zero queries", () => {
    const queries = migrations.getMigrationsSqlQueries();
    assert.strictEqual(queries.length, 0);
  });
});

describe("Adding SQL", () => {
  it("should add a SQL query", () => {
    migrations = cfMigrations({
      appVersion: "0.1.0",
      firstRevisionId: 0,
      useOldMigrationTableQuery: true,
    });
    migrations.createMigration();
    migrations.addSql("SELECT 15 AS testPurpose;");
  });
  it("should return correct SQL query", () => {
    const queries = migrations.getMigrationsSqlQueries();
    assert.strictEqual(queries[0].query, "BEGIN TRANSACTION;");
    assert.strictEqual(
      queries[1].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[2].query, "SELECT 15 AS testPurpose;");
    assert.strictEqual(queries[3].query, "COMMIT TRANSACTION;");
  });
});

describe("Creating new table", () => {
  it("should create a table 'species'", () => {
    createBaseMigration();
  });
  it("should return correct SQL query", () => {
    const queries = migrations.getMigrationsSqlQueries();
    assert.strictEqual(queries[0].query, "BEGIN TRANSACTION;");
    assert.strictEqual(
      queries[1].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[1].args?.length, 3);
    assert.strictEqual(
      queries[2].query,
      `CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "origin" TEXT, "population" INTEGER);`,
    );
    assert.strictEqual(queries[3].query, "COMMIT TRANSACTION;");
  });
});

describe("Creating two tables and link foreign key", () => {
  it("should create a table 'species'", () => {
    createBaseMigration();
  });
  it("should create a table 'people'", () => {
    migrations.createTable("people", {
      id: { type: "ID" },
      name: { default: "Unnamed person", notNull: true, type: "TEXT" },
      talisman: { table: "species", type: "FOREIGN" },
    });
  });
  it("should return correct SQL query", () => {
    const queries = migrations.getMigrationsSqlQueries();
    assert.strictEqual(queries[0].query, "BEGIN TRANSACTION;");
    assert.strictEqual(
      queries[1].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[1].args?.length, 3);
    assert.strictEqual(
      queries[2].query,
      `CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "origin" TEXT, "population" INTEGER);`,
    );
    assert.strictEqual(
      queries[3].query,
      `CREATE TABLE "people" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed person', "talisman" INTEGER, FOREIGN KEY ("talisman") REFERENCES "species"("id"));`,
    );
    assert.strictEqual(queries[4].query, "COMMIT TRANSACTION;");
  });
});

describe("Creating new column", () => {
  it("should create a table 'species'", () => {
    createBaseMigration();
  });
  it("should add a column 'language' with type 'TEXT'", () => {
    migrations.createMigration();
    migrations.addTableColumn("species", "language", { type: "TEXT" });
  });
  it("should return correct SQL query", () => {
    const queries = migrations.getMigrationsSqlQueries();
    assert.strictEqual(queries[0].query, "BEGIN TRANSACTION;");
    assert.strictEqual(
      queries[1].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[1].args?.length, 3);
    assert.strictEqual(
      queries[2].query,
      `CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "origin" TEXT, "population" INTEGER);`,
    );
    assert.strictEqual(
      queries[3].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[3].args?.length, 3);
    assert.strictEqual(
      queries[4].query,
      `ALTER TABLE "species" ADD COLUMN "language" TEXT;`,
    );
    assert.strictEqual(queries[5].query, "COMMIT TRANSACTION;");
  });
});

describe("Changing existing column type", () => {
  it("should create a table 'species'", () => {
    createBaseMigration();
  });
  it("should change type of the column 'origin' from 'TEXT' to 'INTEGER', make it not-null, and default to 'Earth' and add param 'coalesce'", () => {
    migrations.createMigration();
    migrations.changeTableColumn(
      "species",
      "origin",
      {
        default: "Earth",
        notNull: true,
        type: "INTEGER",
      },
      { coalesce: 1 },
    );
    migrations.recreateTable("species");
  });
  it("should return correct SQL query", () => {
    const queries = migrations.getMigrationsSqlQueries();
    assert.strictEqual(queries[0].query, "BEGIN TRANSACTION;");
    assert.strictEqual(
      queries[1].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[1].args?.length, 3);
    assert.strictEqual(
      queries[2].query,
      `CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "origin" TEXT, "population" INTEGER);`,
    );
    assert.strictEqual(
      queries[3].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[3].args?.length, 3);
    assert.strictEqual(
      queries[4].query,
      `CREATE TABLE "species_tmp" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "origin" INTEGER NOT NULL DEFAULT 'Earth', "population" INTEGER);`,
    );
    assert.strictEqual(
      queries[5].query,
      `INSERT INTO "species_tmp" ("id", "name", "origin", "population") SELECT "id", "name", COALESCE("origin", 1), "population" FROM "species";`,
    );
    assert.strictEqual(queries[6].query, `DROP TABLE "species";`);
    assert.strictEqual(
      queries[7].query,
      `ALTER TABLE "species_tmp" RENAME TO "species";`,
    );
    assert.strictEqual(queries[8].query, "COMMIT TRANSACTION;");
  });
});

describe("Renaming existing column", () => {
  it("should create a table 'species'", () => {
    createBaseMigration();
  });
  it("should change name of the column 'origin' to 'place_of_origin'", () => {
    migrations.createMigration();
    migrations.renameTableColumn("species", "origin", "place_of_origin");
  });
  it("should return correct SQL query", () => {
    const queries = migrations.getMigrationsSqlQueries();
    assert.strictEqual(queries[0].query, "BEGIN TRANSACTION;");
    assert.strictEqual(
      queries[1].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[1].args?.length, 3);
    assert.strictEqual(
      queries[2].query,
      `CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "origin" TEXT, "population" INTEGER);`,
    );
    assert.strictEqual(
      queries[3].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[3].args?.length, 3);
    assert.strictEqual(
      queries[4].query,
      `ALTER TABLE "species" RENAME COLUMN "origin" TO "place_of_origin";`,
    );
    assert.strictEqual(queries[5].query, "COMMIT TRANSACTION;");
  });
});

describe("Add column with 'fillFrom' and 'coalesce' params", () => {
  it("should create a table 'species'", () => {
    createBaseMigration();
  });
  it("should add column 'residence' and fill it with data from 'origin'", () => {
    migrations.createMigration();
    migrations.addTableColumn(
      "species",
      "residence",
      { type: "TEXT" },
      { coalesce: "New Earth", fillFrom: "origin" },
    );
    migrations.recreateTable("species");
  });
  it("should return correct SQL query", () => {
    const queries = migrations.getMigrationsSqlQueries();
    assert.strictEqual(queries[0].query, "BEGIN TRANSACTION;");
    assert.strictEqual(
      queries[1].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[1].args?.length, 3);
    assert.strictEqual(
      queries[2].query,
      `CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "origin" TEXT, "population" INTEGER);`,
    );
    assert.strictEqual(
      queries[3].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[3].args?.length, 3);
    assert.strictEqual(
      queries[4].query,
      `ALTER TABLE "species" ADD COLUMN "residence" TEXT;`,
    );
    assert.strictEqual(
      queries[5].query,
      `CREATE TABLE "species_tmp" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "origin" TEXT, "population" INTEGER, "residence" TEXT);`,
    );
    assert.strictEqual(
      queries[6].query,
      `INSERT INTO "species_tmp" ("id", "name", "origin", "population", "residence") SELECT "id", "name", "origin", "population", COALESCE("origin", 'New Earth') FROM "species";`,
    );
    assert.strictEqual(queries[7].query, `DROP TABLE "species";`);
    assert.strictEqual(
      queries[8].query,
      `ALTER TABLE "species_tmp" RENAME TO "species";`,
    );
    assert.strictEqual(queries[9].query, "COMMIT TRANSACTION;");
  });
});

describe("Delete column from table", () => {
  it("should create a table 'species'", () => {
    createBaseMigration();
  });
  it("should delete column 'origin'", () => {
    migrations.createMigration();
    migrations.deleteTableColumn("species", "origin");
    migrations.recreateTable("species");
  });
  it("should return correct SQL query", () => {
    const queries = migrations.getMigrationsSqlQueries();
    assert.strictEqual(queries[0].query, "BEGIN TRANSACTION;");
    assert.strictEqual(
      queries[1].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[1].args?.length, 3);
    assert.strictEqual(
      queries[2].query,
      `CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "origin" TEXT, "population" INTEGER);`,
    );
    assert.strictEqual(
      queries[3].query,
      `INSERT INTO "migrations" ("revision", "app_version", "date_migrated") VALUES (?, ?, ?);`,
    );
    assert.strictEqual(queries[3].args?.length, 3);
    assert.strictEqual(
      queries[4].query,
      `CREATE TABLE "species_tmp" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "population" INTEGER);`,
    );
    assert.strictEqual(
      queries[5].query,
      `INSERT INTO "species_tmp" ("id", "name", "population") SELECT "id", "name", "population" FROM "species";`,
    );
    assert.strictEqual(queries[6].query, `DROP TABLE "species";`);
    assert.strictEqual(
      queries[7].query,
      `ALTER TABLE "species_tmp" RENAME TO "species";`,
    );
    assert.strictEqual(queries[8].query, "COMMIT TRANSACTION;");
  });
});

describe("Generate Typescript file", () => {
  // getTypescriptTypesFile()
});
