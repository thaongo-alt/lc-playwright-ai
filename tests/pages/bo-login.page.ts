import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

// Confirmed against live DOM (2026-09-24): /backoffice/ without a BO session redirects to
// /backoffice/login ("Log in to your Sales Portal"). The MUI inputs have no accessible label,
// so they are targeted by their name attributes.
export class BoLoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.locator('input[name="email"]');
    this.passwordInput = page.locator('input[name="password"]');
    this.loginButton = page.getByRole('button', { name: 'Sign in' });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${BASE_URL}/backoffice/`, { waitUntil: 'domcontentloaded' });
    // The SPA client-side redirects /backoffice/ -> /backoffice/login and re-renders the form;
    // filling before that settles gets wiped (submit then fails with "This field is required").
    await this.page.waitForURL(`${BASE_URL}/backoffice/login`);
    await this.page.waitForLoadState('networkidle');
    await expect(this.emailInput).toBeVisible();
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.loginButton.click();
  }

  async assertLoginSuccess(): Promise<void> {
    await this.page.waitForURL(new RegExp(`^${BASE_URL}/backoffice/?$`));
  }
}
