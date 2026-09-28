import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

// My account > "Address Book" section (confirmed via live DOM 2026-09-24). Address cards have no
// role or data-test attribute; a card is the innermost <div> holding both the recipient name and
// the card's action buttons ("Edit" is on every card, including the Default one).
export class AddressBookPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly defaultLabels: Locator;
  readonly confirmDialog: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Address Book' });
    this.defaultLabels = page.getByText('Default Address', { exact: true });
    this.confirmDialog = page.getByRole('dialog', { name: /Please confirm/ });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${BASE_URL}/my-account`, { waitUntil: 'domcontentloaded' });
    await expect(this.heading).toBeVisible();
  }

  addressCard(recipientName: string): Locator {
    return this.page
      .locator('div')
      .filter({ has: this.page.getByText(recipientName, { exact: true }) })
      .filter({ has: this.page.getByRole('button', { name: 'Edit' }) })
      .last();
  }

  async setAsDefault(recipientName: string): Promise<void> {
    await this.addressCard(recipientName).getByRole('button', { name: 'Set as default' }).click();
    await this.confirmDialog.getByRole('button', { name: 'Save' }).click();
    await expect(this.confirmDialog).toBeHidden();
  }

  async assertIsDefault(recipientName: string): Promise<void> {
    await expect(this.addressCard(recipientName).getByText('Default Address', { exact: true })).toBeVisible();
  }

  async assertSingleDefault(): Promise<void> {
    await expect(this.defaultLabels).toHaveCount(1);
  }
}
