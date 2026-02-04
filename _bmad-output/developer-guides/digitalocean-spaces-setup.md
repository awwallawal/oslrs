# DigitalOcean Spaces Setup Guide

**Purpose:** Configure S3-compatible object storage for OSLSR staff photos, ID cards, and backups.

---

## Why DigitalOcean Spaces?

| Feature | Benefit for OSLSR |
|---------|-------------------|
| **S3-Compatible API** | Works with existing AWS SDK code |
| **Built-in CDN** | Staff photos load faster for all users |
| **Simple Pricing** | $5/month for 250GB + 1TB transfer |
| **Same Provider** | Keeps infrastructure together (VPS + Spaces) |
| **CORS Support** | Easy configuration for browser uploads |

---

## Step 1: Create a Space (Bucket)

1. Log in to [DigitalOcean Cloud Console](https://cloud.digitalocean.com)

2. Navigate to **Spaces Object Storage** in the left sidebar

3. Click **Create a Space**

4. Configure the Space:
   | Setting | Value | Notes |
   |---------|-------|-------|
   | **Datacenter Region** | Same as your Droplet | e.g., `sfo3`, `fra1`, `nyc3` - keeping infra together reduces latency |
   | **CDN** | ✅ Enable | Faster photo loading for end users |
   | **Allow file listing** | ❌ Restrict | Security: prevent enumeration |
   | **Space name** | `oslsr-media` | Must be globally unique |

5. Click **Create a Space**

6. Note your Space details from the origin URL shown:
   - **Origin URL format:** `https://{space-name}.{region}.digitaloceanspaces.com`
   - **CDN URL format:** `https://{space-name}.{region}.cdn.digitaloceanspaces.com`

   Example for sfo3 region:
   - **Origin:** `https://oslsr-media.sfo3.digitaloceanspaces.com`
   - **CDN:** `https://oslsr-media.sfo3.cdn.digitaloceanspaces.com`

---

## Step 2: Generate Spaces Access Keys

> **Important:** Access keys are managed per-Space, not in the global API section.

1. Open your Space: **Spaces** → Click on your Space name (e.g., `oslsr-media`)

2. Click the **Settings** tab (next to "Files" tab)

3. Scroll to **Spaces access keys** section

4. Click **Create Access Key**

5. Enter a key name: `oslsr-api-production` (or `oslsr-api-staging`)

6. **Copy both keys immediately** (secret only shown once!):
   - **Access Key ID:** `DO00XXXXXXXXXXXXXXXXXX` (shorter, always visible later)
   - **Secret Key:** `XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX` (only shown once!)

> **Note:** You can view your Access Key ID later at `https://cloud.digitalocean.com/spaces/{space-name}/settings`, but the Secret Key is only shown at creation time.

---

## Step 3: Configure CORS (Required for Browser Uploads)

If you plan to allow direct browser uploads (e.g., selfie capture), configure CORS:

1. Open your Space in the console

2. Click **Settings** tab

3. Scroll to **CORS Configurations**

4. Click **Add** and enter:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<CORSConfiguration>
  <CORSRule>
    <AllowedOrigin>https://your-app-domain.com</AllowedOrigin>
    <AllowedOrigin>http://localhost:5173</AllowedOrigin>
    <AllowedMethod>GET</AllowedMethod>
    <AllowedMethod>PUT</AllowedMethod>
    <AllowedMethod>POST</AllowedMethod>
    <AllowedMethod>HEAD</AllowedMethod>
    <AllowedHeader>*</AllowedHeader>
    <MaxAgeSeconds>3600</MaxAgeSeconds>
  </CORSRule>
</CORSConfiguration>
```

5. Click **Save**

---

## Step 4: Create Folder Structure

Create the following folders in your Space (via console or API):

```
oslsr-media/
├── staff-photos/
│   ├── original/      # Full-resolution selfies (private)
│   └── id-card/       # Cropped 400x533 for ID cards (private)
├── id-cards/          # Generated PDF ID cards (private)
├── imports/           # Bulk CSV uploads (private, auto-delete after 7 days)
└── backups/           # Database dumps (private, 30-day retention)
```

You can create folders by uploading an empty file with the path prefix, or use the DO Console UI.

---

## Step 5: Configure Environment Variables

Add to your `.env` file (adjust region to match your Space):

```bash
# DigitalOcean Spaces Configuration
# Replace {region} with your region: sfo3, fra1, nyc3, ams3, sgp1
S3_ENDPOINT=https://sfo3.digitaloceanspaces.com
S3_REGION=sfo3
S3_BUCKET_NAME=oslsr-media
S3_ACCESS_KEY=DO00XXXXXXXXXXXXXXXXXX
S3_SECRET_KEY=your-secret-key-here

# CDN endpoint (optional but recommended for faster photo loading)
S3_CDN_ENDPOINT=https://oslsr-media.sfo3.cdn.digitaloceanspaces.com
```

**Region options:**
| Region | Location | Best For |
|--------|----------|----------|
| `sfo3` | San Francisco | US West Coast |
| `nyc3` | New York | US East Coast |
| `ams3` | Amsterdam | Europe |
| `fra1` | Frankfurt | Europe (closest to Nigeria) |
| `sgp1` | Singapore | Asia Pacific |

> **Tip:** Use the same region as your Droplet for fastest API ↔ Storage communication.

---

## Step 6: Verify Connection

Test the connection by running the API health check:

```bash
# Start the API server
cd apps/api && pnpm dev

# In another terminal, check the health endpoint
curl http://localhost:3000/api/v1/health

# Expected response includes:
# "storage": { "healthy": true, "bucket": "oslsr-media" }
```

Or test directly in Node.js:

```typescript
import { PhotoProcessingService } from './services/photo-processing.service';

const photoService = new PhotoProcessingService();
const health = await photoService.healthCheck();
console.log(health); // { healthy: true, bucket: 'oslsr-media' }
```

---

## Step 7: Set Up Lifecycle Rules (Optional)

Configure automatic cleanup for temporary files:

1. Open your Space > **Settings**

2. Click **Add Lifecycle Rule**

3. Add rule for import files:
   - **Prefix:** `imports/`
   - **Expiration:** 7 days
   - **Delete incomplete multipart uploads:** Yes

4. Add rule for old backups:
   - **Prefix:** `backups/`
   - **Expiration:** 90 days (keep 3 months)

---

## Usage in Code

### Upload a Photo

```typescript
const photoService = new PhotoProcessingService();

// Process and upload a selfie (returns S3 keys, not URLs)
const result = await photoService.processLiveSelfie(imageBuffer);
// result = {
//   originalUrl: 'staff-photos/original/01abc123.jpg',  // S3 key
//   idCardUrl: 'staff-photos/id-card/01abc456.jpg',     // S3 key
//   livenessScore: 0.87
// }
```

### Get a Signed URL (Private Access)

```typescript
// Generate a 1-hour signed URL for private file access
const signedUrl = await photoService.getSignedUrl('staff-photos/original/01abc123.jpg');
// Returns: https://oslsr-media.fra1.digitaloceanspaces.com/staff-photos/original/01abc123.jpg?X-Amz-...
```

### Get CDN URL (Public/Cached Access)

```typescript
// Get CDN URL for faster loading (if CDN enabled)
const cdnUrl = photoService.getCdnUrl('staff-photos/id-card/01abc456.jpg');
// Returns: https://oslsr-media.fra1.cdn.digitaloceanspaces.com/staff-photos/id-card/01abc456.jpg
```

---

## Pricing Summary

| Component | Cost | Notes |
|-----------|------|-------|
| **Storage** | $5/month | Includes 250GB |
| **Transfer** | Included | 1TB outbound/month |
| **CDN Transfer** | $0.01/GB | After 1TB |
| **Overage Storage** | $0.02/GB | After 250GB |

**Estimated Monthly Cost:** $5-7/month for OSLSR's needs (~10GB photos, <100GB backups)

---

## Troubleshooting

### "Access Denied" Error

1. Verify your access keys are correct
2. Check the key has Spaces permissions (not just Droplet access)
3. Ensure the bucket name matches exactly (case-sensitive)

### "Bucket Not Found" Error

1. Verify the bucket exists in your DO account
2. Check the region matches (fra1, nyc3, etc.)
3. Ensure `S3_ENDPOINT` includes the correct region

### CORS Errors in Browser

1. Check CORS configuration includes your origin
2. Verify `AllowedMethods` includes the HTTP method you're using
3. Clear browser cache and retry

### Slow Upload/Download

1. Enable CDN in Space settings
2. Use the CDN endpoint for reads
3. Consider using presigned URLs for direct browser uploads

---

## Security Best Practices

1. **Never commit keys to git** - Use `.env` files (already in `.gitignore`)
2. **Use separate keys per environment** - Staging vs Production
3. **Disable file listing** - Prevents enumeration attacks
4. **Private by default** - Only use CDN for intentionally public files
5. **Rotate keys periodically** - Generate new keys every 90 days
6. **Enable 2FA on DO account** - Protects key generation

---

## Related Documentation

- [DigitalOcean Spaces Docs](https://docs.digitalocean.com/products/spaces/)
- [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/AWSJavaScriptSDK/v3/latest/)
- [OSLSR Architecture Decision: ADR-012 Object Storage](../_bmad-output/planning-artifacts/architecture.md)
