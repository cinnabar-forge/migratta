# Agent Guidelines for Migratta

This document provides guidelines for AI coding agents working on the Migratta codebase. Migratta is a TypeScript library for database migrations with a fluent builder API, supporting SQLite.

## Build, Lint, and Test Commands

### Building
- **Full production build**: `npm run build`
  - Uses tsup to create ESM bundle in `dist/`
  - Generates TypeScript declaration files
- **Development build**: `npm run build:dev`
  - Uses TypeScript compiler to build to `build/dev/`
  - Used for testing

### Linting and Formatting
- **Check code quality**: `npm run check`
  - Runs Biome linter on `src/` and `test/` directories
  - Checks for style violations and potential issues
- **Auto-fix issues**: `npm run fix`
  - Applies automatic fixes for linting/formatting issues
  - Uses `--unsafe` flag for more aggressive fixes

### Testing
- **Run all tests**: `npm test`
  - Runs linting, development build, then executes tests
  - Uses Node.js built-in test runner
- **Run single test**: `node --test --grep "pattern"`
  - Example: `node --test --grep "should create a table"`
  - Pattern matches test description strings
- **Run specific test file**: `node --test ./build/dev/test/index.test.js`
  - After running `npm run build:dev`

### CI/CD
- Tests run on Node.js versions: 20.19.5, 22.20.0, 24.10.0, 25.0.0
- GitHub Actions workflow triggers on all branch pushes

## Code Style Guidelines

### TypeScript Configuration
- **Strict mode**: Enabled for all type checking
- **Target**: ES2022
- **Module system**: ES modules (ESM)
- **Module resolution**: Node
- **Type definitions**: Required for all exports

### Formatting (Biome)
- **Indentation**: 2 spaces (no tabs)
- **Line endings**: No semicolons (Biome default)
- **Quotes**: Double quotes for strings
- **Max line length**: Not strictly enforced, use reasonable line breaks

### Naming Conventions
- **Classes**: PascalCase (e.g., `MigrationBuilder`, `Migratta`)
- **Interfaces**: PascalCase (e.g., `Column`, `Config`)
- **Types**: PascalCase (e.g., `ColumnType`, `Step`)
- **Methods/Properties**: camelCase (e.g., `getSteps()`, `migrate()`)
- **Constants**: camelCase or UPPER_CASE depending on context
- **Files**: kebab-case for implementation (e.g., `migration-builder.ts`), PascalCase for types only files

### Import/Export Style
- **Imports**: Use ES module syntax
- **Import order**: Standard library imports first, then local imports
- **Type imports**: Use `import type` for type-only imports
- **Barrel exports**: Use `index.ts` files for clean public APIs
- **Relative imports**: Prefer relative imports within the package

### Architecture Patterns
- **Builder Pattern**: Fluent API with method chaining
- **Context Pattern**: Central state management via context classes
- **Private Fields**: Use `#` prefix for truly private class fields
- **Composition over Inheritance**: Prefer composition for code reuse

### Error Handling
- **Type Safety**: Leverage TypeScript's strict mode for compile-time error catching
- **Input Validation**: Validate parameters at method entry points
- **Graceful Degradation**: Fall back to safe defaults for invalid configurations
- **Descriptive Errors**: Provide clear error messages for debugging

### Code Structure
- **Separation of Concerns**: Public types in `types.ts`, internal types inline
- **Single Responsibility**: Each builder class handles one aspect of migration building
- **Chainable Methods**: Return `this` or appropriate builder instances for fluent API
- **Immutability**: Prefer immutable operations where possible

### Testing Practices
- **Test Framework**: Node.js built-in test runner (`node:test`)
- **Assertion Library**: `node:assert` (strict mode preferred)
- **Test Structure**: `describe` blocks for features, `it` blocks for specific behaviors
- **Test Naming**: Descriptive strings explaining what the test verifies
- **Test Organization**: One main test file mirroring the main entry point
- **Test Coverage**: Focus on API behavior and SQL generation accuracy

### SQL and Database Concerns
- **Dialect Awareness**: Support different SQLite versions with feature detection
- **Safe Operations**: Prefer table recreation over risky ALTER operations when needed
- **Transaction Safety**: Wrap migrations in proper transaction blocks
- **Foreign Key Handling**: Respect referential integrity constraints
- **Migration Tracking**: Maintain migration history in dedicated table

### Documentation
- **TypeScript Types**: Serve as primary documentation for APIs
- **JSON Schema Support**: Use JSON schemas for defining table structures and automatic TypeScript type generation
- **Inline Comments**: Minimal, only for complex business logic
- **README**: Comprehensive usage examples and API documentation
- **Code Comments**: Avoid unless explaining non-obvious algorithms

### Dependencies
- **Minimal Dependencies**: Only essential packages (Biome, TypeScript, tsup)
- **Node Version**: Requires Node.js >= 20
- **Package Type**: ESM-only package
- **Type Definitions**: Generated automatically via tsup

### Git and Version Control
- **Commit Messages**: Follow conventional commit format when applicable
- **Branching**: Feature branches for development
- **Versioning**: Semantic versioning (currently pre-1.0, unstable)
- **Changelog**: Maintain CHANGELOG.md for version history

### Performance Considerations
- **Bundle Size**: Optimize for minimal production bundle
- **Runtime Performance**: SQL generation should be fast and efficient
- **Memory Usage**: Avoid large in-memory data structures
- **Build Speed**: Keep TypeScript compilation fast for development

### Security
- **Input Sanitization**: Escape SQL parameters properly
- **No Dynamic SQL**: Avoid string concatenation for SQL generation
- **Safe Defaults**: Use conservative defaults for potentially dangerous operations
- **Version Constraints**: Pin dependency versions for reproducible builds

This document should be updated as the codebase evolves and new patterns emerge.