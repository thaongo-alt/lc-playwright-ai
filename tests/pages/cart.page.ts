import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

export class CartPage {
  readonly page: Page;
  readonly proceedToCheckoutButton: Locator;
  readonly emptyCartHeading: Locator;
  readonly emptyCartText: Locator;
  readonly shopNowButton: Locator;
  readonly continueShoppingLink: Locator;
  readonly clearCartButton: Locator;
  // data-test attributes confirmed via live DOM (2026-09-24).
  readonly removeRowButtons: Locator;
  readonly quantityIncreaseButton: Locator;
  readonly quantityInput: Locator;
  readonly removeItemDialog: Locator;
  readonly lineRows: Locator;

  constructor(page: Page) {
    this.page = page;
    this.proceedToCheckoutButton = page.getByRole('button', { name: 'Proceed to Checkout' });
    this.emptyCartHeading = page.getByRole('heading', { name: 'Your shopping cart is empty' });
    this.emptyCartText = page.getByText('Looks like your cart is empty. Browse products & add your favourites!');
    // Confirmed via live DOM (2026-09-25): SHOP NOW is a <button>, Continue Shopping an <a>.
    this.shopNowButton = page.getByRole('button', { name: 'SHOP NOW' });
    this.continueShoppingLink = page.getByRole('link', { name: 'Continue Shopping' });
    this.clearCartButton = page.getByRole('button', { name: /clear cart|remove all/i });
    this.removeRowButtons = page.locator('[data-test="table-remove-row"]');
    this.quantityIncreaseButton = page.locator('[data-test="quantity-input-increase"]');
    this.quantityInput = page.getByRole('group', { name: 'Quantity controller' }).getByRole('spinbutton');
    this.removeItemDialog = page.getByRole('dialog', { name: /Remove item/ });
    // Desktop renders the lines as table rows, mobile as stacked cards (confirmed via live DOM
    // 2026-09-25). In both, a line is the closest ancestor of its remove button that also holds
    // its quantity controller. Each line shows: image, name link, SKU, unit price, qty, total.
    this.lineRows = this.removeRowButtons.locator(
      'xpath=ancestor::*[.//*[@role="group" and @aria-label="Quantity controller"]][1]',
    );
  }

