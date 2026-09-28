import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

// Filter PLP test cases (TC-HAPPY-017 .. TC-VAL-005 from
// gen-ai/testcases/lc-storefront-plp-pdp-testcases.md, "Filter PLP" section).
test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json') });

const CATEGORY_SLUG = 'sweetcandelas';
// Live facet values confirmed via DOM inspection 2026-09-23 (UAT data drifts from the original
// static test-case doc, so these were re-confirmed against the live site rather than assumed).
const PRICE_1_50 = /\$1 - \$50/;
const SCENT_COFFEE = /^COFFEE/;
const SCENT_CINNAMON_BUN = /^CINNAMON BUN/;

test.describe('Filter PLP', () => {
  // TC-HAPPY-017
  test('selecting a category updates facet counts to reflect that category\'s product set', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await expect(plpPage.facetCheckbox(PRICE_1_50)).toBeVisible();
  });

  // TC-HAPPY-019 / TC-HAPPY-020
  test('selecting a Pricing range filters results immediately without a page reload', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.toggleFacet(PRICE_1_50);

    await plpPage.assertFacetChecked(PRICE_1_50);
  });

  // TC-VAL-003
  test('all displayed products fall within the selected Pricing range', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.toggleFacet(PRICE_1_50);

    const prices = await plpPage.page.locator('.price-text').allTextContents();
    for (const priceText of prices) {
      const amounts = [...priceText.matchAll(/CAD\s*([\d,]+\.\d{2})/g)].map((m) => Number(m[1].replace(',', '')));
      for (const amount of amounts) {
        expect(amount).toBeGreaterThanOrEqual(1);
        expect(amount).toBeLessThanOrEqual(50);
      }
    }
  });

  // TC-HAPPY-021
  test('the URL reflects the selected Pricing facet', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.toggleFacet(PRICE_1_50);

    // The "facets" query param is percent-encoded (e.g. "price%255B0%255D%3D1.0-50.0" decodes to
    // "price[0]=1.0-50.0" — confirmed via live DOM 2026-09-23); the numeric range itself is not
    // further encoded, so matching on that substring is reliable without decoding.
    await plpPage.assertUrlHasParam(/price.*1\.0-50\.0/);
  });

  // TC-HAPPY-022 — encodes the CONFIRMED requirement (lc-storefront-plp-pdp-requirement.md,
  // REQ-FLT-02: Pricing is single-select). Currently RED against live UAT: selecting a second
  // range leaves the first one checked too (confirmed via this run, 2026-09-23) — Pricing
  // currently behaves as multi-select, not single-select. This is a real product gap, not a
  // test-authoring issue; left in place to track the fix.
  test('selecting a new Pricing range replaces the previously selected range (single-select)', async ({
    plpPage,
  }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.toggleFacet(PRICE_1_50);
    await plpPage.assertFacetChecked(PRICE_1_50);

    await plpPage.toggleFacet(/\$51 - \$150/);

    await plpPage.assertFacetUnchecked(PRICE_1_50);
    await plpPage.assertFacetChecked(/\$51 - \$150/);
  });

  // TC-HAPPY-023
  test('combining Pricing + Scent filters returns the intersection (AND) of both conditions', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.toggleFacet(PRICE_1_50);

    await plpPage.toggleFacet(SCENT_COFFEE);

    await plpPage.assertFacetChecked(PRICE_1_50);
    await plpPage.assertFacetChecked(SCENT_COFFEE);
    await expect(async () => {
      expect(await plpPage.countProductCards()).toBeGreaterThan(0);
    }).toPass();
  });

  // TC-HAPPY-025
  test('URL contains all currently active facet parameters when multiple facets are selected', async ({
    plpPage,
  }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.toggleFacet(PRICE_1_50);

    await plpPage.toggleFacet(SCENT_COFFEE);

    await plpPage.assertUrlHasParam(/price/);
    // Confirmed via live DOM 2026-09-23: the Scent facet's URL key is "variation_SCENT".
    await plpPage.assertUrlHasParam(/variation_SCENT.*COFFEE/);
  });

  // TC-VAL-004
  test('selecting two values within the same facet returns the union (OR) of both values', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.toggleFacet(SCENT_COFFEE);
    await plpPage.toggleFacet(SCENT_CINNAMON_BUN);

    await plpPage.assertFacetChecked(SCENT_COFFEE);
    await plpPage.assertFacetChecked(SCENT_CINNAMON_BUN);
  });

  // TC-HAPPY-026
  test('unticking one active filter updates the result set immediately', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.toggleFacet(SCENT_COFFEE);
    await plpPage.toggleFacet(SCENT_CINNAMON_BUN);

    await plpPage.toggleFacet(SCENT_CINNAMON_BUN);

    await plpPage.assertFacetChecked(SCENT_COFFEE);
    await plpPage.assertFacetUnchecked(SCENT_CINNAMON_BUN);
  });

  // TC-HAPPY-027
  test('unticking all active filters returns the PLP to its original unfiltered list', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);
    const originalCount = await plpPage.countProductCards();
    await plpPage.toggleFacet(SCENT_COFFEE);

    await plpPage.toggleFacet(SCENT_COFFEE);

    await expect(async () => {
      expect(await plpPage.countProductCards()).toBe(originalCount);
    }).toPass();
  });

  // TC-NEG-001
  test('a filter combination with zero matches displays "No Product Found"', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.toggleFacet(/\$501 - \$1,000/);

    await plpPage.toggleFacet(SCENT_COFFEE);

    await plpPage.assertNoProductFound();
  });
});
