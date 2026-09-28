import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

// Sort PLP test cases (TC-HAPPY-041 .. TC-HAPPY-047 from
// gen-ai/testcases/lc-storefront-plp-pdp-testcases.md, "Sort PLP" section).
test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json') });

const CATEGORY_SLUG = 'sweetcandelas';

// Two multi-number price formats exist (confirmed via live DOM 2026-09-23), each sorted by a
// different one of its two numbers:
// - Sale products concatenate both prices with no separator (e.g. "CAD 555.00CAD 500.00" —
//   original struck-through, then the active sale price) and are sorted by the LAST number.
// - Variant price ranges use a " - " separator (e.g. "CAD 20.00 - CAD 26.00") and are sorted by
//   the FIRST (minimum) number.
function extractPrices(priceTexts: string[]): number[] {
  return priceTexts.map((t) => {
    const matches = [...t.matchAll(/CAD\s*([\d,]+\.\d{2})/g)];
    const chosen = t.includes(' - ') ? matches[0] : matches[matches.length - 1];
    return Number(chosen[1].replace(',', ''));
  });
}

test.describe('Sort PLP', () => {
  // TC-HAPPY-041
  test('selecting "Price: Low to High" sorts the list in ascending price order', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.selectSort('Price: Low to High');

    await expect(async () => {
      const prices = extractPrices(await plpPage.page.locator('.price-text').allTextContents());
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1]);
      }
    }).toPass();
  });

  // TC-HAPPY-042
  test('the URL reflects sorted=price-asc after ascending sort is selected', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.selectSort('Price: Low to High');

    await plpPage.assertSortUrlParam('price-asc');
  });

  // TC-VAL-009 — currently RED against live UAT: page 2 of an ascending-sorted list is not
  // actually in ascending order relative to page 1 (confirmed 2026-09-23 — e.g. a CAD 99.00 item
  // and several sale-priced items appear on page 2 out of sequence, alongside a cluster of
  // CAD 6.99 items). This looks like a real cross-page sort-consistency defect, not a test issue
  // — not previously called out in the source UAT notes. Left in place to track the fix.
  test('ascending sort order is consistent across pages', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.selectSort('Price: Low to High');
    await plpPage.assertSortUrlParam('price-asc');

    let page1Prices: number[] = [];
    await expect(async () => {
      page1Prices = extractPrices(await plpPage.page.locator('.price-text').allTextContents());
      expect(page1Prices.length).toBeGreaterThan(0);
    }).toPass();
    const lastOfPage1 = page1Prices[page1Prices.length - 1];

    await plpPage.goToPage(2);
    await plpPage.assertCurrentPage(2);

    await expect(async () => {
      const page2Prices = extractPrices(await plpPage.page.locator('.price-text').allTextContents());
      expect(page2Prices.length).toBeGreaterThan(0);
      expect(page2Prices[0]).toBeGreaterThanOrEqual(lastOfPage1);
    }).toPass();
  });

  // TC-HAPPY-043
  test('selecting "Price: High to Low" sorts the list in descending price order', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.selectSort('Price: High to Low');

    await expect(async () => {
      const prices = extractPrices(await plpPage.page.locator('.price-text').allTextContents());
      for (let i = 1; i < prices.length; i++) {
        expect(prices[i]).toBeLessThanOrEqual(prices[i - 1]);
      }
    }).toPass();
  });

  // TC-HAPPY-044
  test('the URL reflects sorted=price-desc after descending sort is selected', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);

    await plpPage.selectSort('Price: High to Low');

    await plpPage.assertSortUrlParam('price-desc');
  });

  // TC-HAPPY-046
  test('changing/removing a filter while a sort is active retains the active sort', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.selectSort('Price: High to Low');
    await plpPage.toggleFacet(/^COFFEE/);

    await plpPage.toggleFacet(/^COFFEE/);

    await plpPage.assertSortUrlParam('price-desc');
  });

  // TC-HAPPY-047
  test('reloading the PLP page retains both the active filter and sort selections', async ({ plpPage }) => {
    await plpPage.goto(CATEGORY_SLUG);
    await plpPage.selectSort('Price: High to Low');
    await plpPage.toggleFacet(/^COFFEE/);

    await plpPage.page.reload({ waitUntil: 'domcontentloaded' });

    await plpPage.assertSortUrlParam('price-desc');
    await plpPage.assertFacetChecked(/^COFFEE/);
  });
});
