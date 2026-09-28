import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

// Price test cases (TC-VAL-013 .. TC-BOUNDARY-003 from
// gen-ai/testcases/lc-storefront-plp-pdp-testcases.md, "Price" section).
test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json') });

const CATEGORY_SLUG = 'sweetcandelas';
const NON_SALE_PRODUCT = { name: 'Iced Coffee', sku: 'LC001', price: 'CAD 25.00' };
const SALE_PLP_PRODUCT = { name: 'abc', originalPrice: 'CAD 445.00', salePrice: 'CAD 345.00' };
const SALE_PDP_PRODUCT_SLUG = 'normal';
const SALE_PDP_PRODUCT = { salePrice: 'CAD 500.00', originalPrice: 'CAD 555.00', saveBadge: 'Save CAD 55.00 (10' };
const SALE_PDP_PRODUCT_2_SLUG = 'pinky';
const SALE_PDP_PRODUCT_2 = { saveBadge: 'Save CAD 99.90 (30' };

test.describe('Price', () => {
  // TC-VAL-013
  test('a non-sale product\'s price matches exactly across PLP, PDP, and autosuggest', async ({
    plpPage,
    pdpPage,
    homePage,
    searchPage,
  }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.assertProductCardPrice(NON_SALE_PRODUCT.name, NON_SALE_PRODUCT.price);

    await pdpPage.gotoBySku(NON_SALE_PRODUCT.sku);
    await pdpPage.assertPrice(NON_SALE_PRODUCT.price);

    await homePage.goto();
    await searchPage.typeQuery('coffee');
    await searchPage.assertAutosuggestItemVisible(NON_SALE_PRODUCT.name);
    await expect(searchPage.autosuggestItem(NON_SALE_PRODUCT.name)).toContainText('25.00');
  });

  // TC-HAPPY-074
  test('a sale product\'s PLP card shows struck-through original price and active sale price', async ({
    plpPage,
  }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.goToPage(2);

    await plpPage.assertProductCardSalePrice(
      SALE_PLP_PRODUCT.name,
      SALE_PLP_PRODUCT.originalPrice,
      SALE_PLP_PRODUCT.salePrice,
    );
  });

  // TC-HAPPY-075
  test('a sale product\'s PDP shows the sale price prominently with the original price struck through', async ({
    pdpPage,
  }) => {
    await pdpPage.gotoBySku(SALE_PDP_PRODUCT_SLUG);

    await pdpPage.assertSalePriceDisplayed(SALE_PDP_PRODUCT.salePrice, SALE_PDP_PRODUCT.originalPrice);
  });

  // TC-VAL-014 / TC-VAL-015
  test('the PDP sale badge shows the correct savings amount and percentage', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(SALE_PDP_PRODUCT_SLUG);

    await pdpPage.assertSaveBadge(SALE_PDP_PRODUCT.saveBadge);
  });

  // TC-VAL-016
  test('savings percentage calculation is correct for a second sale product data point', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(SALE_PDP_PRODUCT_2_SLUG);

    await pdpPage.assertSaveBadge(SALE_PDP_PRODUCT_2.saveBadge);
  });

  // TC-VAL-017
  test('all prices display in "CAD xx.xx" format with exactly 2 decimal places', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    const prices = await plpPage.page.locator('.price-text').allTextContents();
    for (const priceText of prices) {
      expect(priceText).toMatch(/CAD\s*[\d,]+\.\d{2}/);
    }
  });

  // TC-BOUNDARY-003 — not automated: no product priced at or above CAD 1,000 was confirmed to
  // exist in the live UAT catalog during inspection (2026-09-23; the "$501 - $1,000" bucket has
  // only 1 item, of unconfirmed exact price). Needs a seeded ≥1,000 product to verify.
  test.fixme('prices >= CAD 1,000 display with a thousands separator', async () => {});
});
