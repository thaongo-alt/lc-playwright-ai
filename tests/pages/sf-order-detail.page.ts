import { Download, expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

export type APIResponseLike = { status: number; headers: Record<string, string> };

// Storefront "My account > Orders > Order Details" (/my-account/orders/<id>), confirmed via live
// DOM 2026-09-24. Not to be confused with OrderDetailPage, which is the Backoffice order page.
// Info and summary rows are "<p>label</p><p>value</p>" sibling pairs with no roles or data-test
// attributes, so values are reached from their label's next sibling.
export class StorefrontOrderDetailPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly breadcrumb: Locator;
  readonly backToOrdersLink: Locator;
  readonly orderIdValue: Locator;
  readonly statusValue: Locator;
  readonly orderDateValue: Locator;
  readonly paymentMethodValue: Locator;
  readonly deliveryInstructionsValue: Locator;
  readonly shippingDetails: Locator;
  readonly subtotalValue: Locator;
  readonly shippingFeeLabel: Locator;
  readonly taxLabel: Locator;
  readonly taxValue: Locator;
  readonly discountValue: Locator;
  readonly totalValue: Locator;
  readonly itemsTable: Locator;
  readonly downloadButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Order Details' });
    this.breadcrumb = page.getByRole('navigation', { name: 'breadcrumb' });
    this.backToOrdersLink = page.getByText('Back to Orders', { exact: true });
    this.orderIdValue = this.infoValueOf(/^Order ID$/);
    this.statusValue = this.infoValueOf(/^Status$/);
    this.orderDateValue = this.infoValueOf(/^Order Date$/);
    this.paymentMethodValue = this.infoValueOf(/^Payment method$/);
    // The Delivery Instructions and Shipping Address headers are "<div><svg/><p>label</p></div>"
    // with the content in the header's next sibling (confirmed live 2026-09-28).
    this.deliveryInstructionsValue = this.infoValueOf(/^Delivery Instructions$/);
    this.shippingDetails = this.infoValueOf(/^Shipping Address & Details$/);
    this.subtotalValue = this.valueOf(/^Sub Total$/);
    // No shipping line exists on UAT yet (known defect D-02); the label wording is not specified.
    this.shippingFeeLabel = page.locator('p', { hasText: /^Shipping( fee| Fee| cost)?$/ });
    this.taxLabel = page.locator('p', { hasText: /^Tax \(/ });
    this.taxValue = this.valueOf(/^Tax \(/);
    this.discountValue = this.valueOf(/^Discount$/);
    this.totalValue = this.valueOf(/^Total$/);
    this.itemsTable = page.getByRole('table');
    this.downloadButton = page.getByRole('button', { name: 'Download Order' });
  }

  private valueOf(label: RegExp): Locator {
    return this.page.locator('p', { hasText: label }).locator('xpath=following-sibling::p[1]');
  }

  // In the "Order Info" block each label <p> is wrapped in its own <div>, and the value sits in
  // the next sibling element of that wrapper (confirmed live 2026-09-24).
  private infoValueOf(label: RegExp): Locator {
    return this.page.locator('p', { hasText: label }).locator('xpath=../following-sibling::*[1]');
  }

  async goto(orderId: string): Promise<void> {
    await this.open(orderId);
    await expect(this.page.getByText(`#${orderId}`, { exact: true })).toBeVisible();
  }

  // For IDs that don't load an order (not found / non-numeric / not owned): only waits for the
  // page template, not for the order number.
  async open(orderId: string): Promise<void> {
    await this.page.goto(`${BASE_URL}/my-account/orders/${orderId}`, { waitUntil: 'domcontentloaded' });
    await expect(this.heading).toBeVisible();
  }

  async assertOnOrder(orderId: string): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`/my-account/orders/${orderId}$`));
    await expect(this.orderIdValue).toHaveText(`#${orderId}`);
  }

  async assertBreadcrumb(items: string[]): Promise<void> {
    await expect(this.breadcrumb.getByRole('listitem')).toHaveText(items);
  }

  async backToOrders(): Promise<void> {
    await this.backToOrdersLink.click();
  }

  async assertOrderId(text: string): Promise<void> {
    await expect(this.orderIdValue).toHaveText(text);
  }

  async assertStatus(status: string): Promise<void> {
    await expect(this.statusValue).toHaveText(status);
  }

  async assertOrderDate(date: string): Promise<void> {
    await expect(this.orderDateValue).toHaveText(date);
  }

  async assertPaymentMethod(method: string | RegExp): Promise<void> {
    await expect(this.paymentMethodValue).toHaveText(method);
  }

  async assertDeliveryInstructions(text: string): Promise<void> {
    await expect(this.deliveryInstructionsValue).toHaveText(text);
  }

  async assertDeliveryInstructionsEmpty(): Promise<void> {
    await expect(this.deliveryInstructionsValue).toBeAttached();
    await expect(this.deliveryInstructionsValue).toHaveText('');
  }

  // The recipient block under "Shipping Address & Details" is a single text node that starts
  // with the recipient name, followed by address, email and phone.
  async assertShippingRecipient(text: string): Promise<void> {
    await expect(this.page.getByText(new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`))).toBeVisible();
  }

  async assertShippingDetailsContain(text: string): Promise<void> {
    await expect(this.shippingDetails).toContainText(text);
  }

  async assertShippingDetailsNotContain(text: string): Promise<void> {
    await expect(this.shippingDetails).toBeVisible();
    await expect(this.shippingDetails).not.toContainText(text);
  }

  async assertEmail(email: string): Promise<void> {
    await expect(this.shippingDetails.getByText(/^Email:/)).toHaveText(`Email: ${email}`);
  }

  async assertPhone(phone: string): Promise<void> {
    await expect(this.shippingDetails.getByText(/^Phone number:/)).toHaveText(`Phone number: ${phone}`);
  }

  // Page must not show any of the given values (e.g. another customer's personal data).
  async assertNoneVisible(values: string[]): Promise<void> {
    await expect(this.heading).toBeVisible();
    for (const value of values) {
      await expect(this.page.getByText(value)).toHaveCount(0);
    }
  }

  async assertSubtotal(amount: string): Promise<void> {
    await expect(this.subtotalValue).toHaveText(amount);
  }

  async assertShippingFeeLineVisible(): Promise<void> {
    await expect(this.subtotalValue).toBeVisible();
    await expect(this.shippingFeeLabel).toBeVisible({ timeout: 5000 });
  }

  async assertTaxLabel(label: string): Promise<void> {
    await expect(this.taxLabel).toHaveText(label);
  }

  async assertTax(amount: string): Promise<void> {
    await expect(this.taxValue).toHaveText(amount);
  }

  async assertDiscount(amount: string): Promise<void> {
    await expect(this.discountValue).toHaveText(amount);
  }

  async assertTotal(amount: string): Promise<void> {
    await expect(this.totalValue).toHaveText(amount);
  }

  private itemRow(sku: string): Locator {
    return this.itemsTable.getByRole('row').filter({ hasText: new RegExp(sku, 'i') });
  }

  // Item rows are "<name + SKU> | <unit price> | <qty> | <line total>". The row is matched by SKU:
  // this page shows the product's default-language (French) name even when the store is in
  // English (e.g. "QA Bougie A" instead of "QA Candle A" — reported as a finding 2026-09-24).
  async assertItem(item: { sku: string; unitPrice: string; quantity: number; lineTotal: string }): Promise<void> {
    await expect(this.itemRow(item.sku).getByRole('cell')).toHaveText([
      new RegExp(item.sku, 'i'),
      item.unitPrice,
      String(item.quantity),
      item.lineTotal,
    ]);
  }

  async assertItemName(sku: string, name: string): Promise<void> {
    await expect(this.itemRow(sku).getByRole('cell').first()).toContainText(name);
  }

  async assertItemHasImage(sku: string): Promise<void> {
    await expect(this.itemRow(sku).getByRole('img')).toHaveCount(1);
  }

  async assertDownloadButtonEnabled(): Promise<void> {
    await expect(this.downloadButton).toBeVisible();
    await expect(this.downloadButton).toBeEnabled();
  }

  // The button fetches /ws/lc/order/<id>/download/pdf and the browser saves the file directly.
  async downloadOrder(): Promise<Download> {
    const [download] = await Promise.all([this.page.waitForEvent('download'), this.downloadButton.click()]);
    return download;
  }

  async downloadOrderWithResponse(orderId: string): Promise<{ download: Download; response: APIResponseLike }> {
    const [response, download] = await Promise.all([
      this.page.waitForResponse((r) => r.url().endsWith(`/ws/lc/order/${orderId}/download/pdf`) && r.request().method() === 'GET'),
      this.downloadOrder(),
    ]);
    return { download, response: { status: response.status(), headers: response.headers() } };
  }

  // Direct call to the PDF endpoint. The SF sends the login token as a "b2b-authorization" header,
  // the same value as the B2B_EP_TOKEN cookie (confirmed live 2026-09-28). The endpoint wraps the
  // PDF as base64 in {"success", "message", "data"} JSON; `pdf` is the decoded file, if any.
  async requestPdf(orderId: string, opts: { authenticated: boolean }): Promise<{ status: number; pdf?: Buffer }> {
    const headers: Record<string, string> = {};
    if (opts.authenticated) {
      const token = (await this.page.context().cookies(BASE_URL)).find((c) => c.name === 'B2B_EP_TOKEN')?.value;
      if (!token) throw new Error('No B2B_EP_TOKEN cookie: the context is not logged in to the Storefront');
      headers['b2b-authorization'] = token;
    }
    const response = await this.page.request.get(`${BASE_URL}/ws/lc/order/${orderId}/download/pdf`, { headers });
    const body = await response.body();
    let pdf: Buffer | undefined;
    if (body.subarray(0, 5).toString('latin1') === '%PDF-') {
      pdf = body;
    } else {
      try {
        const data = JSON.parse(body.toString('utf8'))?.data;
        const decoded = typeof data === 'string' ? Buffer.from(data, 'base64') : undefined;
        if (decoded && decoded.subarray(0, 5).toString('latin1') === '%PDF-') pdf = decoded;
      } catch {
        // not JSON: no PDF
      }
    }
    return { status: response.status(), pdf };
  }
}
