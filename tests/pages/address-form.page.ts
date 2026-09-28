import { expect, Locator, Page } from '@playwright/test';

export type AddressFormData = {
  firstName?: string;
  lastName?: string;
  email?: string;
  // Typed digit by digit so the field's input mask applies, like a real user.
  phone?: string;
  city?: string;
  postalCode?: string;
  address1?: string;
  address2?: string;
};

// The "Add new Shipping Address" dialog opened from Checkout's "Add New" button (same dialog for
// guests and logged-in customers). Field labels are plain <p> elements that are not associated
// with their inputs, so the inputs have no accessible name; the stable `name` attributes are used
// instead (confirmed via live DOM 2026-09-24). Each input's error text is its MUI helper text,
// linked through aria-describedby, so it is asserted as the input's accessible description.
export class AddressFormDialog {
  readonly page: Page;
  readonly dialog: Locator;
  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly countryInput: Locator;
  readonly provinceInput: Locator;
  readonly cityDropdown: Locator;
  readonly cityError: Locator;
  readonly postalCodeInput: Locator;
  readonly address1Input: Locator;
  readonly address2Input: Locator;
  readonly saveButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.dialog = page
      .getByRole('dialog')
      .filter({ has: page.getByRole('heading', { name: 'Add new Shipping Address' }) });
    this.firstNameInput = this.field('first_name');
    this.lastNameInput = this.field('last_name');
    this.emailInput = this.field('email');
    this.phoneInput = this.field('phone');
    this.countryInput = this.field('country');
    this.provinceInput = this.field('state_or_province');
    // MUI Select: the visible trigger is a div[role=button] with aria-haspopup="listbox"; its
    // aria-labelledby points at a missing label id, so it has no accessible name.
    this.cityDropdown = this.dialog.locator('[aria-haspopup="listbox"]');
    // The City select's helper text is not linked via aria-describedby, unlike the text inputs.
    this.cityError = this.field('city').locator('xpath=../following-sibling::p[1]');
    this.postalCodeInput = this.field('postal_code');
    this.address1Input = this.field('address_1');
    this.address2Input = this.field('address_2');
    this.saveButton = this.dialog.getByRole('button', { name: 'Save' });
  }

  private field(name: string): Locator {
    return this.dialog.locator(`input[name="${name}"]`);
  }

  label(text: string): Locator {
    const escaped = text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    return this.dialog.getByText(new RegExp(`^${escaped}\\s*\\*?$`));
  }

  async assertOpen(): Promise<void> {
    await expect(this.dialog).toBeVisible();
  }

  async fill(data: AddressFormData): Promise<void> {
    if (data.firstName !== undefined) await this.firstNameInput.fill(data.firstName);
    if (data.lastName !== undefined) await this.lastNameInput.fill(data.lastName);
    if (data.email !== undefined) await this.emailInput.fill(data.email);
    if (data.phone !== undefined) await this.typePhone(data.phone);
    if (data.city !== undefined) await this.selectCity(data.city);
    if (data.postalCode !== undefined) await this.postalCodeInput.fill(data.postalCode);
    if (data.address1 !== undefined) await this.address1Input.fill(data.address1);
    if (data.address2 !== undefined) await this.address2Input.fill(data.address2);
  }

  async typePhone(keys: string): Promise<void> {
    await this.phoneInput.pressSequentially(keys);
  }

  async openCityDropdown(): Promise<void> {
    await this.cityDropdown.click();
  }

  // The city list repeats some names (e.g. "Montréal" appears more than once), so the first
  // exact match is taken.
  async selectCity(city: string): Promise<void> {
    await this.openCityDropdown();
    await this.page.getByRole('option', { name: city, exact: true }).first().click();
  }

  async save(): Promise<void> {
    await this.saveButton.click();
  }

  async assertRequiredMarker(labelText: string): Promise<void> {
    await expect(this.label(labelText)).toHaveText(/\*\s*$/);
  }

  async assertNoRequiredMarker(labelText: string): Promise<void> {
    await expect(this.label(labelText)).not.toHaveText(/\*/);
  }

  async assertFieldError(input: Locator, message: string): Promise<void> {
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(input).toHaveAccessibleDescription(message);
  }

  async assertFieldInvalid(input: Locator): Promise<void> {
    await expect(input).toHaveAttribute('aria-invalid', 'true');
  }

  async assertCityError(message: string): Promise<void> {
    await expect(this.cityError).toHaveText(message);
  }

  async assertLocked(input: Locator, value: string): Promise<void> {
    await expect(input).toHaveValue(value);
    await expect(input).toBeDisabled();
  }

  async assertPhoneValue(value: string): Promise<void> {
    await expect(this.phoneInput).toHaveValue(value);
  }

  async assertPostalCodePlaceholder(placeholder: string): Promise<void> {
    await expect(this.postalCodeInput).toHaveAttribute('placeholder', placeholder);
  }

  async assertCityOptionListed(city: string): Promise<void> {
    await expect(this.page.getByRole('listbox').getByRole('option', { name: city, exact: true }).first()).toBeVisible();
  }

  // A saved address closes the dialog; a rejected one keeps it open.
  async assertNotSaved(): Promise<void> {
    await expect(this.dialog).toBeVisible();
  }

  async assertSaved(): Promise<void> {
    await expect(this.dialog).toBeHidden();
  }
}
