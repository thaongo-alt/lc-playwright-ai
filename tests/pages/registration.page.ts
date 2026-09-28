import { expect, Locator, Page } from '@playwright/test';

export class RegistrationPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly subtitle: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly createAccountButton: Locator;
  readonly signInLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole('heading', { name: 'Create Account', level: 2 });
    this.subtitle = page.getByText("Sign up to get started", { exact: false });
    this.firstNameInput = page.getByRole('textbox', { name: 'Enter your first name' });
    this.lastNameInput = page.getByRole('textbox', { name: 'Enter your last name' });
    this.emailInput = page.getByRole('textbox', { name: 'Enter your email' });
    this.phoneInput = page.getByRole('textbox', { name: '+1 (XXX) XXX-XXXX' });
    this.createAccountButton = page.getByRole('button', { name: 'Create Account' });
    this.signInLink = page.getByRole('link', { name: 'Sign In' });
  }

  async goto(): Promise<void> {
    await this.page.goto('https://lc-uat.digicommerce.cloud/create-account', { waitUntil: 'domcontentloaded' });
    await expect(this.heading).toBeVisible();
  }

  async fillValidForm(data: { firstName: string; lastName: string; email: string; phone: string }): Promise<void> {
    await this.firstNameInput.fill(data.firstName);
    await this.lastNameInput.fill(data.lastName);
    await this.emailInput.fill(data.email);
    await this.phoneInput.fill(data.phone);
  }

  // The "required" error only appears once a field has held a value and been cleared;
  // focusing and blurring a still-pristine field does not mark it touched.
  async clearFieldAndBlur(input: Locator): Promise<void> {
    await input.fill('x');
    await input.fill('');
    await input.blur();
  }

  async fillFieldAndBlur(input: Locator, value: string): Promise<void> {
    await input.fill(value);
    await input.blur();
  }

  // MUI wires each field's error text via a dynamically generated id (React useId),
  // so it must be resolved from the input's own aria-describedby at assertion time
  // rather than hardcoded, unlike the static "#email-helper-text" id on the Login page.
  async assertFieldError(input: Locator, expectedMessage: string): Promise<void> {
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    const describedBy = await input.getAttribute('aria-describedby');
    await expect(this.page.locator(`[id="${describedBy}"]`)).toHaveText(expectedMessage);
  }

  async assertCreateAccountButtonEnabled(): Promise<void> {
    await expect(this.createAccountButton).toBeEnabled();
  }

  async assertCreateAccountButtonDisabled(): Promise<void> {
    await expect(this.createAccountButton).toBeDisabled();
  }
}
