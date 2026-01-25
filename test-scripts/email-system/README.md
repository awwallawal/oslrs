# Email System Manual Testing

This folder contains scripts to manually test Story 1.11: Email Invitation System.

## Prerequisites

1. Services running:
   ```bash
   pnpm services:up  # Start Redis + PostgreSQL
   pnpm --filter @oslsr/api dev  # Start API on port 3000
   ```

2. Database seeded with roles and at least one Super Admin user

## Test Scripts

| Script | Tests | ACs Covered |
|--------|-------|-------------|
| `test-otp-verification.ts` | OTP generation, verification, mutual invalidation | AC6 |
| `test-staff-creation.ts` | Staff creation with email status | AC2, AC5, AC8 |
| `test-budget-tracking.ts` | Budget limits, warnings, queue pause | AC4 |
| `test-resend-invitation.ts` | Resend with rate limiting | AC5 |

## Running Tests

```bash
# Run all tests
pnpm tsx test-scripts/email-system/run-all-tests.ts

# Run individual test
pnpm tsx test-scripts/email-system/test-otp-verification.ts
```

## Expected Results

Each test will output:
- [PASS] for successful assertions
- [FAIL] for failed assertions
- Summary at the end

## Cleanup

After testing, delete this folder:
```bash
rm -rf test-scripts/
```

Or keep it for future regression testing.
