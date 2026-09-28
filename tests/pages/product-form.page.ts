import { expect, Locator, Page } from '@playwright/test';

// Confirmed against live DOM (2026-09-15) via an authenticated BO session.
//
// IMPORTANT correction vs. the original requirement doc: for both Name and Description, the
// FRENCH input is the one visible by default; clicking the locale/globe icon
// (`MuiSvgIcon-root MuiSvgIcon-fontSizeMedium css-s6jlyw`, data-testid="PublicIcon") expands an
// accordion that reveals the ENGLISH input above it. This is the opposite of "EN first, then
// FR via globe icon" as originally documented — see the corrected requirement doc.
export class ProductFormPage {
  readonly page: Page;
  readonly skuInput: Locator;
  readonly categoriesFilterInput: Locator;
  readonly costInput: Locator;
  readonly priceInput: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.skuInput = page.locator('input[name="sku"]');
    this.categoriesFilterInput = page.getByRole('textbox', { name: 'Categories Filter' });
    this.costInput = page.getByRole('spinbutton', { name: 'Cost' });
    this.priceInput = page.getByRole('spinbutton', { name: 'Price' });
    this.createButton = page.getByRole('button', { name: 'Create', exact: true });
  }

  // Scopes to the Stack that contains both the field's header (label + globe icon) and its
  // locale accordions, so FR/EN lookups don't collide with the same-named field elsewhere
  // (e.g. the unrelated "Content (fr)/(en)" editors under Custom Attributes).
  private localizedField(label: string): Locator {
    return this.page.locator('.localize-field-header', { hasText: label }).locator('xpath=..');
  }

  private globeIcon(label: string): Locator {
    return this.localizedField(label).locator('[data-testid="PublicIcon"]');
  }

  // Name — French is the default visible field.
  async fillNameDefault(nameFr: string): Promise<void> {
    await this.page.locator('input[name="name.1.content"]').fill(nameFr);
  }

  // Reveals and fills the English Name field via the globe icon.
  async fillNameEnglish(nameEn: string): Promise<void> {
    await this.globeIcon('Name').click();
    await this.page.locator('input[name="name.0.content"]').fill(nameEn);
  }

  // Description is a rich-text (CKEditor) field, same FR-default/EN-via-globe pattern as Name.
  // Using `.fill()` on it throws a real app error ("trigger is not a function" — confirmed via
  // console/pageerror capture during live investigation), which silently breaks later
  // interactions on the page (e.g. the Gallery picker stops opening). CKEditor needs real
  // keystrokes, not a direct value/input-event set, to stay in sync with the app's own
  // change-handling.
  async fillDescriptionDefault(descriptionFr: string): Promise<void> {
    const editor = this.localizedField('Description').getByRole('textbox', { name: /rich text editor/i }).first();
    await editor.click();
    await editor.pressSequentially(descriptionFr);
  }

  async fillDescriptionEnglish(descriptionEn: string): Promise<void> {
    await this.globeIcon('Description').click();
    // The newly-revealed EN editor is inserted BEFORE the FR one in DOM order (confirmed live —
    // matches the same pattern seen on the Name field's accordion expansion), so it's index 0,
    // not the last one.
    const editor = this.localizedField('Description').getByRole('textbox', { name: /rich text editor/i }).first();
    await editor.click();
    await editor.pressSequentially(descriptionEn);
  }

  async fillSku(sku: string): Promise<void> {
    await this.skuInput.fill(sku);
  }

  // Categories Filter opens a tree-select popover (checkboxes, not a plain autocomplete list):
  // type to filter, tick the matching item, then press Escape to dismiss the popover — otherwise
  // its full-viewport backdrop stays in the DOM and silently intercepts every later click on the
  // page (confirmed live: this was the real cause of a "click timed out" failure on the Gallery
  // section further down the form, not an actionability issue with that element itself).
  async selectCategory(category: string): Promise<void> {
    await this.categoriesFilterInput.click();
    await this.categoriesFilterInput.pressSequentially(category);
    await this.page.getByText(category, { exact: true }).click();
    await this.page.keyboard.press('Escape');
  }

  async fillCost(cost: string): Promise<void> {
    await this.costInput.fill(cost);
  }

  async fillPrice(price: string): Promise<void> {
    await this.priceInput.fill(price);
  }

  // Gallery's "Main Image" box opens a "Select assets / Upload assets" library dialog rather
  // than a plain native file input. Selecting the first available existing asset and saving is
  // more robust than uploading a new file each run (avoids a flaky click-intercept on the
  // "Upload assets" button observed during live investigation).
  async selectMainImageFromLibrary(): Promise<void> {
    const mainImageBox = this.page
      .locator('.MuiTypography-root', { hasText: 'Main Image' })
      .locator('xpath=following-sibling::div[1]');
    await mainImageBox.scrollIntoViewIfNeeded();
    // An unclassed, invisible drag-and-drop overlay div sits directly on top of this box in the
    // stacking order (confirmed live — a real part of the upload widget, not a bug), which fails
    // Playwright's strict "receives pointer events on the resolved element" check even though a
    // real user's click at this spot lands correctly.
    await mainImageBox.click({ force: true });

    const dialog = this.page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await dialog.locator('.select-assets-card').first().click();
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog).toBeHidden();
  }

  // Two "Add New" buttons exist on this page (Custom Attributes and Stock Management), so this
  // scopes to the Stock Management card specifically. Confirmed live: the Location dropdown
  // option is "WareHouse" (one word) — the requirement doc's "ware house" was a paraphrase.
  async addStock(location: string, quantity: string): Promise<void> {
    const stockCard = this.page.locator('.MuiCard-root', { has: this.page.getByRole('heading', { name: 'Stock Management' }) });
    await stockCard.getByRole('button', { name: 'Add New' }).click();

    await this.page.locator('[aria-labelledby="label-Location *"]').click();
    await this.page.getByRole('option', { name: location }).click();

    await this.page.locator('input[name="stock[0].quantity"]').fill(quantity);
  }

  async submitCreate(): Promise<void> {
    await this.createButton.click();
  }

  async assertRedirectedToProductList(): Promise<void> {
    await this.page.waitForURL(/\/backoffice\/products$/);
  }

  // Confirmed live: the inline required-field message is "This field is required" (not "This is
  // required field" as originally stated) — see the corrected requirement doc.
  async assertRequiredFieldError(field: Locator): Promise<void> {
    await expect(field.locator('xpath=./ancestor::div[contains(@class,"MuiFormControl-root")][1]/following-sibling::p')).toHaveText(
      'This field is required',
    );
  }

  // Stock Management rows are indexed form fields; products seeded for the checkout tests have a
  // single WareHouse row (confirmed live 2026-09-24).
  async getStockQuantity(): Promise<number> {
    const quantity = this.page.locator('input[name="stock[0].quantity"]');
    await expect(quantity).not.toHaveValue('');
    return Number(await quantity.inputValue());
  }
}
