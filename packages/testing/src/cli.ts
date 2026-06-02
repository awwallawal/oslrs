#!/usr/bin/env node
import { generateDashboard } from './dashboard.js';
import { cleanupTempFiles } from './cleanup.js';
import path from 'path';
import { exec } from 'child_process';
import { platform } from 'os';

interface CliOptions {
  output?: string;
  open?: boolean;
  noCleanup?: boolean;
  help?: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {};

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--output':
      case '-o':
        options.output = args[++i];
        break;
      case '--open':
        options.open = true;
        break;
      case '--no-cleanup':
        options.noCleanup = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
OSLSR Test Dashboard Generator

Usage: oslsr-test-dashboard [options]

Options:
  -o, --output <path>   Output path for the dashboard HTML (default: test-pipeline.html)
  --open                Open the dashboard in the default browser after generation
  --no-cleanup          Keep temporary .vitest-live-*.json files after generation
  -h, --help            Show this help message

Examples:
  # Generate dashboard with default settings
  oslsr-test-dashboard

  # Generate dashboard and open in browser
  oslsr-test-dashboard --open

  # Generate dashboard to custom path
  oslsr-test-dashboard --output reports/test-results.html

  # Generate dashboard without cleaning up temp files (for debugging)
  oslsr-test-dashboard --no-cleanup
`);
}

function openInBrowser(filePath: string): void {
  const absolutePath = path.resolve(filePath);
  const os = platform();

  let command: string;
  switch (os) {
    case 'darwin':
      command = `open "${absolutePath}"`;
      break;
    case 'win32':
      command = `start "" "${absolutePath}"`;
      break;
    default:
      command = `xdg-open "${absolutePath}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.warn(`[Dashboard] Could not open browser: ${error.message}`);
    }
  });
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const options = parseArgs(args);

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  const rootDir = process.cwd();
  const outputPath = options.output
    ? path.resolve(rootDir, options.output)
    : path.resolve(rootDir, 'test-pipeline.html');

  try {
    // Generate dashboard
    await generateDashboard(rootDir, outputPath, { noCleanup: options.noCleanup });

    // Cleanup temp files unless --no-cleanup flag is set
    if (!options.noCleanup) {
      const cleanupResult = await cleanupTempFiles(rootDir);
      if (cleanupResult.deletedCount > 0) {
        console.log(`[Dashboard] Cleaned up ${cleanupResult.deletedCount} temporary files`);
      }
    } else {
      console.log('[Dashboard] Keeping temporary files (--no-cleanup flag)');
    }

    // Open in browser if requested
    if (options.open) {
      console.log('[Dashboard] Opening in browser...');
      openInBrowser(outputPath);
    }
  } catch (error) {
    console.error('[Dashboard] Error:', (error as Error).message);
    process.exit(1);
  }
}

main();
