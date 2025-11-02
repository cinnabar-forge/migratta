import assert from "node:assert";
import { describe, it } from "node:test";
import { Migratta } from "../src/index.js";

describe("Static functions", () => {
  it("should return expected getMigrationTableCreateSql string", () => {
    const migratta = new Migratta();
    assert.strictEqual(
      migratta.getMigrationTableCreateSql(),
      `CREATE TABLE IF NOT EXISTS "migrations" ("id" INTEGER NOT NULL PRIMARY KEY, "version" TEXT NOT NULL, "timestamp" INTEGER NOT NULL);`,
    );
  });

  it("should return expected getMigrationTableSelectSql string", () => {
    const migratta = new Migratta();
    assert.strictEqual(
      migratta.getMigrationTableSelectSql(),
      `SELECT MAX("id") as "id", "version", "timestamp" FROM "migrations";`,
    );
  });

  it("should return expected old migration table query when configured", () => {
    const migratta = new Migratta({ useOldMigrationTableQuery: true });
    assert.strictEqual(
      migratta.getMigrationTableSelectSql(),
      `SELECT MAX("revision") as "id", "app_version" AS "version", "date_migrated" AS "timestamp" FROM "migrations";`,
    );
  });

  it("should return 5 steps when no migrations defined", () => {
    const migratta = new Migratta();
    const steps = migratta.migrate().toContext().toArray();
    console.log(steps);
    assert.strictEqual(steps.length, 5);
    assert.strictEqual(steps[0].query, "PRAGMA foreign_keys = OFF;");
    assert.strictEqual(steps[1].query, "BEGIN TRANSACTION;");
    assert(
      steps[2].query?.includes(
        `INSERT INTO "migrations" ("id", "version", "timestamp") VALUES (?, ?, ?);`,
      ),
    );
    assert.strictEqual(steps[3].query, "COMMIT TRANSACTION;");
    assert.strictEqual(steps[4].query, "PRAGMA foreign_keys = ON;");
  });
});

describe("Adding SQL", () => {
  it("should add a SQL query", () => {
    const migratta = new Migratta({});

    const steps = migratta
      .migrate()
      .sql("SELECT 15 AS testPurpose;")
      .toContext()
      .toArray();
    console.log(steps);

    assert.strictEqual(steps[3].query, "SELECT 15 AS testPurpose;");
  });
});

describe("Creating new table", () => {
  it("should create a table 'species'", () => {
    const migratta = new Migratta({});

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        name: { default: "Unnamed species", notNull: true, type: "TEXT" },
        origin: { type: "TEXT" },
        population: { type: "INTEGER" },
      })
      .toContext()
      .toArray();
    console.log(steps);

    assert.strictEqual(
      steps[3].query,
      `CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "origin" TEXT, "population" INTEGER);`,
    );
  });
});

describe("Creating two tables with foreign key", () => {
  it("should create tables with foreign key relationship", () => {
    const migratta = new Migratta({});

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        name: { default: "Unnamed species", notNull: true, type: "TEXT" },
        origin: { type: "TEXT" },
        population: { type: "INTEGER" },
      })
      .table("people")
      .create({
        id: { type: "ID" },
        name: { default: "Unnamed person", notNull: true, type: "TEXT" },
        talisman: { table: "species", type: "FOREIGN" },
      })
      .toContext()
      .toArray();
    console.log(steps);

    assert.strictEqual(
      steps[3].query,
      `CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed species', "origin" TEXT, "population" INTEGER);`,
    );
    assert.strictEqual(
      steps[4].query,
      `CREATE TABLE "people" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT NOT NULL DEFAULT 'Unnamed person', "talisman" INTEGER, FOREIGN KEY ("talisman") REFERENCES "species"("id"));`,
    );
  });
});

describe("Creating new column", () => {
  it("should add a column using ALTER TABLE", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.25.0",
    });

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        name: { type: "TEXT" },
      })
      .migrate()
      .table("species")
      .column("language")
      .create({ type: "TEXT" })
      .toContext()
      .toArray();
    console.log(steps);

    assert.strictEqual(
      steps[3].query,
      `CREATE TABLE "species" ("id" INTEGER PRIMARY KEY AUTOINCREMENT, "name" TEXT);`,
    );
    assert.strictEqual(
      steps[5].query,
      `ALTER TABLE "species" ADD COLUMN "language" TEXT;`,
    );
  });

  it("should recreate table when adding ID column", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.40.0",
    });

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        name: { type: "TEXT" },
      })
      .migrate()
      .table("species")
      .column("id")
      .create({ type: "ID" })
      .toContext()
      .toArray();
    console.log(steps);

    // should recreate table since adding ID/PRIMARY KEY
    assert(steps.some((q) => q.query?.includes("species_tmp")));
  });
});

