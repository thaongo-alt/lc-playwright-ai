import path from 'path';
import type { Browser, Page } from '@playwright/test';
import { test, expect, type Pages } from '../fixtures/page-manager.fixture';
import { LoginPage } from '../pages/login.page';
import { CartPage } from '../pages/cart.page';
import { PdpPage } from '../pages/pdp.page';

// Test cases: gen-ai/testcases/lc/lc-storefront-shopping-cart-testcases.md (80 cases).
// Requirement:  gen-ai/requirements/LC-SF-BO/lc-storefront-shopping-cart-requirement.md.
//
// Roles (execution notes of the suite): every Regression = Yes case runs as BOTH a guest and the
// logged-in test customer; the other cases run once (as guest, or as customer when they need a
// multi-product cart). Guest sessions each get their own fresh cart and run in parallel; the
// customer shares one server-side cart, so those tests run one at a time and empty the cart first.
// Known defect F-04 (lc-storefront-checkout-payment-testcases.md): a guest cart keeps only the last
// add — a second product, or re-adding the same SKU, replaces the cart (re-add confirmed live
// 2026-09-25). Guest runs of such cases are marked as expected failures until it is fixed.
//
// Test data confirmed / seeded on UAT on 2026-09-25 (see the data block below).

const GUEST_STATE = path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json');
const CUSTOMER_STATE = path.join(__dirname, '../../.auth/lc-uat-state.json');
const SF_EMAIL = process.env.E2E_USERNAME ?? 'thao.ngo+5@digicommercegroup.com';
const SF_PASSWORD = process.env.E2E_PASSWORD ?? 'Thao@1234';

// key = the SKU the cart shows on the line; lines are matched by it (see CartPage.line()).
type Product = { slug: string; name: string; key: string; options?: string[]; sku?: string };

// D1 — sale item: list CAD 555.00, selling CAD 500.00 (price.spec.ts, slug "normal").
const NORMAL: Product = { slug: 'normal', name: 'Normal Product', key: 'normal' };
const NORMAL_UNIT = 500;
// D2 — simple product, CAD 55.00 (PLP name "ABC En"; the cart shows its French name "ABC fr").
const ABC_EN: Product = { slug: 'abc', name: 'ABC En', key: 'abc' };
// D3 — simple product on the "sweetcandelas" PLP. "Holiday" (the suite's original D3) has stock 0
// in BO and every add is rejected; COCA2 is not in the logged-in customer's catalog. Normal Product
// (simple, in stock, listed for both roles) is used instead.
const SIMPLE_PLP: Product = NORMAL;
// D4 / D5 — Rose Bouquet (LC0003) variants with stock 1 in BO (confirmed 2026-09-25). Note: the
// real variant SKU is LC0003_P_S_hg (not "_bg"), and BO names the variants "Tulip Candela …".
// The PDP resolves a variant asynchronously; openPdp() waits until it shows the variant SKU.
const ROSE: Product = {
  slug: 'LC0003',
  name: 'Rose Bouquet',
  options: ['Pink', 'Strawberries & Cream'],
  sku: 'LC0003_P_S_hg',
  key: 'LC0003_P_S_hg',
};
const ROSE_VARIANT2: Product = {
  slug: 'LC0003',
  name: 'Rose Bouquet',
  options: ['Pink', 'Warm Vanilla Sugar'],
  sku: 'LC0003_P_W_Pz',
  key: 'LC0003_P_W_Pz',
};
// D6 — product with variants on the same PLP ("Tulip Candela", SKU LC0006).
const TULIP_NAME = 'Tulip Candela';
const PLP_CATEGORY = 'sweetcandelas';
// D7 / D8 — seeded in BO on 2026-09-25 by scripts/cart-seed/seed.spec.ts. The cart shows their
// French names ("QA Panier …"), so they are matched by SKU too.
const STOCK5: Product = { slug: 'qacartstock5', name: 'QA Cart Stock5', sku: 'qacartstock5', key: 'qacartstock5' };
const UNLIMITED: Product = { slug: 'qacartunlimited', name: 'QA Cart Unlimited', key: 'qacartunlimited' };

const ADDED_TOAST = 'Product added to cart.';
const REMOVED_TOAST = 'Item removed from cart.';
const addStockToast = (sku: string, stock: number) => `Product with SKU ${sku} is invalid, available stock is ${stock}.`;
const qtyStockToast = (sku: string, stock: number) =>
  `The quantity of product alias sku ${sku} in stock (${stock}) is not enough for the order.`;

