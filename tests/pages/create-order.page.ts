import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

// Confirmed against live DOM (2026-09-16) via an authenticated BO session
// (.auth/lc-uat-bo-state.json). Loading `/backoffice/orders/create` directly (a hard
// navigation) renders a permanently blank page in this SPA — the wizard is only reachable by
// clicking through the left-nav OMS > Create Order link from an already-loaded BO page, which
// is what goto() does below. This also means the wizard does NOT start with an Email/Order
// Number "Step 1" page as the LC-359 requirement doc describes: the real first step is a
// "Create New Order" modal offering only an existing-customer picker (no guest/email-entry
// path was found — see create_order_findings.md §1, a confirmed discrepancy).
export class CreateOrderPage {
  readonly page: Page;
  readonly customerButton: Locator;
  readonly createButton: Locator;
  readonly manualAddButton: Locator;
  readonly checkoutButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.customerButton = page.getByRole('button', { name: 'Customer' });
    this.createButton = page.getByRole('dialog').getByRole('button', { name: 'Create', exact: true });
    this.manualAddButton = page.getByRole('button', { name: '+ Manual Add' });
    this.checkoutButton = page.getByRole('button', { name: 'Checkout', exact: true });
  }

  // "OMS" and "Create Order" in the left nav are plain clickable text, not links/buttons
  // (confirmed live — they carry no ARIA role other than the implicit generic one), so
  // getByText is the accurate locator here rather than getByRole.
  async goto(): Promise<void> {
    await this.page.goto(`${BASE_URL}/backoffice/`, { waitUntil: 'networkidle' });
    await this.page.getByText('OMS', { exact: true }).click();
    await this.page.getByText('Create Order', { exact: true }).click();
    await expect(this.customerButton).toBeVisible();
  }

  async selectCustomer(name: string): Promise<void> {
    await this.customerButton.click();
    // Seed data on this shared UAT environment contains repeated customer names; the first
    // match is a stable, arbitrary pick — any account with that name is equally valid here.
    await this.page.getByRole('option', { name, exact: true }).first().click();
  }

  async submitCreate(): Promise<void> {
    await this.createButton.click();
    await this.page.waitForURL(/\/backoffice\/create-order-detail\//);
  }

  // "+ Manual Add" opens a category-browse/keyword-search modal ("Manual Add Product") — this
  // is the experience the LC-359 requirement doc actually describes under the name
  // "QUICK ADD". The two Add buttons are swapped relative to the doc's naming (confirmed live,
  // see create_order_findings.md §2 "QUICK ADD and MANUAL ADD are swapped"). This method
  // automates the real, live behavior of the "+ Manual Add" button, not the doc's label.
  async addFirstProductFromCategory(categoryName: string): Promise<void> {
    await this.manualAddButton.click();
    const dialog = this.page.getByRole('dialog');
    await dialog.getByRole('button', { name: categoryName, exact: true }).click();

    // The product grid loads asynchronously; its tiles are the first images to appear in the
    // dialog (the initial "PLEASE SELECT CATEGORY..." placeholder has none), so waiting on the
    // first image is a real-state signal instead of a fixed sleep.
    await dialog.locator('img').first().waitFor();

    const addButtons = dialog.getByRole('button', { name: 'Add', exact: true });
    // First match: the first product tile's "Add" button — adds it to the modal's "Current
    // Cart" panel. Last match: the modal's footer "Add" button, which commits that cart back
    // into the order (disabled until the cart holds at least one item).
    await addButtons.first().click();
    await addButtons.last().click();
  }

  async assertProductInTable(sku: string): Promise<void> {
    await expect(this.page.getByRole('table').getByText(sku, { exact: true })).toBeVisible();
  }

  async assertCheckoutDisabled(): Promise<void> {
    await expect(this.checkoutButton).toBeDisabled();
  }

  async assertCheckoutEnabled(): Promise<void> {
    await expect(this.checkoutButton).toBeEnabled();
  }

  async clickCheckout(): Promise<void> {
    await this.checkoutButton.click();
    await this.page.waitForURL(/\/backoffice\/checkout\//);
  }
}
