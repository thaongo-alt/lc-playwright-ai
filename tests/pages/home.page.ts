import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

export class HomePage {
  readonly page: Page;
  readonly signInButton: Locator;
  readonly accountMenuButton: Locator;
  readonly logoutMenuItem: Locator;
  readonly myAccountMenuItem: Locator;
  readonly shopByCollectionLink: Locator;
  readonly cartIcon: Locator;
  readonly wishlistHeaderIcon: Locator;
  readonly mobileMenuButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.signInButton = page.getByRole('button', { name: 'Login' });
    // MUI wires the profile menu trigger via this data-test attribute; it has no accessible name of its own.
    this.accountMenuButton = page.locator('[data-test="layout-profile"]');
    this.logoutMenuItem = page.getByRole('menuitem', { name: 'Logout' });
    this.myAccountMenuItem = page.getByRole('menuitem', { name: 'My account' });
    this.shopByCollectionLink = page.getByRole('menuitem', { name: 'SHOP BY COLLECTION' });
    this.cartIcon = page.locator('[data-test="layout-cart"]');
    // Header icon has no data-test attribute, only aria-label="wishlist" (confirmed via live DOM inspection).
    this.wishlistHeaderIcon = page.getByRole('button', { name: 'wishlist' });
    this.mobileMenuButton = page.getByRole('button', { name: 'menu' });
  }

  async goto(): Promise<void> {
    await this.page.goto(`${BASE_URL}/`, { waitUntil: 'domcontentloaded' });
    await expect(this.page.getByRole('button', { name: 'Search' })).toBeVisible();
  }

  async clickSignIn(): Promise<void> {
    await this.signInButton.click();
    await this.page.waitForURL(/\/login$/);
  }

  async signOut(): Promise<void> {
    await this.accountMenuButton.click();
    await this.logoutMenuItem.click();
  }

  async assertLoggedIn(): Promise<void> {
    await expect(this.accountMenuButton).toBeVisible();
    await expect(this.signInButton).toBeHidden();
  }

  async assertLoggedOut(): Promise<void> {
    await expect(this.signInButton).toBeVisible();
  }

  async assertOnMainPage(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`^${BASE_URL}/(en)?$`));
  }

  async goToShopByCollection(): Promise<void> {
    await this.shopByCollectionLink.click();
    await this.page.waitForURL(/\/categories/);
  }

  // Hovering "SHOP BY COLLECTION" reveals a mega-menu of real <a> links (confirmed via live DOM
  // 2026-09-23); category names are exact-matched to avoid ambiguity with subcategory names.
  async selectCategoryFromMenu(categoryName: string): Promise<void> {
    await this.shopByCollectionLink.hover();
    await this.page.getByRole('link', { name: categoryName, exact: true }).click();
  }

  async hoverCategoryInMenu(categoryName: string): Promise<void> {
    await this.shopByCollectionLink.hover();
    await this.page.getByRole('link', { name: categoryName, exact: true }).hover();
  }

  // Mobile has no header cart icon (nor badge): the cart is reached from the hamburger menu's
  // "Shopping Cart" link (confirmed via live DOM 2026-09-25, Pixel 5 viewport).
  async openCart(): Promise<void> {
    if (await this.mobileMenuButton.isVisible()) {
      await this.mobileMenuButton.click();
      await this.page.getByRole('link', { name: 'Shopping Cart' }).click();
    } else {
      await this.cartIcon.click();
    }
  }

  async goToMyAccountOrders(): Promise<void> {
    await this.accountMenuButton.click();
    await this.myAccountMenuItem.click();
    await this.page.waitForURL(/\/my-account/);
    await this.page.getByRole('link', { name: 'Orders' }).click();
    await this.page.waitForURL(/\/my-account\/orders/);
  }

  // Entry point 1: header wishlist icon -> lands directly on the Wishlists List Page.
  async openWishlistsFromHeaderIcon(): Promise<void> {
    await this.wishlistHeaderIcon.click();
    await this.page.waitForURL(/\/my-account\/wishlists/);
  }

  // Entry point 2: My Account menu -> Wishlists sidebar link -> same Wishlists List Page.
  async goToMyAccountWishlists(): Promise<void> {
    await this.accountMenuButton.click();
    await this.myAccountMenuItem.click();
    await this.page.waitForURL(/\/my-account/);
    await this.page.getByRole('link', { name: 'Wishlists' }).click();
    await this.page.waitForURL(/\/my-account\/wishlists/);
  }

  // The cart icon shows the item count as text next to the icon; it disappears when the cart is empty.
  async assertCartBadgeEmpty(): Promise<void> {
    await expect(this.cartIcon).not.toContainText(/[1-9]/);
  }

  // MUI Badge: the count lives in .MuiBadge-badge (a stable MUI slot class). With 0 lines the
  // element still holds "0" but gets MuiBadge-invisible (scale 0), so it is not visible
  // (confirmed via live DOM 2026-09-25). The badge counts cart lines, not units.
  get cartBadge(): Locator {
    return this.cartIcon.locator('.MuiBadge-badge');
  }

  async assertCartBadgeCount(lines: number): Promise<void> {
    await expect(this.cartBadge).toBeVisible();
    await expect(this.cartBadge).toHaveText(String(lines));
  }

  async assertCartBadgeHidden(): Promise<void> {
    await expect(this.cartBadge).toBeHidden();
  }

  async hoverCart(): Promise<void> {
    await this.cartIcon.hover();
  }

  // There is no mini cart: hovering the icon must not open any dialog, menu or popover.
  async assertNoMiniCartOpen(): Promise<void> {
    await expect(this.page.getByRole('dialog')).toHaveCount(0);
    await expect(this.page.getByRole('menu')).toHaveCount(0);
  }
}
