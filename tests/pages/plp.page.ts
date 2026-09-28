import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

export class PlpPage {
  readonly page: Page;
  readonly sortSelect: Locator;
  readonly gridViewButton: Locator;
  readonly listViewButton: Locator;
  readonly pagination: Locator;
  readonly breadcrumb: Locator;
  readonly noProductFoundText: Locator;

  constructor(page: Page) {
    this.page = page;
    // Real element is a native <select> (confirmed via live DOM), not a MUI combobox popup.
    this.sortSelect = page.locator('select.sc-Sort-select');
    // Icon-only buttons with no accessible name; "sc-btn-grid"/"sc-btn-list" are the component's
    // own semantic classes (not emotion-generated hashes), confirmed via live DOM 2026-09-23.
    // The active view carries an additional "active" class.
    this.gridViewButton = page.locator('button.sc-btn-grid');
    this.listViewButton = page.locator('button.sc-btn-list');
    this.pagination = page.getByRole('navigation', { name: 'pagination navigation' });
    this.breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' });
    this.noProductFoundText = page.getByText('No Product Found');
  }

  async goto(categorySlug: string): Promise<void> {
    await this.page.goto(`${BASE_URL}/category/${categorySlug}`, { waitUntil: 'domcontentloaded' });
    await expect(this.pagination.or(this.noProductFoundText)).toBeVisible();
  }

  async selectProductByName(name: string): Promise<void> {
    await this.page.getByRole('heading', { name: this.headingNamePattern(name), level: 2 }).click();
  }

