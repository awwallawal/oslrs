# Resend Email Service Setup Guide

This guide covers setting up the Resend email service for OSLSR.

## Overview

OSLSR uses [Resend](https://resend.com) for transactional email delivery:
- Staff invitation emails
- Email verification (Magic Link + OTP)
- Password reset emails

## Quick Start (Development)

For local development, emails are logged to console using the mock provider:

```bash
# .env (development)
EMAIL_PROVIDER=mock
EMAIL_ENABLED=true
```

No Resend account needed for development.

## Production Setup

### 1. Create Resend Account

1. Sign up at [resend.com](https://resend.com)
2. Verify your email address
3. Navigate to API Keys section

### 2. Add Your Domain

1. Go to **Domains** in Resend dashboard
2. Click **Add Domain**
3. Enter your domain (e.g., `oyotradeministry.com.ng`)
4. Add the DNS records Resend provides:
   - SPF record
   - DKIM records (3 CNAME records)
   - Optional: DMARC record

5. Wait for verification (usually 24-48 hours)

### 3. Generate API Key

1. Go to **API Keys** in Resend dashboard
2. Click **Create API Key**
3. Name it (e.g., `oslsr-production`)
4. Select **Full access** or **Sending access**
5. Copy the key (starts with `re_`)

### 4. Configure Environment

```bash
# .env (production)
EMAIL_PROVIDER=resend
EMAIL_ENABLED=true

# Resend Configuration
RESEND_API_KEY=re_your_api_key_here
EMAIL_FROM_ADDRESS=noreply@oyotradeministry.com.ng
EMAIL_FROM_NAME=Oyo State Labour Registry

# Budget Configuration
EMAIL_TIER=free  # Options: free, pro, scale
EMAIL_MONTHLY_OVERAGE_BUDGET=3000  # Cents ($30.00) - Pro tier only

# Rate Limits
EMAIL_RESEND_MAX_PER_USER=3  # Max resend attempts per user per 24h
```

## Pricing Tiers

| Tier | Monthly Cost | Included Emails | Daily Limit | Overage |
|------|--------------|-----------------|-------------|---------|
| Free | $0 | 3,000 | **100/day** | N/A |
| Pro | $20 | 50,000 | None | $0.90/1,000 |
| Scale | $90 | 100,000 | None | $0.90/1,000 |

### Free Tier Limitations

- **100 emails per day** - Hard limit, emails deferred to next day
- **3,000 emails per month** - Hard limit
- Best for: Development, small deployments

### Pro Tier Benefits

- No daily limit
- 50,000 included emails
- Overage charged at $0.90 per 1,000 emails
- Best for: Production with moderate volume

## Budget Tracking

OSLSR tracks email usage in Redis:

```
email:daily:count:YYYY-MM-DD   # Daily counter (48h TTL)
email:monthly:count:YYYY-MM    # Monthly counter (35d TTL)
email:overage:cost:YYYY-MM     # Overage cost in cents (Pro tier)
```

### Warning Thresholds

- **80% of daily limit**: Warning logged
- **80% of monthly limit**: Warning logged
- **100% of limit**: Queue paused, emails deferred

### Check Budget Status

```bash
curl -X GET http://localhost:3000/api/v1/admin/email-budget \
  -H "Authorization: Bearer SUPER_ADMIN_TOKEN"
```

Response:
```json
{
  "data": {
    "budget": {
      "tier": "free",
      "dailyUsage": {
        "count": 45,
        "limit": 100,
        "percentage": 45,
        "isWarning": false,
        "isExhausted": false
      },
      "monthlyUsage": {
        "count": 1500,
        "limit": 3000,
        "percentage": 50,
        "isWarning": false,
        "isExhausted": false
      },
      "queuePaused": false
    },
    "queue": {
      "waiting": 0,
      "active": 0,
      "completed": 150,
      "failed": 2,
      "delayed": 0,
      "paused": false
    }
  }
}
```

## Email Templates

### Staff Invitation Email

Subject: `You've been invited to join OSLSR - {Role Name}`

Contains:
- OSLSR branding (Oyo State Red #9C1E23)
- Personalized greeting
- Role and LGA assignment
- Activation link (24-hour expiry)
- Support contact

### Verification Email (ADR-015 Hybrid)

Subject: `Verify Your Email - OSLSR`

Contains:
- Magic Link (24-hour expiry)
- 6-digit OTP code (10-minute expiry)
- Instructions: "Click the link OR enter the code"

### Password Reset Email

Subject: `Password Reset Request - OSLSR`

Contains:
- Reset link (1-hour expiry)
- Security notice

## Troubleshooting

### Emails Not Sending

1. Check `EMAIL_ENABLED=true`
2. Verify `RESEND_API_KEY` is set correctly
3. Check domain is verified in Resend dashboard
4. Check budget limits: `GET /api/v1/admin/email-budget`

### Daily Limit Reached (Free Tier)

```
"Daily email limit reached - emails queued for tomorrow"
```

Options:
1. Wait until midnight UTC for limit reset
2. Upgrade to Pro tier for no daily limit

### Domain Not Verified

Resend will reject emails if domain DNS is not configured:
1. Check DNS records are properly set
2. Wait 24-48 hours for propagation
3. Click "Verify" in Resend dashboard

### View Email Logs

Check Resend dashboard **Logs** section for:
- Delivery status
- Bounce information
- Error details

## Testing in Development

### Mock Provider

All emails are logged to console with mock provider:

```
{"level":30,"event":"email.mock.sent","to":"test@example.com","subject":"..."}
```

### Preview Email Templates

Development-only routes:

```bash
# Staff invitation preview
GET /api/v1/dev/email-preview/staff-invitation

# Verification email preview
GET /api/v1/dev/email-preview/verification

# Password reset preview
GET /api/v1/dev/email-preview/password-reset
```

### Test with Real Resend

To test real email delivery in development:

```bash
EMAIL_PROVIDER=resend
RESEND_API_KEY=re_test_key_here
```

Use Resend's test API key or a verified domain.

## Security Notes

- Never commit `RESEND_API_KEY` to version control
- Invitation URLs are not logged (security)
- OTP codes are stored in Redis with 10-minute TTL
- Rate limit: 3 resend attempts per user per 24 hours

## References

- [Resend Documentation](https://resend.com/docs)
- [Resend Pricing](https://resend.com/pricing)
- [ADR-015: Hybrid Email Verification](../_bmad-output/planning-artifacts/adr-015-hybrid-email-verification.md)
