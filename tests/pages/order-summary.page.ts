import { expect, Locator, Page } from '@playwright/test';

// The "Order Summary" block is the same component on the Cart and Checkout pages. Each row is a
// pair of sibling <p> elements — label then value — with no roles or data-test attributes
// (confirmed via live DOM 2026-09-24), so values are reached from their label's next sibling.
// The cart table's "Total" column header is also a <p>, but it has no <p> sibling, so the
// following-sibling step only ever resolves inside the summary.
export class OrderSummary {
  readonly page: Page;
  readonly couponInput: Locator;
  readonly applyCouponButton: Locator;
  readonly taxLabel: Locator;
  readonly subtotalValue: Locator;
  readonly taxValue: Locator;
  readonly discountValue: Locator;
  readonly totalValue: Locator;

  constructor(page: Page) {
    this.page = page;
    this.couponInput = page.getByRole('textbox', { name: 'Enter code' });
    this.applyCouponButton = page.getByRole('button', { name: 'Apply' });
    this.taxLabel = page.locator('p', { hasText: /^Tax \(/ });
    this.subtotalValue = this.valueOf(/^Subtotal$/);
    this.taxValue = this.valueOf(/^Tax \(/);
    this.discountValue = this.valueOf(/^Discount$/);
    this.totalValue = this.valueOf(/^Total$/);
  }

  private valueOf(label: RegExp): Locator {
    return this.page.locator('p', { hasText: label }).locator('xpath=following-sibling::p[1]');
  }

  // The tax label first renders as "Tax (0%)" until the store's tax config loads, which can take
  // well over the default 5s when several sessions hit UAT at once.
  async waitForLoaded(): Promise<void> {
    await expect(this.taxLabel).not.toHaveText('Tax (0%)', { timeout: 20000 });
    await expect(this.subtotalValue).not.toHaveText('CAD 0.00');
  }

  async applyCoupon(code: string): Promise<void> {
    await this.couponInput.fill(code);
    await this.applyCouponButton.click();
  }

  async assertSubtotal(amount: string): Promise<void> {
    await expect(this.subtotalValue).toHaveText(amount);
  }

  async assertTax(amount: string): Promise<void> {
    await expect(this.taxValue).toHaveText(amount);
  }

  async assertDiscount(amount: string): Promise<void> {
    await expect(this.discountValue).toHaveText(amount);
  }

  async assertTotal(amount: string): Promise<void> {
    await expect(this.totalValue).toHaveText(amount);
  }

  async assertTaxLabel(text: string): Promise<void> {
    await expect(this.taxLabel).toHaveText(text);
  }

  async assertSingleTaxLine(): Promise<void> {
    await expect(this.page.locator('p', { hasText: /^(Tax|GST|QST)\b/ })).toHaveCount(1);
  }

  // Shipping is not applied in this scope: either no Shipping row at all, or a zero amount.
  async assertNoShippingFee(): Promise<void> {
    const shippingValue = this.valueOf(/^Shipping/);
    if ((await shippingValue.count()) > 0) {
      await expect(shippingValue).toHaveText('CAD 0.00');
    }
  }

  async assertNoCodFeeLine(): Promise<void> {
    await expect(this.page.locator('p', { hasText: /COD fee/i })).toHaveCount(0);
  }
}
