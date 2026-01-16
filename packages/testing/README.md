# @oslsr/testing

Test infrastructure and dashboard generation for the OSLSR monorepo.

## Features

- **LiveReporter**: Custom Vitest reporter that captures test results to JSON files
- **Test Dashboard**: Visual HTML dashboard showing test results by stage and package
- **Result Merger**: Consolidates multiple test result files from parallel Turbo runs
- **Tag Filtering**: Filter tests by category (GoldenPath, Security, Contract, UI)
- **Performance Metrics**: View slowest tests and average duration per package

## Installation

The package is part of the OSLSR monorepo. It's automatically available to all workspaces.

## Usage

### Generate Test Dashboard

After running tests, generate the dashboard:

```bash
# Generate dashboard with default settings
pnpm test:dashboard

# Generate dashboard and open in browser
pnpm test:dashboard -- --open

# Generate dashboard to custom path
pnpm test:dashboard -- --output reports/test-results.html

# Keep temporary files for debugging
pnpm test:dashboard -- --no-cleanup
```

### CLI Options

| Option | Alias | Description |
|--------|-------|-------------|
| `--output <path>` | `-o` | Output path for the dashboard HTML (default: `test-pipeline.html`) |
| `--open` | | Open the dashboard in the default browser after generation |
| `--no-cleanup` | | Keep temporary `.vitest-live-*.json` files after generation |
| `--help` | `-h` | Show help message |

## Test Tagging Conventions

Tests should be tagged using the provided decorators for proper categorization in the dashboard.

### Available Decorators

```typescript
import { goldenPath, securityTest, contractTest, uiTest } from '@oslsr/testing';

// Golden Path tests - critical user flows (BLOCKING)
goldenPath('should create user successfully', async () => {
  // ...
});

// Security tests - authentication, authorization (BLOCKING)
securityTest('should reject unauthorized access', async () => {
  // ...
});

// Contract tests - API contracts, schemas (BLOCKING)
contractTest('should match API response schema', async () => {
  // ...
});

// UI tests - visual components (NON-BLOCKING)
uiTest('should render dashboard correctly', async () => {
  // ...
});
```

### Test Categories

| Category | Decorator | Blocking | Description |
|----------|-----------|----------|-------------|
| GoldenPath | `goldenPath()` | Yes | Critical user flows that must pass |
| Security | `securityTest()` | Yes | Authentication and authorization tests |
| Contract | `contractTest()` | Yes | API contract and schema validation |
| UI | `uiTest()` | No | Visual component tests |
| Performance | `taggedTest({ category: 'Performance' })` | Configurable | Performance benchmarks |

### Custom Tags

For more control, use `taggedTest` directly:

```typescript
import { taggedTest } from '@oslsr/testing';

taggedTest(
  { category: 'Security', sla: 2, blocking: true },
  'should complete within 2 seconds',
  async () => {
    // Test with SLA enforcement
  }
);
```

## Test Pipeline Stages

Tests run in a specific order via Turbo:

```
Golden Path → Security → Contract → UI
```

Each stage depends on the previous one passing (for blocking tests).

## Dashboard Features

The generated `test-pipeline.html` includes:

- **Summary Cards**: Total tests, passed, failed, skipped counts
- **Stage Breakdown**: Tests grouped by execution stage with pass/fail counts
- **Package Breakdown**: Tests grouped by package (api, web, utils, etc.)
- **Tag Filtering**: Click tags to filter the test list
- **Performance Metrics**: Total duration, slowest tests (top 10), average per package
- **Error Details**: Error messages and stack traces for failed tests
- **Pipeline Visualization**: Mermaid diagram showing test flow

## File Structure

```
packages/testing/
├── src/
│   ├── index.ts          # Main exports
│   ├── decorators.ts     # Test decorators (goldenPath, securityTest, etc.)
│   ├── reporter.ts       # LiveReporter (Vitest reporter)
│   ├── merger.ts         # Result file merger
│   ├── cleanup.ts        # Temp file cleanup
│   ├── dashboard.ts      # Dashboard generator
│   ├── cli.ts            # CLI entry point
│   └── __tests__/        # Unit tests
├── vitest.config.ts
├── package.json
└── README.md
```

## Output Files

| File | Description |
|------|-------------|
| `.vitest-live-{timestamp}-{pid}.json` | Temporary per-process result files |
| `.vitest-live.json` | Consolidated results (final) |
| `test-pipeline.html` | Generated dashboard |

## Integration

### Vitest Configuration

The reporter is configured in `vitest.base.ts`:

```typescript
import { LiveReporter } from '@oslsr/testing';

export const baseConfig = defineConfig({
  test: {
    reporters: ['default', 'json', new LiveReporter({ outputDir: __dirname })],
  },
});
```

### Turbo Configuration

Tests run via Turbo with stage dependencies in `turbo.json`:

```json
{
  "pipeline": {
    "test:golden": { "dependsOn": ["^build"] },
    "test:security": { "dependsOn": ["test:golden"] },
    "test:contract": { "dependsOn": ["test:security"] },
    "test:ui": { "dependsOn": ["test:contract"] },
    "test": { "dependsOn": ["test:golden", "test:security", "test:contract", "test:ui"] },
    "test:dashboard": { "dependsOn": ["test"] }
  }
}
```

### GitHub Actions

The CI/CD pipeline automatically generates and uploads the dashboard:

1. Runs all test stages
2. Generates dashboard
3. Uploads as build artifact
4. Adds summary to job output

## Troubleshooting

### No test results found

Ensure tests have run and produced `.vitest-live-*.json` files:

```bash
ls -la .vitest-live-*.json
```

### Tests not appearing in dashboard

1. Check that tests use the tagging decorators
2. Verify the reporter is configured in `vitest.config.ts`
3. Run with `--no-cleanup` flag to inspect raw result files

### Dashboard not opening in browser

The `--open` flag uses system commands. Ensure:
- Windows: `start` command is available
- macOS: `open` command is available
- Linux: `xdg-open` is installed
