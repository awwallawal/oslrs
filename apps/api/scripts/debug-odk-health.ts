/**
 * ODK Integration Diagnostic Tool
 *
 * Comprehensive diagnostic script for troubleshooting ODK Central integration.
 * Tests environment, database, Redis, and ODK Central connectivity.
 *
 * Usage: pnpm tsx apps/api/scripts/debug-odk-health.ts [--verbose]
 *
 * Options:
 *   --verbose    Show detailed logs from ODK requests
 *   --skip-db    Skip database checks
 *   --skip-redis Skip Redis checks
 */
import 'dotenv/config';

const VERBOSE = process.argv.includes('--verbose');
const SKIP_DB = process.argv.includes('--skip-db');
const SKIP_REDIS = process.argv.includes('--skip-redis');

interface DiagnosticResult {
  name: string;
  status: 'pass' | 'fail' | 'skip' | 'warn';
  message: string;
  details?: Record<string, unknown>;
}

const results: DiagnosticResult[] = [];

function log(message: string) {
  console.log(message);
}

function logVerbose(message: string) {
  if (VERBOSE) console.log(`  [verbose] ${message}`);
}

function addResult(result: DiagnosticResult) {
  results.push(result);
  const icon = result.status === 'pass' ? '✅' : result.status === 'fail' ? '❌' : result.status === 'warn' ? '⚠️' : '⏭️';
  log(`${icon} ${result.name}: ${result.message}`);
  if (VERBOSE && result.details) {
    log(`   Details: ${JSON.stringify(result.details, null, 2)}`);
  }
}

async function checkEnvironment() {
  log('\n📋 ENVIRONMENT VARIABLES\n' + '─'.repeat(50));

  const required = [
    { key: 'ODK_CENTRAL_URL', sensitive: false },
    { key: 'ODK_ADMIN_EMAIL', sensitive: false },
    { key: 'ODK_ADMIN_PASSWORD', sensitive: true },
    { key: 'ODK_PROJECT_ID', sensitive: false },
    { key: 'ODK_TOKEN_ENCRYPTION_KEY', sensitive: true, expectedLength: 64 },
  ];

  const optional = [
    { key: 'DATABASE_URL', sensitive: true },
    { key: 'REDIS_URL', sensitive: false },
  ];

  let allRequiredSet = true;

  for (const { key, sensitive, expectedLength } of required) {
    const value = process.env[key];
    const isSet = !!value;
    const lengthOk = !expectedLength || value?.length === expectedLength;

    if (!isSet) {
      allRequiredSet = false;
      addResult({
        name: key,
        status: 'fail',
        message: 'NOT SET (required)',
      });
    } else if (!lengthOk) {
      allRequiredSet = false;
      addResult({
        name: key,
        status: 'fail',
        message: `Invalid length: ${value?.length} (expected ${expectedLength})`,
      });
    } else {
      addResult({
        name: key,
        status: 'pass',
        message: sensitive ? '✓ SET (hidden)' : value!,
      });
    }
  }

  for (const { key, sensitive } of optional) {
    const value = process.env[key];
    addResult({
      name: key,
      status: value ? 'pass' : 'warn',
      message: value ? (sensitive ? '✓ SET (hidden)' : value) : 'NOT SET (optional)',
    });
  }

  return allRequiredSet;
}

