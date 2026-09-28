import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

// A single continuous PLP -> PDP browsing session, narrated with test.step() so the whole
// journey runs in one page/session (unlike the granular test files it complements —
// view-plp/filter-plp/search-plp/sort-plp/view-pdp/price/stock/suggested-products.spec.ts —
// which cover every acceptance criterion atomically but each start from a blank page). This
// journey is the happy path only; known product gaps (documented in those granular specs, e.g.
// pagination not auto-scrolling, Pricing facet not being single-select, sort breaking across
// pages, "You may also like" not hiding when empty) are intentionally left out here so the
// journey stays green as a smoke test of the overall flow.
test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json') });

const CATEGORY_SLUG = 'sweetcandelas';
const PRODUCT_NAME = 'Iced Coffee';
const PRODUCT_SKU = 'LC001';
const COLOUR = 'Brown & White';
const SCENT = 'Coffee';

test.describe('PLP -> PDP browsing journey (happy path)', () => {
  test('a shopper can browse, filter, sort, search, and configure a product for purchase', async ({
    homePage,
    plpPage,
    searchPage,
    pdpPage,
  }) => {
    await test.step('Browse to the Sweet category via Shop by Collection', async () => {
      await homePage.goto();
      await homePage.selectCategoryFromMenu('Sweet');

      await plpPage.assertOnCategory(CATEGORY_SLUG);
      await plpPage.assertBreadcrumbText('sweetcandelas');
    });

    await test.step('Filter by price and scent', async () => {
      await plpPage.toggleFacet(/\$1 - \$50/);
      await plpPage.toggleFacet(/^COFFEE/);

      await plpPage.assertProductCardVisible(PRODUCT_NAME);
    });

    await test.step('Sort the filtered results by price', async () => {
      await plpPage.selectSort('Price: Low to High');

      await plpPage.assertSortUrlParam('price-asc');
    });

    await test.step('Search for the product by keyword via autosuggest', async () => {
      await searchPage.typeQuery('coffee');
      await searchPage.assertAutosuggestItemVisible(PRODUCT_NAME);

      await searchPage.clickAutosuggestItem(PRODUCT_NAME);
    });

    await test.step('Select a full variant on the PDP', async () => {
      await expect(pdpPage.page).toHaveURL(new RegExp(`/product/${PRODUCT_SKU}(\\?|$)`));
      await pdpPage.assertAddToCartDisabled();

      await pdpPage.selectVariantOption(COLOUR);
      await pdpPage.selectVariantOption(SCENT);

      await expect(pdpPage.productHeading(`${PRODUCT_NAME} ${COLOUR} ${SCENT}`)).toBeVisible();
      await pdpPage.assertStatus('In stock');
      await pdpPage.assertAddToCartEnabled();
    });

    await test.step('Browse the image gallery and lightbox', async () => {
      await pdpPage.openLightbox();
      await pdpPage.assertLightboxCounter(1, 2);

      await pdpPage.lightboxNext();
      await pdpPage.assertLightboxCounter(2, 2);

      await pdpPage.closeLightboxViaButton();
      await pdpPage.assertLightboxClosed();
    });

    await test.step('Check the Attributes tab', async () => {
      await pdpPage.openAttributesTab();

      await pdpPage.assertAttributeRow('Colour', COLOUR);
    });

    await test.step('Add the configured product to the cart', async () => {
      await pdpPage.addToCart();

      await pdpPage.assertAddToCartToastVisible();
    });
  });
});
