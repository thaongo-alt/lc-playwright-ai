import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';
import { AddressBookPage } from '../pages/address-book.page';
import type { AddressFormData } from '../pages/address-form.page';
import type { PdpPage } from '../pages/pdp.page';
import type { CartPage } from '../pages/cart.page';
import type { CheckoutPage } from '../pages/checkout.page';
import type { OrderSummary } from '../pages/order-summary.page';
import { PayPalPopup } from '../pages/paypal-popup.page';
import { ProductListPage } from '../pages/product-list.page';
import { ProductFormPage } from '../pages/product-form.page';
import { OrderHistoryPage } from '../pages/order-history.page';
import { HomePage } from '../pages/home.page';
import type { Browser, BrowserContext } from '@playwright/test';

// Test cases: gen-ai/testcases/lc/lc-storefront-checkout-payment-testcases.md (v3.2).
// Requirement:  gen-ai/requirements/LC-SF-BO/lc-storefront-checkout-payment-requirement.md (rev 3).
//
// Test data differs from the test-case document (Candle A $40 etc. do not exist on UAT): the
// real UAT product "ABC" (SKU abc, CAD 55.00) is used and every expected amount below is
// recalculated for it with the same rules (tax 14.975% on the Subtotal before discount, rounded
// once to 2 decimals, Total = Subtotal + Tax − Discount, no shipping fee).
const PRODUCT_SKU = 'abc';
const ONE_ITEM = { subtotal: 'CAD 55.00', tax: 'CAD 8.24', total: 'CAD 63.24' }; // 55 × 14.975% = 8.23625
const TWO_ITEMS = { subtotal: 'CAD 110.00', tax: 'CAD 16.47', total: 'CAD 126.47' }; // 110 × 14.975% = 16.4725
// HOLIDAY is the only active coupon on UAT: a fixed CAD 50.00 discount (confirmed live 2026-09-24).
const VALID_COUPON = 'HOLIDAY';
const HOLIDAY = { discount: 'CAD 50.00', tax: 'CAD 8.24', total: 'CAD 13.24' }; // 55 + 8.24 − 50
const EXPIRED_COUPON = '123';
const NO_DISCOUNT = 'CAD 0.00';
const COUPON_NOT_VALID = 'This coupon code is not valid.';

const VALID_ADDRESS: AddressFormData = {
  firstName: 'QA',
  lastName: 'Guest',
  email: 'guest.lc+checkout@test.com',
  phone: '5145551234',
  city: 'Montréal',
  postalCode: 'H3G 1P1',
  address1: '1250 Rue Sainte-Catherine O',
};
const REQUIRED_ERROR = 'This field is required';

// QA products seeded on BO for these tests (2026-09-24): same prices as the test-case document.
const CANDLE_A = { sku: 'qacandlea', name: 'QA Candle A' };
const CANDLE_B = { sku: 'qacandleb', name: 'QA Candle B' };
const CANDLE_C = { sku: 'qacandlec', name: 'QA Candle C' };
// QA coupons seeded on BO (Promotions > Standard): LCTEST10 = 10%, LCFIX5 = $5 fixed,
// LCMAXED = $5 fixed with Maximum Use 1, already used up.
const PERCENT_COUPON = 'LCTEST10';
const FIXED_COUPON = 'LCFIX5';
const MAXED_COUPON = 'LCMAXED';
const CANDLE_A_X1 = { subtotal: 'CAD 40.00', tax: 'CAD 5.99', total: 'CAD 45.99' }; // 40 × 14.975% = 5.99
const CANDLE_A_X2 = { subtotal: 'CAD 80.00', tax: 'CAD 11.98', total: 'CAD 91.98' };

const PAYPAL_EMAIL = process.env.E2E_PAYPAL_EMAIL ?? 'sb-r0mp450778874@personal.example.com';
const PAYPAL_PASSWORD = process.env.E2E_PAYPAL_PASSWORD ?? 'vv$8*Tbw';
const BO_STATE = path.join(__dirname, '../../.auth/lc-uat-bo-state.json');

const GUEST_STATE = path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json');
const CUSTOMER_STATE = path.join(__dirname, '../../.auth/lc-uat-state.json');
// Saved addresses on the shared test account (thao.ngo+5@digicommercegroup.com).
const ACCOUNT_DEFAULT_ADDRESS = 'thao ngo';
const ACCOUNT_OTHER_ADDRESS = 'Tester';

// Each flow adds to cart, opens Cart and Checkout (and often a dialog) on a shared UAT, which
// regularly takes longer than the default 30s when several workers run at once.
test.describe.configure({ timeout: 90_000 });

type CartItem = { sku: string; quantity?: number };
const ONE_ABC: CartItem[] = [{ sku: PRODUCT_SKU }];

async function addProductToCart(pdpPage: PdpPage, { sku, quantity = 1 }: CartItem): Promise<void> {
  await pdpPage.gotoBySku(sku);
  if (quantity > 1) await pdpPage.setQuantity(quantity);
  await pdpPage.addToCart();
  await pdpPage.assertAddToCartToastVisible();
}

// Note: a guest cart keeps only the last product added (see the "guest cart holds one product"
// finding), so multi-product carts are only built in the registered-customer tests.
async function openCart(
  pdpPage: PdpPage,
  cartPage: CartPage,
  orderSummary: OrderSummary,
  items: CartItem[] = ONE_ABC,
): Promise<void> {
  for (const item of items) await addProductToCart(pdpPage, item);
  await cartPage.goto();
  await orderSummary.waitForLoaded();
}