  async goto(): Promise<void> {
    await this.page.goto(`${BASE_URL}/cart`, { waitUntil: 'domcontentloaded' });
    await expect(this.proceedToCheckoutButton.or(this.emptyCartHeading)).toBeVisible();
  }

  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await expect(this.proceedToCheckoutButton.or(this.emptyCartHeading)).toBeVisible();
  }

  async proceedToCheckout(): Promise<void> {
    await this.proceedToCheckoutButton.click();
    await this.page.waitForURL(/\/checkout/);
  }

  async increaseQuantity(): Promise<void> {
    await this.quantityIncreaseButton.click();
  }

  // Removing every line also drops any coupon applied to the cart (confirmed live 2026-09-24),
  // which is the only way to reset a coupon — the UI has no "remove coupon" control.
  async removeAllItems(): Promise<void> {
    await this.goto();
    while ((await this.removeRowButtons.count()) > 0) {
      const before = await this.removeRowButtons.count();
      await this.removeRowButtons.first().click();
      await this.removeItemDialog.getByRole('button', { name: 'Remove' }).click();
      await expect(this.removeRowButtons).toHaveCount(before - 1);
    }
    await expect(this.emptyCartHeading).toBeVisible();
  }

  async assertEmpty(): Promise<void> {
    await expect(this.emptyCartHeading).toBeVisible();
  }

  // --- Lines ---
  // A line is matched by its SKU (shown on every row), not by its name: the cart shows the
  // French name for some products (e.g. "ABC fr") and variant names from BO, which can differ
  // from the PDP heading (confirmed via live DOM 2026-09-25).

  line(sku: string): Locator {
    return this.lineRows.filter({ hasText: sku });
  }

  lineQuantityInput(sku: string): Locator {
    return this.line(sku).getByRole('group', { name: 'Quantity controller' }).getByRole('spinbutton');
  }

  // Each line has exactly one link (the product name). The thumbnail's alt is "Product <name>";
  // the remove button holds a second, unnamed image (confirmed live 2026-09-25).
  lineNameLink(sku: string): Locator {
    return this.line(sku).getByRole('link');
  }

  lineThumbnail(sku: string): Locator {
    return this.line(sku).getByRole('img', { name: /^Product / });
  }

  async assertLineCount(count: number): Promise<void> {
    await expect(this.lineRows).toHaveCount(count);
  }

  async assertLineVisible(sku: string): Promise<void> {
    await expect(this.line(sku)).toBeVisible();
  }

  async assertLineAbsent(sku: string): Promise<void> {
    await expect(this.line(sku)).toHaveCount(0);
  }

  async assertLineContains(sku: string, text: string | RegExp): Promise<void> {
    await expect(this.line(sku).first()).toContainText(text);
  }

  // A typed quantity is saved to the server first and only then reflected in the input, which
  // can take several seconds on a busy UAT (observed live 2026-09-25).
  async assertLineQuantity(sku: string, quantity: number): Promise<void> {
    await expect(this.lineQuantityInput(sku).first()).toHaveValue(String(quantity), { timeout: 10_000 });
  }

  // Fails fast (expect timeout) instead of letting an action wait for the whole test timeout
  // when the line is missing.
  private async lineReady(sku: string): Promise<Locator> {
    await expect(this.line(sku)).toBeVisible();
    return this.line(sku);
  }

  async lineTexts(): Promise<string[]> {
    return this.lineRows.allTextContents();
  }

  async lineThumbnailSrc(sku: string): Promise<string> {
    return (await this.lineThumbnail(sku).getAttribute('src')) ?? '';
  }

  async clickLineName(sku: string): Promise<void> {
    await this.lineNameLink(sku).click();
  }

  async clickLineThumbnail(sku: string): Promise<void> {
    await this.lineThumbnail(sku).click();
  }

  // --- Quantity ---

  async increaseLineQuantity(sku: string): Promise<void> {
    await (await this.lineReady(sku)).locator('[data-test="quantity-input-increase"]').click();
  }

  // force: at quantity 1 "−" may be disabled; a forced click on a disabled button is a no-op,
  // which is exactly the behaviour under test ("does nothing").
  async decreaseLineQuantity(sku: string, { force = false } = {}): Promise<void> {
    await (await this.lineReady(sku)).locator('[data-test="quantity-input-decrease"]').click({ force });
  }

  // The cart re-renders its lines once the totals/tax have loaded ("Tax (0%)" until then — see
  // order-summary.page.ts); typing before that loses the typed value (observed live 2026-09-25).
  async waitForCartReady(): Promise<void> {
    await expect(this.page.locator('p', { hasText: /^Tax \(/ })).not.toHaveText('Tax (0%)', { timeout: 20_000 });
  }

  async typeLineQuantity(sku: string, value: string, commit: 'enter' | 'blur'): Promise<void> {
    await this.lineReady(sku);
    await this.waitForCartReady();
    const input = this.lineQuantityInput(sku);
    await input.fill(value);
    if (commit === 'enter') await input.press('Enter');
    else await input.blur();
  }

  async pressLineQuantityKeys(sku: string, keys: string): Promise<void> {
    await this.waitForCartReady();
    const input = this.lineQuantityInput(sku);
    await input.click();
    await input.pressSequentially(keys);
  }

  async blurLineQuantity(sku: string): Promise<void> {
    await this.lineQuantityInput(sku).blur();
  }

  async clearLineQuantity(sku: string): Promise<void> {
    await this.waitForCartReady();
    await this.lineQuantityInput(sku).clear();
  }

  // --- Remove ---

  async clickRemove(sku: string): Promise<void> {
    await (await this.lineReady(sku)).locator('[data-test="table-remove-row"]').click();
    await expect(this.removeItemDialog).toBeVisible();
  }

  async confirmRemove(): Promise<void> {
    await this.removeItemDialog.getByRole('button', { name: 'Remove' }).click();
  }

  async cancelRemove(): Promise<void> {
    await this.removeItemDialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(this.removeItemDialog).toBeHidden();
  }

  async removeLine(sku: string): Promise<void> {
    await this.clickRemove(sku);
    await this.confirmRemove();
    await expect(this.line(sku)).toHaveCount(0);
  }

  async assertRemoveDialog(displayName: string): Promise<void> {
    await expect(this.removeItemDialog).toContainText('Remove item');
    await expect(this.removeItemDialog).toContainText(`Are you sure you want to remove ${displayName} from your cart?`);
    await expect(this.removeItemDialog.getByRole('button', { name: 'Cancel' })).toBeVisible();
    await expect(this.removeItemDialog.getByRole('button', { name: 'Remove' })).toBeVisible();
  }

  async assertRemoveDialogHidden(): Promise<void> {
    await expect(this.removeItemDialog).toBeHidden();
  }

  // --- Empty state / page controls ---

  async assertEmptyStateMessage(): Promise<void> {
    await expect(this.emptyCartHeading).toBeVisible();
    await expect(this.emptyCartText).toBeVisible();
  }

  async assertNoItemTableOrCheckout(): Promise<void> {
    await expect(this.lineRows).toHaveCount(0);
    await expect(this.proceedToCheckoutButton).toBeHidden();
  }

  async clickShopNow(): Promise<void> {
    await this.shopNowButton.click();
  }

  async clickContinueShopping(): Promise<void> {
    await this.continueShoppingLink.click();
  }

  async assertNoClearCartAction(): Promise<void> {
    await expect(this.clearCartButton).toHaveCount(0);
  }

  async assertOnCartPage(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`^${BASE_URL}/cart`));
  }

  // --- Reload detection ---
  // A marker on window survives client-side (SPA) updates but not a full page reload.

  async markDocument(): Promise<void> {
    await this.page.evaluate(() => ((window as unknown as { __cartMarker?: boolean }).__cartMarker = true));
  }

  async assertDocumentNotReloaded(): Promise<void> {
    const marker = await this.page.evaluate(() => (window as unknown as { __cartMarker?: boolean }).__cartMarker);
    expect(marker, 'page was reloaded — the update was not in place').toBe(true);
  }
}
