import { expect, Locator, Page } from '@playwright/test';

// Confirmed via live DOM (2026-08-27): creating a wishlist ALWAYS redirects to this detail page,
// regardless of entry point (Wishlists List Page "Add New" or My Account -> Wishlists) — this
// contradicts requirement AC4, which describes the List Page entry point as staying put with the
// table updating in place. See gen-ai/testcases/lc-storefront-create-wishlist-testcases.md Gap G004.
// Real structure: breadcrumb "Home > Wishlists > {name}", a "Wishlist {name} detail" paragraph
// (not an <h1>), and — for a fresh wishlist — the empty-state text "Your wishlist is empty" rather
// than a literal "0 items" string.
export class WishlistDetailPage {
  readonly page: Page;
  readonly emptyStateText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emptyStateText = page.getByText('Your wishlist is empty');
  }

  async assertOnDetailPageFor(name: string): Promise<void> {
    await expect(this.page).toHaveURL(/\/my-account\/wishlists\/\d+/);
    await expect(this.page.getByText(`Wishlist ${name} detail`)).toBeVisible();
  }

  async assertZeroItems(): Promise<void> {
    await expect(this.emptyStateText).toBeVisible();
  }
}