async function openCheckout(
  pdpPage: PdpPage,
  cartPage: CartPage,
  checkoutPage: CheckoutPage,
  orderSummary: OrderSummary,
  items: CartItem[] = ONE_ABC,
): Promise<void> {
  await openCart(pdpPage, cartPage, orderSummary, items);
  await cartPage.proceedToCheckout();
  await checkoutPage.waitForLoaded();
  await orderSummary.waitForLoaded();
}

// Reads a product's stock from the Backoffice in a separate admin session. The BO product list
// can take well over 5s to render under load, so the navigation is retried as a whole.
async function readStock(browser: Browser, productName: string): Promise<number> {
  const context = await browser.newContext({ storageState: BO_STATE });
  try {
    const page = await context.newPage();
    const productList = new ProductListPage(page);
    let stock = NaN;
    await expect(async () => {
      await productList.goto();
      await productList.openEditProduct(productName);
      stock = await new ProductFormPage(page).getStockQuantity();
    }).toPass({ timeout: 60_000 });
    return stock;
  } finally {
    await context.close();
  }
}

// Reads the customer's newest order ID in a second tab, so the Checkout tab stays untouched.
async function newestOrderId(context: BrowserContext, index = 1): Promise<string> {
  const page = await context.newPage();
  try {
    await new HomePage(page).goto();
    await new HomePage(page).goToMyAccountOrders();
    return await new OrderHistoryPage(page).getOrderIdAt(index);
  } finally {
    await page.close();
  }
}

