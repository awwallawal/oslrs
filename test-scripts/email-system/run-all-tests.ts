/**
 * Email System Manual Test Runner
 *
 * Story 1.11: Email Invitation System
 *
 * Run: pnpm tsx test-scripts/email-system/run-all-tests.ts
 *
 * Prerequisites:
 * - Redis running (pnpm services:up)
 * - API running (pnpm --filter @oslsr/api dev)
 * - Database seeded with roles
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface TestSuite {
  name: string;
  file: string;
  description: string;
}

const testSuites: TestSuite[] = [
  {
    name: 'OTP Verification',
    file: 'test-otp-verification.ts',
    description: 'AC6: Hybrid verification (Magic Link + OTP)',
  },
  {
    name: 'Budget Tracking',
    file: 'test-budget-tracking.ts',
    description: 'AC4: Tiered budget with daily/monthly limits',
  },
];

async function runTest(suite: TestSuite): Promise<boolean> {
  return new Promise((resolve) => {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`Running: ${suite.name}`);
    console.log(`Description: ${suite.description}`);
    console.log(`${'='.repeat(60)}\n`);

    const testPath = path.join(__dirname, suite.file);
    const proc = spawn('npx', ['tsx', testPath], {
      stdio: 'inherit',
      shell: true,
      env: process.env,
    });

    proc.on('close', (code) => {
      resolve(code === 0);
    });

    proc.on('error', (err) => {
      console.error(`Failed to run ${suite.name}:`, err);
      resolve(false);
    });
  });
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════╗
║     Story 1.11: Email Invitation System - Manual Tests       ║
╠══════════════════════════════════════════════════════════════╣
║  Make sure services are running:                             ║
║    pnpm services:up                                          ║
║    pnpm --filter @oslsr/api dev                              ║
╚══════════════════════════════════════════════════════════════╝
`);

  const results: { name: string; passed: boolean }[] = [];

  for (const suite of testSuites) {
    const passed = await runTest(suite);
    results.push({ name: suite.name, passed });
  }

  // Final summary
  console.log(`\n${'='.repeat(60)}`);
  console.log('FINAL RESULTS');
  console.log(`${'='.repeat(60)}\n`);

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;

  results.forEach((r) => {
    const icon = r.passed ? '\x1b[32m✓\x1b[0m' : '\x1b[31m✗\x1b[0m';
    console.log(`  ${icon} ${r.name}`);
  });

  console.log(`\n  Passed: ${passed}/${results.length}`);

  if (failed > 0) {
    console.log(`\n\x1b[31m${failed} test suite(s) failed.\x1b[0m`);
    process.exit(1);
  } else {
    console.log(`\n\x1b[32mAll test suites passed!\x1b[0m`);
    console.log(`\nYou can now mark Task 8.5 as complete.`);
    console.log(`\nTo clean up: rm -rf test-scripts/`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error('Test runner error:', err);
  process.exit(1);
});
