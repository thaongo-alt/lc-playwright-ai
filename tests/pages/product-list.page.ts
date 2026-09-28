import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';
const PRODUCTS_URL = `${BASE_URL}/backoffice/products`;

// Confirmed against live DOM (2026-09-15) via an authenticated BO session.
export class ProductListPage {
  readonly page: Page;
  readonly createProductButton: Locator;
  readonly searchInput: Locator;

  constructor(page: Page) {
    this.page = page;
    this.createProductButton = page.getByRole('button', { name: 'Create Product' });
    // The requirement doc calls this a "search field"; the real label is "Keyword".
    this.searchInput = page.getByRole('textbox', { name: 'Keyword' });
  }

  async goto(): Promise<void> {
    await this.page.goto(PRODUCTS_URL, { waitUntil: 'domcontentloaded' });
    await expect(this.createProductButton).toBeVisible();
  }

  async assertOnProductList(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`^${PRODUCTS_URL}$`));
  }

  async assertCreateProductButtonVisible(): Promise<void> {
    await expect(this.createProductButton).toBeVisible();
  }

  async assertSearchFieldVisible(): Promise<void> {
    await expect(this.searchInput).toBeVisible();
  }

  // Newly created products can land outside the default first page of results, so search by
  // keyword rather than assuming sort order/pagination when looking for one just created.
  async searchByKeyword(keyword: string): Promise<void> {
    await this.searchInput.fill(keyword);
    await this.page.getByRole('button', { name: 'Search', exact: true }).click();
  }

  async clickCreateProduct(): Promise<void> {
    await this.createProductButton.click();
  }

  // Each product renders as a MUI Card (class MuiCard-root — a stable component-slot class,
  // not an emotion-generated hash) containing a link (name, repeated in text + img alt), a
  // "SKU:" label + value, and a price heading.
  productCard(name: string): Locator {
    // .first(): repeated test runs against live UAT with the same hardcoded product name can
    // leave more than one matching card behind (see cleanup note in the spec file).
    return this.page.locator('.MuiCard-root').filter({ hasText: name }).first();
  }

  async assertProductVisible(name: string): Promise<void> {
    await expect(this.productCard(name)).toBeVisible();
  }

  async assertProductSku(name: string, sku: string): Promise<void> {
    await expect(this.productCard(name)).toContainText(sku);
  }

  async assertProductPrice(name: string, price: string): Promise<void> {
    await expect(this.productCard(name)).toContainText(price);
  }

  // Edit/Delete are icon-only buttons with no accessible name; the MUI icon components carry
  // data-testid="EditIcon" / "DeleteIcon" (confirmed live), so target those instead of a role name.
  async assertEditIconVisible(name: string): Promise<void> {
    await expect(this.productCard(name).locator('button:has([data-testid="EditIcon"])')).toBeVisible();
  }

  async assertDeleteIconVisible(name: string): Promise<void> {
    await expect(this.productCard(name).locator('button:has([data-testid="DeleteIcon"])')).toBeVisible();
  }

  // The product grid itself sits inside a .MuiCard-root too, so the innermost matching card
  // (the product's own card, last in document order) is used rather than the first match.
  async openEditProduct(name: string): Promise<void> {
    await this.searchByKeyword(name);
    await this.page
      .locator('.MuiCard-root')
      .filter({ hasText: name })
      .last()
      .locator('button:has([data-testid="EditIcon"])')
      .click();
    await this.page.waitForURL(/\/backoffice\/product\/edit\//);
  }
}