describe("Renaming existing column", () => {
  it("should use ALTER TABLE RENAME COLUMN in SQLite 3.25+", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.25.0",
    });

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        origin: { type: "TEXT" },
      })
      .migrate()
      .table("species")
      .column("origin")
      .rename("place_of_origin")
      .toContext()
      .toArray();
    console.log(steps);

    assert(
      steps.some(
        (q) =>
          q.query ===
          `ALTER TABLE "species" RENAME COLUMN "origin" TO "place_of_origin";`,
      ),
    );
    // should NOT recreate table
    assert(!steps.some((q) => q.query?.includes("species_tmp")));
  });

  it("should recreate table when renaming in SQLite < 3.25", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.20.0",
    });

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        origin: { type: "TEXT" },
      })
      .migrate()
      .table("species")
      .column("origin")
      .rename("place_of_origin")
      .toContext()
      .toArray();
    console.log(steps);

    // should recreate table in older SQLite
    assert(steps.some((q) => q.query?.includes("species_tmp")));
    // should NOT have ALTER TABLE RENAME
    assert(
      !steps.some(
        (q) =>
          q.query?.includes("ALTER TABLE") &&
          q.query?.includes("RENAME COLUMN"),
      ),
    );
  });
});

describe("Dropping column", () => {
  it("should use ALTER TABLE DROP COLUMN in SQLite 3.35+", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.35.0",
    });

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        origin: { type: "TEXT" },
        population: { type: "INTEGER" },
      })
      .migrate()
      .table("species")
      .column("origin")
      .drop()
      .toContext()
      .toArray();
    console.log(steps);

    assert(
      steps.some(
        (q) => q.query === `ALTER TABLE "species" DROP COLUMN "origin";`,
      ),
    );
    // should NOT recreate table
    assert(!steps.some((q) => q.query?.includes("species_tmp")));
  });

  it("should recreate table when dropping in SQLite < 3.35", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.30.0",
    });

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        origin: { type: "TEXT" },
        population: { type: "INTEGER" },
      })
      .migrate()
      .table("species")
      .column("origin")
      .drop()
      .toContext()
      .toArray();
    console.log(steps);

    // should recreate table in older SQLite
    assert(steps.some((q) => q.query?.includes("species_tmp")));
    // final table should not have origin column
    const createTmp = steps.find((q) =>
      q.query?.includes('CREATE TABLE "species_tmp"'),
    );
    assert(createTmp?.query);
    assert(!createTmp.query.includes('"origin"'));
  });
});

describe("Changing column type", () => {
  it("should recreate table when changing column type", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.40.0",
    });

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        origin: { type: "TEXT" },
      })
      .migrate()
      .table("species")
      .column("origin")
      .change(
        {
          default: "Earth",
          notNull: true,
          type: "INTEGER",
        },
        { coalesce: 1 },
      )
      .toContext()
      .toArray();
    console.log(steps);

    // should always recreate for type changes
    assert(steps.some((q) => q.query?.includes("species_tmp")));
    assert(
      steps.some(
        (q) => q.query?.includes("COALESCE") && q.query?.includes("1"),
      ),
    );
  });
});

describe("Batch operations optimization", () => {
  it("should batch multiple renames into single table recreation in SQLite < 3.25", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.20.0",
    });

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        col1: { type: "TEXT" },
        col2: { type: "TEXT" },
        col3: { type: "TEXT" },
      })
      .migrate()
      .table("species")
      .column("col1")
      .rename("newCol1")
      .column("col2")
      .rename("newCol2")
      .column("col3")
      .rename("newCol3")
      .toContext()
      .toArray();
    console.log(steps);

    // should only recreate once
    const tmpTables = steps.filter((q) => q.query?.includes("species_tmp"));
    assert.strictEqual(tmpTables.length, 3); // CREATE, INSERT, ALTER RENAME
  });

  it("should use multiple ALTER statements in SQLite 3.25+", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.25.0",
    });

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        col1: { type: "TEXT" },
        col2: { type: "TEXT" },
      })
      .migrate()
      .table("species")
      .column("col1")
      .rename("newCol1")
      .column("col2")
      .rename("newCol2")
      .toContext()
      .toArray();
    console.log(steps);

    // should NOT recreate table
    assert(!steps.some((q) => q.query?.includes("species_tmp")));
    // should have two ALTER statements
    const alters = steps.filter(
      (q) =>
        q.query?.includes("ALTER TABLE") && q.query?.includes("RENAME COLUMN"),
    );
    assert.strictEqual(alters.length, 2);
  });

  it("should recreate once when mixing operations that require recreation", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.30.0", // has rename, but not drop
    });

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        name: { type: "TEXT" },
        origin: { type: "TEXT" },
        deprecated: { type: "TEXT" },
      })
      .migrate()
      .table("species")
      .column("origin")
      .rename("place_of_origin")
      .column("deprecated")
      .drop() // operation is NOT supported in 3.30.0 - needs recreation
      .toContext()
      .toArray();
    console.log(steps);

    // should recreate once for both operations
    const creates = steps.filter((q) =>
      q.query?.includes('CREATE TABLE "species_tmp"'),
    );
    assert.strictEqual(creates.length, 1);

    // should NOT have ALTER RENAME since we're recreating anyway
    assert(
      !steps.some(
        (q) =>
          q.query?.includes("ALTER TABLE") &&
          q.query?.includes("RENAME COLUMN"),
      ),
    );

    // final table should have place_of_origin, not origin or deprecated
    const createTmp = creates[0];
    assert(createTmp.query?.includes('"place_of_origin"'));
    assert(!createTmp.query?.includes('"origin"'));
    assert(!createTmp.query?.includes('"deprecated"'));
  });
});

