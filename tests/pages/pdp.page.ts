import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

export class PdpPage {
  readonly page: Page;
  readonly addToCartButton: Locator;
  readonly descriptionTabPanel: Locator;
  readonly attributesTab: Locator;
  readonly attributesTabPanel: Locator;
  readonly productImage: Locator;
  readonly addToCartToast: Locator;
  readonly breadcrumb: Locator;
  readonly statusText: Locator;
  readonly quantityGroup: Locator;
  readonly quantityInput: Locator;
  readonly quantityDecreaseButton: Locator;
  readonly quantityIncreaseButton: Locator;
  readonly suggestedProductsHeading: Locator;
  // lightGallery renders its own root; confirmed via live DOM (2026-09-23).
  readonly lightbox: Locator;
  readonly lightboxCloseButton: Locator;
  readonly lightboxNextButton: Locator;
  readonly lightboxPrevButton: Locator;
  readonly lightboxZoomInButton: Locator;
  readonly lightboxZoomOutButton: Locator;
  readonly lightboxFullscreenButton: Locator;
  readonly lightboxCounter: Locator;

  constructor(page: Page) {
    this.page = page;
    // The "You may also like" section further down the PDP reuses the PLP product-card
    // component, which also has an "Add to Cart" button (data-test="product-list-add-to-cart") —
    // excluding it disambiguates from this PDP's own Add to Cart button.
    this.addToCartButton = page.locator('button:not([data-test="product-list-add-to-cart"])', {
      hasText: 'Add to Cart',
    });
    this.descriptionTabPanel = page.getByRole('tabpanel', { name: 'Description' });
    this.attributesTab = page.getByRole('tab', { name: 'Attributes' });
    this.attributesTabPanel = page.getByRole('tabpanel', { name: 'Attributes' });
    this.productImage = page.getByRole('listbox', { name: 'slider' }).locator('img').first();
    // react-toastify renders the top-right toast container with this fixed class.
    this.addToCartToast = page.locator('.Toastify__toast-container--top-right');
    // SPA route transitions can briefly leave the previous page's breadcrumb mounted alongside
    // the new one (confirmed via live DOM 2026-09-23); .last() targets the current page's.
    this.breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' }).last();
    // "Status:" and its value ("In stock" / "Out of stock") render as two separate sibling
    // <span> elements, not one text node (confirmed via live DOM 2026-09-23) — the value span is
    // targeted directly so assertions can match on it alone.
    this.statusText = page.getByText('Status:', { exact: true }).locator('xpath=following-sibling::span[1]');
    this.quantityGroup = page.getByRole('group', { name: 'Quantity controller' });
    // data-test attributes confirmed via live DOM (2026-09-23).
    this.quantityInput = page.locator('[data-test="quantity-input-textbox"] input');
    this.quantityDecreaseButton = page.locator('[data-test="quantity-input-decrease"]');
    this.quantityIncreaseButton = page.locator('[data-test="quantity-input-increase"]');
    this.suggestedProductsHeading = page.getByRole('heading', { name: 'You may also like' });
    this.lightbox = page.locator('.lg-outer');
    this.lightboxCloseButton = page.getByRole('button', { name: 'Close gallery' });
    this.lightboxNextButton = page.getByRole('button', { name: 'Next slide' });
    this.lightboxPrevButton = page.getByRole('button', { name: 'Previous slide' });
    this.lightboxZoomInButton = page.getByRole('button', { name: 'Zoom in' });
    this.lightboxZoomOutButton = page.getByRole('button', { name: 'Zoom out' });
    this.lightboxFullscreenButton = page.getByRole('button', { name: 'Toggle fullscreen' });
    // The counter is an unclassed <div> (two <span>s + a "/" text node, no "lg-counter" class in
    // this build — confirmed via live DOM 2026-09-23); matched by scoping to the lightbox root
    // instead and checking its text via assertLightboxCounter().
    this.lightboxCounter = this.lightbox;
  }

