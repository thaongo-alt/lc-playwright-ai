import { expect, Locator, Page } from '@playwright/test';

export class CreateWishlistModalPage {
  readonly page: Page;
  readonly dialog: Locator;
  readonly title: Locator;
  readonly closeIconButton: Locator;
  readonly nameInput: Locator;
  readonly nameCounter: Locator;
  readonly descriptionInput: Locator;
  readonly descriptionCounter: Locator;
  readonly cancelButton: Locator;
  readonly createButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dialog = page.getByRole('dialog');
    this.title = this.dialog.getByText('Create New Wishlist', { exact: true });
    this.closeIconButton = this.dialog.getByRole('button', { name: 'close' });
    this.nameInput = page.getByPlaceholder('e.g., Christmas Gifts, Birthday Ideas');
    this.nameCounter = this.dialog.getByText(/^\d+ \/ 50 characters$/);
    this.descriptionInput = page.getByPlaceholder('Add notes about this wishlist...');
    this.descriptionCounter = this.dialog.getByText(/^\d+ \/ 200 characters$/);
    // Live DOM text is "Cancel"/"Create" (uppercase styling is applied via CSS text-transform).
    this.cancelButton = this.dialog.getByRole('button', { name: 'Cancel' });
    this.createButton = this.dialog.getByRole('button', { name: 'Create' });
  }

  async assertOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
  }

  async assertClosed(): Promise<void> {
    await expect(this.dialog).toBeHidden();
  }

  async assertTitleVisible(): Promise<void> {
    await expect(this.title).toBeVisible();
  }

  async assertNameAutoFocused(): Promise<void> {
    await expect(this.nameInput).toBeFocused();
  }

  async assertNamePlaceholder(expected: string): Promise<void> {
    await expect(this.nameInput).toHaveAttribute('placeholder', expected);
  }

  async assertDescriptionPlaceholder(expected: string): Promise<void> {
    await expect(this.descriptionInput).toHaveAttribute('placeholder', expected);
  }

  async assertDescriptionIsThreeRowTextarea(): Promise<void> {
    await expect(this.descriptionInput).toHaveJSProperty('tagName', 'TEXTAREA');
    // Confirmed via live DOM: MUI's multiline TextField manages height via inline style plus
    // an autosizing shadow textarea, not the native `rows` attribute — there is no `rows="3"`
    // to assert directly. A 3-row textarea renders noticeably taller than a single-line input
    // (~36-40px), so this checks it's tall enough to plausibly be 3 rows without hardcoding
    // an exact pixel value that would break on font/theme changes.
    const box = await this.descriptionInput.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.height).toBeGreaterThan(60);
  }

  // TODO: verify against live DOM — exact background-color values; current check only confirms
  // left-to-right visual order (Cancel before Create), which is what the requirement's
  // "left/right" positioning actually implies and is far less brittle than a color assertion.
  async assertCancelIsLeftOfCreate(): Promise<void> {
    const cancelBox = await this.cancelButton.boundingBox();
    const createBox = await this.createButton.boundingBox();
    expect(cancelBox).not.toBeNull();
    expect(createBox).not.toBeNull();
    expect(cancelBox!.x).toBeLessThan(createBox!.x);
  }

  // TODO: verify against live DOM — exact pixel width; MUI "small" dialogs commonly resolve to a
  // fixed max-width regardless of viewport, so this checks the dialog is narrow and horizontally
  // centered rather than asserting a specific pixel value that wasn't directly confirmed.
  async assertModalIsSmallAndCentered(): Promise<void> {
    const box = await this.dialog.boundingBox();
    const viewport = this.page.viewportSize();
    expect(box).not.toBeNull();
    expect(viewport).not.toBeNull();
    expect(box!.width).toBeLessThan(500);
    const dialogCenterX = box!.x + box!.width / 2;
    const viewportCenterX = viewport!.width / 2;
    expect(Math.abs(dialogCenterX - viewportCenterX)).toBeLessThan(20);
  }

  async fillName(name: string): Promise<void> {
    await this.nameInput.fill(name);
  }

  async typeNameSequentially(name: string): Promise<void> {
    await this.nameInput.pressSequentially(name);
  }

  async fillDescription(description: string): Promise<void> {
    await this.descriptionInput.fill(description);
  }

  async typeDescriptionSequentially(description: string): Promise<void> {
    await this.descriptionInput.pressSequentially(description);
  }

  async getNameValue(): Promise<string> {
    return this.nameInput.inputValue();
  }

  async getDescriptionValue(): Promise<string> {
    return this.descriptionInput.inputValue();
  }

  async assertNameCounter(expected: string): Promise<void> {
    await expect(this.nameCounter).toHaveText(expected);
  }

  async assertDescriptionCounter(expected: string): Promise<void> {
    await expect(this.descriptionCounter).toHaveText(expected);
  }

  async clickCreate(): Promise<void> {
    await this.createButton.click();
  }

  async clickCancel(): Promise<void> {
    await this.cancelButton.click();
  }

  async createWishlist(name: string, description?: string): Promise<void> {
    await this.fillName(name);
    if (description) {
      await this.fillDescription(description);
    }
    await this.clickCreate();
  }

  // Confirmed via live DOM: CREATE stays disabled (native `disabled` attribute) whenever Name is
  // empty or whitespace-only. No inline "This field is requried." message was ever observed
  // rendering (typed-then-cleared, blurred, and force-clicked all showed no such text) — see
  // gen-ai/testcases/lc-storefront-create-wishlist-testcases.md Gap notes for TC-VAL-001/003.
  async assertCreateButtonDisabled(): Promise<void> {
    await expect(this.createButton).toBeDisabled();
  }

  async assertCreateButtonEnabled(): Promise<void> {
    await expect(this.createButton).toBeEnabled();
  }
}
