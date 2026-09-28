import { expect, Locator, Page } from '@playwright/test';

export class OrderHistoryPage {
  readonly page: Page;
  readonly ordersTable: Locator;

  constructor(page: Page) {
    this.page = page;
    this.ordersTable = page.getByRole('table');
  }

  async getNewestOrderId(expectedOrderId?: string): Promise<string> {
    // Row 0 is the column header ("Order ID", "Status", ...); row 1 is the newest order.
    const newestRow = this.ordersTable.getByRole('row').nth(1);
    const orderIdCell = newestRow.getByRole('cell').first();
    if (expectedOrderId) {
      // The table can briefly render the previous (stale) order list before the
      // just-placed order is fetched in, so the cell is non-empty before it's correct.
      // Poll for the expected value itself instead of just "non-empty" so we wait out
      // that staleness window rather than racing it.
      await expect(orderIdCell).toHaveText(expectedOrderId, { timeout: 15000 });
    } else {
      // The table renders empty/loading cells briefly before the order data arrives.
      await expect(orderIdCell).toHaveText(/\S+/);
    }
    return (await orderIdCell.innerText()).trim();
  }

  // Rows carry the Order ID in their first cell and the status (e.g. "Order Placed") in a later
  // cell, so the row is matched by its Order ID and then checked for the status text.
  async assertOrderStatus(orderId: string, status: string): Promise<void> {
    const row = this.ordersTable.getByRole('row').filter({ has: this.page.getByRole('cell', { name: orderId, exact: true }) });
    await expect(row).toContainText(status, { timeout: 15000 });
  }

  async goto(): Promise<void> {
    await this.page.goto('https://lc-uat.digicommerce.cloud/my-account/orders', { waitUntil: 'domcontentloaded' });
    await expect(this.ordersTable.getByRole('row').nth(1).getByRole('cell').first()).toHaveText(/\d+/, { timeout: 15000 });
  }

  private rowOf(orderId: string): Locator {
    return this.ordersTable.getByRole('row').filter({ has: this.page.getByRole('cell', { name: orderId, exact: true }) });
  }

  // The Order ID cell is a plain <a href="/my-account/orders/<id>"> (confirmed live 2026-09-28).
  async openOrder(orderId: string): Promise<void> {
    await this.rowOf(orderId).getByRole('link', { name: orderId, exact: true }).click();
  }

  // Actions is a "⋮" button that toggles an inline dropdown of plain buttons in the same cell.
  async openActionsMenu(orderId: string): Promise<Locator> {
    const actionsCell = this.rowOf(orderId).getByRole('cell').last();
    await actionsCell.getByRole('button', { name: '⋮' }).click();
    const options = actionsCell.getByRole('button').filter({ hasNotText: '⋮' });
    await expect(options.first()).toBeVisible();
    return options;
  }

  async assertActionsMenuOptions(orderId: string, expected: string[]): Promise<void> {
    await expect(await this.openActionsMenu(orderId)).toHaveText(expected);
  }

  async viewDetails(orderId: string): Promise<void> {
    const options = await this.openActionsMenu(orderId);
    await options.filter({ hasText: 'View Details' }).click();
  }

  // Row 0 is the header; index 1 is the newest order, index 2 the one before it, and so on.
  async getOrderIdAt(index: number): Promise<string> {
    const cell = this.ordersTable.getByRole('row').nth(index).getByRole('cell').first();
    await expect(cell).toHaveText(/\d+/, { timeout: 15000 });
    return (await cell.innerText()).trim();
  }
}
