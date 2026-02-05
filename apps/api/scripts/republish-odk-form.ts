/**
 * ODK Form Republish Script
 *
 * Republishes a form to ODK Central to regenerate the Enketo preview ID.
 * This can help fix preview issues caused by stale Enketo cache.
 *
 * Usage: pnpm tsx apps/api/scripts/republish-odk-form.ts <xmlFormId> [--reopen]
 * Example: pnpm tsx apps/api/scripts/republish-odk-form.ts oslsr_master_v3
 * Example: pnpm tsx apps/api/scripts/republish-odk-form.ts oslsr_master_v3 --reopen
 */

import 'dotenv/config';

const ODK_CENTRAL_URL = process.env.ODK_CENTRAL_URL;
const ODK_ADMIN_EMAIL = process.env.ODK_ADMIN_EMAIL;
const ODK_ADMIN_PASSWORD = process.env.ODK_ADMIN_PASSWORD;
const ODK_PROJECT_ID = process.env.ODK_PROJECT_ID;

const xmlFormId = process.argv[2];
const shouldReopen = process.argv.includes('--reopen');

if (!xmlFormId) {
  console.log('Usage: pnpm tsx apps/api/scripts/republish-odk-form.ts <xmlFormId> [--reopen]');
  console.log('Example: pnpm tsx apps/api/scripts/republish-odk-form.ts oslsr_master_v3');
  console.log('  --reopen  Reopen form if it is in closing state');
  process.exit(1);
}

async function republishForm() {
  console.log('\n🔄 ODK Form Republish Script\n');
  console.log('='.repeat(50));
  console.log(`\nTarget form: ${xmlFormId}`);

  // Check environment variables
  if (!ODK_CENTRAL_URL || !ODK_ADMIN_EMAIL || !ODK_ADMIN_PASSWORD || !ODK_PROJECT_ID) {
    console.log('\n❌ Missing required environment variables');
    console.log('Required: ODK_CENTRAL_URL, ODK_ADMIN_EMAIL, ODK_ADMIN_PASSWORD, ODK_PROJECT_ID');
    process.exit(1);
  }

  // Step 1: Authenticate
  console.log('\n🔐 Authenticating...');
  let sessionToken: string;
  try {
    const authResponse = await fetch(`${ODK_CENTRAL_URL}v1/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify({ email: ODK_ADMIN_EMAIL, password: ODK_ADMIN_PASSWORD }),
    });

    if (!authResponse.ok) {
      console.log(`   ❌ Authentication failed: ${authResponse.status}`);
      process.exit(1);
    }

    const authData = await authResponse.json();
    sessionToken = authData.token;
    console.log('   ✅ Authenticated');
  } catch (error) {
    console.log(`   ❌ Auth error: ${(error as Error).message}`);
    process.exit(1);
  }

  // Step 2: Get current form status
  console.log('\n📋 Getting current form status...');
  const formUrl = `${ODK_CENTRAL_URL}v1/projects/${ODK_PROJECT_ID}/forms/${xmlFormId}`;

  try {
    const formResponse = await fetch(formUrl, {
      headers: { 'Authorization': `Bearer ${sessionToken}`, 'Accept': 'application/json' },
    });

    if (formResponse.status === 404) {
      console.log(`   ❌ Form "${xmlFormId}" not found in project ${ODK_PROJECT_ID}`);
      process.exit(1);
    }

    if (!formResponse.ok) {
      console.log(`   ❌ Error getting form: ${formResponse.status}`);
      process.exit(1);
    }

    const formData = await formResponse.json();
    console.log(`   Form: "${formData.name}"`);
    console.log(`   Current state: ${formData.state}`);
    console.log(`   Version: ${formData.version}`);

    // Step 3: Get draft status
    console.log('\n📝 Checking for existing draft...');
    const draftUrl = `${formUrl}/draft`;
    const draftResponse = await fetch(draftUrl, {
      headers: { 'Authorization': `Bearer ${sessionToken}`, 'Accept': 'application/json' },
    });

    if (draftResponse.ok) {
      const draftData = await draftResponse.json();
      console.log(`   Existing draft found: v${draftData.version}`);

      // Step 4a: Publish existing draft
      console.log('\n🚀 Publishing existing draft...');
      const publishResponse = await fetch(`${draftUrl}/publish?version=${draftData.version}`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${sessionToken}`, 'Accept': 'application/json' },
      });

      if (!publishResponse.ok) {
        const errorText = await publishResponse.text();
        console.log(`   ❌ Publish failed: ${publishResponse.status}`);
        console.log(`   Error: ${errorText}`);
        process.exit(1);
      }

      console.log('   ✅ Draft published successfully!');
    } else if (formData.state === 'closing' && shouldReopen) {
      // Reopen form from closing state
      console.log('\n🔓 Reopening form from closing state...');
      const reopenResponse = await fetch(formUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({ state: 'open' }),
      });

      if (!reopenResponse.ok) {
        const errorText = await reopenResponse.text();
        console.log(`   ❌ Reopen failed: ${reopenResponse.status}`);
        console.log(`   Error: ${errorText}`);
      } else {
        const reopenData = await reopenResponse.json();
        console.log('   ✅ Form reopened successfully');
        console.log(`   New state: ${reopenData.state}`);
      }
    } else if (formData.state === 'open' || formData.state === 'closing') {
      // Form is already published, no draft exists
      console.log('   No draft exists, form is already published');
      if (formData.state === 'closing') {
        console.log('\n   Form is in "closing" state. Use --reopen to reopen it.');
      }
      console.log('\n   To regenerate Enketo preview, you can:');
      console.log('   1. Create a new draft with a version increment');
      console.log('   2. Publish the draft');
      console.log('   OR');
      console.log('   SSH into your server and run:');
      console.log('   docker exec central-enketo_redis_cache-1 redis-cli FLUSHALL');
      console.log('   docker compose restart enketo');
    } else if (formData.state === 'closed') {
      console.log('   Form is closed. Reopen it first via ODK Central UI.');
    }

    // Final status check
    console.log('\n📊 Final form status...');
    const finalResponse = await fetch(formUrl, {
      headers: { 'Authorization': `Bearer ${sessionToken}`, 'Accept': 'application/json' },
    });
    const finalData = await finalResponse.json();
    console.log(`   State: ${finalData.state}`);
    console.log(`   Version: ${finalData.version}`);
    console.log(`   EnketoId: ${finalData.enketoId || 'Not set'}`);

    console.log('\n' + '='.repeat(50));
    console.log('\n✅ Done! Test the preview at:');
    console.log(`   ${ODK_CENTRAL_URL}projects/${ODK_PROJECT_ID}/forms/${xmlFormId}/preview\n`);

  } catch (error) {
    console.log(`   ❌ Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

republishForm().catch(console.error);
