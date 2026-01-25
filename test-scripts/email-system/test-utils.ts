/**
 * Test utilities for Email System manual testing
 */

const API_BASE = process.env.API_URL || 'http://localhost:3000/api/v1';

// Modulus 11 algorithm for Nigerian NIN checksum generation
function modulus11Generate(input: string): string {
  if (!/^\d{10}$/.test(input)) {
    throw new Error('Input must be exactly 10 digits');
  }
  const digits = input.split('').map(Number);
  const weights = [10, 9, 8, 7, 6, 5, 4, 3, 2, 1];
  let sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += digits[i] * weights[i];
  }
  const remainder = sum % 11;
  const checkDigit = remainder === 0 ? 0 : 11 - remainder;
  if (checkDigit === 10) {
    throw new Error('This base number cannot have a valid Modulus 11 check digit');
  }
  return input + checkDigit;
}

export interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  details?: unknown;
}

const results: TestResult[] = [];

export function log(message: string): void {
  console.log(`  ${message}`);
}

export function pass(name: string, message = 'OK'): void {
  console.log(`  \x1b[32m[PASS]\x1b[0m ${name}: ${message}`);
  results.push({ name, passed: true, message });
}

export function fail(name: string, message: string, details?: unknown): void {
  console.log(`  \x1b[31m[FAIL]\x1b[0m ${name}: ${message}`);
  if (details) console.log(`         Details:`, details);
  results.push({ name, passed: false, message, details });
}

export function section(title: string): void {
  console.log(`\n\x1b[36m=== ${title} ===\x1b[0m\n`);
}

export function summary(): { passed: number; failed: number } {
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log(`\n\x1b[36m=== SUMMARY ===\x1b[0m`);
  console.log(`  Total: ${results.length}`);
  console.log(`  \x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`  \x1b[31mFailed: ${failed}\x1b[0m`);

  if (failed > 0) {
    console.log(`\n\x1b[31mFailed tests:\x1b[0m`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
  }

  return { passed, failed };
}

export async function api(
  method: string,
  path: string,
  body?: unknown,
  token?: string
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

export function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
}

export function generateTestPhone(): string {
  return `+23480${Date.now().toString().slice(-8)}`;
}

// NIN generator with valid Verhoeff check digit
export function generateTestNin(): string {
  const base = Date.now().toString().slice(-10);
  return modulus11Generate(base);
}

export { results };
