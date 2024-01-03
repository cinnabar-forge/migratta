import cfMigrations from "./migrate.js";
import assert from "assert";

function createBaseMigration() {
  cfMigrations.resetContext();
  cfMigrations.createMigration();
  cfMigrations.createTable("species", {
    id: { id: true },
    name: { type: "text", notNull: true },
    origin: { type: "text" },
    population: { type: "integer" },
  });
}

describe("Empty run", function () {
  it("should return correct SQL query", function () {
    assert.equal(
      cfMigrations.getMigrationRevisionSqlQuery(),
      "CREATE TABLE IF NOT EXISTS migrations (revision INTEGER NOT NULL PRIMARY KEY, app_version TEXT NOT NULL, date_migrated INTEGER NOT NULL); SELECT MAX(revision) as latest_revision, app_version, date_migrated FROM migrations;"
    );
  });
  it("should return correct SQL query", function () {
    const query = cfMigrations.getMigrationsSqlBundle({});
    assert.equal(
      query.query,
      `BEGIN TRANSACTION;
COMMIT TRANSACTION;
VACUUM;`
    );
    assert.equal(query.args.length, 0);
  });
});

describe("Adding SQL", function () {
  it("should add a SQL query", function () {
    cfMigrations.createMigration();
    cfMigrations.addSql("VACUUM;", ["testPurposes"]);
  });
  it("should return correct SQL query", function () {
    const query = cfMigrations.getMigrationsSqlBundle({});
    assert.equal(
      query.query,
      `BEGIN TRANSACTION;
INSERT INTO migrations (revision, app_version, date_migrated) VALUES (?, ?, ?);
VACUUM;
COMMIT TRANSACTION;
VACUUM;`
    );
    assert.equal(query.args.length, 4);
  });
});

describe("Creating new table", function () {
  it("should create a table 'species'", function () {
    createBaseMigration();
  });
  it("should return correct SQL query", function () {
    const query = cfMigrations.getMigrationsSqlBundle({});
    assert.equal(
      query.query,
      `BEGIN TRANSACTION;
INSERT INTO migrations (revision, app_version, date_migrated) VALUES (?, ?, ?);
CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "origin" TEXT, "population" INTEGER);
COMMIT TRANSACTION;
VACUUM;`
    );
    assert.equal(query.args.length, 3);
  });
});

describe("Creating new column", function () {
  it("should create a table 'species'", function () {
    createBaseMigration();
  });
  it("should add a column 'language' with type 'text'", function () {
    cfMigrations.createMigration();
    cfMigrations.addTableColumn("species", "language", { type: "text" });
  });
  it("should return correct SQL query", function () {
    const query = cfMigrations.getMigrationsSqlBundle({});
    assert.equal(
      query.query,
      `BEGIN TRANSACTION;
INSERT INTO migrations (revision, app_version, date_migrated) VALUES (?, ?, ?);
CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "origin" TEXT, "population" INTEGER);
INSERT INTO migrations (revision, app_version, date_migrated) VALUES (?, ?, ?);
ALTER TABLE "species" ADD COLUMN "language" TEXT;
COMMIT TRANSACTION;
VACUUM;`
    );
    assert.equal(query.args.length, 6);
  });
});

describe("Changing existing column type", function () {
  it("should create a table 'species'", function () {
    createBaseMigration();
  });
  it("should change type of the column 'origin' from text to 'integer' and make it not-null", function () {
    cfMigrations.createMigration();
    cfMigrations.changeTableColumn("species", "origin", {
      type: "integer",
      notNull: true,
    });
  });
  it("should return correct SQL query", function () {
    const query = cfMigrations.getMigrationsSqlBundle({});
    assert.equal(
      query.query,
      `BEGIN TRANSACTION;
INSERT INTO migrations (revision, app_version, date_migrated) VALUES (?, ?, ?);
CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "origin" TEXT, "population" INTEGER);
INSERT INTO migrations (revision, app_version, date_migrated) VALUES (?, ?, ?);
CREATE TABLE "species_tmp" ("id" INTEGER, "name" TEXT, "origin" INTEGER NOT NULL, "population" INTEGER);
INSERT INTO species_tmp (id, name, origin, population) SELECT id, name, origin, population FROM species;
DROP TABLE "species";
ALTER TABLE "species_tmp" RENAME TO "species";
COMMIT TRANSACTION;
VACUUM;`
    );
    assert.equal(query.args.length, 6);
  });
});

describe("Renaming existing column", function () {
  it("should create a table 'species'", function () {
    createBaseMigration();
  });
  it("should change name of the column 'origin' to 'place_of_origin'", function () {
    cfMigrations.createMigration();
    cfMigrations.renameTableColumn("species", "origin", "place_of_origin");
  });
  it("should return correct SQL query", function () {
    const query = cfMigrations.getMigrationsSqlBundle({});
    assert.equal(
      query.query,
      `BEGIN TRANSACTION;
INSERT INTO migrations (revision, app_version, date_migrated) VALUES (?, ?, ?);
CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL, "origin" TEXT, "population" INTEGER);
INSERT INTO migrations (revision, app_version, date_migrated) VALUES (?, ?, ?);
ALTER TABLE "species" RENAME COLUMN "origin" TO "place_of_origin";
COMMIT TRANSACTION;
VACUUM;`
    );
    assert.equal(query.args.length, 6);
  });
});
