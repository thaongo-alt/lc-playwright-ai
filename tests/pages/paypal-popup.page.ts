import { expect, Locator, Page } from '@playwright/test';

// The PayPal Sandbox checkout window opened by the Smart Button on Checkout (confirmed live
// 2026-09-24). This is a third-party page: its structure can change without notice, which is
// why the PayPal cases are rated Low for automation feasibility.
export class PayPalPopup {
  readonly popup: Page;
  readonly emailInput: Locator;
  readonly nextButton: Locator;
  readonly passwordInput: Locator;
  readonly loginButton: Locator;
  readonly cartAmountButton: Locator;
  readonly completePurchaseButton: Locator;
  readonly cancelLink: Locator;

  constructor(popup: Page) {
    this.popup = popup;
    this.emailInput = popup.getByRole('textbox', { name: 'Email or mobile number' });
    this.nextButton = popup.getByRole('button', { name: 'Next' });
    this.passwordInput = popup.getByRole('textbox', { name: 'Password' });
    this.loginButton = popup.getByRole('button', { name: 'Log In' });
    this.cartAmountButton = popup.getByRole('button', { name: /^Cart amount:/ });
    this.completePurchaseButton = popup.getByRole('button', { name: 'Complete Purchase' });
    // The sandbox merchant is named "Test Store", not "Liana's Candelas" as in the test case.
    this.cancelLink = popup.getByRole('link', { name: /^Cancel and return to/ });
  }

  async assertOnPayPalSandbox(): Promise<void> {
    await expect(this.popup).toHaveURL(/^https:\/\/www\.sandbox\.paypal\.com\//);
  }

  // The email step sometimes shows the password field on the same screen and sometimes after
  // "Next", depending on PayPal's A/B flow. A second popup in the same browser session is
  // already logged in and goes straight to the review page, so login is skipped then.
  async logIn(email: string, password: string): Promise<void> {
    await expect(this.emailInput.or(this.completePurchaseButton)).toBeVisible({ timeout: 45_000 });
    if (await this.completePurchaseButton.isVisible()) return;
    await this.emailInput.fill(email);
    if (await this.nextButton.isVisible()) {
      await this.nextButton.click();
    }
    await this.passwordInput.fill(password);
    await this.loginButton.click();
    await expect(this.completePurchaseButton).toBeVisible({ timeout: 45_000 });
  }

  async assertAmount(amount: string): Promise<void> {
    await expect(this.cartAmountButton).toContainText(amount);
  }

  async completePurchase(): Promise<void> {
    const closed = this.popup.waitForEvent('close', { timeout: 60_000 });
    await this.completePurchaseButton.click();
    await closed;
  }

  async cancel(): Promise<void> {
    const closed = this.popup.waitForEvent('close', { timeout: 60_000 });
    await this.cancelLink.click();
    await closed;
  }

  async close(): Promise<void> {
    await this.popup.close();
  }
}
