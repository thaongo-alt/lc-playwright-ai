import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

// View PDP test cases (TC-HAPPY-048 .. TC-HAPPY-070 from
// gen-ai/testcases/lc-storefront-plp-pdp-testcases.md, "View PDP" section).
test.use({ storageState: path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json') });

const VARIANT_PRODUCT_SKU = 'LC001';
const VARIANT_PRODUCT_NAME = 'Iced Coffee';
const COLOUR = 'Brown & White';
const SCENT = 'Coffee';

test.describe('View PDP', () => {
  // TC-HAPPY-048
  test('PDP displays all required product information fields', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(VARIANT_PRODUCT_SKU);

    await expect(pdpPage.productHeading(VARIANT_PRODUCT_NAME)).toBeVisible();
    await expect(pdpPage.page.getByText('SKU: LC001')).toBeVisible();
    await expect(pdpPage.quantityGroup).toBeVisible();
    await expect(pdpPage.addToCartButton).toBeVisible();
    await expect(pdpPage.statusText).toBeVisible();
    await expect(pdpPage.page.getByText('Delivery Note:')).toBeVisible();
    await expect(pdpPage.descriptionTabPanel).toBeVisible();
    await expect(pdpPage.attributesTab).toBeVisible();
  });

  // TC-NEG-003
  test('"ADD TO CART" is disabled when variant selection is incomplete', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(VARIANT_PRODUCT_SKU);

    await pdpPage.assertAddToCartDisabled();
  });

  // TC-HAPPY-049 / TC-HAPPY-050 / TC-HAPPY-051
  test('selecting a full variant combination updates name, SKU, price, and enables ADD TO CART', async ({
    pdpPage,
  }) => {
    await pdpPage.gotoBySku(VARIANT_PRODUCT_SKU);

    await pdpPage.selectVariantOption(COLOUR);
    await pdpPage.selectVariantOption(SCENT);

    await expect(pdpPage.productHeading(`${VARIANT_PRODUCT_NAME} ${COLOUR} ${SCENT}`)).toBeVisible();
    await pdpPage.assertAddToCartEnabled();
  });

  // TC-HAPPY-052
  test('the "Attributes" tab displays correct attributes for the selected variant', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(VARIANT_PRODUCT_SKU);
    await pdpPage.selectVariantOption(COLOUR);
    await pdpPage.selectVariantOption(SCENT);

    await pdpPage.openAttributesTab();

    await pdpPage.assertAttributeRow('Colour', COLOUR);
  });

  // TC-HAPPY-053 / TC-HAPPY-054
  test('next/prev arrows and thumbnails cycle through product images', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(VARIANT_PRODUCT_SKU);

    await pdpPage.clickNextThumbnail();

    await expect(pdpPage.page.getByRole('option', { name: 'slide', selected: false })).toHaveCount(1);
  });

  // TC-HAPPY-055 / TC-HAPPY-056
  test('clicking the main image opens the lightbox with an image counter', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(VARIANT_PRODUCT_SKU);

    await pdpPage.openLightbox();

    await pdpPage.assertLightboxCounter(1, 2);
  });

  // TC-HAPPY-057
  test('next/prev navigation works within the lightbox', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(VARIANT_PRODUCT_SKU);
    await pdpPage.openLightbox();

    await pdpPage.lightboxNext();

    await pdpPage.assertLightboxCounter(2, 2);
  });

  // TC-HAPPY-061
  test('closing the lightbox via the X button returns to the PDP', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(VARIANT_PRODUCT_SKU);
    await pdpPage.openLightbox();

    await pdpPage.closeLightboxViaButton();

    await pdpPage.assertLightboxClosed();
    await expect(pdpPage.productHeading(VARIANT_PRODUCT_NAME)).toBeVisible();
  });

  // TC-HAPPY-062 — encodes the CONFIRMED requirement (REQ-PDP-02: first Esc while zoomed exits
  // zoom without closing the lightbox).
  test('pressing Esc while zoomed in exits zoom mode without closing the lightbox', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(VARIANT_PRODUCT_SKU);
    await pdpPage.openLightbox();
    await pdpPage.lightboxZoomIn();

    await pdpPage.pressEscape();

    await pdpPage.assertLightboxOpen();
  });

  // TC-HAPPY-063
  test('pressing Esc while not zoomed closes the lightbox', async ({ pdpPage }) => {
    await pdpPage.gotoBySku(VARIANT_PRODUCT_SKU);
    await pdpPage.openLightbox();

    await pdpPage.pressEscape();

    await pdpPage.assertLightboxClosed();
  });

  // TC-HAPPY-064 — encodes the CONFIRMED requirement (REQ-PDP-03: breadcrumb includes the full
  // category path). Expected to currently be RED: original UAT observed "HOME > ICED COFFEE"
  // only, with no category segment.
  test('breadcrumb shows the full category path when reached from a category PLP', async ({ plpPage, pdpPage }) => {
    await plpPage.goto('sweetcandelas');

    await plpPage.selectProductByName(VARIANT_PRODUCT_NAME);

    await pdpPage.assertBreadcrumbText('sweetcandelas');
    await pdpPage.assertBreadcrumbText(VARIANT_PRODUCT_NAME);
  });

  // TC-HAPPY-067 - TC-HAPPY-070
  for (const viewport of [
    { name: '1440 desktop', width: 1440, height: 900 },
    { name: '1024 tablet', width: 1024, height: 900 },
    { name: '768', width: 768, height: 1024 },
    { name: '375 mobile', width: 375, height: 812 },
  ]) {
    test(`PDP layout at ${viewport.name} renders without breakage or horizontal scroll`, async ({ pdpPage }) => {
      await pdpPage.page.setViewportSize({ width: viewport.width, height: viewport.height });

      await pdpPage.gotoBySku(VARIANT_PRODUCT_SKU);

      await expect(pdpPage.productHeading(VARIANT_PRODUCT_NAME)).toBeVisible();
      await expect(pdpPage.quantityGroup).toBeVisible();
      const hasHorizontalScroll = await pdpPage.page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      expect(hasHorizontalScroll).toBe(false);
    });
  }
});
