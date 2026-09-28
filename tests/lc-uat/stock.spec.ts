import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

// Stock test cases (TC-HAPPY-076 .. TC-VAL-019 from
// gen-ai/testcases/lc-storefront-plp-pdp-testcases.md, "Stock" section). Out-of-stock scenarios
// (REQ-STK-02/03/04) are not automated here: no out-of-stock or known-low-stock SKU was
// confirmed to exist in the live UAT catalog during inspection (2026-09-23) — see the test
// suite's Gap Analysis / "Blocked — Test Data Pending" note.
test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json') });

const IN_STOCK_VARIANT_SKU = 'LC001';
const COLOUR = 'Brown & White';
const SCENT = 'Coffee';

test.describe('Stock', () => {
  // TC-HAPPY-076 / TC-HAPPY-077
  test('an in-stock product/variant shows "Status: In stock" and "ADD TO CART" enabled', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(IN_STOCK_VARIANT_SKU);
    await pdpPage.selectVariantOption(COLOUR);
    await pdpPage.selectVariantOption(SCENT);

    await pdpPage.assertStatus('In stock');
    await pdpPage.assertAddToCartEnabled();
  });

  // TC-VAL-019
  test('the PDP displays only the Status label, not the exact stock quantity', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(IN_STOCK_VARIANT_SKU);

    await pdpPage.assertNoExactStockQuantityDisplayed();
  });

  // TC-NEG-005 / TC-NEG-006 / TC-NEG-007 / TC-NEG-008 / TC-VAL-018 / TC-HAPPY-078 —
  // out-of-stock display, disabled ADD TO CART, and re-enabling on an in-stock variant.
  test.fixme('an out-of-stock product/variant shows "Status: Out of stock" and disables ADD TO CART', async () => {});

  // TC-BOUNDARY-004 / TC-BOUNDARY-005 / TC-NEG-009 / TC-HAPPY-079 — max-quantity enforcement
  // against a known stock count (N).
  test.fixme('quantity cannot be incremented or typed past the maximum available stock', async () => {});
});
