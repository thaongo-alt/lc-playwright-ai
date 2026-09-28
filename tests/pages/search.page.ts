import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

export class SearchPage {
  readonly page: Page;
  readonly searchInput: Locator;
  readonly searchButton: Locator;
  readonly breadcrumb: Locator;
  readonly noProductFoundText: Locator;

  constructor(page: Page) {
    this.page = page;
    // The search box is always present in the header (not an overlay that needs opening) —
    // confirmed via live DOM 2026-09-23.
    this.searchInput = page.getByRole('textbox', { name: 'Search for your perfect candle' });
    this.searchButton = page.getByRole('button', { name: 'SEARCH' });
    this.breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' });
    this.noProductFoundText = page.getByText('No Product Found');
  }

  // Kept for existing callers: the search input is always visible in the header (not behind an
  // overlay toggle, as originally assumed pre-DOM-confirmation) — this simply focuses it.
  async open(): Promise<void> {
    await this.searchInput.click();
  }

  async searchFor(query: string): Promise<void> {
    await this.searchInput.fill(query);
    await this.page.keyboard.press('Enter');
  }

  async typeQuery(query: string): Promise<void> {
    await this.searchInput.fill(query);
  }

  // The autosuggest dropdown item; class names confirmed via live DOM 2026-09-23.
  autosuggestItem(name: string): Locator {
    return this.page.locator('.sc-Autocomplete-hint', { hasText: name });
  }

  async assertAutosuggestItemVisible(name: string): Promise<void> {
    await expect(this.autosuggestItem(name)).toBeVisible();
  }

  async clickAutosuggestItem(name: string): Promise<void> {
    await this.autosuggestItem(name).click();
  }

  async assertOnSearchResults(query: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`^${BASE_URL}/search\\?q=${encodeURIComponent(query)}`));
    await expect(this.breadcrumb).toContainText(/search result/i);
  }

  async assertProductInResults(name: string): Promise<void> {
    await expect(this.page.getByRole('heading', { name, level: 2 })).toBeVisible();
  }

  async assertNoProductFound(): Promise<void> {
    await expect(this.noProductFoundText).toBeVisible();
  }
}