// Guest sessions (Cloudflare Access only, no app login) each get their own fresh cart, so these
// tests are isolated from each other and from the shared test account, and can run in parallel.
test.describe('Checkout & Payment (guest session)', () => {
  test.use({ storageState: GUEST_STATE });

  test.describe('Tax', () => {
    test('TC-HAPPY-008 tax > the Cart shows the tax line from the Cart step', async ({ pdpPage, cartPage, orderSummary }) => {
      await openCart(pdpPage, cartPage, orderSummary);

      await orderSummary.assertTax(ONE_ITEM.tax);
    });

    test('TC-HAPPY-009 tax > the Cart Total includes tax', async ({ pdpPage, cartPage, orderSummary }) => {
      await openCart(pdpPage, cartPage, orderSummary);

      await orderSummary.assertTotal(ONE_ITEM.total);
    });

    test('TC-HAPPY-010 tax > Checkout shows the correct tax for one product', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);

      await orderSummary.assertTax(ONE_ITEM.tax);
    });

    test('TC-HAPPY-012 tax > the tax on Checkout equals the tax on the Cart', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
    }) => {
      await openCart(pdpPage, cartPage, orderSummary);
      await orderSummary.assertTax(ONE_ITEM.tax);

      await cartPage.proceedToCheckout();
      await checkoutPage.waitForLoaded();

      await orderSummary.assertTax(ONE_ITEM.tax);
    });

    test('TC-HAPPY-013 tax > the Cart recalculates tax when the quantity changes', async ({
      pdpPage,
      cartPage,
      orderSummary,
    }) => {
      await openCart(pdpPage, cartPage, orderSummary);

      await cartPage.increaseQuantity();

      await orderSummary.assertSubtotal(TWO_ITEMS.subtotal);
      await orderSummary.assertTax(TWO_ITEMS.tax);
    });

    test('TC-HAPPY-016 tax > no shipping fee is added to the Order Summary', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);

      await orderSummary.assertNoShippingFee();
      await orderSummary.assertTotal(ONE_ITEM.total);
    });

    test('TC-HAPPY-019 tax > the tax line is labelled "Tax (14,975%)"', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);

      await orderSummary.assertTaxLabel('Tax (14,975%)');
    });

    test('TC-HAPPY-020 tax > the Order Summary shows a single tax line', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);

      await orderSummary.assertSingleTaxLine();
    });
  });

  test.describe('Coupon', () => {
    test.beforeEach(async ({ pdpPage, cartPage, checkoutPage, orderSummary }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);
    });

    test('TC-HAPPY-047 coupon > a valid coupon shows a green "Success" toast', async ({ orderSummary, toastPage }) => {
      await orderSummary.applyCoupon(VALID_COUPON);

      await toastPage.assertToast('success', 'Success');
    });

    test('TC-HAPPY-030 coupon > tax is calculated on the Subtotal before the discount', async ({ orderSummary }) => {
      await orderSummary.applyCoupon(VALID_COUPON);

      await orderSummary.assertDiscount(HOLIDAY.discount);
      await orderSummary.assertTax(HOLIDAY.tax);
    });

    test('TC-HAPPY-031 coupon > Total = Subtotal + Tax − Discount', async ({ orderSummary }) => {
      await orderSummary.applyCoupon(VALID_COUPON);

      await orderSummary.assertDiscount(HOLIDAY.discount);
      await orderSummary.assertTotal(HOLIDAY.total);
    });

    test('TC-EDGE-003 coupon > a lowercase code is applied (case-insensitive)', async ({ orderSummary }) => {
      await orderSummary.applyCoupon(VALID_COUPON.toLowerCase());

      await orderSummary.assertDiscount(HOLIDAY.discount);
    });

    test('TC-EDGE-004 coupon > a mixed-case code is applied (case-insensitive)', async ({ orderSummary }) => {
      await orderSummary.applyCoupon('HoLiDaY');

      await orderSummary.assertDiscount(HOLIDAY.discount);
    });

    test('TC-EDGE-007 coupon > a leading space is trimmed and the code is applied', async ({ orderSummary }) => {
      await orderSummary.applyCoupon(` ${VALID_COUPON}`);

      await orderSummary.assertDiscount(HOLIDAY.discount);
    });

    test('TC-EDGE-008 coupon > a trailing space is trimmed and the code is applied', async ({ orderSummary }) => {
      await orderSummary.applyCoupon(`${VALID_COUPON} `);

      await orderSummary.assertDiscount(HOLIDAY.discount);
    });

    test('TC-EDGE-006 coupon > applying the same code twice does not double the discount', async ({ orderSummary }) => {
      await orderSummary.applyCoupon(VALID_COUPON);
      await orderSummary.assertDiscount(HOLIDAY.discount);

      await orderSummary.applyCoupon(VALID_COUPON);

      await orderSummary.assertDiscount(HOLIDAY.discount);
      await orderSummary.assertTotal(HOLIDAY.total);
    });

    test('TC-NEG-002 coupon > a non-existent code shows the red "not valid" toast', async ({ orderSummary, toastPage }) => {
      await orderSummary.applyCoupon('INVALID123');

      await toastPage.assertToast('error', COUPON_NOT_VALID);
      await orderSummary.assertDiscount(NO_DISCOUNT);
      await orderSummary.assertTotal(ONE_ITEM.total);
    });

    test('TC-NEG-003 coupon > an expired code is not applied', async ({ orderSummary, toastPage }) => {
      await orderSummary.applyCoupon(EXPIRED_COUPON);

      // Error text for an expired code is still open (OQ-2); only the error toast is asserted.
      await toastPage.assertToastOfType('error');
      await orderSummary.assertDiscount(NO_DISCOUNT);
      await orderSummary.assertTotal(ONE_ITEM.total);
    });

    test('TC-NEG-007 coupon > Apply with an empty field shows the red "not valid" toast', async ({
      orderSummary,
      toastPage,
    }) => {
      await orderSummary.applyCouponButton.click();

      await toastPage.assertToast('error', COUPON_NOT_VALID);
      await orderSummary.assertDiscount(NO_DISCOUNT);
    });
  });

  test.describe('Coupon (QA Candle A, CAD 40.00)', () => {
    test.beforeEach(async ({ pdpPage, cartPage, checkoutPage, orderSummary }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [{ sku: CANDLE_A.sku }]);
    });

    test('TC-HAPPY-021 coupon > a valid percentage coupon is applied', async ({ orderSummary }) => {
      await orderSummary.applyCoupon(PERCENT_COUPON);

      await orderSummary.assertDiscount('CAD 4.00');
    });

    test('TC-HAPPY-022 coupon > a valid fixed-amount coupon is applied', async ({ orderSummary }) => {
      await orderSummary.applyCoupon(FIXED_COUPON);

      await orderSummary.assertDiscount('CAD 5.00');
    });

    test('TC-HAPPY-032 coupon > Grand Total after a fixed coupon', async ({ orderSummary }) => {
      await orderSummary.applyCoupon(FIXED_COUPON);

      await orderSummary.assertTax(CANDLE_A_X1.tax);
      await orderSummary.assertTotal('CAD 40.99'); // 40.00 + 5.99 − 5.00
    });

    test('TC-STATE-003 coupon > a second coupon replaces the first (percentage → fixed)', async ({
      orderSummary,
    }) => {
      await orderSummary.applyCoupon(PERCENT_COUPON);
      await orderSummary.assertDiscount('CAD 4.00');

      await orderSummary.applyCoupon(FIXED_COUPON);

      await orderSummary.assertDiscount('CAD 5.00');
      await orderSummary.assertTotal('CAD 40.99');
    });

    test('TC-STATE-010 coupon > a second coupon replaces the first (fixed → percentage)', async ({ orderSummary }) => {
      await orderSummary.applyCoupon(FIXED_COUPON);
      await orderSummary.assertDiscount('CAD 5.00');

      await orderSummary.applyCoupon(PERCENT_COUPON);

      await orderSummary.assertDiscount('CAD 4.00');
      await orderSummary.assertTotal('CAD 41.99'); // 40.00 + 5.99 − 4.00
    });

    test('TC-NEG-004 coupon > a coupon that reached its usage limit is not applied', async ({
      orderSummary,
      toastPage,
    }) => {
      await orderSummary.applyCoupon(MAXED_COUPON);

      // Error text for a used-up code is still open (OQ-2); only the error toast is asserted.
      await toastPage.assertToastOfType('error');
      await orderSummary.assertDiscount(NO_DISCOUNT);
      await orderSummary.assertTotal(CANDLE_A_X1.total);
    });
  });

  test('TC-HAPPY-014 tax > tax is rounded to 2 decimal places', async ({ pdpPage, cartPage, orderSummary }) => {
    await openCart(pdpPage, cartPage, orderSummary, [{ sku: CANDLE_C.sku, quantity: 3 }]);

    await orderSummary.assertSubtotal('CAD 29.97');
    await orderSummary.assertTax('CAD 4.49'); // 29.97 × 14.975% = 4.4880075
  });

  test.describe('Address form validation', () => {
    test.beforeEach(async ({ pdpPage, cartPage, checkoutPage, orderSummary, addressFormDialog }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);
      await checkoutPage.openAddNewAddress();
      await addressFormDialog.assertOpen();
    });

    test('TC-VAL-001 address > required fields show an asterisk and optional ones do not', async ({ addressFormDialog }) => {
      for (const label of ['First Name', 'Last name', 'Email', 'Phone number', 'Country', 'City', 'Postal/Zip Code', 'Address Line 1']) {
        await addressFormDialog.assertRequiredMarker(label);
      }
      await addressFormDialog.assertNoRequiredMarker('Address Line 2');
    });

    const requiredTextFields = [
      { id: 'TC-VAL-002', label: 'First name', omit: 'firstName', input: 'firstNameInput' },
      { id: 'TC-VAL-003', label: 'Last name', omit: 'lastName', input: 'lastNameInput' },
      { id: 'TC-VAL-004', label: 'Address line 1', omit: 'address1', input: 'address1Input' },
      { id: 'TC-VAL-007', label: 'Postcode', omit: 'postalCode', input: 'postalCodeInput' },
      { id: 'TC-VAL-009', label: 'Phone', omit: 'phone', input: 'phoneInput' },
      { id: 'TC-VAL-020', label: 'Email', omit: 'email', input: 'emailInput' },
    ] as const;

    for (const { id, label, omit, input } of requiredTextFields) {
      test(`${id} address > the address is not saved when ${label} is empty`, async ({ addressFormDialog }) => {
        const { [omit]: _omitted, ...rest } = VALID_ADDRESS;
        await addressFormDialog.fill(rest);

        await addressFormDialog.save();

        await addressFormDialog.assertNotSaved();
        await addressFormDialog.assertFieldError(addressFormDialog[input], REQUIRED_ERROR);
      });
    }

    test('TC-VAL-005 address > the address is not saved when no City is selected', async ({ addressFormDialog }) => {
      const { city: _city, ...rest } = VALID_ADDRESS;
      await addressFormDialog.fill(rest);

      await addressFormDialog.save();

      await addressFormDialog.assertNotSaved();
      await addressFormDialog.assertCityError('This field is required!');
    });

    test('TC-VAL-006 address > Province is locked to Quebec', async ({ addressFormDialog }) => {
      await addressFormDialog.assertLocked(addressFormDialog.provinceInput, 'Quebec');
    });

    test('TC-VAL-008 address > Country is locked to Canada', async ({ addressFormDialog }) => {
      await addressFormDialog.assertLocked(addressFormDialog.countryInput, 'Canada');
    });

    test('TC-VAL-010 address > the address is saved when optional fields are left empty', async ({
      addressFormDialog,
      checkoutPage,
    }) => {
      await addressFormDialog.fill(VALID_ADDRESS);

      await addressFormDialog.save();

      await addressFormDialog.assertSaved();
      await checkoutPage.assertShipTo(`${VALID_ADDRESS.firstName} ${VALID_ADDRESS.lastName}`);
    });

    test('TC-VAL-011 address > Phone auto-formats while typing', async ({ addressFormDialog }) => {
      await addressFormDialog.typePhone('5145551234');

      await addressFormDialog.assertPhoneValue('+1 (514) 555-1234');
    });

    test('TC-VAL-012 address > Phone does not accept letters', async ({ addressFormDialog }) => {
      await addressFormDialog.typePhone('514abc5551234');

      await addressFormDialog.assertPhoneValue('+1 (514) 555-1234');
    });

    test('TC-VAL-013 address > Phone does not accept special characters', async ({ addressFormDialog }) => {
      await addressFormDialog.typePhone('514#$5551234');

      await addressFormDialog.assertPhoneValue('+1 (514) 555-1234');
    });

    test('TC-VAL-014 address > an incomplete Phone is rejected', async ({ addressFormDialog }) => {
      await addressFormDialog.fill({ ...VALID_ADDRESS, phone: '514555' });

      await addressFormDialog.save();

      await addressFormDialog.assertNotSaved();
      await addressFormDialog.assertFieldInvalid(addressFormDialog.phoneInput);
    });

    test('TC-VAL-015 address > the Postcode placeholder shows the format A1A 1A1', async ({ addressFormDialog }) => {
      await addressFormDialog.assertPostalCodePlaceholder('A1A 1A1');
    });

    test('TC-VAL-016 address > a Postcode matching A1A 1A1 is accepted', async ({ addressFormDialog, checkoutPage }) => {
      await addressFormDialog.fill({ ...VALID_ADDRESS, address2: 'Suite 100' });

      await addressFormDialog.save();

      await addressFormDialog.assertSaved();
      await checkoutPage.assertShipToAddressContains(VALID_ADDRESS.postalCode!);
    });

    const invalidPostcodes = [
      { id: 'TC-VAL-017', scenario: 'with special characters', value: 'H3G#1P1' },
      { id: 'TC-VAL-018', scenario: 'with digits only', value: '12345' },
      { id: 'TC-VAL-019', scenario: 'shorter than the format', value: 'H3G' },
    ];

    for (const { id, scenario, value } of invalidPostcodes) {
      test(`${id} address > a Postcode ${scenario} is rejected`, async ({ addressFormDialog }) => {
        await addressFormDialog.fill({ ...VALID_ADDRESS, postalCode: value });

        await addressFormDialog.save();

        await addressFormDialog.assertNotSaved();
        await addressFormDialog.assertFieldError(addressFormDialog.postalCodeInput, 'Invalid zip code format');
      });
    }

    const invalidEmails = [
      { id: 'TC-VAL-021', scenario: 'without a domain', value: 'qa.test@' },
      { id: 'TC-VAL-022', scenario: 'without a top-level domain', value: 'qa.test@example' },
    ];

    for (const { id, scenario, value } of invalidEmails) {
      test(`${id} address > an Email ${scenario} is rejected`, async ({ addressFormDialog }) => {
        await addressFormDialog.fill({ ...VALID_ADDRESS, email: value });

        await addressFormDialog.save();

        await addressFormDialog.assertNotSaved();
        await addressFormDialog.assertFieldError(addressFormDialog.emailInput, 'Please enter a valid email address');
      });
    }

    test('TC-VAL-023 address > City is chosen from a dropdown list', async ({ addressFormDialog }) => {
      await addressFormDialog.openCityDropdown();

      await addressFormDialog.assertCityOptionListed('Montréal');
    });

    test('TC-BOUNDARY-001 address > a 500-character Address line 1 is accepted', async ({
      addressFormDialog,
      checkoutPage,
    }) => {
      const longAddress = '1250 Rue Sainte-Catherine O '.repeat(20).slice(0, 500);
      await addressFormDialog.fill({ ...VALID_ADDRESS, address1: longAddress });

      await addressFormDialog.save();

      await addressFormDialog.assertSaved();
      await checkoutPage.assertShipToAddressContains(longAddress.trim());
    });
  });

  test.describe('COD payment', () => {
    test.beforeEach(async ({ pdpPage, cartPage, checkoutPage, orderSummary }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);
    });

    test('TC-HAPPY-040 COD > Cash on Delivery can be selected', async ({ checkoutPage }) => {
      await checkoutPage.selectCod();

      await checkoutPage.assertCodSelected();
    });

    test('TC-HAPPY-041 COD > no payment details or PayPal button are required', async ({ checkoutPage }) => {
      await checkoutPage.selectCod();

      await checkoutPage.assertCodDescriptionVisible();
      await checkoutPage.assertPayPalButtonsHidden();
      await checkoutPage.assertPlaceOrderVisible();
    });
  });

  test.describe('Guest permissions', () => {
    test('TC-PERM-001 guest > can open Checkout without logging in', async ({ pdpPage, cartPage, checkoutPage, orderSummary }) => {
      await openCart(pdpPage, cartPage, orderSummary);

      await cartPage.proceedToCheckout();

      await checkoutPage.waitForLoaded();
    });

    test('TC-PERM-002 guest > sees an address entry option and no saved-address list', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);

      await checkoutPage.assertNoSavedAddressList();
    });

    test('TC-PERM-003 guest > the address form has a required Email field', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
      addressFormDialog,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);

      await checkoutPage.openAddNewAddress();

      await addressFormDialog.assertRequiredMarker('Email');
    });

    test('TC-PERM-005 guest > cannot place an order without a shipping address', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);

      await checkoutPage.selectCod();

      await checkoutPage.assertPlaceOrderDisabled();
    });

    test('TC-PERM-006 guest > only COD is offered as a payment method', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);

      await checkoutPage.assertCodOptionAvailable();
      await checkoutPage.assertPayPalOptionUnavailable();
    });

    test('TC-PERM-009 guest > cannot view orders', async ({ page, loginPage }) => {
      await page.goto('https://lc-uat.digicommerce.cloud/my-account/orders', { waitUntil: 'domcontentloaded' });

      await loginPage.assertOnLoginPage();
    });
  });

  test.describe('Guest COD order', () => {
    test.beforeEach(async ({ pdpPage, cartPage, checkoutPage, orderSummary, addressFormDialog }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);
      await checkoutPage.openAddNewAddress();
      await addressFormDialog.fill(VALID_ADDRESS);
      await addressFormDialog.save();
      await addressFormDialog.assertSaved();
      await checkoutPage.selectCod();
    });

    test('TC-PERM-007 guest > can place a COD order', async ({ checkoutPage, orderConfirmationPage }) => {
      await checkoutPage.placeOrder();

      await orderConfirmationPage.assertOrderConfirmed();
    });

    test('TC-HAPPY-042 COD > the order goes straight to Order Confirmation without a payment popup', async ({
      page,
      checkoutPage,
      orderConfirmationPage,
    }) => {
      let popupOpened = false;
      page.on('popup', () => {
        popupOpened = true;
      });

      await checkoutPage.placeOrder();

      await orderConfirmationPage.assertOrderConfirmed();
      expect(popupOpened).toBe(false);
    });

    test('TC-HAPPY-027 order > Order Confirmation shows a "Back to Shop" button', async ({
      checkoutPage,
      orderConfirmationPage,
    }) => {
      await checkoutPage.placeOrder();

      await orderConfirmationPage.assertBackToShopVisible();
    });

    test('TC-PERM-008 guest > the cart is cleared after placing an order', async ({
      checkoutPage,
      orderConfirmationPage,
      homePage,
      cartPage,
    }) => {
      await checkoutPage.placeOrder();
      await orderConfirmationPage.assertOrderConfirmed();

      await homePage.assertCartBadgeEmpty();
      await cartPage.goto();

      await cartPage.assertEmpty();
    });
  });
});

