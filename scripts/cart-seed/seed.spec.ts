import { test, expect } from '@playwright/test';
import { ProductListPage } from '../../tests/pages/product-list.page';
import { ProductFormPage } from '../../tests/pages/product-form.page';

// Seeds the shopping-cart suite's BO test data (idempotent: skips a product that already exists).
//   D7: QA Cart Stock5    (SKU qacartstock5,    CAD 20.00, stock 5 in WareHouse)
//   D8: QA Cart Unlimited (SKU qacartunlimited, CAD 30.00, no stock row = unlimited)
// Run: npx playwright test -c scripts/cart-seed/pw.config.ts seed.spec.ts
test.use({ storageState: 'C:/ai-zone/e2e-tests/.auth/lc-uat-bo-state.json' });

const PRODUCTS = [
  { en: 'QA Cart Stock5', fr: 'QA Panier Stock5', sku: 'qacartstock5', price: '20', stock: '5' },
  { en: 'QA Cart Unlimited', fr: 'QA Panier Illimite', sku: 'qacartunlimited', price: '30', stock: undefined },
];

for (const p of PRODUCTS) {
  test(`seed ${p.sku}`, async ({ page }) => {
    const list = new ProductListPage(page);
    const form = new ProductFormPage(page);
    await list.goto();
    await list.searchByKeyword(p.en);
    await page.waitForLoadState('networkidle');
    if ((await page.locator('.MuiCard-root').filter({ hasText: p.sku }).count()) > 0) {
      console.log(`EXISTS ${p.sku}`);
      return;
    }
    await list.clickCreateProduct();
    await form.fillNameDefault(p.fr);
    await form.fillNameEnglish(p.en);
    await form.fillDescriptionDefault(`${p.fr} description`);
    await form.fillDescriptionEnglish(`${p.en} description`);
    await form.fillSku(p.sku);
    await form.fillCost('5');
    await form.fillPrice(p.price);
    if (p.stock) await form.addStock('WareHouse', p.stock);
    await form.submitCreate();
    // A "Confirm Save" modal may gate the save (see create-product requirement AC2.18).
    const confirm = page.getByRole('dialog').getByRole('button', { name: 'Save' });
    await expect(confirm.or(page.getByText('Product created', { exact: false }))).toBeVisible({ timeout: 15000 }).catch(() => {});
    if (await confirm.isVisible()) await confirm.click();
    await form.assertRedirectedToProductList();
    console.log(`CREATED ${p.sku}`);
  });
}
