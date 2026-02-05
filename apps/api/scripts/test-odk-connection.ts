/**
 * ODK Central Connection Test Script
 *
 * Tests the ODK Central configuration and connectivity.
 *
 * Usage: npx tsx apps/api/scripts/test-odk-connection.ts
 */

import 'dotenv/config';

const ODK_CENTRAL_URL = process.env.ODK_CENTRAL_URL;
const ODK_ADMIN_EMAIL = process.env.ODK_ADMIN_EMAIL;
const ODK_ADMIN_PASSWORD = process.env.ODK_ADMIN_PASSWORD;
const ODK_PROJECT_ID = process.env.ODK_PROJECT_ID;

async function testOdkConnection() {
  console.log('\n🔍 ODK Central Connection Test\n');
  console.log('='.repeat(50));

  // Step 1: Check environment variables
  console.log('\n📋 Step 1: Checking environment variables...\n');

  const missingVars: string[] = [];

  if (!ODK_CENTRAL_URL) missingVars.push('ODK_CENTRAL_URL');
  if (!ODK_ADMIN_EMAIL) missingVars.push('ODK_ADMIN_EMAIL');
  if (!ODK_ADMIN_PASSWORD) missingVars.push('ODK_ADMIN_PASSWORD');
  if (!ODK_PROJECT_ID) missingVars.push('ODK_PROJECT_ID');

  console.log(`  ODK_CENTRAL_URL:    ${ODK_CENTRAL_URL || '❌ NOT SET'}`);
  console.log(`  ODK_ADMIN_EMAIL:    ${ODK_ADMIN_EMAIL || '❌ NOT SET'}`);
  console.log(`  ODK_ADMIN_PASSWORD: ${ODK_ADMIN_PASSWORD ? '✅ SET (hidden)' : '❌ NOT SET'}`);
  console.log(`  ODK_PROJECT_ID:     ${ODK_PROJECT_ID || '❌ NOT SET'}`);

  if (missingVars.length > 0) {
    console.log(`\n❌ Missing environment variables: ${missingVars.join(', ')}`);
    console.log('   Please set these in your .env file and try again.');
    process.exit(1);
  }

  console.log('\n  ✅ All environment variables are set');

  // Step 2: Test server reachability
  console.log('\n📡 Step 2: Testing server reachability...\n');

  try {
    const healthUrl = `${ODK_CENTRAL_URL}v1/projects`;
    console.log(`  Connecting to: ${healthUrl}`);

    const healthResponse = await fetch(healthUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (healthResponse.status === 401) {
      console.log('  ✅ Server is reachable (returned 401 - auth required)');
    } else if (healthResponse.ok) {
      console.log('  ✅ Server is reachable');
    } else {
      console.log(`  ⚠️ Server returned status: ${healthResponse.status}`);
    }
  } catch (error) {
    console.log(`  ❌ Cannot reach server: ${(error as Error).message}`);
    console.log('\n  Possible causes:');
    console.log('    - URL is incorrect');
    console.log('    - Server is down');
    console.log('    - Network/firewall issues');
    process.exit(1);
  }

  // Step 3: Test authentication
  console.log('\n🔐 Step 3: Testing authentication...\n');

  let sessionToken: string;
  try {
    const authUrl = `${ODK_CENTRAL_URL}v1/sessions`;
    console.log(`  Authenticating at: ${authUrl}`);

    const authResponse = await fetch(authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        email: ODK_ADMIN_EMAIL,
        password: ODK_ADMIN_PASSWORD,
      }),
    });

    if (!authResponse.ok) {
      const errorText = await authResponse.text();
      console.log(`  ❌ Authentication failed: ${authResponse.status}`);
      console.log(`     Response: ${errorText}`);
      console.log('\n  Possible causes:');
      console.log('    - Email or password is incorrect');
      console.log('    - Account does not exist');
      console.log('    - Account is disabled');
      process.exit(1);
    }

    const authData = await authResponse.json();
    sessionToken = authData.token;
    console.log('  ✅ Authentication successful');
    console.log(`     Session token: ${sessionToken.substring(0, 20)}...`);
  } catch (error) {
    console.log(`  ❌ Authentication error: ${(error as Error).message}`);
    process.exit(1);
  }

  // Step 4: Test project access
  console.log('\n📁 Step 4: Testing project access...\n');

  try {
    const projectUrl = `${ODK_CENTRAL_URL}v1/projects/${ODK_PROJECT_ID}`;
    console.log(`  Fetching project: ${projectUrl}`);

    const projectResponse = await fetch(projectUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Accept': 'application/json',
      },
    });

    if (projectResponse.status === 404) {
      console.log(`  ❌ Project ID ${ODK_PROJECT_ID} not found`);

      // Try to list available projects
      console.log('\n  Fetching available projects...');
      const listResponse = await fetch(`${ODK_CENTRAL_URL}v1/projects`, {
        headers: {
          'Authorization': `Bearer ${sessionToken}`,
          'Accept': 'application/json',
        },
      });

      if (listResponse.ok) {
        const projects = await listResponse.json();
        if (projects.length > 0) {
          console.log('\n  Available projects:');
          projects.forEach((p: { id: number; name: string }) => {
            console.log(`    - ID: ${p.id}, Name: "${p.name}"`);
          });
          console.log(`\n  Update ODK_PROJECT_ID in .env to one of these IDs.`);
        } else {
          console.log('  No projects found. Create a project in ODK Central first.');
        }
      }
      process.exit(1);
    }

    if (!projectResponse.ok) {
      console.log(`  ❌ Cannot access project: ${projectResponse.status}`);
      process.exit(1);
    }

    const projectData = await projectResponse.json();
    console.log('  ✅ Project access confirmed');
    console.log(`     Project Name: "${projectData.name}"`);
    console.log(`     Project ID: ${projectData.id}`);
  } catch (error) {
    console.log(`  ❌ Project access error: ${(error as Error).message}`);
    process.exit(1);
  }

  // Step 5: List existing forms
  console.log('\n📝 Step 5: Listing existing forms...\n');

  try {
    const formsUrl = `${ODK_CENTRAL_URL}v1/projects/${ODK_PROJECT_ID}/forms`;
    const formsResponse = await fetch(formsUrl, {
      headers: {
        'Authorization': `Bearer ${sessionToken}`,
        'Accept': 'application/json',
      },
    });

    if (formsResponse.ok) {
      const forms = await formsResponse.json();
      if (forms.length > 0) {
        console.log(`  Found ${forms.length} form(s):`);
        forms.forEach((f: { xmlFormId: string; name: string; state: string }) => {
          console.log(`    - ${f.xmlFormId}: "${f.name}" (${f.state})`);
        });
      } else {
        console.log('  No forms in this project yet.');
      }
    }
  } catch (error) {
    console.log(`  ⚠️ Could not list forms: ${(error as Error).message}`);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('\n✅ ODK Central connection test PASSED!\n');
  console.log('Your configuration is correct. You should be able to publish forms now.');
  console.log('\nMake sure to restart your API server if you just updated .env\n');
}

testOdkConnection().catch(console.error);