// These run against the shared test account, whose cart and address book are server-side state:
// they run one at a time, in order, in a single worker (the Default-address cases build on each
// other), and the cart is emptied before each test (which also drops any
// coupon, since the UI has no "remove coupon" control). The Default address is restored at the
// end so other specs (purchase-flow) keep their precondition.
test.describe('Checkout & Payment (registered customer)', () => {
  test.describe.configure({ mode: 'default' });
  test.use({ storageState: CUSTOMER_STATE });

  test.beforeEach(async ({ cartPage }) => {
    await cartPage.removeAllItems();
  });

  test.afterAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: CUSTOMER_STATE });
    const addressBook = new AddressBookPage(await context.newPage());
    await addressBook.goto();
    if ((await addressBook.addressCard(ACCOUNT_DEFAULT_ADDRESS).getByText('Default Address').count()) === 0) {
      await addressBook.setAsDefault(ACCOUNT_DEFAULT_ADDRESS);
    }
    await context.close();
  });

  test.describe('Checkout basics (1 × ABC)', () => {
    test.beforeEach(async ({ pdpPage, cartPage, checkoutPage, orderSummary }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary);
    });

    test('TC-PERM-010 registered > sees both PayPal and COD', async ({ checkoutPage }) => {
      await checkoutPage.assertCodOptionAvailable();
      await checkoutPage.assertPayPalOptionAvailable();
    });

    test('TC-PERM-011 registered > sees their saved addresses at Checkout', async ({ checkoutPage }) => {
      await checkoutPage.openSelectAnotherAddress();

      await checkoutPage.assertSavedAddressListed(ACCOUNT_DEFAULT_ADDRESS);
      await checkoutPage.assertSavedAddressListed(ACCOUNT_OTHER_ADDRESS);
    });

    // PayPal cannot be selected in a guest session, so the COD-fee comparison runs as a customer.
    test('TC-HAPPY-044 COD > no COD fee is added to the Total', async ({ checkoutPage, orderSummary }) => {
      await checkoutPage.selectPayPal();
      await orderSummary.assertTotal(ONE_ITEM.total);

      await checkoutPage.selectCod();

      await orderSummary.assertNoCodFeeLine();
      await orderSummary.assertTotal(ONE_ITEM.total);
    });

    test('TC-HAPPY-001 address > the Default address is pre-selected at Checkout', async ({ checkoutPage }) => {
      await checkoutPage.assertShipTo(ACCOUNT_DEFAULT_ADDRESS);
    });

    test('TC-EDGE-002 tax > tax does not change when another address is selected', async ({ checkoutPage, orderSummary }) => {
      await orderSummary.assertTax(ONE_ITEM.tax);

      await checkoutPage.shipToSavedAddress(ACCOUNT_OTHER_ADDRESS);

      await checkoutPage.assertShipTo(ACCOUNT_OTHER_ADDRESS);
      await orderSummary.assertTax(ONE_ITEM.tax);
    });

    test('TC-HAPPY-007 address > a saved address can be set as Default', async ({ addressBookPage }) => {
      await addressBookPage.goto();

      await addressBookPage.setAsDefault(ACCOUNT_OTHER_ADDRESS);

      await addressBookPage.assertIsDefault(ACCOUNT_OTHER_ADDRESS);
    });

    test('TC-STATE-001 address > only one address is Default after the Default changes', async ({ addressBookPage }) => {
      await addressBookPage.goto();

      await addressBookPage.assertSingleDefault();
      await addressBookPage.assertIsDefault(ACCOUNT_OTHER_ADDRESS);
    });

    test('TC-STATE-002 address > the new Default is pre-selected on the next Checkout', async ({ checkoutPage }) => {
      await checkoutPage.assertShipTo(ACCOUNT_OTHER_ADDRESS);
    });

    test('TC-HAPPY-029 order > a new COD order is listed in My account with status "Order Placed"', async ({
      checkoutPage,
      orderConfirmationPage,
      homePage,
      orderHistoryPage,
    }) => {
      await checkoutPage.selectCod();
      await checkoutPage.placeOrder();
      const orderNumber = await orderConfirmationPage.getOrderNumber();

      await homePage.goto();
      await homePage.goToMyAccountOrders();

      await orderHistoryPage.assertOrderStatus(orderNumber, 'Order Placed');
    });
  });

  test.describe('Multiple products', () => {
    test('TC-HAPPY-011 tax > tax is correct for multiple products with different quantities', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [
        { sku: CANDLE_A.sku, quantity: 2 },
        { sku: CANDLE_B.sku },
      ]);

      await orderSummary.assertSubtotal('CAD 105.50');
      await orderSummary.assertTax('CAD 15.80'); // 105.50 × 14.975% = 15.798625
    });

    test('TC-HAPPY-015 tax > Grand Total = Subtotal + Tax with no coupon and no shipping fee', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [
        { sku: CANDLE_A.sku, quantity: 2 },
        { sku: CANDLE_B.sku },
      ]);

      await orderSummary.assertTotal('CAD 121.30');
    });

    test('TC-EDGE-001 tax > tax is rounded once on the order total, not per line', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [{ sku: CANDLE_B.sku }, { sku: CANDLE_C.sku }]);

      await orderSummary.assertSubtotal('CAD 35.49');
      // 35.49 × 14.975% = 5.3146 → 5.31; rounding each line (3.82 + 1.50) would give 5.32.
      await orderSummary.assertTax('CAD 5.31');
    });
  });

  test.describe('Saved order', () => {
    test('TC-HAPPY-017 tax > the tax saved on the order matches Checkout', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
      orderConfirmationPage,
      storefrontOrderDetailPage,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [{ sku: CANDLE_A.sku }]);
      await orderSummary.assertTax(CANDLE_A_X1.tax);
      await checkoutPage.selectCod();
      await checkoutPage.placeOrder();
      const orderId = await orderConfirmationPage.getOrderNumber();

      await storefrontOrderDetailPage.goto(orderId);

      await storefrontOrderDetailPage.assertTax(CANDLE_A_X1.tax);
    });

    test('TC-HAPPY-028 order > the order detail lists the ordered items', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
      orderConfirmationPage,
      storefrontOrderDetailPage,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [{ sku: CANDLE_A.sku, quantity: 2 }]);
      await checkoutPage.selectCod();
      await checkoutPage.placeOrder();
      const orderId = await orderConfirmationPage.getOrderNumber();

      await storefrontOrderDetailPage.goto(orderId);

      await storefrontOrderDetailPage.assertItem({
        sku: CANDLE_A.sku,
        unitPrice: 'CAD 40.00',
        quantity: 2,
        lineTotal: 'CAD 80.00',
      });
    });

    test('TC-HAPPY-045 order > the order detail shows the order totals', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
      orderConfirmationPage,
      storefrontOrderDetailPage,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [{ sku: CANDLE_A.sku, quantity: 2 }]);
      await checkoutPage.selectCod();
      await checkoutPage.placeOrder();
      const orderId = await orderConfirmationPage.getOrderNumber();

      await storefrontOrderDetailPage.goto(orderId);

      await storefrontOrderDetailPage.assertSubtotal(CANDLE_A_X2.subtotal);
      await storefrontOrderDetailPage.assertTax(CANDLE_A_X2.tax);
      await storefrontOrderDetailPage.assertTotal(CANDLE_A_X2.total);
    });

    test('TC-HAPPY-043 COD > a COD order is saved with payment "Cash On Delivery (COD)"', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
      orderConfirmationPage,
      storefrontOrderDetailPage,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [{ sku: CANDLE_A.sku }]);
      await checkoutPage.selectCod();
      await checkoutPage.placeOrder();
      const orderId = await orderConfirmationPage.getOrderNumber();

      await storefrontOrderDetailPage.goto(orderId);

      await storefrontOrderDetailPage.assertPaymentMethod('Cash On Delivery (COD)');
    });

    test('TC-HAPPY-024 coupon > the discount is saved on the order', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
      orderConfirmationPage,
      storefrontOrderDetailPage,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [{ sku: CANDLE_A.sku }]);
      await orderSummary.applyCoupon(PERCENT_COUPON);
      await orderSummary.assertDiscount('CAD 4.00');
      await checkoutPage.selectCod();
      await checkoutPage.placeOrder();
      const orderId = await orderConfirmationPage.getOrderNumber();

      await storefrontOrderDetailPage.goto(orderId);

      await storefrontOrderDetailPage.assertDiscount('CAD 4.00');
      await storefrontOrderDetailPage.assertTotal('CAD 41.99');
    });

    test('TC-STATE-009 payment > switching from PayPal to COD places a COD order without opening PayPal', async ({
      page,
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
      orderConfirmationPage,
      storefrontOrderDetailPage,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [{ sku: CANDLE_A.sku }]);
      let popupOpened = false;
      page.on('popup', () => {
        popupOpened = true;
      });
      await checkoutPage.selectPayPal();

      await checkoutPage.selectCod();
      await checkoutPage.placeOrder();

      const orderId = await orderConfirmationPage.getOrderNumber();
      expect(popupOpened).toBe(false);
      await storefrontOrderDetailPage.goto(orderId);
      await storefrontOrderDetailPage.assertPaymentMethod('Cash On Delivery (COD)');
    });

    test('TC-EDGE-005 COD > COD succeeds for a high-value order (no value limit)', async ({
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
      orderConfirmationPage,
      storefrontOrderDetailPage,
    }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [{ sku: CANDLE_A.sku, quantity: 50 }]);
      await checkoutPage.assertCodOptionAvailable();
      await checkoutPage.selectCod();

      await checkoutPage.placeOrder();

      const orderId = await orderConfirmationPage.getOrderNumber();
      await storefrontOrderDetailPage.goto(orderId);
      await storefrontOrderDetailPage.assertTotal(/^CAD\s2,?299\.50$/); // 2000.00 + 299.50
    });

    test('TC-HAPPY-033 stock > stock decreases by the ordered quantity after a COD order', async ({
      browser,
      pdpPage,
      cartPage,
      checkoutPage,
      orderSummary,
      orderConfirmationPage,
    }) => {
      const stockBefore = await readStock(browser, CANDLE_A.name);
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [{ sku: CANDLE_A.sku, quantity: 2 }]);
      await checkoutPage.selectCod();

      await checkoutPage.placeOrder();
      await orderConfirmationPage.assertOrderConfirmed();

      expect(await readStock(browser, CANDLE_A.name)).toBe(stockBefore - 2);
    });
  });

  // Runs against the PayPal Sandbox with a sandbox buyer account; every successful payment
  // creates a real (sandbox-paid) order on UAT.
  test.describe('PayPal', () => {
    test.beforeEach(async ({ pdpPage, cartPage, checkoutPage, orderSummary }) => {
      await openCheckout(pdpPage, cartPage, checkoutPage, orderSummary, [{ sku: CANDLE_A.sku }]);
    });

    test('TC-HAPPY-035 PayPal > choosing PayPal opens the PayPal popup over Checkout', async ({ checkoutPage }) => {
      const payPal = new PayPalPopup(await checkoutPage.openPayPalPopup());

      await payPal.assertOnPayPalSandbox();
      await checkoutPage.assertOnCheckout();
    });

    test('TC-HAPPY-036 PayPal > the amount in the popup equals the Checkout Total in CAD', async ({ checkoutPage }) => {
      const payPal = new PayPalPopup(await checkoutPage.openPayPalPopup());

      await payPal.logIn(PAYPAL_EMAIL, PAYPAL_PASSWORD);

      await payPal.assertAmount('$45.99 CAD');
    });

    test('TC-HAPPY-037 PayPal > paying in the popup submits the order and shows Order Confirmation', async ({
      checkoutPage,
      orderConfirmationPage,
    }) => {
      const payPal = new PayPalPopup(await checkoutPage.openPayPalPopup());
      await payPal.logIn(PAYPAL_EMAIL, PAYPAL_PASSWORD);

      await payPal.completePurchase();

      await orderConfirmationPage.assertOrderConfirmed();
    });

    test('TC-HAPPY-046 PayPal > a PayPal order is saved with payment method PayPal', async ({
      checkoutPage,
      orderConfirmationPage,
      storefrontOrderDetailPage,
    }) => {
      const payPal = new PayPalPopup(await checkoutPage.openPayPalPopup());
      await payPal.logIn(PAYPAL_EMAIL, PAYPAL_PASSWORD);
      await payPal.completePurchase();
      const orderId = await orderConfirmationPage.getOrderNumber();

      await storefrontOrderDetailPage.goto(orderId);

      await storefrontOrderDetailPage.assertPaymentMethod(/PayPal/i);
    });

    test('TC-HAPPY-038 PayPal > the cart is cleared after a successful PayPal payment', async ({
      checkoutPage,
      orderConfirmationPage,
      cartPage,
    }) => {
      const payPal = new PayPalPopup(await checkoutPage.openPayPalPopup());
      await payPal.logIn(PAYPAL_EMAIL, PAYPAL_PASSWORD);
      await payPal.completePurchase();
      await orderConfirmationPage.assertOrderConfirmed();

      await cartPage.goto();

      await cartPage.assertEmpty();
    });

    test('TC-HAPPY-039 PayPal > stock decreases after a successful PayPal payment', async ({
      browser,
      checkoutPage,
      orderConfirmationPage,
    }) => {
      const stockBefore = await readStock(browser, CANDLE_A.name);
      const payPal = new PayPalPopup(await checkoutPage.openPayPalPopup());
      await payPal.logIn(PAYPAL_EMAIL, PAYPAL_PASSWORD);

      await payPal.completePurchase();
      await orderConfirmationPage.assertOrderConfirmed();

      expect(await readStock(browser, CANDLE_A.name)).toBe(stockBefore - 1);
    });

    test('TC-STATE-004 PayPal > cancelling closes the popup, keeps the user on Checkout and shows an error', async ({
      checkoutPage,
      toastPage,
    }) => {
      const payPal = new PayPalPopup(await checkoutPage.openPayPalPopup());
      await payPal.logIn(PAYPAL_EMAIL, PAYPAL_PASSWORD);

      await payPal.cancel();

      await checkoutPage.assertOnCheckout();
      // Error text after a cancel is still open (OQ-4); only the error toast is asserted.
      await toastPage.assertToastOfType('error');
    });

    test('TC-STATE-005 PayPal > cancelling does not create an order', async ({ page, checkoutPage }) => {
      const newestBefore = await newestOrderId(page.context());
      const payPal = new PayPalPopup(await checkoutPage.openPayPalPopup());
      await payPal.logIn(PAYPAL_EMAIL, PAYPAL_PASSWORD);

      await payPal.cancel();
      await checkoutPage.assertOnCheckout();

      expect(await newestOrderId(page.context())).toBe(newestBefore);
    });

    test('TC-STATE-006 PayPal > checkout data is kept after cancelling', async ({ checkoutPage, orderSummary }) => {
      await orderSummary.applyCoupon(PERCENT_COUPON);
      await orderSummary.assertDiscount('CAD 4.00');
      const payPal = new PayPalPopup(await checkoutPage.openPayPalPopup());
      await payPal.logIn(PAYPAL_EMAIL, PAYPAL_PASSWORD);

      await payPal.cancel();

      await checkoutPage.assertShipTo(ACCOUNT_DEFAULT_ADDRESS);
      await orderSummary.assertSubtotal(CANDLE_A_X1.subtotal);
      await orderSummary.assertDiscount('CAD 4.00');
    });

    test('TC-STATE-007 PayPal > stock is unchanged after cancelling', async ({ browser, checkoutPage }) => {
      const stockBefore = await readStock(browser, CANDLE_A.name);
      const payPal = new PayPalPopup(await checkoutPage.openPayPalPopup());
      await payPal.logIn(PAYPAL_EMAIL, PAYPAL_PASSWORD);

      await payPal.cancel();
      await checkoutPage.assertOnCheckout();

      expect(await readStock(browser, CANDLE_A.name)).toBe(stockBefore);
    });

    test('TC-STATE-008 PayPal > paying after a cancel succeeds and creates only one order', async ({
      page,
      checkoutPage,
      orderConfirmationPage,
    }) => {
      const newestBefore = await newestOrderId(page.context());
      const firstAttempt = new PayPalPopup(await checkoutPage.openPayPalPopup());
      await firstAttempt.logIn(PAYPAL_EMAIL, PAYPAL_PASSWORD);
      await firstAttempt.cancel();
      await checkoutPage.assertOnCheckout();

      const secondAttempt = new PayPalPopup(await checkoutPage.openPayPalPopup());
      await secondAttempt.logIn(PAYPAL_EMAIL, PAYPAL_PASSWORD);
      await secondAttempt.completePurchase();

      const orderId = await orderConfirmationPage.getOrderNumber();
      expect(await newestOrderId(page.context())).toBe(orderId);
      expect(await newestOrderId(page.context(), 2)).toBe(newestBefore);
    });

    test('TC-NEG-010 PayPal > closing the popup before paying keeps the user on Checkout', async ({
      page,
      checkoutPage,
      toastPage,
    }) => {
      const newestBefore = await newestOrderId(page.context());
      const payPal = new PayPalPopup(await checkoutPage.openPayPalPopup());

      await payPal.close();

      await checkoutPage.assertOnCheckout();
      await toastPage.assertToastOfType('error');
      expect(await newestOrderId(page.context())).toBe(newestBefore);
    });
  });
});
