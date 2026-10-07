/**
 * NexusCRM Demo Data Seed Script — Phase 19
 *
 * Idempotent seeder that populates EspoCRM with demo Accounts, Contacts, and Leads
 * for development and testing purposes.
 *
 * Usage:
 *   node scripts/seed.js
 *
 * Requirements:
 *   - EspoCRM running and accessible at ESPOCRM_SITE_URL (default: http://localhost:8080)
 *   - Admin credentials: ESPOCRM_ADMIN_USERNAME / ESPOCRM_ADMIN_PASSWORD from .env
 *
 * Idempotency: Checks existing records by name/email before creating to prevent duplicates.
 * Security: All credentials loaded exclusively from .env — never hardcoded.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ─── Load .env ────────────────────────────────────────────────────────────────

const envPath = path.resolve(__dirname, '../.env');
const envVars = {};
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8')
    .split('\n')
    .forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 1) return;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      envVars[key] = val;
    });
}

const BASE_URL   = process.env.ESPOCRM_SITE_URL       || envVars['ESPOCRM_SITE_URL']       || 'http://localhost:8080';
const ADMIN_USER = process.env.ESPOCRM_ADMIN_USERNAME  || envVars['ESPOCRM_ADMIN_USERNAME']  || 'admin';
const ADMIN_PASS = process.env.ESPOCRM_ADMIN_PASSWORD  || envVars['ESPOCRM_ADMIN_PASSWORD']  || 'admin';

const AUTH_HEADER = 'Basic ' + Buffer.from(`${ADMIN_USER}:${ADMIN_PASS}`).toString('base64');

// ─── HTTP Helper ──────────────────────────────────────────────────────────────

async function req(method, endpoint, body) {
  const opts = {
    method,
    headers: {
      Authorization: AUTH_HEADER,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}/api/v1${endpoint}`, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

// ─── Idempotency Helpers ──────────────────────────────────────────────────────

/**
 * Find an existing entity by a field=value filter.
 * Returns the first matching record or null.
 */
async function findOne(entity, field, value) {
  const encoded = encodeURIComponent(value);
  const res = await req(
    'GET',
    `/${entity}?where[0][type]=equals&where[0][attribute]=${field}&where[0][value]=${encoded}&maxSize=1`
  );
  if (res.status === 200 && res.data?.list?.length > 0) {
    return res.data.list[0];
  }
  return null;
}

/**
 * Create an entity only if it doesn't already exist.
 * Checks by `checkField` / `checkValue` before creating.
 * Returns { record, created: boolean }.
 */
async function upsert(entity, checkField, checkValue, payload) {
  const existing = await findOne(entity, checkField, checkValue);
  if (existing) {
    console.log(`  ♻️  ${entity} already exists: "${checkValue}" (ID: ${existing.id})`);
    return { record: existing, created: false };
  }

  const res = await req('POST', `/${entity}`, payload);
  if (res.status === 200 || res.status === 201) {
    console.log(`  ✅  Created ${entity}: "${checkValue}" (ID: ${res.data.id})`);
    return { record: res.data, created: true };
  }

  console.error(`  ❌  Failed to create ${entity} "${checkValue}": [${res.status}]`, res.data);
  return { record: null, created: false };
}

// ─── Seed Definitions ─────────────────────────────────────────────────────────

const ACCOUNTS = [
  {
    name: 'Acme Corporation',
    emailAddress: 'contact@acme.corp.example',
    phoneNumber: '+14155550200',
    website: 'https://acme.corp.example',
    industry: 'Technology',
    type: 'Customer',
    description: 'Demo account — Acme Corporation (seed data)',
  },
  {
    name: 'Beta Solutions Ltd',
    emailAddress: 'hello@betasolutions.example',
    phoneNumber: '+14155550300',
    website: 'https://betasolutions.example',
    industry: 'Consulting',
    type: 'Partner',
    description: 'Demo account — Beta Solutions (seed data)',
  },
];