  async assertOnPlp(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`^${BASE_URL}/categories`));
  }

  async assertOnCategory(categorySlug: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`^${BASE_URL}/category/${categorySlug}`));
  }

  // The breadcrumb's visual all-caps styling is CSS text-transform only; the actual DOM text is
  // lowercase (confirmed via live DOM 2026-09-23), so matching is case-insensitive.
  async assertBreadcrumbText(expected: string): Promise<void> {
    await expect(this.breadcrumb).toContainText(new RegExp(expected, 'i'));
  }

  // --- Product card ---

  // Each card's name (h2) and SKU (<strong>) sit in a shared wrapper; walking up from the
  // heading is more resilient than a full-card class match, since card container classes are
  // emotion-generated and not stable across builds.
  // List view concatenates the SKU straight into the heading's accessible name (e.g. "Iced
  // CoffeeLC001", vs. grid view's plain "Iced Coffee" — confirmed via live DOM 2026-09-23), so
  // matching must anchor on the start of the name rather than requiring an exact match.
  private headingNamePattern(name: string): RegExp {
    return new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
  }

  productCard(name: string): Locator {
    // Grid and list view nest the heading at different depths (confirmed via live DOM), so a
    // fixed ancestor-depth walk breaks when switching views. Instead, walk up to the closest
    // ancestor that also contains the price element — that's always the full card root,
    // regardless of view mode, since price and wishlist icon live in sibling subtrees of it.
    return this.page
      .getByRole('heading', { name: this.headingNamePattern(name), level: 2 })
      .locator('xpath=ancestor::div[.//*[contains(@class,"price-text")]][1]');
  }

  // The same category lists different products on page 1 for a guest and a logged-in customer
  // (confirmed live 2026-09-25), so a card is looked up page by page.
  async goToPageWithProduct(name: string): Promise<void> {
    const heading = this.page.getByRole('heading', { name: this.headingNamePattern(name), level: 2 });
    const next = this.pagination.getByRole('button', { name: 'Go to next page' });
    await expect(this.page.locator('.price-text').first()).toBeVisible();
    while ((await heading.count()) === 0 && (await next.isEnabled())) {
      const firstCard = await this.page.getByRole('heading', { level: 2 }).first().textContent();
      await next.click();
      await expect(this.page.getByRole('heading', { level: 2 }).first()).not.toHaveText(firstCard ?? '');
    }
    await expect(heading).toBeVisible();
  }

  async assertProductCardVisible(name: string): Promise<void> {
    await expect(this.productCard(name)).toBeVisible();
  }

  async assertProductCardSku(name: string, sku: string): Promise<void> {
    await expect(this.productCard(name)).toContainText(sku);
  }

  async assertProductCardPrice(name: string, price: string): Promise<void> {
    await expect(this.productCard(name).locator('.price-text')).toContainText(price);
  }

  async assertProductCardHasViewDetail(name: string): Promise<void> {
    await expect(this.productCard(name).getByRole('button', { name: 'View Detail' })).toBeVisible();
  }

  async assertProductCardHasAddToCart(name: string): Promise<void> {
    await expect(this.productCard(name).getByRole('button', { name: 'Add to Cart', exact: true })).toBeVisible();
  }

  async assertProductCardHasNoAddToCart(name: string): Promise<void> {
    await expect(this.productCard(name).getByRole('button', { name: 'Add to Cart', exact: true })).toHaveCount(0);
  }

  // The card stepper is two icon-only buttons ("−", "+") around the quantity text, with no role,
  // label or data-test (confirmed via live DOM 2026-09-25). They are the card's buttons with no
  // text, minus the wishlist icon button.
  cardStepperButtons(name: string): Locator {
    return this.productCard(name)
      .getByRole('button')
      .filter({ hasNotText: /\S/ })
      .filter({ hasNot: this.page.locator('[data-testid^="Favorite"]') });
  }

  async assertProductCardHasQuantityStepper(name: string): Promise<void> {
    await expect(this.cardStepperButtons(name)).toHaveCount(2);
  }

  async assertProductCardHasNoQuantityStepper(name: string): Promise<void> {
    await expect(this.cardStepperButtons(name)).toHaveCount(0);
  }

  // "+" is the second stepper button (after "−").
  async increaseCardQuantity(name: string): Promise<void> {
    await this.cardStepperButtons(name).last().click();
  }

  async addCardToCart(name: string): Promise<void> {
    await this.productCard(name).getByRole('button', { name: 'Add to Cart', exact: true }).click();
  }

  async clickCardViewDetail(name: string): Promise<void> {
    await this.productCard(name).getByRole('button', { name: 'View Detail' }).click();
  }

  async assertProductCardSalePrice(name: string, originalPrice: string, salePrice: string): Promise<void> {
    const priceBlock = this.productCard(name).locator('.price-text');
    await expect(priceBlock).toContainText(originalPrice);
    await expect(priceBlock).toContainText(salePrice);
  }

  // Icon-only, identified by the underlying MUI icon's data-testid (same pattern as
  // product-list.page.ts's Edit/Delete icons).
  wishlistIcon(name: string): Locator {
    return this.productCard(name).locator('button:has([data-testid="FavoriteBorderIcon"]), button:has([data-testid="FavoriteIcon"])');
  }

  async assertWishlistIconVisible(name: string): Promise<void> {
    await expect(this.wishlistIcon(name)).toBeVisible();
  }

  async countProductCards(): Promise<number> {
    return this.page.locator('.price-text').count();
  }

  // --- Grid / List view ---

  async switchToGridView(): Promise<void> {
    await this.gridViewButton.click();
  }

  async switchToListView(): Promise<void> {
    await this.listViewButton.click();
  }

  async assertGridViewActive(): Promise<void> {
    await expect(this.gridViewButton).toHaveClass(/active/);
  }

  async assertListViewActive(): Promise<void> {
    await expect(this.listViewButton).toHaveClass(/active/);
  }

  // --- Pagination ---

  async goToNextPage(): Promise<void> {
    await this.pagination.getByRole('button', { name: 'Go to next page' }).click();
  }

  async goToPreviousPage(): Promise<void> {
    await this.pagination.getByRole('button', { name: 'Go to previous page' }).click();
  }

  async goToPage(pageNumber: number): Promise<void> {
    await this.pagination.getByRole('button', { name: `Go to page ${pageNumber}` }).click();
  }

  async assertCurrentPage(pageNumber: number): Promise<void> {
    await expect(this.pagination.getByRole('button', { name: `page ${pageNumber}` })).toHaveAttribute(
      'aria-current',
      'true',
    );
  }

  async assertPreviousPageDisabled(): Promise<void> {
    await expect(this.pagination.getByRole('button', { name: 'Go to previous page' })).toBeDisabled();
  }

  async assertNextPageDisabled(): Promise<void> {
    await expect(this.pagination.getByRole('button', { name: 'Go to next page' })).toBeDisabled();
  }

  async assertScrolledToTop(): Promise<void> {
    await expect(async () => {
      const scrollY = await this.page.evaluate(() => window.scrollY);
      expect(scrollY).toBeLessThan(50);
    }).toPass({ timeout: 3000 });
  }

  async scrollToBottomOfProductList(): Promise<void> {
    await this.pagination.scrollIntoViewIfNeeded();
  }

  // --- Sort ---

  async selectSort(option: 'Relevance' | 'Price: Low to High' | 'Price: High to Low'): Promise<void> {
    await this.sortSelect.selectOption({ label: option });
  }

  async assertSortUrlParam(value: 'price-asc' | 'price-desc'): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`sorted=${value}`));
  }

  // --- Facets ---

  facetCheckbox(labelPattern: string | RegExp): Locator {
    return this.page.getByRole('checkbox', { name: labelPattern });
  }

  async toggleFacet(labelPattern: string | RegExp): Promise<void> {
    await this.facetCheckbox(labelPattern).click();
  }

  async assertFacetChecked(labelPattern: string | RegExp): Promise<void> {
    await expect(this.facetCheckbox(labelPattern)).toBeChecked();
  }

  async assertFacetUnchecked(labelPattern: string | RegExp): Promise<void> {
    await expect(this.facetCheckbox(labelPattern)).not.toBeChecked();
  }

  async assertUrlHasParam(paramPattern: RegExp): Promise<void> {
    await expect(this.page).toHaveURL(paramPattern);
  }

  async assertNoProductFound(): Promise<void> {
    await expect(this.noProductFoundText).toBeVisible();
  }
}
