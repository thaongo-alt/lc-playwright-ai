import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

export class WishlistsListPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly wishlistCountText: Locator;
  readonly addNewButton: Locator;
  readonly table: Locator;

  constructor(page: Page) {
    this.page = page;
    // Live DOM combines the title and count into one heading's accessible name
    // (e.g. "Wishlists 2 Wishlists"), so this must be a prefix match, not exact.
    this.heading = page.getByRole('heading', { name: /^Wishlists/ });
    this.wishlistCountText = page.getByText(/^\d+ Wishlists?$/);
    this.addNewButton = page.getByRole('button', { name: 'Add New' });
    // Confirmed via live DOM: rendered as a native <table> with columns
    // Name / Description (Optional) / No. of Products / Created Date / Actions.
    this.table = page.getByRole('table');
  }

  async goto(): Promise<void> {
    // The UAT environment occasionally drops a navigation mid-flight (transient 502 / ERR_ABORTED
    // from the edge) unrelated to the app itself; one retry absorbs that without masking a real
    // failure, since a second consecutive failure still surfaces as a normal thrown error.
    try {
      await this.page.goto(`${BASE_URL}/my-account/wishlists`, { waitUntil: 'load' });
    } catch {
      await this.page.goto(`${BASE_URL}/my-account/wishlists`, { waitUntil: 'load' });
    }
    await expect(this.heading).toBeVisible();
    // Confirmed via live DOM: the page briefly renders a loading/skeleton state where the heading
    // reads "0 Wishlists" and every row cell is empty, before the real list loads in. Waiting for
    // the heading alone races with this — wait for the data fetch to settle too.
    await this.page.waitForLoadState('networkidle');
  }

  async assertOnWishlistsListPage(): Promise<void> {
    await expect(this.page).toHaveURL(/\/my-account\/wishlists/);
    await expect(this.heading).toBeVisible();
  }

  async clickAddNew(): Promise<void> {
    await this.addNewButton.click();
  }

  async getWishlistCount(): Promise<number> {
    const text = await this.wishlistCountText.innerText();
    return parseInt(text, 10);
  }

  async assertWishlistRowVisible(name: string): Promise<void> {
    await expect(this.table.getByRole('row', { name })).toBeVisible();
  }

  async getRowCountForName(name: string): Promise<number> {
    return this.table.getByRole('row', { name }).count();
  }
}
