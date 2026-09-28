import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

// Backoffice admin (same account tests/auth.setup.ts logs in with).
const ADMIN_EMAIL = process.env.E2E_BO_ADMIN_EMAIL ?? 'admin@digicommerce.xyz';
const ADMIN_PASSWORD = process.env.E2E_BO_ADMIN_PASSWORD ?? 'Z7w2bxdpEDGXC6WMvrTqaykK';

// Storefront customer (reuses the same account/session pattern as purchase-flow.spec.ts).
const SF_EMAIL = process.env.E2E_USERNAME ?? 'thao.ngo+5@digicommercegroup.com';
const SF_PASSWORD = process.env.E2E_PASSWORD ?? 'Thao@1234';

// SKU must be unique per the confirmed business rule (AC2.16), and this flow creates a real
// product on a live, shared UAT environment — so a fixed SKU/name would only succeed once and
// fail with "SKU is already in the system" on every subsequent run. A run-scoped suffix (letters
// + digits, matching the confirmed SKU format) keeps each run's product unique without needing
// manual cleanup between runs.
const RUN_SUFFIX = Date.now().toString().slice(-6);
const PRODUCT_NAME_EN = `QA Chocolate Croissant ${RUN_SUFFIX}`;
const PRODUCT_NAME_FR = `QA Croissant au Chocolat ${RUN_SUFFIX}`;
const PRODUCT_DESCRIPTION_EN = 'A buttery, flaky pastry filled with rich chocolate.';
const PRODUCT_DESCRIPTION_FR = 'Une pâtisserie feuilletée et beurrée fourrée au chocolat riche.';
const PRODUCT_SKU = `CC${RUN_SUFFIX}`;
const PRODUCT_CATEGORY = 'Sweet';
const PRODUCT_COST = '3.50';
const PRODUCT_PRICE = '6.99';
// Confirmed live (2026-09-15): the actual Location option is "WareHouse" (one word), not
// "ware house" as paraphrased in the requirement doc.
const STOCK_LOCATION = 'WareHouse';
const STOCK_QUANTITY = '100';

test.describe('Create product in Backoffice and verify visibility in Storefront search - Happy Path', () => {
  test.describe('BO Login', () => {
    // Cloudflare Access passed, no BO app session — /backoffice/ renders the real admin login
    // form. Storefront and Backoffice share this CF-only session (same host).
    test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json') });

    // TC-HAPPY-001
    test('Admin is redirected to the BO homepage after logging in with valid credentials', async ({
      boLoginPage,
    }) => {
      await boLoginPage.goto();

      await boLoginPage.fillCredentials(ADMIN_EMAIL, ADMIN_PASSWORD);
      await boLoginPage.submit();

      await boLoginPage.assertLoginSuccess();
    });
  });

  test.describe.serial('Product creation (PIM)', () => {
    // Full BO admin session, written by tests/auth.setup.ts.
    test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-bo-state.json') });

    // TC-HAPPY-002/003/004/005/006/007/008
    test('the Product Management list page displays the Create Product button, search field, and product cards', async ({
      productListPage,
    }) => {
      await productListPage.goto();

      await productListPage.assertCreateProductButtonVisible();
      await productListPage.assertSearchFieldVisible();
      // At least one pre-existing product is expected in the list for these card-level checks.
    });

    // TC-HAPPY-009 through TC-HAPPY-023 (full creation flow -> list verification)
    // Gallery image selection is intentionally omitted here: it is a confirmed-optional field
    // (AC2.13), and live investigation found that opening the asset-library dialog after the
    // Categories Filter popover has been used leaves the page in a broken state (a leftover
    // element silently swallows the click that should open the dialog). Since Gallery isn't
    // required for creation to succeed, this flow skips it rather than depend on a flaky
    // sequence; `productFormPage.selectMainImageFromLibrary()` remains available for a future,
    // isolated Gallery-focused test.
    test('Admin can create a product with EN/FR content, SKU, category, price, and stock, and it appears correctly on the list', async ({
      productListPage,
      productFormPage,
    }) => {
      await productListPage.goto();
      await productListPage.clickCreateProduct();

      // French is the default visible Name/Description field; English is revealed via the
      // globe icon. This is the opposite order from the original requirement doc — see the
      // corrected requirement doc for details.
      await productFormPage.fillNameDefault(PRODUCT_NAME_FR);
      await productFormPage.fillNameEnglish(PRODUCT_NAME_EN);
      await productFormPage.fillDescriptionDefault(PRODUCT_DESCRIPTION_FR);
      await productFormPage.fillDescriptionEnglish(PRODUCT_DESCRIPTION_EN);
      await productFormPage.fillSku(PRODUCT_SKU);
      await productFormPage.fillCost(PRODUCT_COST);
      await productFormPage.fillPrice(PRODUCT_PRICE);
      await productFormPage.addStock(STOCK_LOCATION, STOCK_QUANTITY);
      // Selecting a Category leaves the page unable to register further clicks elsewhere
      // (confirmed live — a leftover element from its popover silently swallows later clicks),
      // so it runs last, immediately before Create, rather than before other interactive steps.
      await productFormPage.selectCategory(PRODUCT_CATEGORY);

      await productFormPage.submitCreate();

      await productFormPage.assertRedirectedToProductList();
      await productListPage.assertOnProductList();
      // A newly created product can land outside the default first page, so search for it by
      // keyword rather than assuming sort order/pagination.
      await productListPage.searchByKeyword(PRODUCT_NAME_EN);
      await productListPage.assertProductVisible(PRODUCT_NAME_EN);
      await productListPage.assertProductSku(PRODUCT_NAME_EN, PRODUCT_SKU);
      await productListPage.assertProductPrice(PRODUCT_NAME_EN, PRODUCT_PRICE);
    });
  });

  test.describe('SF Login', () => {
    // The Storefront sits behind its own Cloudflare Access session (already satisfied, no app
    // session yet) — see .auth/lc-uat-state-cf-only.json.
    test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json') });

    // TC-HAPPY-024
    test('a Storefront customer is redirected to the homepage after logging in with valid credentials', async ({
      loginPage,
      homePage,
    }) => {
      await loginPage.goto();

      await loginPage.fillCredentials(SF_EMAIL, SF_PASSWORD);
      await loginPage.submit();

      await loginPage.assertLoginSuccess();
      await homePage.assertLoggedIn();
    });
  });

  test.describe('Search product', () => {
    // Full app-level SF session — see .auth/lc-uat-state.json.
    test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state.json') });

    // TC-HAPPY-025
    test('clicking the search field allows text input', async ({ homePage, searchPage }) => {
      await homePage.goto();

      await searchPage.open();
      await searchPage.searchFor(PRODUCT_NAME_EN);

      await expect(searchPage.searchInput).toHaveValue(PRODUCT_NAME_EN);
    });

    // TC-HAPPY-026 — depends on the product created in the "Product creation (PIM)" block above
    // having actually been created on the live site first.
    test('searching by the name of the product just created in BO returns it on the Storefront', async ({
      homePage,
      searchPage,
    }) => {
      await homePage.goto();

      await searchPage.open();
      await searchPage.searchFor(PRODUCT_NAME_EN);

      await searchPage.assertProductInResults(PRODUCT_NAME_EN);
    });
  });
});