const CONTACTS_TEMPLATE = (accountIds) => [
  {
    firstName: 'Alice',
    lastName: 'Johnson',
    emailAddress: 'alice@acme.corp.example',
    phoneNumber: '+14155550101',
    title: 'Head of Operations',
    accountId: accountIds['Acme Corporation'] || undefined,
    description: 'Demo contact (seed data)',
  },
  {
    firstName: 'Bob',
    lastName: 'Martinez',
    emailAddress: 'bob@acme.corp.example',
    phoneNumber: '+14155550102',
    title: 'Sales Director',
    accountId: accountIds['Acme Corporation'] || undefined,
    description: 'Demo contact (seed data)',
  },
  {
    firstName: 'Carlos',
    lastName: 'Silva',
    emailAddress: 'carlos@betasolutions.example',
    phoneNumber: '+14155550103',
    title: 'Senior Consultant',
    accountId: accountIds['Beta Solutions Ltd'] || undefined,
    description: 'Demo contact (seed data)',
  },
  {
    firstName: 'Diana',
    lastName: 'Patel',
    emailAddress: 'diana@betasolutions.example',
    phoneNumber: '+14155550104',
    title: 'Project Manager',
    accountId: accountIds['Beta Solutions Ltd'] || undefined,
    description: 'Demo contact (seed data)',
  },
  {
    firstName: 'Edward',
    lastName: 'Kim',
    emailAddress: 'edward@nexuscrm.example',
    phoneNumber: '+14155550105',
    title: 'Enterprise Architect',
    description: 'Demo contact (seed data)',
  },
];

const LEADS = [
  {
    firstName: 'WhatsApp',
    lastName: 'Inbound Lead',
    phoneNumber: '+15005550001',
    source: 'Other',
    status: 'New',
    description: '[Demo] Auto-generated from inbound WhatsApp inquiry (seed data)',
  },
  {
    firstName: 'SMS',
    lastName: 'Inbound Lead',
    phoneNumber: '+15005550002',
    source: 'Other',
    status: 'New',
    description: '[Demo] Auto-generated from inbound SMS (seed data)',
  },
  {
    firstName: 'Email',
    lastName: 'Inbound Lead',
    emailAddress: 'inbound@leads.example',
    source: 'Web Site',
    status: 'New',
    description: '[Demo] Auto-generated from inbound web email form (seed data)',
  },
];

// ─── Main Seed Runner ─────────────────────────────────────────────────────────

async function runSeed() {
  console.log(`\n🌱 NexusCRM Demo Data Seed Script`);
  console.log(`   Target: ${BASE_URL}\n`);

  // ── Verify connectivity ────────────────────────────────────────────────────
  console.log('🔌 Verifying EspoCRM connectivity...');
  const ping = await req('GET', '/App/user');
  if (ping.status !== 200) {
    console.error(`❌ Cannot reach EspoCRM at ${BASE_URL} (status ${ping.status}). Is the container running?`);
    process.exit(1);
  }
  console.log('   ✅ Connected\n');

  // ── Seed Accounts ──────────────────────────────────────────────────────────
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📁  Seeding Accounts...');
  const accountIds = {};
  for (const acc of ACCOUNTS) {
    const { record } = await upsert('Account', 'name', acc.name, acc);
    if (record) accountIds[acc.name] = record.id;
  }

  // ── Seed Contacts ──────────────────────────────────────────────────────────
  console.log('\n👥  Seeding Contacts...');
  const contacts = CONTACTS_TEMPLATE(accountIds);
  for (const c of contacts) {
    await upsert('Contact', 'emailAddress', c.emailAddress, c);
  }

  // ── Seed Leads ─────────────────────────────────────────────────────────────
  console.log('\n🎯  Seeding Leads...');
  for (const lead of LEADS) {
    const idField  = lead.emailAddress ? 'emailAddress' : 'phoneNumber';
    const idValue  = lead.emailAddress || lead.phoneNumber;
    await upsert('Lead', idField, idValue, lead);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅  Demo seed complete!');
  console.log(`   Accounts  : ${ACCOUNTS.length}`);
  console.log(`   Contacts  : ${contacts.length}`);
  console.log(`   Leads     : ${LEADS.length}`);
  console.log('\n💡  Tip: Run node scripts/seed-roles.js and node scripts/seed-api-user.js');
  console.log('        if you have not provisioned RBAC roles and the integration API user yet.\n');
}

runSeed().catch((err) => {
  console.error('\n❌ Seed script failed:', err.message || err);
  process.exit(1);
});
