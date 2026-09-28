import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

// Per the requirement (checkout-payment rev 3 / purchase-flow rev 2), this page shows only the
// success message, the Order Number and a "Back to Shop" button — no items, address or amounts.
export class OrderConfirmationPage {
  readonly page: Page;
  readonly confirmationMessage: Locator;
  readonly orderNumberText: Locator;
  readonly backToShopButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.confirmationMessage = page.getByText("We've received your order!");
    this.orderNumberText = page.getByText(/Order Number:/);
    this.backToShopButton = page.getByRole('button', { name: 'Back to Shop' });
  }

  async assertOrderConfirmed(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`^${BASE_URL}/order-confirmation`));
    await expect(this.confirmationMessage).toBeVisible();
    await expect(this.orderNumberText).toBeVisible();
  }

  async assertBackToShopVisible(): Promise<void> {
    await expect(this.backToShopButton).toBeVisible();
  }

  async getOrderNumber(): Promise<string> {
    const text = await this.orderNumberText.innerText();
    const match = text.match(/Order Number:\s*(\S+)/);
    if (!match) {
      throw new Error(`Could not parse order number from text: "${text}"`);
    }
    return match[1];
  }
}
