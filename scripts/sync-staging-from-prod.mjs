#!/usr/bin/env node
// Mirror the prod Render service's env vars onto staging, and optionally
// fast-forward the staging branch (`develop`) to `main`. Idempotent — re-run
// whenever you change something on prod.
//
// Usage:
//   node scripts/sync-staging-from-prod.mjs               # show diff only
//   node scripts/sync-staging-from-prod.mjs --apply       # apply env sync
//   node scripts/sync-staging-from-prod.mjs --apply --code  # also FF develop
//
// Requires: RENDER_API_KEY env var or ~/.render-key file containing
// `RENDER_API_KEY=rnd_...` (the user already has this set up).
//
// NEVER syncs DATABASE_URL, APP_URL, or STRIPE_WEBHOOK_SECRET — those must
// stay distinct between environments (separate DB, different host, webhooks
// only fire to prod URL). Tweak EXCLUDED below to add others.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execSync } from 'node:child_process';

const PROD_SERVICE_ID = 'srv-d6f0j1lm5p6s73fk81b0';     // Theodore-production
const STAGING_SERVICE_ID = 'srv-d6f0c0h5pdvs73dr79f0';  // theodore-staging
const STAGING_BRANCH = 'develop';
const PROD_BRANCH = 'main';

const EXCLUDED = new Set([
  'APP_URL',                // staging URL differs
  'DATABASE_URL',           // separate DB by design
  'STRIPE_WEBHOOK_SECRET',  // webhooks only fire to prod URL
]);

function loadRenderKey() {
  if (process.env.RENDER_API_KEY) return process.env.RENDER_API_KEY;
  const keyPath = path.join(os.homedir(), '.render-key');
  if (fs.existsSync(keyPath)) {
    const text = fs.readFileSync(keyPath, 'utf8').trim();
    const m = text.match(/RENDER_API_KEY\s*=\s*(\S+)/);
    if (m) return m[1];
    if (text.startsWith('rnd_')) return text;
  }
  throw new Error('Set RENDER_API_KEY env var or ~/.render-key file');
}

async function getEnvVars(serviceId, apiKey) {
  const r = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars?limit=100`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (!r.ok) throw new Error(`GET env-vars ${r.status}: ${await r.text()}`);
  const data = await r.json();
  const items = Array.isArray(data) ? data : data.envVars || [];
  const out = new Map();
  for (const x of items) {
    const ev = x.envVar || x;
    if (ev.key) out.set(ev.key, ev.value || '');
  }
  return out;
}

async function putEnvVars(serviceId, apiKey, envMap) {
  // Render's PUT replaces the entire env-var set. Send all the keys we want
  // to keep including the ones we're explicitly preserving from staging.
  const body = [...envMap.entries()].map(([key, value]) => ({ key, value }));
  const r = await fetch(`https://api.render.com/v1/services/${serviceId}/env-vars`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`PUT env-vars ${r.status}: ${await r.text()}`);
  return r.json();
}

function maskValue(v) {
  if (!v) return '(empty)';
  if (v.length <= 12) return v;
  return `${v.slice(0, 6)}…${v.slice(-3)}`;
}

function syncCode() {
  console.log('\n→ Fast-forwarding develop to main…');
  execSync('git fetch origin --quiet', { stdio: 'inherit' });
  execSync(`git push origin origin/${PROD_BRANCH}:${STAGING_BRANCH}`, { stdio: 'inherit' });
  console.log(`✓ Pushed origin/${PROD_BRANCH} → origin/${STAGING_BRANCH}. Staging will auto-deploy.`);
}

async function main() {
  const apply = process.argv.includes('--apply');
  const syncCodeToo = process.argv.includes('--code');

  const apiKey = loadRenderKey();
  const [prodEnv, stagingEnv] = await Promise.all([
    getEnvVars(PROD_SERVICE_ID, apiKey),
    getEnvVars(STAGING_SERVICE_ID, apiKey),
  ]);

  // Build the target env set for staging:
  //   - everything from prod EXCEPT excluded keys
  //   - excluded keys preserved from staging (or empty if missing)
  const target = new Map();
  for (const [key, value] of prodEnv) {
    if (EXCLUDED.has(key)) continue;
    target.set(key, value);
  }
  for (const key of EXCLUDED) {
    if (stagingEnv.has(key)) target.set(key, stagingEnv.get(key));
  }

  // Diff
  const adds = [];
  const updates = [];
  const removes = [];
  for (const [k, v] of target) {
    if (!stagingEnv.has(k)) adds.push(k);
    else if (stagingEnv.get(k) !== v) updates.push(k);
  }
  for (const k of stagingEnv.keys()) {
    if (!target.has(k)) removes.push(k);
  }

  console.log(`Prod env vars: ${prodEnv.size}`);
  console.log(`Staging env vars: ${stagingEnv.size}`);
  console.log(`Excluded (kept separate): ${[...EXCLUDED].join(', ')}\n`);
  console.log(`Diff (prod → staging):`);
  console.log(`  + ${adds.length} added:    ${adds.join(', ') || '(none)'}`);
  console.log(`  ~ ${updates.length} updated: ${updates.join(', ') || '(none)'}`);
  console.log(`  - ${removes.length} removed: ${removes.join(', ') || '(none)'}`);

  if (!apply) {
    console.log('\n(dry-run) — pass --apply to push these changes. --code to also FF develop branch.');
    return;
  }

  console.log('\n→ Pushing env-vars to staging…');
  await putEnvVars(STAGING_SERVICE_ID, apiKey, target);
  console.log(`✓ Staging env-vars now ${target.size} keys.`);

  if (syncCodeToo) syncCode();

  console.log('\n✓ Staging is in sync with prod. It will auto-deploy on env change.');
}

main().catch((e) => {
  console.error('✗', e.message);
  process.exit(1);
});
