# Changelog

This changelog is updated by [Cinnabar Meta](https://github.com/cinnabar-forge/node-meta).

## [Unreleased]

Visit the link above to see all unreleased changes.

[comment]: # (Insert new version after this line)

## [0.6.0](https://github.com/cinnabar-forge/migratta/releases/tag/v0.6.0) — 2025-10-25

This version brings a breaking change: settings. Main entry function now accepts settings instead of version (appVersion, firstMigrationId (default 1), ignoreTransactionStatements (default false), useOldMigrationTableQuery (use this feature if you have used migratta before))

Full list:

- add renameTable ([246c936])
- add settings ([246c936])
- chore ([de015e5])
- prepare release ([e0d5f60])
- rewrite to typescript ([246c936])
- update npm packages ([26539f2])

[e0d5f60]: https://github.com/cinnabar-forge/migratta/commit/e0d5f60
[de015e5]: https://github.com/cinnabar-forge/migratta/commit/de015e5
[246c936]: https://github.com/cinnabar-forge/migratta/commit/246c936
[26539f2]: https://github.com/cinnabar-forge/migratta/commit/26539f2


## [0.5.0](https://github.com/cinnabar-forge/migratta/releases/tag/v0.5.0) — 2025-01-20

- add anca support ([2ccc0d0])
- comply anca ([ea71f4e])
- fix app version ([e7f7946])
- remove versionColumnName support ([e7f7946])
- switch to biomejs ([2ccc0d0])
- update action ([e7f7946])
- update example ([e7f7946])
- update tests ([e7f7946])

[e7f7946]: https://github.com/cinnabar-forge/migratta/commit/e7f7946
[ea71f4e]: https://github.com/cinnabar-forge/migratta/commit/ea71f4e
[2ccc0d0]: https://github.com/cinnabar-forge/migratta/commit/2ccc0d0


[unreleased]: https://github.com/cinnabar-forge/migratta/compare/v0.6.0...HEAD
