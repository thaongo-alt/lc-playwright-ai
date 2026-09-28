import { expect, Page } from '@playwright/test';

export type ToastType = 'success' | 'error';

// react-toastify: each toast is a `.Toastify__toast` with a type modifier class
// (`--success` = green, `--error` = red) and a role="alert" body (confirmed via live DOM
// 2026-09-24 on the coupon toasts).
export class ToastPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  async assertSuccessMessageVisible(): Promise<void> {
    await expect(this.page.getByText('Wishlist created successfully.')).toBeVisible();
  }

  async assertErrorMessageVisible(): Promise<void> {
    await expect(this.page.getByText('Failed to create wishlist. Please try again.')).toBeVisible();
  }

  async assertToast(type: ToastType, message: string): Promise<void> {
    await expect(
      this.page.locator(`.Toastify__toast--${type}`).getByRole('alert').filter({ hasText: message }).first(),
    ).toBeVisible();
  }

  // Type-agnostic: the stock toasts' colour/type was not specified.
  async assertToastText(message: string): Promise<void> {
    await expect(this.page.locator('.Toastify__toast').filter({ hasText: message }).first()).toBeVisible();
  }

  async assertToastOfType(type: ToastType): Promise<void> {
    await expect(this.page.locator(`.Toastify__toast--${type}`).first()).toBeVisible();
  }
}