  async gotoBySku(pathSegment: string): Promise<void> {
    await this.page.goto(`${BASE_URL}/product/${pathSegment}`, { waitUntil: 'domcontentloaded' });
  }

  // Simple products render the name as an <h1>, but variant products (e.g. Iced Coffee) render
  // it as a plain, non-heading <p> instead — confirmed via live DOM 2026-09-23. Matching either
  // element by leading text covers both product types.
  productHeading(name: string): Locator {
    const pattern = new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`);
    return this.page.locator('h1, p').filter({ hasText: pattern }).first();
  }

  async assertProductDisplayed(name: string, description: string): Promise<void> {
    await expect(this.productHeading(name)).toBeVisible();
    await expect(this.descriptionTabPanel.getByText(description)).toBeVisible();
    await expect(this.productImage).toBeVisible();
  }

  async addToCart(): Promise<void> {
    await this.addToCartButton.click();
  }

  async assertAddToCartToastVisible(): Promise<void> {
    await expect(this.addToCartToast).toContainText('Product added to cart.');
  }

  async assertAddToCartEnabled(): Promise<void> {
    await expect(this.addToCartButton).toBeEnabled();
  }

  async assertAddToCartDisabled(): Promise<void> {
    await expect(this.addToCartButton).toBeDisabled();
  }

  // --- Breadcrumb ---

  // See plp.page.ts's assertBreadcrumbText — same CSS-only uppercase styling.
  async assertBreadcrumbText(expected: string): Promise<void> {
    await expect(this.breadcrumb).toContainText(new RegExp(expected, 'i'));
  }

  async clickBreadcrumbSegment(text: string): Promise<void> {
    await this.breadcrumb.getByText(text, { exact: true }).click();
  }

  // --- Variant selection ---
  // TODO: verify against live DOM — Colour/Scent options render as plain, unstyled-role <p>
  // elements with no accessible role, aria-label, or data-test attribute (confirmed absent via
  // live DOM inspection 2026-09-23); the click handler is presumably on an ancestor and relies
  // on event bubbling. Matching by exact visible text is the most resilient option available.
  variantOption(value: string): Locator {
    return this.page.getByText(value, { exact: true }).first();
  }

  async selectVariantOption(value: string): Promise<void> {
    await this.variantOption(value).click();
  }

  async assertSku(sku: string): Promise<void> {
    await expect(this.page.getByText(`SKU: ${sku}`)).toBeVisible();
  }

  // The price is a plain <p> with no role or data-test; it is the first "CAD x.xx" text on the
  // PDP (confirmed via live DOM 2026-09-25 on a non-sale variant product).
  async readPrice(): Promise<string> {
    const price = this.page.getByText(/^CAD\s[\d,]+\.\d{2}$/).first();
    await expect(price).toBeVisible();
    return (await price.textContent())!.trim();
  }

  async productImageSrc(): Promise<string> {
    await expect(this.productImage).toBeVisible();
    return (await this.productImage.getAttribute('src')) ?? '';
  }

  async assertPrice(price: string): Promise<void> {
    await expect(this.page.getByText(price, { exact: true }).first()).toBeVisible();
  }

  // --- Quantity ---

  async assertQuantity(value: number): Promise<void> {
    await expect(this.quantityInput).toHaveValue(String(value));
  }

  async incrementQuantity(): Promise<void> {
    await this.quantityIncreaseButton.click();
  }

  async decrementQuantity(): Promise<void> {
    await this.quantityDecreaseButton.click();
  }

  async setQuantity(value: number): Promise<void> {
    await this.quantityInput.fill(String(value));
  }

  async assertQuantityIncreaseDisabled(): Promise<void> {
    await expect(this.quantityIncreaseButton).toBeDisabled();
  }

  // --- Status / stock ---

  async assertStatus(text: 'In stock' | 'Out of stock'): Promise<void> {
    await expect(this.statusText).toHaveText(text);
  }

  async assertNoExactStockQuantityDisplayed(): Promise<void> {
    // Only the Status label should be present; there is no separate "N in stock" element.
    await expect(this.page.getByText(/\d+\s+(in stock|units left|remaining)/i)).toHaveCount(0);
  }

  // --- Tabs / Attributes ---

  async openAttributesTab(): Promise<void> {
    await this.attributesTab.click();
  }

  async assertAttributeRow(label: string, value: string): Promise<void> {
    await expect(this.attributesTabPanel.getByRole('row', { name: new RegExp(`${label}.*${value}`) })).toBeVisible();
  }

  // --- Price / sale ---

  async assertSalePriceDisplayed(salePrice: string, originalPrice: string): Promise<void> {
    await expect(this.page.getByText(salePrice, { exact: true }).first()).toBeVisible();
    await expect(this.page.getByText(originalPrice, { exact: true }).first()).toBeVisible();
  }

  async assertSaveBadge(text: string): Promise<void> {
    await expect(this.page.getByText(text)).toBeVisible();
  }

  // --- Gallery / lightbox ---

  async clickNextThumbnail(): Promise<void> {
    await this.page.getByRole('button', { name: 'next' }).click();
  }

  async clickPreviousThumbnail(): Promise<void> {
    await this.page.getByRole('button', { name: 'previous' }).click();
  }

  async clickThumbnailDot(index: number): Promise<void> {
    await this.page.getByRole('button', { name: 'slide dot' }).nth(index).click();
  }

  async openLightbox(): Promise<void> {
    await this.productImage.click();
    await expect(this.lightbox).toBeVisible();
  }

  async closeLightboxViaButton(): Promise<void> {
    await this.lightboxCloseButton.click();
  }

  async assertLightboxOpen(): Promise<void> {
    await expect(this.lightbox).toBeVisible();
  }

  async assertLightboxClosed(): Promise<void> {
    await expect(this.lightbox).toBeHidden();
  }

  async assertLightboxCounter(current: number, total: number): Promise<void> {
    await expect(this.lightboxCounter).toContainText(new RegExp(`${current}\\s*/\\s*${total}`));
  }

  async lightboxNext(): Promise<void> {
    await this.lightboxNextButton.click();
  }

  async lightboxPrevious(): Promise<void> {
    await this.lightboxPrevButton.click();
  }

  async lightboxZoomIn(): Promise<void> {
    await this.lightboxZoomInButton.click();
  }

  async lightboxZoomOut(): Promise<void> {
    await this.lightboxZoomOutButton.click();
  }

  async lightboxToggleFullscreen(): Promise<void> {
    await this.lightboxFullscreenButton.click();
  }

  // TODO: verify against live DOM — "lg-zoomed" is lightGallery's documented zoom-plugin class,
  // applied to the .lg-outer root while zoomed in, but was not directly re-confirmed by
  // inspection (only the pre-zoom class list was captured).
  async assertLightboxZoomed(): Promise<void> {
    await expect(this.lightbox).toHaveClass(/lg-zoomed/);
  }

  async assertLightboxNotZoomed(): Promise<void> {
    await expect(this.lightbox).not.toHaveClass(/lg-zoomed/);
  }

  async pressEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
  }

  // --- Suggested products ---

  async assertSuggestedSectionHidden(): Promise<void> {
    // The section loads asynchronously after initial paint, so an immediate count check can
    // pass as a false negative (checked before the heading has rendered at all). Waiting for the
    // page to settle first ensures the check reflects the section's actual final state.
    await this.page.waitForLoadState('networkidle');
    await expect(this.suggestedProductsHeading).toHaveCount(0);
  }

  async assertSuggestedSectionVisible(): Promise<void> {
    await expect(this.suggestedProductsHeading).toBeVisible();
  }

  suggestedProductCard(name: string): Locator {
    return this.page.getByRole('heading', { name, level: 2 }).locator('xpath=ancestor::*[self::div][3]');
  }

  async clickSuggestedProduct(name: string): Promise<void> {
    await this.suggestedProductCard(name).getByRole('button', { name: 'View Detail' }).click();
  }
}
