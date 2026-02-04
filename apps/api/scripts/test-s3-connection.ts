/**
 * Quick script to test DigitalOcean Spaces connection
 * Run from project root: pnpm tsx apps/api/scripts/test-s3-connection.ts
 * Or from apps/api: pnpm tsx scripts/test-s3-connection.ts
 */
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { S3Client, ListObjectsV2Command, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';

// Load .env from project root (ESM compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, '../../../.env') });

async function testS3Connection() {
  console.log('\n🔍 Testing DigitalOcean Spaces Connection...\n');

  // Load env vars
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'sfo3';
  const bucket = process.env.S3_BUCKET_NAME;
  const accessKey = process.env.S3_ACCESS_KEY;
  const secretKey = process.env.S3_SECRET_KEY;

  // Validate config
  console.log('📋 Configuration:');
  console.log(`   Endpoint: ${endpoint || '❌ MISSING'}`);
  console.log(`   Region:   ${region}`);
  console.log(`   Bucket:   ${bucket || '❌ MISSING'}`);
  console.log(`   Access Key: ${accessKey ? accessKey.slice(0, 8) + '...' : '❌ MISSING'}`);
  console.log(`   Secret Key: ${secretKey ? '***' + secretKey.slice(-4) : '❌ MISSING'}`);
  console.log('');

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    console.error('❌ Missing required environment variables. Check your .env file.');
    process.exit(1);
  }

  // Create S3 client
  const s3Client = new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
    },
    forcePathStyle: true,
  });

  try {
    // Test 1: List objects (tests read permission)
    console.log('📂 Test 1: Listing bucket contents...');
    const listCommand = new ListObjectsV2Command({
      Bucket: bucket,
      MaxKeys: 5,
    });
    const listResult = await s3Client.send(listCommand);
    console.log(`   ✅ Success! Found ${listResult.KeyCount || 0} objects in bucket.`);

    // Test 2: Upload a test file (tests write permission)
    console.log('\n📤 Test 2: Uploading test file...');
    const testKey = `_test/connection-test-${Date.now()}.txt`;
    const testContent = `S3 connection test at ${new Date().toISOString()}`;

    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain',
    });
    await s3Client.send(putCommand);
    console.log(`   ✅ Success! Uploaded: ${testKey}`);

    // Test 3: Delete test file (cleanup)
    console.log('\n🗑️  Test 3: Cleaning up test file...');
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucket,
      Key: testKey,
    });
    await s3Client.send(deleteCommand);
    console.log(`   ✅ Success! Deleted: ${testKey}`);

    // All tests passed
    console.log('\n' + '═'.repeat(50));
    console.log('🎉 All S3 connection tests passed!');
    console.log('═'.repeat(50));
    console.log('\nYour DigitalOcean Spaces bucket is ready for use.');
    console.log(`CDN URL: ${process.env.S3_CDN_ENDPOINT || 'Not configured'}\n`);

  } catch (error: unknown) {
    console.error('\n❌ S3 Connection Test Failed:');
    if (error instanceof Error) {
      console.error(`   Error: ${error.message}`);
      if (error.name === 'AccessDenied') {
        console.error('\n   💡 Tip: Check that your Access Key has permission for this bucket.');
      } else if (error.name === 'NoSuchBucket') {
        console.error('\n   💡 Tip: The bucket does not exist. Check S3_BUCKET_NAME in .env.');
      } else if (error.message.includes('getaddrinfo')) {
        console.error('\n   💡 Tip: Cannot reach endpoint. Check S3_ENDPOINT in .env.');
      }
    }
    process.exit(1);
  }
}

testS3Connection();
