import { expect, Locator, Page } from '@playwright/test';

// Confirmed against live DOM (2026-09-16), reached via BoCheckoutPage.placeOrder()'s redirect.
export class OrderDetailPage {
  readonly page: Page;
  // Each of these lives inside a combined "<label> <value>" paragraph (e.g. "Status Order
  // Placed"), not its own element, so these locators intentionally use substring matching
  // rather than an exact match.
  readonly statusText: Locator;
  readonly paymentMethodText: Locator;
  readonly shippingMethodText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.statusText = page.getByText('Order Placed');
    this.paymentMethodText = page.getByText('Cash On Delivery (COD)');
    this.shippingMethodText = page.getByText('Standard Shipping (Free ship)');
  }

  getOrderIdFromUrl(): string {
    const match = this.page.url().match(/\/order-detail\/(\d+)/);
    if (!match) {
      throw new Error(`Not on an Order Detail page: ${this.page.url()}`);
    }
    return match[1];
  }

  async assertOrderPlaced(): Promise<void> {
    await expect(this.statusText).toBeVisible();
  }

  async assertPaymentMethod(): Promise<void> {
    await expect(this.paymentMethodText).toBeVisible();
  }

  async assertShippingMethod(): Promise<void> {
    await expect(this.shippingMethodText).toBeVisible();
  }

  async assertProductVisible(sku: string): Promise<void> {
    await expect(this.page.getByRole('table').getByText(sku, { exact: true })).toBeVisible();
  }
}
