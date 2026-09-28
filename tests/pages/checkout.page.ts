import { expect, Locator, Page } from '@playwright/test';

export class CheckoutPage {
  readonly page: Page;
  readonly selectAnotherAddressButton: Locator;
  readonly addNewAddressButton: Locator;
  readonly addressDialog: Locator;
  readonly addShippingAddressPrompt: Locator;
  readonly shipToName: Locator;
  readonly shipToAddress: Locator;
  readonly codRadio: Locator;
  readonly payPalRadio: Locator;
  readonly codDescription: Locator;
  readonly payPalButtons: Locator;
  readonly placeOrderButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.selectAnotherAddressButton = page.getByRole('button', { name: 'Select another' });
    this.addNewAddressButton = page.getByRole('button', { name: 'Add New' });
    this.addressDialog = page.getByRole('dialog', { name: 'Select another Shipping Address' });
    this.addShippingAddressPrompt = page.getByText('Please add a shipping address to continue.');
    // "SHIP TO:" is followed by the recipient name paragraph, then contact and address lines.
    this.shipToName = page.getByText('SHIP TO:', { exact: true }).locator('xpath=following-sibling::p[1]');
    this.shipToAddress = page.getByText(/^Address:/);
    // The payment radios have no accessible name: each <input type=radio> sits next to a <p>
    // holding the method's label, inside one row <div> (confirmed via live DOM 2026-09-24).
    this.codRadio = this.paymentRadio('Cash on Delivery (COD)');
    this.payPalRadio = this.paymentRadio('Pay with PayPal');
    this.codDescription = page.getByText('Pay with cash upon delivery. Please have exact change ready.');
    // PayPal Smart Buttons container; the attribute is set by the PayPal JS SDK itself.
    this.payPalButtons = page.locator('[data-paypal-smart-button-version]');
    this.placeOrderButton = page.getByRole('button', { name: 'Place Order' });
  }

  private paymentRadio(label: string): Locator {
    return this.page.getByText(label, { exact: true }).locator('xpath=ancestor::div[1]//input[@type="radio"]');
  }

  async waitForLoaded(): Promise<void> {
    await expect(this.placeOrderButton).toBeVisible();
  }

  // Opening the dialog loads the city list and usually refetches the checkout right after; that
  // refetch re-renders the form and clears a Phone value typed before it (confirmed live
  // 2026-09-24). The refetch does not always happen, so it is awaited only briefly.
  async openAddNewAddress(): Promise<void> {
    const citiesLoaded = this.page.waitForResponse((r) => /\/ws\/lc\/sf\/city\//.test(r.url()));
    await this.addNewAddressButton.click();
    await citiesLoaded;
    await this.page
      .waitForResponse((r) => /\/ws\/lc\/sf\/checkout\//.test(r.url()) && r.request().method() === 'GET', {
        timeout: 3000,
      })
      .catch(() => undefined);
  }

  async openSelectAnotherAddress(): Promise<void> {
    await this.selectAnotherAddressButton.click();
    await expect(this.addressDialog).toBeVisible();
  }

  async selectAddressByIndex(index: number): Promise<void> {
    await this.selectAnotherAddressButton.click();
    await this.addressDialog.getByRole('button', { name: 'Ship Here' }).nth(index).click();
  }

  // Each saved address in the dialog is a card (the innermost <div> holding both the recipient
  // name and a "Ship Here" button); the cards have no role or data-test attribute.
  async shipToSavedAddress(recipientName: string): Promise<void> {
    await this.openSelectAnotherAddress();
    await this.addressDialog
      .locator('div')
      .filter({ has: this.page.getByText(recipientName, { exact: true }) })
      .filter({ has: this.page.getByRole('button', { name: 'Ship Here' }) })
      .last()
      .getByRole('button', { name: 'Ship Here' })
      .click();
    await expect(this.addressDialog).toBeHidden();
  }

  async assertSavedAddressListed(recipientName: string): Promise<void> {
    await expect(this.addressDialog.getByText(recipientName, { exact: true })).toBeVisible();
  }

  async assertShipTo(recipientName: string): Promise<void> {
    await expect(this.shipToName).toHaveText(recipientName);
  }

  async assertShipToAddressContains(text: string): Promise<void> {
    await expect(this.shipToAddress).toContainText(text);
  }

  async assertNoSavedAddressList(): Promise<void> {
    await expect(this.selectAnotherAddressButton).toBeHidden();
    await expect(this.addShippingAddressPrompt).toBeVisible();
  }

  // The MUI radio <input> is visually hidden under its styled icon, so the method's label is
  // clicked instead, the way a user does.
  async selectCod(): Promise<void> {
    await this.page.getByText('Cash on Delivery (COD)', { exact: true }).click();
    await expect(this.codRadio).toBeChecked();
  }

  async selectPayPal(): Promise<void> {
    await this.page.getByText('Pay with PayPal', { exact: true }).click();
    await expect(this.payPalRadio).toBeChecked();
  }

  async assertCodSelectedByDefault(): Promise<void> {
    await expect(this.codRadio).toBeChecked();
  }

  async assertCodSelected(): Promise<void> {
    await expect(this.codRadio).toBeChecked();
  }

  async assertCodDescriptionVisible(): Promise<void> {
    await expect(this.codDescription).toBeVisible();
  }

  async assertPayPalButtonsHidden(): Promise<void> {
    await expect(this.payPalButtons).toBeHidden();
  }

  async assertPayPalOptionAvailable(): Promise<void> {
    await expect(this.payPalRadio).toBeVisible();
    await expect(this.payPalRadio).toBeEnabled();
  }

  async assertCodOptionAvailable(): Promise<void> {
    await expect(this.codRadio).toBeVisible();
    await expect(this.codRadio).toBeEnabled();
  }

  // For guests the PayPal row is either not rendered, or rendered greyed out and inert: the row
  // <div> gets pointer-events: none (and reduced opacity), so it cannot be selected (confirmed
  // live 2026-09-24). Either state satisfies "PayPal is not shown / not selectable".
  async assertPayPalOptionUnavailable(): Promise<void> {
    const payPalLabel = this.page.getByText('Pay with PayPal', { exact: true });
    if ((await payPalLabel.count()) === 0) return;
    await expect(payPalLabel.locator('xpath=ancestor::div[1]')).toHaveCSS('pointer-events', 'none');
    await expect(this.payPalRadio).not.toBeChecked();
  }

  async assertPlaceOrderVisible(): Promise<void> {
    await expect(this.placeOrderButton).toBeVisible();
  }

  async assertPlaceOrderDisabled(): Promise<void> {
    await expect(this.placeOrderButton).toBeDisabled();
  }

  // Selecting PayPal disables "Place Order" and renders the PayPal Smart Button inside a
  // cross-origin iframe; clicking it opens the PayPal Sandbox checkout in a popup window.
  // The SDK first shows a non-interactive "prerender" frame and swaps in the real button frame
  // (class "component-frame visible") once loaded; clicks before that are silently ignored, so
  // the swap is awaited and the click is retried if no popup appears.
  async openPayPalPopup(): Promise<Page> {
    await this.selectPayPal();
    await expect(this.payPalButtons.locator('iframe.component-frame.visible')).toBeVisible({ timeout: 30_000 });
    const payPalButton = this.page
      .frameLocator('iframe[name^="__zoid__paypal_buttons"]')
      .locator('[data-funding-source="paypal"], [role="link"]')
      .first();
    let popup: Page | undefined;
    await expect(async () => {
      const popupOpened = this.page.waitForEvent('popup', { timeout: 15_000 });
      await payPalButton.click();
      popup = await popupOpened;
    }).toPass({ timeout: 60_000 });
    await popup!.waitForLoadState('domcontentloaded');
    return popup!;
  }

  async assertOnCheckout(): Promise<void> {
    await expect(this.page).toHaveURL(/\/checkout/);
    await expect(this.placeOrderButton).toBeVisible();
  }

  async placeOrder(): Promise<void> {
    await this.placeOrderButton.click();
    await this.page.waitForURL(/\/order-confirmation/);
  }
}
