import { expect, Locator, Page } from '@playwright/test';

// Confirmed against live DOM (2026-09-16). This is the 4-step BO checkout stepper (Shipping
// Address -> Shipping Method -> Payment Method -> Place Order) that CreateOrderPage.clickCheckout()
// navigates to. All four steps live on one page/URL (`/backoffice/checkout/{id}`) and share a
// single "Back"/"Confirm" button pair that acts on whichever step is currently active, so this
// page object exposes one confirm method per step for readability even though they click the
// same physical button.
export class BoCheckoutPage {
  readonly page: Page;
  readonly confirmButton: Locator;
  readonly backButton: Locator;
  readonly selectAddressButtons: Locator;
  readonly placeOrderButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.confirmButton = page.getByRole('button', { name: 'Confirm', exact: true });
    this.backButton = page.getByRole('button', { name: 'Back', exact: true });
    // Each saved-address card has its own "Select" button; the already-selected/default card's
    // button renders disabled (confirmed live), so a plain first-match still lands on a
    // selectable card.
    this.selectAddressButtons = page.getByRole('button', { name: 'Select', exact: true });
    this.placeOrderButton = page.getByRole('button', { name: 'PLACE ORDER', exact: true });
  }

  async selectFirstAvailableAddress(): Promise<void> {
    await this.selectAddressButtons.first().click();
  }

  async confirmShippingAddress(): Promise<void> {
    await this.confirmButton.click();
    // Real-state signal that the Shipping Method step is now active.
    await expect(this.page.getByRole('radiogroup', { name: 'Status-shippingCost' })).toBeVisible();
  }

  async confirmShippingMethod(): Promise<void> {
    // Only "Standard Shipping (Free ship)" is configured in this environment and is
    // pre-checked by default (Expedited Shipping isn't configured here — confirmed live, see
    // create_order_findings.md §4), so no explicit radio selection is needed before confirming.
    await this.confirmButton.click();
    // Real-state signal that the Payment Method step is now active.
    await expect(this.page.getByRole('button', { name: 'Payment Options' })).toBeVisible();
  }

  async confirmPaymentMethod(): Promise<void> {
    // COD is the only payment option in this BO wizard and is pre-selected by default
    // (matches the LC-359 clarification that PayPal/credit card are not available here).
    await this.confirmButton.click();
    await expect(this.placeOrderButton).toBeEnabled();
  }

  async placeOrder(): Promise<void> {
    await this.placeOrderButton.click();
    await this.page.waitForURL(/\/backoffice\/order-detail\/\d+/);
  }
}
