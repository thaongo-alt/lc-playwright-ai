// The only manual auth step: the whole lc-uat environment (Storefront AND Backoffice) sits behind
// Cloudflare Access, which needs an email one-time code. This opens a headed browser, waits for
// you to pass Cloudflare Access, then saves that session (CF cookies only, no app login) to
// .auth/lc-uat-state-cf-only.json. The session lasts ~24h — re-run this once a day.
//
// Everything else is automatic: tests/auth.setup.ts (the `setup` project) uses this file to log in
// to the Storefront and the Backoffice and writes .auth/lc-uat-state.json and
// .auth/lc-uat-bo-state.json before the specs run.
const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'https://lc-uat.digicommerce.cloud';
const OUTPUT_PATH = path.join(__dirname, '../.auth/lc-uat-state-cf-only.json');
const MANUAL_TIMEOUT_MS = 5 * 60 * 1000;

async function main() {
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });

  console.log('\nA browser window has opened.');
  console.log('Complete Cloudflare Access ONLY: enter your email, then the login code from your inbox.');
  console.log('Do NOT log in to the Storefront — the script continues by itself once the Storefront');
  console.log('login page appears.\n');

  // Storefront's own login form = CF Access passed.
  await page.getByPlaceholder('Enter your email').waitFor({ timeout: MANUAL_TIMEOUT_MS });

  // Backoffice is on the same host, so the same CF session should get straight to its login form.
  await page.goto(`${BASE_URL}/backoffice/`, { waitUntil: 'domcontentloaded' });
  await page.locator('input[name="email"]').waitFor({ timeout: 60 * 1000 });

  await context.storageState({ path: OUTPUT_PATH });
  const cf = (await context.cookies(BASE_URL)).find((c) => c.name === 'CF_Authorization');
  console.log(`Saved session to ${OUTPUT_PATH}`);
  if (cf) console.log(`Cloudflare Access session valid until ${new Date(cf.expires * 1000).toLocaleString()}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
