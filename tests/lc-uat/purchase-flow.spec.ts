import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

const EMAIL = process.env.E2E_USERNAME ?? 'thao.ngo+5@digicommercegroup.com';
const PASSWORD = process.env.E2E_PASSWORD ?? 'Thao@1234';
const PRODUCT_NAME = 'ABC En';
const PRODUCT_DESCRIPTION = 'ABC';
// The address book has two saved addresses; index 0 ("Nguyen Phung") has no email on
// file, so the account holder's own address ("thao ngo", index 1) is used for checkout.
const ACCOUNT_ADDRESS_INDEX = 1;

test.describe('Storefront purchase flow - Happy Path', () => {
  test.describe('Login', () => {
    // The Storefront sits behind Cloudflare Access. This state has CF Access already
    // satisfied but no app-level session, so /login renders the real app login form
    // instead of the CF Access challenge (see .auth/lc-uat-state-cf-only.json).
    test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json') });

    // TC-HAPPY-001
    test('a customer is redirected to the Homepage after logging in with a valid email and password', async ({
      loginPage,
      homePage,
    }) => {
      await loginPage.goto();

      await loginPage.fillCredentials(EMAIL, PASSWORD);
      await loginPage.submit();

      await loginPage.assertLoginSuccess();
      await homePage.assertLoggedIn();
    });
  });

  // TC-HAPPY-004/005/006 add to cart and check out against the same account's server-side
  // cart, so they must not run concurrently with each other or they'll race on shared state.
  test.describe.serial('Browse, cart, checkout, order history (logged in)', () => {
    // This state already has a full app-level session (see .auth/lc-uat-state.json).
    test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state.json') });

    // TC-HAPPY-002
    test('clicking "Shop By Collection" navigates from the Homepage to the PLP', async ({ homePage, plpPage }) => {
      await homePage.goto();
      await homePage.assertLoggedIn();

      await homePage.goToShopByCollection();

      await plpPage.assertOnPlp();
    });

    // TC-HAPPY-003
    test('the PDP for SKU "abc" displays the product name, description, and image', async ({
      homePage,
      plpPage,
      pdpPage,
    }) => {
      await homePage.goto();
      await homePage.goToShopByCollection();
      await plpPage.selectProductByName(PRODUCT_NAME);

      await pdpPage.assertProductDisplayed(PRODUCT_NAME, PRODUCT_DESCRIPTION);
    });

    // TC-HAPPY-004
    test('adding the product to the cart shows a confirmation toast at the top-right', async ({
      homePage,
      plpPage,
      pdpPage,
    }) => {
      await homePage.goto();
      await homePage.goToShopByCollection();
      await plpPage.selectProductByName(PRODUCT_NAME);

      await pdpPage.addToCart();

      await pdpPage.assertAddToCartToastVisible();
    });

    // TC-HAPPY-005
    test('completing checkout with a saved address and COD shows the Order Confirmation Page with the Order Number', async ({
      homePage,
      plpPage,
      pdpPage,
      cartPage,
      checkoutPage,
      orderConfirmationPage,
    }) => {
      await homePage.goto();
      await homePage.goToShopByCollection();
      await plpPage.selectProductByName(PRODUCT_NAME);
      await pdpPage.addToCart();
      await homePage.openCart();
      await cartPage.proceedToCheckout();

      await checkoutPage.selectAddressByIndex(ACCOUNT_ADDRESS_INDEX);
      await checkoutPage.assertCodSelectedByDefault();
      await checkoutPage.placeOrder();

      await orderConfirmationPage.assertOrderConfirmed();
      // TODO(gap): REQ-005 (lc-storefront-purchase-flow-requirement.md) also expects
      // Total Amount and Items on this page, but the live UAT page renders neither —
      // confirmed 2026-08-26. Add those assertions once BA/Dev resolves the gap.
    });

    // TC-HAPPY-006
    test('the newest Order History entry matches the Order Number from the just-placed order', async ({
      homePage,
      plpPage,
      pdpPage,
      cartPage,
      checkoutPage,
      orderConfirmationPage,
      orderHistoryPage,
    }) => {
      await homePage.goto();
      await homePage.goToShopByCollection();
      await plpPage.selectProductByName(PRODUCT_NAME);
      await pdpPage.addToCart();
      await homePage.openCart();
      await cartPage.proceedToCheckout();
      await checkoutPage.selectAddressByIndex(ACCOUNT_ADDRESS_INDEX);
      await checkoutPage.placeOrder();
      const placedOrderNumber = await orderConfirmationPage.getOrderNumber();

      await homePage.goto();
      await homePage.goToMyAccountOrders();
      const newestOrderId = await orderHistoryPage.getNewestOrderId(placedOrderNumber);

      expect(newestOrderId).toBe(placedOrderNumber);
    });
  });
});
