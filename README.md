# Migratta

_By Cinnabar Forge_

> **DISCLAIMER**: This project is not production ready. All versions below 1.0.0 should be considered unstable

Database migrations library

## Installation

### npm

```bash
npm install migratta
```

### Usage

```javascript
import fs from "node:fs";
import Database from "better-sqlite3";
import cfMigrations from "migratta";

// Init sqlite3 database
const db = new Database("./default.sqlite");

// Init migrations object
const migrations = cfMigrations("0.1.0");

// Init migrations DB 'migrations' table
db.exec(migrations.getMigrationTableSqlCreateQuery());

// Get latest migration revision
const latestRevision = db
  .prepare(migrations.getMigrationRevisionSqlSelectQuery())
  .get();

// Initial migration (migration 0)
migrations.createMigration();
migrations.createTable("species", {
  id: { type: "ID" },
  name: { default: "Unnamed species", notNull: true, type: "TEXT" },
  origin: { type: "TEXT" },
  population: { type: "INTEGER" },
});

// Rename column (migration 1)
migrations.createMigration();
migrations.renameTableColumn("species", "origin", "place_of_origin");

// Create column (migration 2)
migrations.createMigration();
migrations.createTable("planets", {
  id: { type: "ID" },
  name: { default: "Unnamed planet", notNull: true, type: "TEXT" },
  photo: { type: "BLOB" },
});

// Change column name and type (migration 3)
migrations.createMigration();
migrations.changeTableColumn("planets", "photo", { type: "TEXT" });
migrations.recreateTable("planets");

// Generate Typescript types
fs.writeFileSync("./types.ts", migrations.getTypescriptTypesFile());

// Apply queries. This will apply all migrations that are not applied yet
const queries = migrations.getMigrationsSqlQueries(latestRevision);
console.log(queries);
for (const query of queries) {
  if (query.args) {
    db.prepare(query.query).run(...query.args);
  } else {
    db.exec(query.query);
  }
}
```

## Contributing

Visit [`CONTRIBUTING.md`](CONTRIBUTING.md).

Current maintainer - Timur Moziev ([@TimurRin](https://github.com/TimurRin))

## License

Visit [`LICENSE`](LICENSE).

## Anca

This repository is a part of [Anca](https://github.com/cinnabar-forge/anca) standardization project. Parts of the files and code are generated by Anca.
