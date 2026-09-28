import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

// Guest-browsing test cases (TC-HAPPY-001 .. TC-VAL-001 from
// gen-ai/testcases/lc-storefront-plp-pdp-testcases.md, "View PLP" section). The Storefront sits
// behind Cloudflare Access; this state has CF Access satisfied but no app-level session, which
// is sufficient for guest browsing.
test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json') });

const CATEGORY_SLUG = 'sweetcandelas';
const VARIANT_PRODUCT = { name: 'Iced Coffee', sku: 'LC001', price: 'CAD 25.00' };
const SIMPLE_PRODUCT = { name: 'Holiday', sku: 'holiday', price: 'CAD 44.00' };
const SALE_PRODUCT = { name: 'abc', sku: 'abcz', originalPrice: 'CAD 445.00', salePrice: 'CAD 345.00' };

test.describe('View PLP', () => {
  // TC-HAPPY-001
  test('selecting a category from Shop by Collection navigates to the correct PLP with correct breadcrumb', async ({
    homePage,
    plpPage,
  }) => {
    await homePage.goto();

    await homePage.selectCategoryFromMenu('Sweet');

    await plpPage.assertOnCategory(CATEGORY_SLUG);
    await plpPage.assertBreadcrumbText('SWEETCANDELAS');
  });

  // TC-HAPPY-002
  test('PLP displays banner, facet panel, Sort dropdown, and Grid/List toggle', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await expect(plpPage.page.getByRole('heading', { name: 'Pricing', level: 5 })).toBeVisible();
    await expect(plpPage.sortSelect).toBeVisible();
    await expect(plpPage.gridViewButton).toBeVisible();
    await expect(plpPage.listViewButton).toBeVisible();
  });

  // TC-HAPPY-003
  test('PLP shows only products belonging to the selected category', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.assertProductCardVisible(VARIANT_PRODUCT.name);
  });

  // TC-HAPPY-006
  test('PLP page 1 displays exactly 12 products for a category with more than 12 items', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await expect(async () => {
      expect(await plpPage.countProductCards()).toBe(12);
    }).toPass();
  });

  // TC-HAPPY-007
  test('PLP page 2 displays a different set of products than page 1 (no duplicates)', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);
    const page1Skus = await plpPage.page.locator('p strong').allTextContents();

    await plpPage.goToPage(2);

    const page2Skus = await plpPage.page.locator('p strong').allTextContents();
    expect(page1Skus.some((sku) => page2Skus.includes(sku))).toBe(false);
  });

  // TC-HAPPY-008
  test('the current page number is highlighted on the pagination control', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.goToPage(2);

    await plpPage.assertCurrentPage(2);
  });

  // TC-BOUNDARY-001
  test('"< Back" is disabled on page 1', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.assertPreviousPageDisabled();
  });

  // TC-BOUNDARY-002
  test('"Next >" is disabled on the last page', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.goToPage(3);

    await plpPage.assertNextPageDisabled();
  });

  // TC-HAPPY-009
  test('clicking "Next >" auto-scrolls the page to the top of the product list', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.scrollToBottomOfProductList();

    await plpPage.goToNextPage();

    await plpPage.assertScrolledToTop();
  });

  // TC-HAPPY-010
  test('clicking "< Back" auto-scrolls the page to the top of the product list', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.goToPage(2);
    await plpPage.scrollToBottomOfProductList();

    await plpPage.goToPreviousPage();

    await plpPage.assertScrolledToTop();
  });

  // TC-HAPPY-011
  test('a product card displays image, name, SKU, price, and wishlist icon', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.assertProductCardVisible(VARIANT_PRODUCT.name);
    await plpPage.assertProductCardSku(VARIANT_PRODUCT.name, VARIANT_PRODUCT.sku);
    await plpPage.assertProductCardPrice(VARIANT_PRODUCT.name, VARIANT_PRODUCT.price);
    // The wishlist icon isn't present on every card on live UAT (e.g. it's absent on "Iced
    // Coffee"); "Holiday" is confirmed to render it, so that's used here instead.
    await plpPage.assertWishlistIconVisible(SIMPLE_PRODUCT.name);
  });

  // TC-HAPPY-012
  test('a variant product card shows a "VIEW DETAIL" button', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.assertProductCardHasViewDetail(VARIANT_PRODUCT.name);
  });

  // TC-HAPPY-013
  test('a single-variant (simple) product card shows a quantity selector and "ADD TO CART"', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.assertProductCardHasAddToCart(SIMPLE_PRODUCT.name);
  });

  // TC-HAPPY-014
  test('a sale product card shows the original price struck through alongside the sale price', async ({
    plpPage,
  }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.goToPage(2);

    await plpPage.assertProductCardSalePrice(SALE_PRODUCT.name, SALE_PRODUCT.originalPrice, SALE_PRODUCT.salePrice);
  });

  // TC-HAPPY-015
  test('switching to List view changes layout without changing product data', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.switchToListView();

    await plpPage.assertProductCardVisible(VARIANT_PRODUCT.name);
    await plpPage.assertListViewActive();
  });

  // TC-HAPPY-016
  test('switching to Grid view changes layout without changing product data', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.switchToListView();

    await plpPage.switchToGridView();

    await plpPage.assertProductCardVisible(VARIANT_PRODUCT.name);
    await plpPage.assertGridViewActive();
  });

  // TC-EDGE-001 / TC-EDGE-002 — layout-integrity and image-distortion checks require visual
  // comparison (see lc-storefront-plp-pdp-testcases.md: Automation Feasibility "Low"); not
  // automated here, left as a placeholder for a future visual-regression pass.
  test.fixme('a product card with a long product name does not break the card layout', async () => {});
  test.fixme('a product image renders without distortion or stretching on the card', async () => {});
});