async function checkDatabase() {
  log('\n🗄️  DATABASE CONNECTIVITY\n' + '─'.repeat(50));

  if (SKIP_DB) {
    addResult({ name: 'Database', status: 'skip', message: 'Skipped (--skip-db)' });
    return true;
  }

  try {
    const { db } = await import('../src/db/index.js');
    const { sql } = await import('drizzle-orm');

    // Test basic connectivity
    const result = await db.execute(sql`SELECT 1 as test`);
    addResult({
      name: 'Database Connection',
      status: 'pass',
      message: 'Connected successfully',
    });

    // Check ODK tables exist
    const tables = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'odk%'
    `);

    const tableNames = (tables.rows as Array<{ table_name: string }>).map(r => r.table_name);

    if (tableNames.includes('odk_sync_failures') && tableNames.includes('odk_app_users')) {
      addResult({
        name: 'ODK Tables',
        status: 'pass',
        message: `Found: ${tableNames.join(', ')}`,
      });
    } else {
      addResult({
        name: 'ODK Tables',
        status: 'fail',
        message: `Missing tables. Found: ${tableNames.length ? tableNames.join(', ') : 'none'}`,
        details: { expected: ['odk_sync_failures', 'odk_app_users'], found: tableNames },
      });
      return false;
    }

    // Check questionnaire tables
    const qTables = await db.execute(sql`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name LIKE 'questionnaire%'
    `);
    const qTableNames = (qTables.rows as Array<{ table_name: string }>).map(r => r.table_name);
    addResult({
      name: 'Questionnaire Tables',
      status: qTableNames.length > 0 ? 'pass' : 'warn',
      message: qTableNames.length > 0 ? `Found: ${qTableNames.join(', ')}` : 'No questionnaire tables found',
    });

    return true;
  } catch (error) {
    addResult({
      name: 'Database Connection',
      status: 'fail',
      message: (error as Error).message,
    });
    return false;
  }
}

async function checkRedis() {
  log('\n📮 REDIS CONNECTIVITY\n' + '─'.repeat(50));

  if (SKIP_REDIS) {
    addResult({ name: 'Redis', status: 'skip', message: 'Skipped (--skip-redis)' });
    return true;
  }

  try {
    const { Redis } = await import('ioredis');
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 5000,
    });

    await redis.ping();
    addResult({
      name: 'Redis Connection',
      status: 'pass',
      message: 'Connected successfully',
    });

    // Check for ODK health cache
    const healthCache = await redis.get('odk:health:last_connectivity');
    if (healthCache) {
      const data = JSON.parse(healthCache);
      addResult({
        name: 'ODK Health Cache',
        status: 'pass',
        message: `Last check: ${data.lastChecked}, Reachable: ${data.reachable}`,
        details: data,
      });
    } else {
      addResult({
        name: 'ODK Health Cache',
        status: 'warn',
        message: 'No cached health data (run a health check first)',
      });
    }

    await redis.quit();
    return true;
  } catch (error) {
    addResult({
      name: 'Redis Connection',
      status: 'fail',
      message: (error as Error).message,
    });
    return false;
  }
}

async function checkOdkIntegration() {
  log('\n🔗 ODK INTEGRATION MODULE\n' + '─'.repeat(50));

  try {
    const { isOdkFullyConfigured, validateOdkTokenConfig, getOdkConfig } = await import('@oslsr/odk-integration');

    const validation = validateOdkTokenConfig();

    addResult({
      name: 'Config Validation',
      status: validation.valid ? 'pass' : 'fail',
      message: validation.valid ? 'All configuration valid' : `Errors: ${validation.errors.join(', ')}`,
      details: validation as unknown as Record<string, unknown>,
    });

    addResult({
      name: 'Basic Operations',
      status: validation.features.basicOperations ? 'pass' : 'fail',
      message: validation.features.basicOperations ? 'Enabled' : 'Disabled - check ODK_CENTRAL_URL, EMAIL, PASSWORD, PROJECT_ID',
    });

    addResult({
      name: 'Token Management',
      status: validation.features.tokenManagement ? 'pass' : 'fail',
      message: validation.features.tokenManagement ? 'Enabled' : 'Disabled - check ODK_TOKEN_ENCRYPTION_KEY',
    });

    const config = getOdkConfig();
    addResult({
      name: 'getOdkConfig()',
      status: config ? 'pass' : 'fail',
      message: config ? `URL: ${config.ODK_CENTRAL_URL}` : 'Returns null',
    });

    return isOdkFullyConfigured();
  } catch (error) {
    addResult({
      name: 'ODK Integration Module',
      status: 'fail',
      message: (error as Error).message,
    });
    return false;
  }
}

async function checkOdkConnectivity() {
  log('\n🌐 ODK CENTRAL CONNECTIVITY\n' + '─'.repeat(50));

  try {
    const { createOdkHealthService, getOdkConfig } = await import('@oslsr/odk-integration');

    const config = getOdkConfig();
    if (!config) {
      addResult({
        name: 'ODK Connectivity',
        status: 'skip',
        message: 'Skipped - ODK not configured',
      });
      return false;
    }

    const healthService = createOdkHealthService({
      persistence: {
        createSyncFailure: async () => { throw new Error('Not implemented'); },
        getSyncFailures: async () => [],
        getSyncFailureById: async () => null,
        updateSyncFailure: async () => {},
        deleteSyncFailure: async () => {},
      },
      logger: {
        info: (obj: Record<string, unknown>) => logVerbose(`[INFO] ${JSON.stringify(obj)}`),
        warn: (obj: Record<string, unknown>) => logVerbose(`[WARN] ${JSON.stringify(obj)}`),
        error: (obj: Record<string, unknown>) => logVerbose(`[ERROR] ${JSON.stringify(obj)}`),
        debug: (obj: Record<string, unknown>) => logVerbose(`[DEBUG] ${JSON.stringify(obj)}`),
      },
    });

    log('  Checking connectivity...');
    const startTime = Date.now();
    const result = await healthService.checkOdkConnectivity();
    const duration = Date.now() - startTime;

    addResult({
      name: 'ODK Central Reachable',
      status: result.reachable ? 'pass' : 'fail',
      message: result.reachable
        ? `Yes (${result.latencyMs}ms latency)`
        : `No - ${result.consecutiveFailures} consecutive failures`,
      details: result as unknown as Record<string, unknown>,
    });

    // Try to list forms
    if (result.reachable) {
      try {
        const projectId = parseInt(String(config.ODK_PROJECT_ID), 10);
        const submissions = await healthService.getSubmissionCounts(projectId);
        addResult({
          name: 'Form Access',
          status: 'pass',
          message: `Found ${submissions.byForm.length} form(s) with ${submissions.odkCount} total submissions`,
          details: { forms: submissions.byForm },
        });
      } catch (error) {
        addResult({
          name: 'Form Access',
          status: 'warn',
          message: (error as Error).message,
        });
      }
    }

    return result.reachable;
  } catch (error) {
    addResult({
      name: 'ODK Connectivity',
      status: 'fail',
      message: (error as Error).message,
    });
    return false;
  }
}

async function printSummary() {
  log('\n' + '═'.repeat(50));
  log('📊 DIAGNOSTIC SUMMARY');
  log('═'.repeat(50));

  const passed = results.filter(r => r.status === 'pass').length;
  const failed = results.filter(r => r.status === 'fail').length;
  const warnings = results.filter(r => r.status === 'warn').length;
  const skipped = results.filter(r => r.status === 'skip').length;

  log(`\n  ✅ Passed:   ${passed}`);
  log(`  ❌ Failed:   ${failed}`);
  log(`  ⚠️  Warnings: ${warnings}`);
  log(`  ⏭️  Skipped:  ${skipped}`);

  if (failed > 0) {
    log('\n❌ ISSUES TO FIX:');
    results.filter(r => r.status === 'fail').forEach(r => {
      log(`   • ${r.name}: ${r.message}`);
    });
  }

  if (warnings > 0) {
    log('\n⚠️  WARNINGS:');
    results.filter(r => r.status === 'warn').forEach(r => {
      log(`   • ${r.name}: ${r.message}`);
    });
  }

  log('\n' + '═'.repeat(50));

  if (failed === 0) {
    log('🎉 All critical checks passed! ODK integration is ready.');
  } else {
    log('🔧 Please fix the issues above before using ODK features.');
    process.exit(1);
  }
}

async function main() {
  log('═'.repeat(50));
  log('🔍 ODK INTEGRATION DIAGNOSTIC TOOL');
  log('═'.repeat(50));
  log(`\nTimestamp: ${new Date().toISOString()}`);
  log(`Verbose mode: ${VERBOSE ? 'ON' : 'OFF'}`);

  await checkEnvironment();
  await checkDatabase();
  await checkRedis();
  const odkConfigured = await checkOdkIntegration();

  if (odkConfigured) {
    await checkOdkConnectivity();
  }

  await printSummary();
}

main().catch((error) => {
  console.error('\n💥 FATAL ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
});