describe("Column params: fillFrom and coalesce", () => {
  it("should use fillFrom and coalesce when recreating table", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.40.0",
    });

    const steps = migratta
      .migrate()
      .table("species")
      .create({
        id: { type: "ID" },
        origin: { type: "TEXT" },
      })
      .migrate()
      .table("species")
      .column("residence")
      .create({ type: "TEXT" }, { coalesce: "New Earth", fillFrom: "origin" })
      .toContext()
      .toArray();
    console.log(steps);

    // should recreate table due to fillFrom param
    const insertQuery = steps.find(
      (q) =>
        q.query?.includes("INSERT INTO") && q.query?.includes("species_tmp"),
    );
    assert(insertQuery?.query);
    assert(insertQuery.query.includes("COALESCE"));
    assert(insertQuery.query.includes("'New Earth'"));
  });
});

describe("Multiple migrations", () => {
  it("should generate multiple migration blocks", () => {
    const migratta = new Migratta({});

    const steps = migratta
      .migrate()
      .table("users")
      .create({
        id: { type: "ID" },
        name: { type: "TEXT" },
      })
      .migrate()
      .table("users")
      .column("email")
      .create({ type: "TEXT" })
      .migrate()
      .table("users")
      .column("name")
      .rename("fullName")
      .toContext()
      .toArray();
    console.log(steps);

    // should have 3 migration INSERT statements
    const migrationInserts = steps.filter((q) =>
      q.query?.includes('INSERT INTO "migrations"'),
    );
    assert.strictEqual(migrationInserts.length, 3);

    // check migration IDs
    assert.strictEqual(migrationInserts[0].values?.[0], 1);
    assert.strictEqual(migrationInserts[1].values?.[0], 2);
    assert.strictEqual(migrationInserts[2].values?.[0], 3);
  });
});

describe("Extra scenarios", () => {
  it("should handle the example from requirements", () => {
    const migratta = new Migratta({
      dialect: "sqlite",
      dialectVersion: "3.30.0",
    });

    const steps = migratta
      .migrate()
      .table("users")
      .create({
        id: { type: "ID" },
        name: { type: "TEXT" },
      })
      .migrate()
      .table("users")
      .column("year")
      .create({ type: "INTEGER" })
      .migrate()
      .table("users")
      .column("year")
      .rename("birthYear")
      .column("registrationYear")
      .create({ type: "INTEGER" })
      .toContext()
      .toArray();
    console.log(steps);

    // verify structure
    assert(steps.length > 0);

    // first migration should create table
    assert(steps.some((q) => q.query?.includes('CREATE TABLE "users"')));

    // second migration should add year
    assert(
      steps.some(
        (q) => q.query?.includes("ADD COLUMN") && q.query?.includes('"year"'),
      ),
    );

    // third migration should rename and add
    // in 3.30.0, rename is supported
    assert(
      steps.some(
        (q) =>
          q.query?.includes("RENAME COLUMN") && q.query?.includes('"year"'),
      ),
    );
    assert(
      steps.some(
        (q) =>
          q.query?.includes("ADD COLUMN") &&
          q.query?.includes('"registrationYear"'),
      ),
    );
  });
});

describe("TypeScript types generation", () => {
  it("should generate TypeScript types for tables", () => {
    const migratta = new Migratta({});

    const types = migratta
      .migrate()
      .table("users")
      .create({
        id: { type: "ID" },
        name: { type: "TEXT", notNull: true },
        email: { type: "TEXT" },
        age: { type: "INTEGER" },
      })
      .toContext()
      .toTypeScript();

    assert(types.includes("export class UsersTableItem"));
    assert(types.includes("id: number;"));
    assert(types.includes("name: string;"));
    assert(types.includes("email?: string;"));
    assert(types.includes("age?: number;"));
  });
});

describe("Scripts and async scripts", () => {
  it("should add script callbacks", () => {
    const migratta = new Migratta({});

    let scriptExecuted = false;
    const steps = migratta
      .migrate()
      .script(() => {
        scriptExecuted = true;
      })
      .toContext()
      .toArray();
    console.log(steps);

    // should have callback in steps
    assert(steps.some((q) => q.callback !== undefined));
  });

  it("should add async script callbacks", () => {
    const migratta = new Migratta({});

    const steps = migratta
      .migrate()
      .asyncScript(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      })
      .toContext()
      .toArray();
    console.log(steps);

    // should have callbackPromise in steps
    assert(steps.some((q) => q.callbackPromise !== undefined));
  });
});
