/**
 * Phase 9: EspoCRM Integration API Role & User Setup
 *
 * This script:
 * 1. Creates an "Integration API" role with permissions on CRM entities.
 * 2. Creates an API user "nexus-integration" assigned to that role.
 * 3. Prints the generated API key to paste into .env as ESPOCRM_API_KEY.
 *
 * Run: node scripts/seed-api-user.js
 *
 * Requires: EspoCRM running at ESPOCRM_SITE_URL with admin credentials in .env
 */

const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Load .env from project root
const envPath = path.resolve(__dirname, '../.env');
const envVars = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const [key, ...rest] = line.split('=');
      if (key && rest.length) envVars[key.trim()] = rest.join('=').trim();
    });
}

const BASE_URL = process.env.ESPOCRM_SITE_URL || envVars['ESPOCRM_SITE_URL'] || 'http://localhost:8080';
const ADMIN_USER = process.env.ESPOCRM_ADMIN_USERNAME || envVars['ESPOCRM_ADMIN_USERNAME'] || 'admin';
const ADMIN_PASS = process.env.ESPOCRM_ADMIN_PASSWORD || envVars['ESPOCRM_ADMIN_PASSWORD'] || 'admin';

const authHeader = 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');

async function req(method, path, body) {
  const opts = {
    method,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE_URL}/api/v1${path}`, opts);
  const text = await res.text();
  try {
    return { status: res.status, data: JSON.parse(text) };
  } catch {
    return { status: res.status, data: text };
  }
}

async function run() {
  console.log(`\n🔌 Connecting to EspoCRM at ${BASE_URL}...\n`);

  // ─── 1. Create Integration API Role ───────────────────────────────────────
  console.log('1️⃣  Creating "Integration API" role...');
  const rolePayload = {
    name: 'Integration API',
    data: {
      Contact: { read: 'all', create: 'yes', edit: 'all', delete: 'no', stream: 'all' },
      Account: { read: 'all', create: 'yes', edit: 'all', delete: 'no', stream: 'all' },
      Lead:    { read: 'all', create: 'yes', edit: 'all', delete: 'no', stream: 'all' },
      Opportunity: { read: 'all', create: 'yes', edit: 'all', delete: 'no', stream: 'all' },
      Call:    { read: 'all', create: 'yes', edit: 'all', delete: 'no', stream: 'all' },
      Email:   { read: 'all', create: 'yes', edit: 'all', delete: 'no', stream: 'all' },
      Note:    { read: 'all', create: 'yes', edit: 'own', delete: 'no', stream: 'all' },
      Attachment: { read: 'all', create: 'yes', edit: 'no', delete: 'no' },
    },
  };

  let roleId;
  const roleRes = await req('POST', '/Role', rolePayload);
  if (roleRes.status === 200 || roleRes.status === 201) {
    roleId = roleRes.data.id;
    console.log(`   ✅ Role created: ID=${roleId}`);
  } else {
    console.warn(`   ⚠️  Role creation returned ${roleRes.status}:`, roleRes.data);
    // Try to find existing role
    const listRes = await req('GET', '/Role?maxSize=50');
    const existing = listRes.data?.list?.find((r) => r.name === 'Integration API');
    if (existing) {
      roleId = existing.id;
      console.log(`   ♻️  Using existing role: ID=${roleId}`);
    } else {
      console.error('   ❌ Could not create or find the "Integration API" role. Aborting.');
      process.exit(1);
    }
  }

  // ─── 2. Create API User ────────────────────────────────────────────────────
  console.log('\n2️⃣  Creating API user "nexus-integration"...');
  const userPayload = {
    userName: 'nexus-integration',
    firstName: 'Nexus',
    lastName: 'Integration',
    type: 'api',
    authMethod: 'ApiKey',
    rolesIds: [roleId],
  };

  const userRes = await req('POST', '/User', userPayload);
  if (userRes.status !== 200 && userRes.status !== 201) {
    // May already exist
    console.warn(`   ⚠️  User creation returned ${userRes.status}:`, userRes.data);
    const listRes = await req('GET', '/User?where[0][type]=equals&where[0][attribute]=userName&where[0][value]=nexus-integration');
    const existingUser = listRes.data?.list?.[0];
    if (existingUser) {
      console.log(`   ♻️  User "nexus-integration" already exists: ID=${existingUser.id}`);
      if (existingUser.apiKey) {
        console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅  API KEY (existing):');
        console.log(`    ${existingUser.apiKey}`);
        console.log('\n📋  Add this to your .env file:');
        console.log(`    ESPOCRM_API_KEY=${existingUser.apiKey}`);
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
      } else {
        console.log('   ℹ️  No API key found. Please generate one manually in EspoCRM:');
        console.log('       Administration → API Users → nexus-integration → Generate API Key');
      }
    } else {
      console.error('   ❌ Could not create or find the "nexus-integration" user. Aborting.');
      process.exit(1);
    }
    return;
  }

  const createdUser = userRes.data;
  const apiKey = createdUser.apiKey;

  console.log(`   ✅ API user created: ID=${createdUser.id}`);

  if (apiKey) {
    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅  API KEY:');
    console.log(`    ${apiKey}`);
    console.log('\n📋  Add this to your .env file:');
    console.log(`    ESPOCRM_API_KEY=${apiKey}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  } else {
    console.log('\n   ℹ️  API key not returned in creation response.');
    console.log('       Go to: EspoCRM → Administration → API Users → nexus-integration → Generate API Key');
  }
}

run().catch((err) => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
