# Migratta

_By Cinnabar Forge_

**DISCLAIMER**: Until version 1.0.0, all versions below should be considered unstable and are subject to change.

## Getting Started

### Installation

Install Migratta using npm:

```bash
npm install migratta
```

### Usage

Example (using [Cinnabar Forge SQLite Wrapper](https://github.com/cinnabar-forge/cf-sqlite3)):

```bash
npm install @cinnabar-forge/cf-sqlite3
```

```javascript
import fs from "fs";
import cfSqlite3 from "@cinnabar-forge/cf-sqlite3";
import cfMigrations from "migratta";

// Init sqlite3 database
const db = cfSqlite3("./default.sqlite");

// Init migrations object
const migrations = cfMigrations();

// Init migrations DB 'migrations' table
await db.exec(migrations.getMigrationTableSqlCreateQuery());

// Get latest migration revision
const latestRevision = await db.get(
  migrations.getMigrationRevisionSqlSelectQuery()
);

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
  await db.run(query.query, query.args);
}
```

## Contributing

Contributions are welcome! If you find any issues or have suggestions for improvements, feel free to open an issue or create a pull request.

Clone the repository and install dependencies:

```bash
git clone git@github.com:cinnabar-forge/migratta.git
cd migratta
npm install
```

## License

Migratta is licensed under the ISC License - see the [LICENSE](LICENSE) file for details.

## Authors

- Timur Moziev ([@TimurRin](https://github.com/TimurRin))
