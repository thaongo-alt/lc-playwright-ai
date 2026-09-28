import { expect, Locator, Page } from '@playwright/test';

const BASE_URL = 'https://lc-uat.digicommerce.cloud';

export class LoginPage {
  readonly page: Page;
  readonly emailInput: Locator;
  readonly passwordInput: Locator;
  readonly signInButton: Locator;
  readonly forgotPasswordLink: Locator;
  readonly signUpLink: Locator;
  readonly emailErrorText: Locator;

  constructor(page: Page) {
    this.page = page;
    this.emailInput = page.getByPlaceholder('Enter your email');
    this.passwordInput = page.getByPlaceholder('Enter your password');
    this.signInButton = page.getByRole('button', { name: 'Sign In' });
    this.forgotPasswordLink = page.getByRole('link', { name: 'Forgot password?' });
    this.signUpLink = page.getByRole('link', { name: 'Sign Up' });
    // MUI wires this element via the email input's aria-describedby.
    this.emailErrorText = page.locator('#email-helper-text');
  }

  async goto(): Promise<void> {
    await this.page.goto(`${BASE_URL}/login`, { waitUntil: 'domcontentloaded' });
    await expect(this.emailInput).toBeVisible();
  }

  async fillCredentials(email: string, password: string): Promise<void> {
    await this.emailInput.fill(email);
    await this.passwordInput.fill(password);
  }

  async submit(): Promise<void> {
    await this.signInButton.click();
  }

  async assertEmailValidationError(expectedMessage: string): Promise<void> {
    await expect(this.emailInput).toHaveAttribute('aria-invalid', 'true');
    await expect(this.emailErrorText).toHaveText(expectedMessage);
  }

  async assertOnLoginPage(): Promise<void> {
    await expect(this.page).toHaveURL(new RegExp(`^${BASE_URL}/login`));
  }

  async assertLoginSuccess(): Promise<void> {
    await this.page.waitForURL(new RegExp(`^${BASE_URL}/(en)?$`));
  }

  async assertLoginFailure(expectedMessage: string): Promise<void> {
    await expect(this.page.getByText(expectedMessage)).toBeVisible();
  }
}
