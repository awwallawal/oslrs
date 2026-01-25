/**
 * Test: OTP Verification (AC6 - ADR-015 Hybrid Verification)
 *
 * Tests:
 * 1. Registration generates OTP stored in Redis
 * 2. OTP verification activates user
 * 3. Invalid OTP is rejected
 * 4. Non-existent email OTP is rejected
 */

import { execSync } from 'child_process';

const API_BASE = process.env.API_URL || 'http://localhost:3000/api/v1';
const OTP_KEY_PREFIX = 'verification_otp:';

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

// Test results tracking
const results: { name: string; passed: boolean; message: string }[] = [];

function pass(name: string, message = 'OK'): void {
  console.log(`  \x1b[32m[PASS]\x1b[0m ${name}: ${message}`);
  results.push({ name, passed: true, message });
}

function fail(name: string, message: string): void {
  console.log(`  \x1b[31m[FAIL]\x1b[0m ${name}: ${message}`);
  results.push({ name, passed: false, message });
}

function log(message: string): void {
  console.log(`  ${message}`);
}

// Use docker exec to read Redis
function redisGet(key: string): string | null {
  try {
    const result = execSync(`docker exec oslsr_redis redis-cli GET "${key}"`, {
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
    return result === '(nil)' || result === '' ? null : result;
  } catch {
    return null;
  }
}

// API helper
async function api(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => null);
  return { status: response.status, data };
}

function generateTestEmail(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@example.com`;
}

let phoneCounter = 0;
let ninCounter = 0;

function generateTestPhone(): string {
  phoneCounter++;
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `+23480${Date.now().toString().slice(-4)}${random}`;
}

function generateTestNin(): string {
  ninCounter++;
  // Generate 10-digit base with counter and randomness to avoid collisions
  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
  const base = `${ninCounter}${timestamp}${random}`.slice(0, 10).padStart(10, '0');
  return modulus11Generate(base);
}

async function runTests() {
  console.log(`\n\x1b[36m=== OTP Verification Tests (AC6 - ADR-015) ===\x1b[0m\n`);

  // Test 1: Registration stores OTP in Redis
  log('Test 1: Registration stores OTP in Redis...');
  const email1 = generateTestEmail();
  const regResult = await api('POST', '/auth/public/register', {
    fullName: 'Test OTP User',
    email: email1,
    phone: generateTestPhone(),
    nin: generateTestNin(),
    password: 'SecurePass123!',
    confirmPassword: 'SecurePass123!',
  });

  if (regResult.status === 201) {
    const otpData = redisGet(`${OTP_KEY_PREFIX}${email1.toLowerCase()}`);
    if (otpData) {
      try {
        const parsed = JSON.parse(otpData);
        if (parsed.otp && parsed.otp.length === 6 && /^\d{6}$/.test(parsed.otp)) {
          pass('OTP stored in Redis', `6-digit OTP found: ${parsed.otp}`);
        } else {
          fail('OTP stored in Redis', `OTP format invalid: ${JSON.stringify(parsed)}`);
        }
      } catch {
        fail('OTP stored in Redis', `Could not parse OTP data: ${otpData}`);
      }
    } else {
      fail('OTP stored in Redis', 'No OTP found in Redis');
    }
  } else {
    fail('OTP stored in Redis', `Registration failed with status ${regResult.status}: ${JSON.stringify(regResult.data)}`);
  }

  // Test 2: Valid OTP activates user
  log('Test 2: Valid OTP activates user...');
  const email2 = generateTestEmail();
  const reg2 = await api('POST', '/auth/public/register', {
    fullName: 'Test OTP UserTwo',
    email: email2,
    phone: generateTestPhone(),
    nin: generateTestNin(),
    password: 'SecurePass123!',
    confirmPassword: 'SecurePass123!',
  });

  if (reg2.status === 201) {
    const otpData2 = redisGet(`${OTP_KEY_PREFIX}${email2.toLowerCase()}`);
    if (otpData2) {
      const { otp } = JSON.parse(otpData2);
      const verifyResult = await api('POST', '/auth/verify-otp', { email: email2, otp });

      if (verifyResult.status === 200) {
        const data = verifyResult.data as { data?: { success?: boolean } };
        if (data?.data?.success) {
          pass('Valid OTP activates user', 'User verified successfully');
        } else {
          fail('Valid OTP activates user', `Unexpected response: ${JSON.stringify(verifyResult.data)}`);
        }
      } else {
        fail('Valid OTP activates user', `Status ${verifyResult.status}: ${JSON.stringify(verifyResult.data)}`);
      }
    } else {
      fail('Valid OTP activates user', 'Could not get OTP from Redis');
    }
  } else {
    fail('Valid OTP activates user', `Registration failed: ${reg2.status}: ${JSON.stringify(reg2.data)}`);
  }

  // Test 3: Invalid OTP is rejected
  log('Test 3: Invalid OTP is rejected...');
  const email3 = generateTestEmail();
  await api('POST', '/auth/public/register', {
    fullName: 'Test OTP UserThree',
    email: email3,
    phone: generateTestPhone(),
    nin: generateTestNin(),
    password: 'SecurePass123!',
    confirmPassword: 'SecurePass123!',
  });

  const badOtpResult = await api('POST', '/auth/verify-otp', {
    email: email3,
    otp: '000000', // Wrong OTP
  });

  if (badOtpResult.status === 400) {
    pass('Invalid OTP rejected', 'Got 400 error as expected');
  } else {
    fail('Invalid OTP rejected', `Expected 400, got ${badOtpResult.status}`);
  }

  // Test 4: OTP for non-existent email is rejected
  log('Test 4: OTP for non-existent email rejected...');
  const noUserResult = await api('POST', '/auth/verify-otp', {
    email: 'nonexistent-user-abc123@example.com',
    otp: '123456',
  });

  if (noUserResult.status === 400) {
    pass('Non-existent email rejected', 'Got 400 error as expected');
  } else {
    fail('Non-existent email rejected', `Expected 400, got ${noUserResult.status}`);
  }

  // Test 5: OTP deleted after successful verification
  log('Test 5: OTP deleted after verification...');
  const otpAfterVerify = redisGet(`${OTP_KEY_PREFIX}${email2.toLowerCase()}`);
  if (otpAfterVerify === null) {
    pass('OTP deleted after verification', 'Redis key removed');
  } else {
    fail('OTP deleted after verification', 'OTP still exists in Redis');
  }

  // Summary
  console.log(`\n\x1b[36m=== SUMMARY ===\x1b[0m`);
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  console.log(`  Total: ${results.length}`);
  console.log(`  \x1b[32mPassed: ${passed}\x1b[0m`);
  console.log(`  \x1b[31mFailed: ${failed}\x1b[0m`);

  if (failed > 0) {
    console.log(`\n\x1b[31mFailed tests:\x1b[0m`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`  - ${r.name}: ${r.message}`);
    });
    process.exit(1);
  } else {
    console.log(`\n\x1b[32mAll tests passed!\x1b[0m`);
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error('Test error:', err);
  process.exit(1);
});
