import fs from 'fs';
import path from 'path';
import { test as setup, Browser } from '@playwright/test';
import { LoginPage } from './pages/login.page';
import { BoLoginPage } from './pages/bo-login.page';

// Runs before every test run (the `setup` project in playwright.config.ts). The only manual
// step is Cloudflare Access (email one-time code), captured once a day via `npm run save-cf-auth`
// into CF_STATE. From that, this logs in to the Storefront and the Backoffice with the test
// accounts and writes the full-session states the specs use — so nobody has to capture them by
// hand. Storefront and Backoffice share one CF Access session (same host, cookies on path "/";
// confirmed live 2026-09-24).
const AUTH_DIR = path.join(__dirname, '../.auth');
const CF_STATE = path.join(AUTH_DIR, 'lc-uat-state-cf-only.json');
const SF_STATE = path.join(AUTH_DIR, 'lc-uat-state.json');
const BO_STATE = path.join(AUTH_DIR, 'lc-uat-bo-state.json');

const SF_EMAIL = process.env.E2E_USERNAME ?? 'thao.ngo+5@digicommercegroup.com';
const SF_PASSWORD = process.env.E2E_PASSWORD ?? 'Thao@1234';
const ADMIN_EMAIL = process.env.E2E_BO_ADMIN_EMAIL ?? 'admin@digicommerce.xyz';
const ADMIN_PASSWORD = process.env.E2E_BO_ADMIN_PASSWORD ?? 'Z7w2bxdpEDGXC6WMvrTqaykK';

// Fail fast with an actionable message instead of letting every spec time out on the CF login page.
function assertCfSessionValid(): void {
  const hint = 'Run `npm run save-cf-auth` to capture a fresh Cloudflare Access session.';
  if (!fs.existsSync(CF_STATE)) throw new Error(`Missing ${CF_STATE}. ${hint}`);

  const { cookies } = JSON.parse(fs.readFileSync(CF_STATE, 'utf8'));
  const cfCookie = cookies.find(
    (c: { name: string; domain: string }) => c.name === 'CF_Authorization' && c.domain === 'lc-uat.digicommerce.cloud',
  );
  if (!cfCookie) throw new Error(`No CF_Authorization cookie in ${CF_STATE}. ${hint}`);

  const expiresAt = cfCookie.expires * 1000;
  // Leave a margin so the session doesn't expire in the middle of the run.
  if (expiresAt < Date.now() + 10 * 60 * 1000) {
    throw new Error(`Cloudflare Access session expired/expiring at ${new Date(expiresAt).toISOString()}. ${hint}`);
  }
}

async function newCfContext(browser: Browser) {
  assertCfSessionValid();
  return browser.newContext({ storageState: CF_STATE });
}

setup('log in to Storefront as test customer', async ({ browser }) => {
  const context = await newCfContext(browser);
  const loginPage = new LoginPage(await context.newPage());

  await loginPage.goto();
  await loginPage.fillCredentials(SF_EMAIL, SF_PASSWORD);
  await loginPage.submit();
  await loginPage.assertLoginSuccess();

  await context.storageState({ path: SF_STATE });
  await context.close();
});

setup('log in to Backoffice as admin', async ({ browser }) => {
  const context = await newCfContext(browser);
  const boLoginPage = new BoLoginPage(await context.newPage());

  await boLoginPage.goto();
  await boLoginPage.fillCredentials(ADMIN_EMAIL, ADMIN_PASSWORD);
  await boLoginPage.submit();
  await boLoginPage.assertLoginSuccess();

  await context.storageState({ path: BO_STATE });
  await context.close();
});
