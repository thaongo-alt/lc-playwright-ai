import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

// Search PLP test cases (TC-HAPPY-030 .. TC-HAPPY-040 from
// gen-ai/testcases/lc-storefront-plp-pdp-testcases.md, "Search PLP" section).
test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json') });

const CATEGORY_SLUG = 'sweetcandelas';

test.describe('Search PLP', () => {
  // TC-HAPPY-030 / TC-HAPPY-031
  test('typing a keyword shows the autosuggest dropdown with matching items', async ({ homePage, searchPage }) => {
    await homePage.goto();

    await searchPage.typeQuery('coffee');

    await searchPage.assertAutosuggestItemVisible('Iced Coffee');
  });

  // TC-HAPPY-032
  test('clicking an autosuggest item navigates to that product\'s PDP', async ({ homePage, searchPage, pdpPage }) => {
    await homePage.goto();
    await searchPage.typeQuery('coffee');

    await searchPage.clickAutosuggestItem('Iced Coffee');

    await expect(pdpPage.productHeading('Iced Coffee')).toBeVisible();
  });

  // TC-HAPPY-033
  test('submitting a search navigates to the search results page with correct breadcrumb', async ({
    homePage,
    searchPage,
  }) => {
    await homePage.goto();

    await searchPage.searchFor('coffee');

    await searchPage.assertOnSearchResults('coffee');
  });

  // TC-HAPPY-034
  test('search by partial keyword returns relevant matching products', async ({ homePage, searchPage }) => {
    await homePage.goto();

    await searchPage.searchFor('coffee');

    await searchPage.assertProductInResults('Iced Coffee');
  });

  // TC-HAPPY-035
  test('search by full product name returns the exact matching product', async ({ homePage, searchPage }) => {
    await homePage.goto();

    await searchPage.searchFor('Iced Coffee');

    await searchPage.assertProductInResults('Iced Coffee');
  });

  // TC-HAPPY-036
  test('search by SKU returns the matching product', async ({ homePage, searchPage }) => {
    await homePage.goto();

    await searchPage.searchFor('LC001');

    await searchPage.assertProductInResults('Iced Coffee');
  });

  // TC-VAL-006
  test('search is case-insensitive', async ({ homePage, searchPage }) => {
    await homePage.goto();

    await searchPage.searchFor('COFFEE');

    await searchPage.assertProductInResults('Iced Coffee');
  });

  // TC-VAL-007
  test('search trims leading/trailing whitespace from the query', async ({ homePage, searchPage }) => {
    await homePage.goto();

    await searchPage.searchFor('  coffee  ');

    await searchPage.assertProductInResults('Iced Coffee');
  });

  // TC-HAPPY-037
  test('the facet panel updates to reflect the search result set', async ({ homePage, searchPage, plpPage }) => {
    await homePage.goto();

    await searchPage.searchFor('coffee');

    await expect(plpPage.page.getByRole('heading', { name: 'Pricing', level: 5 })).toBeVisible();
  });

  // TC-HAPPY-038 — encodes the CONFIRMED requirement (REQ-SRC-03: filters persist through a new
  // search, like sort already does). Expected to currently be RED: original UAT observed filters
  // reset on search.
  test('submitting a search while PLP filters are active preserves the active filters', async ({
    plpPage,
    searchPage,
  }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.toggleFacet(/^COFFEE/);
    await plpPage.assertFacetChecked(/^COFFEE/);

    await searchPage.searchFor('a');

    await plpPage.assertFacetChecked(/^COFFEE/);
  });

  // TC-NEG-002
  test('a search term with no matches displays "No Product Found"', async ({ homePage, searchPage }) => {
    await homePage.goto();

    await searchPage.searchFor('zzqqxx123');

    await searchPage.assertNoProductFound();
  });
});
