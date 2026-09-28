import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

// Backoffice admin — full BO session, written by tests/auth.setup.ts before the run. This flow creates a real order on a live, shared UAT
// environment, and the BO has no order-deletion capability (confirmed live in
// create_order_findings.md), so each run leaves a new order behind — the same tradeoff
// create-product-sf-search.spec.ts already accepts for the products it creates there.
const CUSTOMER_NAME = 'Thao Ngo';
// "+ Manual Add" (despite its name) is the category-browse/keyword-search modal in the live
// app — its behavior is swapped relative to the LC-359 requirement doc's "QUICK ADD"/
// "MANUAL ADD" descriptions (confirmed live, see create_order_findings.md §2). "Sweet
// Candelas" is a leaf category confirmed to have catalog products under it.
const PRODUCT_CATEGORY = 'Sweet Candelas';
const PRODUCT_SKU = 'abc';

test.describe('BO Create Order (LC-359) - Happy Path', () => {
  test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-bo-state.json') });

  // TC-VAL-002 (adapted): the live wizard's Products step starts with an empty cart and gates
  // Checkout on it, matching the requirement doc's confirmed rule even though the surrounding
  // Step 1 UI does not match the doc (see CreateOrderPage's goto()/submitCreate() notes).
  test('Checkout is disabled on a new order until a product is added', async ({ createOrderPage }) => {
    await createOrderPage.goto();
    await createOrderPage.selectCustomer(CUSTOMER_NAME);
    await createOrderPage.submitCreate();

    await createOrderPage.assertCheckoutDisabled();
  });

  // TC-HAPPY (adapted end-to-end): create an order for an existing customer, add a catalog
  // product, and complete checkout with the only available shipping method (Standard) and the
  // only available payment method (COD), landing on "Order Placed".
  test('BO user can create an order for an existing customer, add a catalog product, and place a COD order', async ({
    createOrderPage,
    boCheckoutPage,
    orderDetailPage,
  }) => {
    await createOrderPage.goto();
    await createOrderPage.selectCustomer(CUSTOMER_NAME);
    await createOrderPage.submitCreate();

    await createOrderPage.addFirstProductFromCategory(PRODUCT_CATEGORY);
    await createOrderPage.assertProductInTable(PRODUCT_SKU);
    await createOrderPage.assertCheckoutEnabled();

    await createOrderPage.clickCheckout();

    await boCheckoutPage.selectFirstAvailableAddress();
    await boCheckoutPage.confirmShippingAddress();
    await boCheckoutPage.confirmShippingMethod();
    await boCheckoutPage.confirmPaymentMethod();
    await boCheckoutPage.placeOrder();

    await orderDetailPage.assertOrderPlaced();
    await orderDetailPage.assertPaymentMethod();
    await orderDetailPage.assertShippingMethod();
    await orderDetailPage.assertProductVisible(PRODUCT_SKU);
  });
});
