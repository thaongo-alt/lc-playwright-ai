import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

// The registration page sits behind Cloudflare Access; this replays a saved
// session (see .auth/lc-uat-state.json) instead of authenticating headlessly.
test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state.json') });

test.describe('Registration form', () => {
  test('loads with expected page content and a disabled Create Account button by default', async ({
    registrationPage,
  }) => {
    await registrationPage.goto();

    await expect(registrationPage.heading).toHaveText('Create Account');
    await expect(registrationPage.subtitle).toHaveText("Sign up to get started with Liana's Candelas");
    await expect(registrationPage.firstNameInput).toBeVisible();
    await expect(registrationPage.lastNameInput).toBeVisible();
    await expect(registrationPage.emailInput).toBeVisible();
    await expect(registrationPage.phoneInput).toBeVisible();
    await expect(registrationPage.signInLink).toBeVisible();
    await registrationPage.assertCreateAccountButtonDisabled();
  });

  test('shows the shorter subtitle on a mobile viewport', async ({ page, registrationPage }) => {
    await page.setViewportSize({ width: 375, height: 800 });

    await registrationPage.goto();

    await expect(registrationPage.subtitle).toHaveText('Sign up to get started');
  });

  test('Create Account button becomes enabled once all required fields are valid', async ({ registrationPage }) => {
    await registrationPage.goto();
    await registrationPage.assertCreateAccountButtonDisabled();

    await registrationPage.fillValidForm({
      firstName: 'QA',
      lastName: 'Automation',
      email: 'qa.claude@digicommercegroup.com',
      phone: '5149876543',
    });

    await registrationPage.assertCreateAccountButtonEnabled();
  });

  test('Sign In link navigates to the Login page', async ({ registrationPage }) => {
    await registrationPage.goto();

    await registrationPage.signInLink.click();

    await expect(registrationPage.page).toHaveURL(/\/login/);
  });

  test.describe('Field validation', () => {
    test('First Name shows a required error when cleared', async ({ registrationPage }) => {
      await registrationPage.goto();

      await registrationPage.clearFieldAndBlur(registrationPage.firstNameInput);

      await registrationPage.assertFieldError(registrationPage.firstNameInput, 'This field is required');
    });

    test('First Name rejects numeric characters', async ({ registrationPage }) => {
      await registrationPage.goto();

      await registrationPage.fillFieldAndBlur(registrationPage.firstNameInput, 'John1');

      await registrationPage.assertFieldError(registrationPage.firstNameInput, 'Only letters are allowed');
    });

    test('Last Name shows a required error when cleared', async ({ registrationPage }) => {
      await registrationPage.goto();

      await registrationPage.clearFieldAndBlur(registrationPage.lastNameInput);

      await registrationPage.assertFieldError(registrationPage.lastNameInput, 'This field is required');
    });

    test('Last Name rejects numeric characters', async ({ registrationPage }) => {
      await registrationPage.goto();

      await registrationPage.fillFieldAndBlur(registrationPage.lastNameInput, 'Doe1');

      await registrationPage.assertFieldError(registrationPage.lastNameInput, 'Only letters are allowed');
    });

    test('Email shows a required error when cleared', async ({ registrationPage }) => {
      await registrationPage.goto();

      await registrationPage.clearFieldAndBlur(registrationPage.emailInput);

      await registrationPage.assertFieldError(registrationPage.emailInput, 'This field is required');
    });

    test('Email rejects an invalid format', async ({ registrationPage }) => {
      await registrationPage.goto();

      await registrationPage.fillFieldAndBlur(registrationPage.emailInput, 'notanemail');

      await registrationPage.assertFieldError(registrationPage.emailInput, 'Please enter a valid email address');
    });

    test('Create Account button stays disabled while Phone Number is empty', async ({ registrationPage }) => {
      await registrationPage.goto();

      await registrationPage.firstNameInput.fill('QA');
      await registrationPage.lastNameInput.fill('Automation');
      await registrationPage.emailInput.fill('qa.claude@digicommercegroup.com');

      await registrationPage.assertCreateAccountButtonDisabled();
    });

    test('Phone Number rejects fewer than 10 digits', async ({ registrationPage }) => {
      await registrationPage.goto();

      await registrationPage.fillFieldAndBlur(registrationPage.phoneInput, '514987654');

      await registrationPage.assertFieldError(registrationPage.phoneInput, 'Please enter a valid phone number');
    });
  });
});