const cad = (amount: number) =>
  `CAD ${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const parseCad = (text: string) => Number(text.replace(/[^\d.]/g, ''));

async function openPdp(pdpPage: PdpPage, product: Product, options = product.options): Promise<void> {
  await pdpPage.gotoBySku(product.slug);
  for (const option of options ?? []) await pdpPage.selectVariantOption(option);
  // Add to Cart is enabled before the variant resolves; clicking it earlier adds the parent product
  // and is rejected. The SKU label switching to the variant SKU marks the variant as resolved.
  if (product.options && options === product.options && product.sku) await pdpPage.assertSku(product.sku);
}

// Adds from the PDP and waits for the success toast (Arrange helper).
async function addToCart(pdpPage: PdpPage, product: Product, quantity = 1, options = product.options): Promise<void> {
  await openPdp(pdpPage, product, options);
  if (quantity > 1) await pdpPage.setQuantity(quantity);
  await pdpPage.addToCart();
  await pdpPage.assertAddToCartToastVisible();
}

async function openCartWith(pdpPage: PdpPage, cartPage: CartPage, items: [Product, number][]): Promise<void> {
  for (const [product, quantity] of items) await addToCart(pdpPage, product, quantity);
  await cartPage.goto();
}

// --- Case registry: each case is registered once and expanded per role below. ---

type Role = 'guest' | 'customer';
type Fx = Pick<Pages, 'homePage' | 'pdpPage' | 'plpPage' | 'cartPage' | 'orderSummary' | 'toastPage' | 'loginPage'> & {
  page: Page;
  browser: Browser;
};
type CartCase = {
  id: string;
  title: string;
  regression: boolean;
  // Adds to a cart that already holds items (2+ products, or re-adding a SKU). A guest cart only
  // keeps the last add (known defect F-04), so guest runs of these cases are expected failures.
  accumulates?: boolean;
  // Restricts the case to one role (PERM cases).
  only?: Role;
  run: (fx: Fx) => Promise<void>;
};
const CASES: CartCase[] = [];
const cartCase = (c: CartCase) => CASES.push(c);

function rolesFor(c: CartCase): Role[] {
  if (c.only) return [c.only];
  if (c.regression) return ['guest', 'customer'];
  return c.accumulates ? ['customer'] : ['guest'];
}

// ============================ 2.1 View Cart (LC-324) ============================

cartCase({
  id: 'TC-HAPPY-001', title: 'view cart > the header cart icon opens /cart', regression: true,
  run: async ({ homePage, pdpPage, cartPage }) => {
    await addToCart(pdpPage, NORMAL);
    await homePage.goto();

    await homePage.openCart();

    await cartPage.assertOnCartPage();
    await cartPage.assertLineVisible(NORMAL.key);
  },
});

cartCase({
  id: 'TC-EDGE-001', title: 'view cart > hovering the cart icon opens no mini cart', regression: false,
  run: async ({ homePage, pdpPage, page }) => {
    // Hover does not exist on touch devices and mobile has no header cart icon (the cart is in the
    // hamburger menu), so this case is not applicable to the mobile project.
    test.skip(!!test.info().project.use.isMobile, 'Not applicable on mobile: no hover, no header cart icon');
    await addToCart(pdpPage, NORMAL);
    await homePage.goto();
    const url = page.url();

    await homePage.hoverCart();

    await homePage.assertNoMiniCartOpen();
    await expect(page).toHaveURL(url);
  },
});

cartCase({
  id: 'TC-HAPPY-002', title: 'view cart > every added product is listed exactly once per variant', regression: true, accumulates: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1], [ROSE, 1]]);

    await cartPage.assertLineCount(2);
    await expect(cartPage.line(NORMAL.key)).toHaveCount(1);
    await expect(cartPage.line(ROSE.key)).toHaveCount(1);
    await cartPage.assertLineContains(ROSE.key, 'Pink');
  },
});

cartCase({
  id: 'TC-HAPPY-003', title: 'view cart > lines are listed in the order they were added', regression: false, accumulates: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[ABC_EN, 1], [NORMAL, 1]]);

    const lines = await cartPage.lineTexts();

    expect(lines).toHaveLength(2);
    expect(lines[0]).toContain(ABC_EN.key);
    expect(lines[1]).toContain(NORMAL.key);
  },
});

cartCase({
  id: 'TC-HAPPY-004', title: 'view cart > the badge shows the number of lines, not the total quantity', regression: true, accumulates: true,
  run: async ({ homePage, pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 3], [ABC_EN, 1]]);

    await homePage.assertCartBadgeCount(2);
  },
});

cartCase({
  id: 'TC-HAPPY-005', title: 'view cart > the line product name matches the PDP', regression: false,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);

    await expect(cartPage.lineNameLink(NORMAL.key)).toHaveText(NORMAL.name);
  },
});

cartCase({
  id: 'TC-HAPPY-006', title: 'view cart > the line thumbnail matches the PDP main image', regression: false,
  run: async ({ pdpPage, cartPage }) => {
    await pdpPage.gotoBySku(NORMAL.slug);
    const pdpImage = new URL(await pdpPage.productImageSrc(), 'https://x').pathname.split('/').pop()!;
    await pdpPage.addToCart();
    await pdpPage.assertAddToCartToastVisible();
    await cartPage.goto();

    const cartImage = await cartPage.lineThumbnailSrc(NORMAL.key);

    expect(cartImage).toContain(pdpImage);
  },
});

cartCase({
  id: 'TC-HAPPY-007', title: 'view cart > the line shows the selected variant', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[ROSE, 1]]);

    await cartPage.assertLineContains(ROSE.key, 'Pink');
    await cartPage.assertLineContains(ROSE.key, 'Strawberries & Cream');
  },
});

cartCase({
  id: 'TC-HAPPY-008', title: 'view cart > the line unit price matches the PDP selling price', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);

    await cartPage.assertLineContains(NORMAL.key, cad(NORMAL_UNIT));
  },
});

cartCase({
  id: 'TC-HAPPY-009', title: 'view cart > the line quantity matches the added quantity', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);

    await cartPage.assertLineQuantity(NORMAL.key, 2);
  },
});

cartCase({
  id: 'TC-HAPPY-010', title: 'view cart > line total = unit price × quantity', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 3]]);

    await cartPage.assertLineContains(NORMAL.key, cad(NORMAL_UNIT * 3));
  },
});

cartCase({
  id: 'TC-HAPPY-011', title: 'view cart > clicking the line product name opens the PDP', regression: false,
  run: async ({ pdpPage, cartPage, page }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);

    await cartPage.clickLineName(NORMAL.key);

    await expect(page).toHaveURL(new RegExp(`/product/${NORMAL.slug}`));
  },
});

cartCase({
  id: 'TC-HAPPY-012', title: 'view cart > clicking the line thumbnail opens the PDP', regression: false,
  run: async ({ pdpPage, cartPage, page }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);

    await cartPage.clickLineThumbnail(NORMAL.key);

    await expect(page).toHaveURL(new RegExp(`/product/${NORMAL.slug}`));
  },
});

cartCase({
  id: 'TC-HAPPY-013', title: 'view cart > Subtotal = Σ(unit price × quantity) of all lines', regression: true, accumulates: true,
  run: async ({ pdpPage, cartPage, orderSummary }) => {
    await openPdp(pdpPage, ROSE);
    const rosePrice = parseCad(await pdpPage.readPrice());
    await addToCart(pdpPage, ROSE);
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);
    await orderSummary.waitForLoaded();

    await orderSummary.assertSubtotal(cad(NORMAL_UNIT * 2 + rosePrice));
  },
});

cartCase({
  id: 'TC-HAPPY-014', title: 'view cart > Subtotal uses the sale price, not the list price', regression: true,
  run: async ({ pdpPage, cartPage, orderSummary }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);
    await orderSummary.waitForLoaded();

    await orderSummary.assertSubtotal(cad(NORMAL_UNIT));
  },
});

cartCase({
  id: 'TC-HAPPY-015', title: 'view cart > Subtotal leaves out tax and shipping', regression: true,
  run: async ({ pdpPage, cartPage, orderSummary }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);
    await orderSummary.waitForLoaded();

    await orderSummary.assertSubtotal('CAD 1,000.00');
  },
});

cartCase({
  id: 'TC-VAL-001', title: 'view cart > amounts use CAD, comma thousands separator and 2 decimals', regression: true,
  run: async ({ pdpPage, cartPage, orderSummary }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 3]]);
    await orderSummary.waitForLoaded();

    await cartPage.assertLineContains(NORMAL.key, 'CAD 1,500.00');
    await orderSummary.assertSubtotal('CAD 1,500.00');
  },
});

cartCase({
  id: 'TC-HAPPY-016', title: 'view cart > the empty-cart message is shown when the cart has no items', regression: true,
  run: async ({ homePage, cartPage }) => {
    await homePage.goto();

    await homePage.openCart();

    await cartPage.assertEmptyStateMessage();
  },
});

cartCase({
  id: 'TC-HAPPY-017', title: 'view cart > SHOP NOW on the empty cart goes to /categories', regression: false,
  run: async ({ cartPage, page }) => {
    await cartPage.goto();
    await cartPage.assertEmpty();

    await cartPage.clickShopNow();

    await expect(page).toHaveURL(/\/categories/);
  },
});

cartCase({
  id: 'TC-EDGE-002', title: 'view cart > the empty cart shows no item table, Subtotal or Checkout', regression: true,
  run: async ({ cartPage, orderSummary }) => {
    await cartPage.goto();
    await cartPage.assertEmpty();

    await cartPage.assertNoItemTableOrCheckout();
    await expect(orderSummary.subtotalValue).toHaveCount(0);
  },
});

cartCase({
  id: 'TC-EDGE-003', title: 'view cart > the badge is hidden when the cart is empty', regression: true,
  run: async ({ homePage }) => {
    await homePage.goto();

    await homePage.assertCartBadgeHidden();
  },
});

cartCase({
  id: 'TC-HAPPY-018', title: 'view cart > Continue Shopping on the Cart page goes to /categories', regression: false,
  run: async ({ pdpPage, cartPage, page }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);

    await cartPage.clickContinueShopping();

    await expect(page).toHaveURL(/\/categories/);
  },
});

// ============================ 2.2 Add to Cart (LC-343) ============================

cartCase({
  id: 'TC-HAPPY-019', title: 'add to cart > adding from the PDP shows the success toast', regression: true,
  run: async ({ pdpPage, toastPage }) => {
    await pdpPage.gotoBySku(NORMAL.slug);

    await pdpPage.addToCart();

    await toastPage.assertToastText(ADDED_TOAST);
  },
});

cartCase({
  id: 'TC-HAPPY-020', title: 'add to cart > the PDP item lands in the cart with the chosen variant, quantity and price', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openPdp(pdpPage, ROSE);
    const rosePrice = await pdpPage.readPrice();

    await pdpPage.addToCart();
    await pdpPage.assertAddToCartToastVisible();
    await cartPage.goto();

    await cartPage.assertLineCount(1);
    await cartPage.assertLineContains(ROSE.key, 'Pink');
    await cartPage.assertLineContains(ROSE.key, 'Strawberries & Cream');
    await cartPage.assertLineQuantity(ROSE.key, 1);
    await cartPage.assertLineContains(ROSE.key, rosePrice);
  },
});

cartCase({
  id: 'TC-HAPPY-021', title: 'add to cart > the badge goes up by 1 when an add creates a new line', regression: true, accumulates: true,
  run: async ({ homePage, pdpPage }) => {
    await addToCart(pdpPage, ABC_EN);
    await homePage.assertCartBadgeCount(1);

    await addToCart(pdpPage, NORMAL);

    await homePage.assertCartBadgeCount(2);
  },
});

cartCase({
  id: 'TC-VAL-002', title: 'add to cart > PDP Add to Cart is disabled with no variant option selected', regression: true,
  run: async ({ pdpPage }) => {
    await pdpPage.gotoBySku(ROSE.slug);

    await pdpPage.assertAddToCartDisabled();
  },
});

cartCase({
  id: 'TC-VAL-003', title: 'add to cart > PDP Add to Cart stays disabled with only some variant options selected', regression: true,
  run: async ({ pdpPage }) => {
    await pdpPage.gotoBySku(ROSE.slug);

    await pdpPage.selectVariantOption('Pink');

    await pdpPage.assertAddToCartDisabled();
  },
});

cartCase({
  id: 'TC-HAPPY-022', title: 'add to cart > PDP Add to Cart is enabled once every variant option is selected', regression: true,
  run: async ({ pdpPage }) => {
    await pdpPage.gotoBySku(ROSE.slug);

    await pdpPage.selectVariantOption('Pink');
    await pdpPage.selectVariantOption('Strawberries & Cream');

    await pdpPage.assertAddToCartEnabled();
  },
});

cartCase({
  id: 'TC-HAPPY-023', title: 'add to cart > a simple product card on the PLP shows a stepper and ADD TO CART', regression: true,
  run: async ({ plpPage }) => {
    await plpPage.goto(PLP_CATEGORY);
    await plpPage.goToPageWithProduct(SIMPLE_PLP.name);

    await plpPage.assertProductCardHasQuantityStepper(SIMPLE_PLP.name);
    await plpPage.assertProductCardHasAddToCart(SIMPLE_PLP.name);
  },
});

cartCase({
  id: 'TC-HAPPY-024', title: 'add to cart > adding a simple product from the PLP stays on the PLP', regression: true,
  run: async ({ plpPage, toastPage }) => {
    await plpPage.goto(PLP_CATEGORY);
    await plpPage.goToPageWithProduct(SIMPLE_PLP.name);

    await plpPage.addCardToCart(SIMPLE_PLP.name);

    await toastPage.assertToastText(ADDED_TOAST);
    await plpPage.assertOnCategory(PLP_CATEGORY);
  },
});

cartCase({
  id: 'TC-HAPPY-025', title: 'add to cart > the PLP card stepper quantity is used when adding', regression: true,
  run: async ({ plpPage, toastPage, cartPage }) => {
    await plpPage.goto(PLP_CATEGORY);
    await plpPage.goToPageWithProduct(SIMPLE_PLP.name);
    await plpPage.increaseCardQuantity(SIMPLE_PLP.name);

    await plpPage.addCardToCart(SIMPLE_PLP.name);
    await toastPage.assertToastText(ADDED_TOAST);
    await cartPage.goto();

    await cartPage.assertLineQuantity(SIMPLE_PLP.key, 2);
  },
});

cartCase({
  id: 'TC-HAPPY-026', title: 'add to cart > a variant product card on the PLP shows VIEW DETAIL and no ADD TO CART', regression: true,
  run: async ({ plpPage }) => {
    await plpPage.goto(PLP_CATEGORY);
    await plpPage.goToPageWithProduct(TULIP_NAME);

    await plpPage.assertProductCardHasViewDetail(TULIP_NAME);
    await plpPage.assertProductCardHasNoAddToCart(TULIP_NAME);
    await plpPage.assertProductCardHasNoQuantityStepper(TULIP_NAME);
  },
});

cartCase({
  id: 'TC-HAPPY-027', title: 'add to cart > VIEW DETAIL on a variant product card opens its PDP', regression: false,
  run: async ({ plpPage, pdpPage, page }) => {
    await plpPage.goto(PLP_CATEGORY);
    await plpPage.goToPageWithProduct(TULIP_NAME);

    await plpPage.clickCardViewDetail(TULIP_NAME);

    await expect(page).toHaveURL(/\/product\//);
    await expect(pdpPage.productHeading(TULIP_NAME)).toBeVisible();
  },
});

// TC-EDGE-004 (mobile viewport, no hover) is defined in its own describe block at the bottom.

cartCase({
  id: 'TC-HAPPY-028', title: 'add to cart > re-adding a SKU already in the cart raises its quantity instead of adding a line', regression: true, accumulates: true,
  run: async ({ pdpPage, cartPage }) => {
    await addToCart(pdpPage, NORMAL);

    await addToCart(pdpPage, NORMAL);
    await cartPage.goto();

    await cartPage.assertLineCount(1);
    await cartPage.assertLineQuantity(NORMAL.key, 2);
  },
});

cartCase({
  id: 'TC-HAPPY-029', title: 'add to cart > line total and Subtotal update after a repeat add merges', regression: true, accumulates: true,
  run: async ({ pdpPage, cartPage, orderSummary }) => {
    await addToCart(pdpPage, NORMAL);

    await addToCart(pdpPage, NORMAL);
    await cartPage.goto();
    await orderSummary.waitForLoaded();

    await cartPage.assertLineContains(NORMAL.key, 'CAD 1,000.00');
    await orderSummary.assertSubtotal('CAD 1,000.00');
  },
});

cartCase({
  id: 'TC-HAPPY-030', title: 'add to cart > a different variant of the same product creates a separate line', regression: true, accumulates: true,
  run: async ({ pdpPage, cartPage }) => {
    await addToCart(pdpPage, ROSE);

    await addToCart(pdpPage, ROSE_VARIANT2);
    await cartPage.goto();

    await expect(cartPage.line(ROSE.slug)).toHaveCount(2);
    await cartPage.assertLineVisible(ROSE.key);
    await cartPage.assertLineVisible(ROSE_VARIANT2.key);
  },
});

cartCase({
  id: 'TC-NEG-001', title: 'add to cart > re-adding a stock-1 SKU shows the stock toast and no error page', regression: true, accumulates: true,
  run: async ({ pdpPage, toastPage, page }) => {
    await addToCart(pdpPage, ROSE);
    await openPdp(pdpPage, ROSE);

    await pdpPage.addToCart();

    await toastPage.assertToastText(addStockToast(ROSE.sku!, 1));
    await expect(page).toHaveURL(new RegExp(`/product/${ROSE.slug}`));
    await expect(pdpPage.addToCartButton).toBeVisible();
  },
});

cartCase({
  id: 'TC-NEG-002', title: 'add to cart > the cart quantity is unchanged after a rejected over-stock add', regression: true, accumulates: true,
  run: async ({ pdpPage, toastPage, cartPage }) => {
    await addToCart(pdpPage, ROSE);
    await openPdp(pdpPage, ROSE);
    await pdpPage.addToCart();
    await toastPage.assertToastText(addStockToast(ROSE.sku!, 1));

    await cartPage.goto();

    await cartPage.assertLineQuantity(ROSE.key, 1);
  },
});

cartCase({
  id: 'TC-NEG-003', title: 'add to cart > adding more than stock to an empty cart is rejected', regression: true,
  run: async ({ pdpPage, toastPage, cartPage }) => {
    await openPdp(pdpPage, ROSE);
    await pdpPage.setQuantity(2);

    await pdpPage.addToCart();

    await toastPage.assertToastText(addStockToast(ROSE.sku!, 1));
    await cartPage.goto();
    await cartPage.assertEmpty();
  },
});

cartCase({
  id: 'TC-BOUNDARY-001', title: 'add to cart > an add bringing the quantity exactly to stock is accepted', regression: true, accumulates: true,
  run: async ({ pdpPage, toastPage, cartPage }) => {
    const sku5 = STOCK5;
    await addToCart(pdpPage, sku5, 4);
    await openPdp(pdpPage, sku5);

    await pdpPage.addToCart();

    await toastPage.assertToastText(ADDED_TOAST);
    await cartPage.goto();
    await cartPage.assertLineQuantity(sku5.key, 5);
  },
});

cartCase({
  id: 'TC-NEG-004', title: 'add to cart > an add going over stock is rejected, not capped', regression: true, accumulates: true,
  run: async ({ pdpPage, toastPage, cartPage }) => {
    const sku5 = STOCK5;
    await addToCart(pdpPage, sku5, 4);
    await openPdp(pdpPage, sku5);
    await pdpPage.setQuantity(2);

    await pdpPage.addToCart();

    await toastPage.assertToastText(addStockToast(sku5.sku!, 5));
    await cartPage.goto();
    await cartPage.assertLineQuantity(sku5.key, 4);
  },
});

cartCase({
  id: 'TC-BOUNDARY-002', title: 'add to cart > adding quantity = stock to an empty cart is accepted', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    const sku5 = STOCK5;

    await addToCart(pdpPage, sku5, 5);
    await cartPage.goto();

    await cartPage.assertLineQuantity(sku5.key, 5);
  },
});

cartCase({
  id: 'TC-BOUNDARY-003', title: 'add to cart > adding quantity = stock + 1 to an empty cart is rejected', regression: true,
  run: async ({ pdpPage, toastPage, cartPage }) => {
    const sku5 = STOCK5;
    await openPdp(pdpPage, sku5);
    await pdpPage.setQuantity(6);

    await pdpPage.addToCart();

    await toastPage.assertToastText(addStockToast(sku5.sku!, 5));
    await cartPage.goto();
    await cartPage.assertEmpty();
  },
});

cartCase({
  id: 'TC-EDGE-005', title: 'add to cart > a product with no stock set in PIM accepts quantity 50', regression: false,
  run: async ({ pdpPage, toastPage, cartPage }) => {
    const unlimited = UNLIMITED;
    await openPdp(pdpPage, unlimited);
    await pdpPage.setQuantity(50);

    await pdpPage.addToCart();

    await toastPage.assertToastText(ADDED_TOAST);
    await cartPage.goto();
    await cartPage.assertLineQuantity(unlimited.key, 50);
  },
});

// ============================ 2.3 Delete item (LC-325) ============================

cartCase({
  id: 'TC-HAPPY-031', title: 'delete > the trash icon opens the Remove item confirmation dialog', regression: true, accumulates: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1], [ABC_EN, 1]]);

    await cartPage.clickRemove(NORMAL.key);

    await cartPage.assertRemoveDialog(NORMAL.name);
  },
});

cartCase({
  id: 'TC-HAPPY-032', title: 'delete > Cancel in the dialog keeps the line', regression: false,
  run: async ({ homePage, pdpPage, cartPage, orderSummary }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);
    await orderSummary.waitForLoaded();
    await cartPage.clickRemove(NORMAL.key);

    await cartPage.cancelRemove();

    await cartPage.assertLineQuantity(NORMAL.key, 1);
    await orderSummary.assertSubtotal(cad(NORMAL_UNIT));
    await homePage.assertCartBadgeCount(1);
  },
});

cartCase({
  id: 'TC-HAPPY-033', title: 'delete > Remove deletes the line', regression: true, accumulates: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1], [ABC_EN, 1]]);
    await cartPage.clickRemove(NORMAL.key);

    await cartPage.confirmRemove();

    await cartPage.assertLineAbsent(NORMAL.key);
  },
});

cartCase({
  id: 'TC-HAPPY-034', title: 'delete > removing shows the "Item removed from cart." toast', regression: true,
  run: async ({ pdpPage, cartPage, toastPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);
    await cartPage.clickRemove(NORMAL.key);

    await cartPage.confirmRemove();

    await toastPage.assertToastText(REMOVED_TOAST);
  },
});

cartCase({
  id: 'TC-HAPPY-035', title: 'delete > removing one line leaves the other lines unchanged', regression: true, accumulates: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1], [ABC_EN, 2]]);
    const abcLine = (await cartPage.line(ABC_EN.key).textContent())!;

    await cartPage.removeLine(NORMAL.key);

    await cartPage.assertLineQuantity(ABC_EN.key, 2);
    await expect(cartPage.line(ABC_EN.key)).toHaveText(abcLine);
  },
});

cartCase({
  id: 'TC-STATE-001', title: 'delete > a removed line does not come back after refresh', regression: true, accumulates: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1], [ABC_EN, 1]]);
    await cartPage.removeLine(NORMAL.key);

    await cartPage.reload();

    await cartPage.assertLineAbsent(NORMAL.key);
    await cartPage.assertLineCount(1);
    await cartPage.assertLineVisible(ABC_EN.key);
  },
});

cartCase({
  id: 'TC-HAPPY-036', title: 'delete > Subtotal goes down by exactly the removed line total', regression: true, accumulates: true,
  run: async ({ pdpPage, cartPage, orderSummary }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2], [ABC_EN, 1]]);
    await orderSummary.waitForLoaded();
    const before = parseCad((await orderSummary.subtotalValue.textContent())!);

    await cartPage.removeLine(NORMAL.key);

    await orderSummary.assertSubtotal(cad(before - NORMAL_UNIT * 2));
  },
});

cartCase({
  id: 'TC-HAPPY-037', title: 'delete > the badge goes down by 1 line when a line with quantity 2 is removed', regression: true, accumulates: true,
  run: async ({ homePage, pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2], [ABC_EN, 1]]);
    await homePage.assertCartBadgeCount(2);

    await cartPage.removeLine(NORMAL.key);

    await homePage.assertCartBadgeCount(1);
  },
});

cartCase({
  id: 'TC-EDGE-006', title: 'delete > there is no "Clear cart" action', regression: false, accumulates: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1], [ABC_EN, 1]]);

    await cartPage.assertNoClearCartAction();
    await expect(cartPage.removeRowButtons).toHaveCount(2);
  },
});

cartCase({
  id: 'TC-STATE-002', title: 'delete > removing the last line shows the empty-cart state', regression: true,
  run: async ({ homePage, pdpPage, cartPage, orderSummary }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);

    await cartPage.removeLine(NORMAL.key);

    await cartPage.assertEmptyStateMessage();
    await expect(cartPage.shopNowButton).toBeVisible();
    await cartPage.assertNoItemTableOrCheckout();
    await expect(orderSummary.subtotalValue).toHaveCount(0);
    await homePage.assertCartBadgeHidden();
  },
});

cartCase({
  id: 'TC-STATE-003', title: 'delete > the empty-cart state stays after refresh', regression: true,
  run: async ({ homePage, pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);
    await cartPage.removeLine(NORMAL.key);

    await cartPage.reload();

    await cartPage.assertEmptyStateMessage();
    await homePage.assertCartBadgeHidden();
  },
});

// ============================ 2.4 Adjust Quantity (LC-353) ============================

cartCase({
  id: 'TC-HAPPY-038', title: 'quantity > "+" raises the line quantity by 1', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);

    await cartPage.increaseLineQuantity(NORMAL.key);

    await cartPage.assertLineQuantity(NORMAL.key, 3);
  },
});

cartCase({
  id: 'TC-HAPPY-039', title: 'quantity > "−" lowers the line quantity by 1', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 3]]);

    await cartPage.decreaseLineQuantity(NORMAL.key);

    await cartPage.assertLineQuantity(NORMAL.key, 2);
  },
});

cartCase({
  id: 'TC-HAPPY-040', title: 'quantity > typing a quantity and pressing Enter applies it', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);

    await cartPage.typeLineQuantity(NORMAL.key, '3', 'enter');

    await cartPage.assertLineQuantity(NORMAL.key, 3);
    await cartPage.assertLineContains(NORMAL.key, 'CAD 1,500.00');
  },
});

cartCase({
  id: 'TC-HAPPY-041', title: 'quantity > typing a quantity and clicking outside applies it', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);

    await cartPage.typeLineQuantity(NORMAL.key, '3', 'blur');

    await cartPage.assertLineQuantity(NORMAL.key, 3);
    await cartPage.assertLineContains(NORMAL.key, 'CAD 1,500.00');
  },
});

cartCase({
  id: 'TC-HAPPY-042', title: 'quantity > the line total updates without a page reload', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);
    await cartPage.assertLineContains(NORMAL.key, 'CAD 1,000.00');
    await cartPage.markDocument();

    await cartPage.increaseLineQuantity(NORMAL.key);

    await cartPage.assertLineContains(NORMAL.key, 'CAD 1,500.00');
    await cartPage.assertDocumentNotReloaded();
  },
});

cartCase({
  id: 'TC-HAPPY-043', title: 'quantity > Subtotal updates without a page reload', regression: true, accumulates: true,
  run: async ({ pdpPage, cartPage, orderSummary }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2], [ABC_EN, 1]]);
    await orderSummary.waitForLoaded();
    const before = parseCad((await orderSummary.subtotalValue.textContent())!);
    await cartPage.markDocument();

    await cartPage.increaseLineQuantity(NORMAL.key);

    await orderSummary.assertSubtotal(cad(before + NORMAL_UNIT));
    await cartPage.assertDocumentNotReloaded();
  },
});

cartCase({
  id: 'TC-STATE-004', title: 'quantity > a changed quantity stays after refresh', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);
    await cartPage.increaseLineQuantity(NORMAL.key);
    await cartPage.assertLineQuantity(NORMAL.key, 3);

    await cartPage.reload();

    await cartPage.assertLineQuantity(NORMAL.key, 3);
  },
});

cartCase({
  id: 'TC-BOUNDARY-004', title: 'quantity > "−" at quantity 1 does nothing', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);

    await cartPage.decreaseLineQuantity(NORMAL.key, { force: true });

    await cartPage.assertLineQuantity(NORMAL.key, 1);
    await cartPage.assertLineCount(1);
    await cartPage.assertRemoveDialogHidden();
  },
});

cartCase({
  id: 'TC-VAL-004', title: 'quantity > typing 0 resets the quantity to 1 on blur with no message', regression: true,
  run: async ({ pdpPage, cartPage, page }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);

    await cartPage.typeLineQuantity(NORMAL.key, '0', 'blur');

    await cartPage.assertLineQuantity(NORMAL.key, 1);
    await expect(page.locator('.Toastify__toast')).toHaveCount(0);
  },
});

cartCase({
  id: 'TC-VAL-005', title: 'quantity > typing 0 neither removes the item nor asks to remove it', regression: true,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);

    await cartPage.typeLineQuantity(NORMAL.key, '0', 'blur');

    await cartPage.assertLineVisible(NORMAL.key);
    await cartPage.assertRemoveDialogHidden();
  },
});

cartCase({
  id: 'TC-VAL-006', title: 'quantity > typing a negative value resets the quantity to 1 on blur', regression: true,
  run: async ({ pdpPage, cartPage, page }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);

    await cartPage.typeLineQuantity(NORMAL.key, '-1', 'blur');

    await cartPage.assertLineQuantity(NORMAL.key, 1);
    await expect(page.locator('.Toastify__toast')).toHaveCount(0);
  },
});

cartCase({
  id: 'TC-VAL-007', title: 'quantity > leaving the quantity field empty resets it to 1 on blur', regression: false,
  run: async ({ pdpPage, cartPage, page }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);

    await cartPage.clearLineQuantity(NORMAL.key);
    await cartPage.blurLineQuantity(NORMAL.key);

    await cartPage.assertLineQuantity(NORMAL.key, 1);
    await expect(page.locator('.Toastify__toast')).toHaveCount(0);
  },
});

cartCase({
  id: 'TC-VAL-008', title: 'quantity > letters cannot be typed into the quantity field', regression: false,
  run: async ({ pdpPage, cartPage }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 2]]);

    await cartPage.pressLineQuantityKeys(NORMAL.key, 'abc');

    await expect(cartPage.lineQuantityInput(NORMAL.key)).not.toHaveValue(/[a-z]/i);
    await cartPage.blurLineQuantity(NORMAL.key);
    await expect(cartPage.lineQuantityInput(NORMAL.key)).toHaveValue(/^[1-9]\d*$/);
  },
});

cartCase({
  id: 'TC-BOUNDARY-005', title: 'quantity > "+" can raise the quantity up to stock', regression: true,
  run: async ({ pdpPage, cartPage, page }) => {
    const sku5 = STOCK5;
    await openCartWith(pdpPage, cartPage, [[sku5, 4]]);

    await cartPage.increaseLineQuantity(sku5.key);

    await cartPage.assertLineQuantity(sku5.key, 5);
    await expect(page.locator('.Toastify__toast').filter({ hasText: 'not enough' })).toHaveCount(0);
  },
});

cartCase({
  id: 'TC-BOUNDARY-006', title: 'quantity > "+" at stock is rejected with the stock toast', regression: true,
  run: async ({ pdpPage, cartPage, toastPage }) => {
    const sku5 = STOCK5;
    await openCartWith(pdpPage, cartPage, [[sku5, 5]]);

    await cartPage.increaseLineQuantity(sku5.key);

    await toastPage.assertToastText(qtyStockToast(sku5.sku!, 5));
    await cartPage.assertLineQuantity(sku5.key, 5);
  },
});

cartCase({
  id: 'TC-BOUNDARY-007', title: 'quantity > typing stock + 1 at the stock limit is rejected', regression: true,
  run: async ({ pdpPage, cartPage, toastPage }) => {
    const sku5 = STOCK5;
    await openCartWith(pdpPage, cartPage, [[sku5, 5]]);

    await cartPage.typeLineQuantity(sku5.key, '6', 'blur');

    await toastPage.assertToastText(qtyStockToast(sku5.sku!, 5));
    await cartPage.assertLineQuantity(sku5.key, 5);
  },
});

cartCase({
  id: 'TC-BOUNDARY-008', title: 'quantity > Subtotal reflects only the in-stock quantity after a rejected change', regression: true,
  run: async ({ pdpPage, cartPage, toastPage, orderSummary }) => {
    const sku5 = STOCK5;
    await openCartWith(pdpPage, cartPage, [[sku5, 5]]);
    await orderSummary.waitForLoaded();
    const subtotalAt5 = (await orderSummary.subtotalValue.textContent())!;

    await cartPage.increaseLineQuantity(sku5.key);
    await toastPage.assertToastText(qtyStockToast(sku5.sku!, 5));

    await orderSummary.assertSubtotal(subtotalAt5);
  },
});

cartCase({
  id: 'TC-NEG-005', title: 'quantity > "+" on a stock-1 SKU at quantity 1 shows the stock toast', regression: true,
  run: async ({ pdpPage, cartPage, toastPage }) => {
    await openCartWith(pdpPage, cartPage, [[ROSE, 1]]);

    await cartPage.increaseLineQuantity(ROSE.key);

    await toastPage.assertToastText(qtyStockToast(ROSE.sku!, 1));
    await cartPage.assertLineQuantity(ROSE.key, 1);
  },
});

cartCase({
  id: 'TC-NEG-006', title: 'quantity > typing more than stock on a stock-1 SKU is rejected', regression: true,
  run: async ({ pdpPage, cartPage, toastPage }) => {
    await openCartWith(pdpPage, cartPage, [[ROSE, 1]]);

    await cartPage.typeLineQuantity(ROSE.key, '5', 'blur');

    await toastPage.assertToastText(qtyStockToast(ROSE.sku!, 1));
    await cartPage.assertLineQuantity(ROSE.key, 1);
  },
});

cartCase({
  id: 'TC-EDGE-007', title: 'quantity > a product with no stock set can be raised to 50 in the cart', regression: false,
  run: async ({ pdpPage, cartPage, page }) => {
    const unlimited = UNLIMITED;
    await openPdp(pdpPage, unlimited);
    const unit = parseCad(await pdpPage.readPrice());
    await addToCart(pdpPage, unlimited);
    await cartPage.goto();

    await cartPage.typeLineQuantity(unlimited.key, '50', 'blur');

    await cartPage.assertLineQuantity(unlimited.key, 50);
    await cartPage.assertLineContains(unlimited.key, cad(unit * 50));
    await expect(page.locator('.Toastify__toast').filter({ hasText: 'not enough' })).toHaveCount(0);
  },
});

cartCase({
  id: 'TC-EDGE-008', title: 'quantity > fast repeated "+" clicks give consistent totals', regression: false,
  run: async ({ pdpPage, cartPage, orderSummary }) => {
    await openCartWith(pdpPage, cartPage, [[NORMAL, 1]]);
    await orderSummary.waitForLoaded();

    for (let i = 0; i < 5; i++) await cartPage.increaseLineQuantity(NORMAL.key);
    await pdpPage.page.waitForLoadState('networkidle');

    // Wait until the quantity, line total and Subtotal agree (all updates have settled).
    let quantity = 0;
    await expect(async () => {
      quantity = Number(await cartPage.lineQuantityInput(NORMAL.key).inputValue());
      await expect(cartPage.line(NORMAL.key)).toContainText(cad(quantity * NORMAL_UNIT), { timeout: 1000 });
      await expect(orderSummary.subtotalValue).toHaveText(cad(quantity * NORMAL_UNIT), { timeout: 1000 });
    }).toPass({ timeout: 20_000 });
    await cartPage.reload();
    await cartPage.assertLineQuantity(NORMAL.key, quantity);
  },
});

// ============================ 2.5 Guest vs Logged-in ============================

cartCase({
  id: 'TC-PERM-001', title: 'roles > a guest can add to cart and view the cart', regression: true, only: 'guest',
  run: async ({ pdpPage, cartPage, loginPage }) => {
    await addToCart(pdpPage, NORMAL);

    await cartPage.goto();

    await cartPage.assertLineQuantity(NORMAL.key, 1);
    await expect(loginPage.emailInput).toBeHidden();
  },
});

cartCase({
  id: 'TC-PERM-002', title: 'roles > a logged-in customer can add to cart and view the cart', regression: true, only: 'customer',
  run: async ({ pdpPage, cartPage }) => {
    await addToCart(pdpPage, NORMAL);

    await cartPage.goto();

    await cartPage.assertLineQuantity(NORMAL.key, 1);
  },
});

cartCase({
  id: 'TC-PERM-003', title: 'roles > the guest cart is not merged into the customer cart on login', regression: true, only: 'customer',
  // Runs in the customer group: the beforeEach has emptied the customer's cart.
  run: async ({ browser }) => {
    const guest = await browser.newContext({ storageState: GUEST_STATE });
    try {
      const page = await guest.newPage();
      await addToCart(new PdpPage(page), NORMAL);
      const loginPage = new LoginPage(page);
      await loginPage.goto();
      await loginPage.fillCredentials(SF_EMAIL, SF_PASSWORD);

      await loginPage.submit();
      await loginPage.assertLoginSuccess();

      const cartPage = new CartPage(page);
      await cartPage.goto();
      await cartPage.assertEmpty();
    } finally {
      await guest.close();
    }
  },
});

// ============================ Expand the cases per role ============================

test.describe.configure({ timeout: 90_000 });

test.describe('Shopping cart (guest)', () => {
  // Fresh browser context per test = fresh guest cart, so these are isolated and parallel.
  test.describe.configure({ mode: 'parallel' });
  test.use({ storageState: GUEST_STATE });

  for (const c of CASES.filter((c) => rolesFor(c).includes('guest'))) {
    test(`${c.id} ${c.title} @guest`, async ({ page, browser, homePage, pdpPage, plpPage, cartPage, orderSummary, toastPage, loginPage }) => {
      test.fail(!!c.accumulates, 'Known defect F-04: a guest cart keeps only the last add (a 2nd product or a re-add replaces the cart)');
      await c.run({ page, browser, homePage, pdpPage, plpPage, cartPage, orderSummary, toastPage, loginPage });
    });
  }

  // TC-EDGE-004 — mobile viewport, no hover.
  test.describe('mobile viewport', () => {
    test.use({ viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true });

    test('TC-EDGE-004 add to cart > PLP card buttons are visible without hover @guest', async ({ plpPage }) => {
      await plpPage.goto(PLP_CATEGORY);
    await plpPage.goToPageWithProduct(SIMPLE_PLP.name);

      await plpPage.assertProductCardHasAddToCart(SIMPLE_PLP.name);
      await plpPage.assertProductCardHasQuantityStepper(SIMPLE_PLP.name);
      await plpPage.goto(PLP_CATEGORY);
      await plpPage.goToPageWithProduct(TULIP_NAME);
      await plpPage.assertProductCardHasViewDetail(TULIP_NAME);
    });
  });
});

test.describe('Shopping cart (logged-in customer)', () => {
  // One shared server-side cart: run one at a time (without skipping the rest on a failure).
  test.describe.configure({ mode: 'default' });
  test.use({ storageState: CUSTOMER_STATE });

  test.beforeEach(async ({ cartPage }) => {
    await cartPage.removeAllItems();
  });

  for (const c of CASES.filter((c) => rolesFor(c).includes('customer'))) {
    test(`${c.id} ${c.title} @customer`, async ({ page, browser, homePage, pdpPage, plpPage, cartPage, orderSummary, toastPage, loginPage }) => {
      await c.run({ page, browser, homePage, pdpPage, plpPage, cartPage, orderSummary, toastPage, loginPage });
    });
  }
});
