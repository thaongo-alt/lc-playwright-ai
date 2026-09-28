import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';
import { StorefrontOrderDetailPage } from '../pages/sf-order-detail.page';
import { OrderPdf } from '../utils/order-pdf';

// Test cases: gen-ai/testcases/lc/lc-storefront-order-detail-pdf-testcases.md (v1).
// Requirement:  gen-ai/requirements/LC-SF-BO/lc-storefront-order-detail-pdf-requirement.md.
//
// Test data (G03, resolved live 2026-09-28): every order below belongs to the shared test account
// thao.ngo+5@digicommercegroup.com (the auth.setup SF login), except #4584 / #4401 (other customers).
// Amounts are shown with the "CAD " prefix on UAT. Existing orders are used instead of placing new
// ones: #4602 matches ORD-DISC exactly, and #4468 (2 lines) replaces ORD-ROUND for the rounding and
// multi-line cases.
const CUSTOMER_STATE = path.join(__dirname, '../../.auth/lc-uat-state.json');
const GUEST_STATE = path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json');

const ORD_COD = {
  id: '4608',
  status: 'Order Placed',
  listStatus: 'Order placed',
  date: 'Sep 25, 2026',
  payment: 'Cash On Delivery (COD)',
  instructions: 'QA test COD - leave at door',
  recipient: 'QA Claude',
  address: ['1000 Rue De La Gauchetiere', 'Quebec', 'Montréal', 'Canada'],
  postalCode: 'H3B 2Y5',
  email: 'qa-claude@digicommercegroup.com',
  phone: '+1 (123) 456-7890',
  item: { name: 'QA Bougie A', sku: 'QACANDLEA', unitPrice: 'CAD 40.00', quantity: 2, lineTotal: 'CAD 80.00' },
  subtotal: 'CAD 80.00',
  taxLabel: 'Tax (14.975%)',
  tax: 'CAD 11.98', // 80.00 × 14.975% = 11.98
  discount: 'CAD 0.00',
  total: 'CAD 91.98',
};
const ORD_OPEN = { id: '4606', status: 'Open' };
const ORD_PAID = { id: '4605', status: 'Paid' };
const ORD_CANCEL = { id: '4430', status: 'Cancelled' };
const ORD_NOINSTR = '4607';
const ORD_DISC = { id: '4602', subtotal: 'CAD 40.00', tax: 'CAD 5.99', discount: 'CAD 4.00', total: 'CAD 41.99' }; // tax on 40.00, not 36.00
// 1,238.00 × 14.975% = 185.3905 → 185.39 (rounds down)
const ORD_ROUND = {
  id: '4468',
  subtotal: 'CAD 1,238.00',
  tax: 'CAD 185.39',
  total: 'CAD 1,423.39',
  items: [
    { sku: 'normal', unitPrice: 'CAD 500.00', quantity: 1, lineTotal: 'CAD 500.00' },
    { sku: 'abc_1788412021356', unitPrice: 'CAD 123.00', quantity: 6, lineTotal: 'CAD 738.00' },
  ],
};
// Personal data of the other customers' orders (seen via the IDOR on 2026-09-28).
const OTHER_ORDERS = [
  { id: '4584', personalData: ['QA Guest', '1250 Rue Sainte-Catherine O', 'guest.lc+checkout@test.com', '+1 (514) 555-1234'] },
  { id: '4401', personalData: [] as string[] },
];
const NOT_FOUND_ID = '999999';
const NON_NUMERIC_ID = 'abc';

test.describe.configure({ timeout: 60_000 });

test.describe('Order Detail & PDF (guest)', () => {
  test.use({ storageState: GUEST_STATE });

  test('TC-PERM-001 order detail > a guest opening an Order Detail URL is redirected to Login', async ({ page, loginPage }) => {
    await page.goto(`https://lc-uat.digicommerce.cloud/my-account/orders/${ORD_COD.id}`);

    await loginPage.assertOnLoginPage();
    await expect(page.getByText(ORD_COD.recipient)).toHaveCount(0);
  });

  test('TC-PERM-002 order detail > a guest opening the Order History list is redirected to Login', async ({ page, loginPage }) => {
    await page.goto('https://lc-uat.digicommerce.cloud/my-account/orders');

    await loginPage.assertOnLoginPage();
  });

  test('TC-PERM-003 order pdf > the PDF endpoint returns 401 without a login token', async ({ storefrontOrderDetailPage }) => {
    const { status, pdf } = await storefrontOrderDetailPage.requestPdf(ORD_COD.id, { authenticated: false });

    expect(status).toBe(401);
    expect(pdf).toBeUndefined();
  });
});

test.describe('Order Detail & PDF (registered customer)', () => {
  test.use({ storageState: CUSTOMER_STATE });

  test.describe('Permission', () => {
    for (const other of OTHER_ORDERS) {
      const permId = other.id === '4584' ? 'TC-PERM-004' : 'TC-PERM-005';
      test(`${permId} order detail > a customer cannot view another customer's order #${other.id}`, async ({
        storefrontOrderDetailPage,
        toastPage,
      }) => {
        test.fail(true, "Known defect D-01: the server returns another customer's order (IDOR)");
        await storefrontOrderDetailPage.open(other.id);

        await toastPage.assertToastText(`Order with id ${other.id} not found`);
        await storefrontOrderDetailPage.assertNoneVisible([`#${other.id}`, ...other.personalData]);
      });
    }

    test("TC-PERM-006 order pdf > a customer cannot download another customer's order PDF", async ({ storefrontOrderDetailPage }) => {
      test.fail(true, "Known defect D-01: the PDF endpoint also returns another customer's order (IDOR)");
      await storefrontOrderDetailPage.open(ORD_COD.id); // loads the SF session cookies into the request context

      const { pdf } = await storefrontOrderDetailPage.requestPdf('4584', { authenticated: true });

      // G05: the status code is not specified; only "no PDF of that order" is asserted.
      expect(pdf).toBeUndefined();
    });

    test('TC-PERM-007 order detail > a customer can view their own order', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.open(ORD_COD.id);

      await storefrontOrderDetailPage.assertOrderId(`#${ORD_COD.id}`);
    });
  });

  test.describe('Navigation', () => {
    test('TC-HAPPY-001 order detail > clicking the Order ID in the list opens the Order Detail page', async ({
      orderHistoryPage,
      storefrontOrderDetailPage,
    }) => {
      await orderHistoryPage.goto();

      await orderHistoryPage.openOrder(ORD_COD.id);

      await storefrontOrderDetailPage.assertOnOrder(ORD_COD.id);
    });

    test('TC-HAPPY-002 order detail > Actions > View Details opens the Order Detail page', async ({
      orderHistoryPage,
      storefrontOrderDetailPage,
    }) => {
      await orderHistoryPage.goto();

      await orderHistoryPage.viewDetails(ORD_COD.id);

      await storefrontOrderDetailPage.assertOnOrder(ORD_COD.id);
    });

    test('TC-HAPPY-003 order detail > View Details is the only option in the Actions menu', async ({ orderHistoryPage }) => {
      await orderHistoryPage.goto();

      await orderHistoryPage.assertActionsMenuOptions(ORD_COD.id, ['View Details']);
    });

    test('TC-HAPPY-004 order detail > the breadcrumb shows Home > Orders > {id}', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.goto(ORD_COD.id);

      await storefrontOrderDetailPage.assertBreadcrumb(['Home', 'Orders', ORD_COD.id]);
    });

    test('TC-HAPPY-005 order detail > Back to Orders returns to the Order History list', async ({ page, storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.goto(ORD_COD.id);

      await storefrontOrderDetailPage.backToOrders();

      await expect(page).toHaveURL(/\/my-account\/orders$/);
    });
  });

  test.describe('Content (#4608)', () => {
    test.beforeEach(async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.goto(ORD_COD.id);
    });

    test('TC-HAPPY-006 order detail > Order Info shows the Order ID', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertOrderId(`#${ORD_COD.id}`);
    });

    test('TC-HAPPY-007 order detail > Order Info shows the status "Order Placed"', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertStatus(ORD_COD.status);
    });

    test('TC-HAPPY-008 order detail > Order Info shows the Order Date in short format', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertOrderDate(ORD_COD.date);
    });

    test('TC-HAPPY-009 order detail > Order Info shows the payment method for a COD order', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertPaymentMethod(ORD_COD.payment);
    });

    test('TC-HAPPY-011 order detail > Delivery Instructions shows the text entered at checkout', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertDeliveryInstructions(ORD_COD.instructions);
    });

    test('TC-HAPPY-012 order detail > Shipping Address shows name, street, province, city and country', async ({
      storefrontOrderDetailPage,
    }) => {
      for (const part of [ORD_COD.recipient, ...ORD_COD.address]) {
        await storefrontOrderDetailPage.assertShippingDetailsContain(part);
      }
    });

    test('TC-HAPPY-013 order detail > Shipping Address shows the customer email', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertEmail(ORD_COD.email);
    });

    test('TC-HAPPY-014 order detail > the phone number is shown as +1 (XXX) XXX-XXXX', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertPhone(ORD_COD.phone);
    });

    test('TC-HAPPY-015 order detail > no postal code is shown', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertShippingDetailsNotContain(ORD_COD.postalCode);
    });

    test('TC-HAPPY-016 order detail > the Order Summary shows the Sub Total', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertSubtotal(ORD_COD.subtotal);
    });

    test('TC-HAPPY-017 order detail > the Order Summary shows a Shipping fee line', async ({ storefrontOrderDetailPage }) => {
      test.fail(true, 'Known defect D-02: the Order Summary has no Shipping fee line (value pending G01)');
      await storefrontOrderDetailPage.assertShippingFeeLineVisible();
    });

    test('TC-HAPPY-018 order detail > the Tax line shows the tax rate', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertTaxLabel(ORD_COD.taxLabel);
    });

    test('TC-HAPPY-019 order detail > the Order Summary shows the Discount', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertDiscount(ORD_COD.discount);
    });

    test("TC-HAPPY-020 order detail > the Items table shows the line's name, SKU, unit price, qty and total", async ({
      storefrontOrderDetailPage,
    }) => {
      await storefrontOrderDetailPage.assertItemName(ORD_COD.item.sku, ORD_COD.item.name);
      await storefrontOrderDetailPage.assertItem(ORD_COD.item);
    });

    test('TC-HAPPY-021 order detail > the Items table shows a product image', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertItemHasImage(ORD_COD.item.sku);
    });

    test('TC-HAPPY-022 order detail > the Download Order button is shown', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertDownloadButtonEnabled();
    });

    test('TC-HAPPY-023 order detail > Tax = Sub Total × 14.975% (no discount)', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.assertTax(ORD_COD.tax);
    });

    test('TC-HAPPY-024 order detail > Total = Sub Total + Shipping + Tax − Discount (no discount)', async ({
      storefrontOrderDetailPage,
    }) => {
      await storefrontOrderDetailPage.assertTotal(ORD_COD.total);
    });
  });

  test.describe('Content (other orders)', () => {
    test('TC-HAPPY-010 order detail > Order Info shows the payment method for a PayPal order', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.goto(ORD_PAID.id);

      await storefrontOrderDetailPage.assertPaymentMethod(/PayPal/); // exact label pending G04 (UAT: "Pay with PayPal")
    });

    test('TC-EDGE-001 order detail > Delivery Instructions stays blank when none were entered', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.goto(ORD_NOINSTR);

      await storefrontOrderDetailPage.assertDeliveryInstructionsEmpty();
    });

    test('TC-EDGE-002 order history > the list shows the status in lower case ("Order placed")', async ({ orderHistoryPage }) => {
      await orderHistoryPage.goto();

      await orderHistoryPage.assertOrderStatus(ORD_COD.id, ORD_COD.listStatus);
    });
  });

  test.describe('Calculation', () => {
    test('TC-BOUNDARY-001 order detail > Tax is rounded to the cent (round-down case)', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.goto(ORD_ROUND.id);

      await storefrontOrderDetailPage.assertSubtotal(ORD_ROUND.subtotal);
      await storefrontOrderDetailPage.assertTax(ORD_ROUND.tax);
    });

    test('TC-HAPPY-025 order detail > Tax is calculated on the Sub Total before the discount', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.goto(ORD_DISC.id);

      await storefrontOrderDetailPage.assertSubtotal(ORD_DISC.subtotal);
      await storefrontOrderDetailPage.assertDiscount(ORD_DISC.discount);
      await storefrontOrderDetailPage.assertTax(ORD_DISC.tax);
    });

    test('TC-HAPPY-026 order detail > the Discount is subtracted from the Total', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.goto(ORD_DISC.id);

      await storefrontOrderDetailPage.assertTotal(ORD_DISC.total);
    });

    test('TC-BOUNDARY-002 order detail > the Total includes the rounded tax', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.goto(ORD_ROUND.id);

      await storefrontOrderDetailPage.assertTotal(ORD_ROUND.total);
    });

    test('TC-BOUNDARY-003 order detail > each line total equals unit price × qty on a multi-line order', async ({
      storefrontOrderDetailPage,
    }) => {
      await storefrontOrderDetailPage.goto(ORD_ROUND.id);

      for (const item of ORD_ROUND.items) {
        await storefrontOrderDetailPage.assertItem(item);
      }
    });

    test.fixme('TC-BOUNDARY-004 order detail > the Total includes a non-zero shipping fee (pending G01: no shipping fee in scope)', async () => {});
  });

  test.describe('Error states', () => {
    test('TC-NEG-001 order detail > a not-found toast is shown for a non-existent order ID', async ({ storefrontOrderDetailPage, toastPage }) => {
      await storefrontOrderDetailPage.open(NOT_FOUND_ID);

      await toastPage.assertToastText(`Order with id ${NOT_FOUND_ID} not found`);
    });

    test('TC-NEG-002 order detail > no order data is rendered for a non-existent order ID', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.open(NOT_FOUND_ID);

      await storefrontOrderDetailPage.assertOrderId('#');
    });

    test('TC-NEG-003 order detail > an error toast is shown for a non-numeric order ID', async ({ storefrontOrderDetailPage, toastPage }) => {
      await storefrontOrderDetailPage.open(NON_NUMERIC_ID);

      await toastPage.assertToastText('NumberFormatException');
    });

    test('TC-NEG-004 order detail > the Order ID shows "#0" for a non-numeric order ID', async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.open(NON_NUMERIC_ID);

      await storefrontOrderDetailPage.assertOrderId('#0');
    });
  });

  test.describe('Download by status', () => {
    test('TC-STATE-001 order pdf > an "Order Placed" order can be downloaded', async ({ storefrontOrderDetailPage }, testInfo) => {
      await storefrontOrderDetailPage.goto(ORD_COD.id);

      const pdf = await downloadPdf(storefrontOrderDetailPage, testInfo.outputPath('order.pdf'));

      pdf.assertContains(ORD_COD.id);
    });

    for (const [caseId, order] of [
      ['TC-STATE-002', ORD_OPEN],
      ['TC-STATE-005', ORD_CANCEL],
    ] as const) {
      test(`${caseId} order pdf > the Download Order button is shown on an "${order.status}" order`, async ({ storefrontOrderDetailPage }) => {
        await storefrontOrderDetailPage.goto(order.id);

        await storefrontOrderDetailPage.assertDownloadButtonEnabled();
      });
    }

    for (const [caseId, order] of [
      ['TC-STATE-003', ORD_OPEN],
      ['TC-STATE-004', ORD_PAID],
      ['TC-STATE-006', ORD_CANCEL],
    ] as const) {
      test(`${caseId} order pdf > an "${order.status}" order can be downloaded`, async ({ storefrontOrderDetailPage }, testInfo) => {
        await storefrontOrderDetailPage.goto(order.id);

        const pdf = await downloadPdf(storefrontOrderDetailPage, testInfo.outputPath('order.pdf'));

        pdf.assertContains(`Status: ${order.status}`);
      });
    }
  });

  test.describe('Download mechanics', () => {
    test.beforeEach(async ({ storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.goto(ORD_COD.id);
    });

    test('TC-HAPPY-027 order pdf > the file is named Order_{id}.pdf', async ({ storefrontOrderDetailPage }) => {
      const download = await storefrontOrderDetailPage.downloadOrder();

      expect(download.suggestedFilename()).toBe(`Order_${ORD_COD.id}.pdf`);
    });

    test('TC-HAPPY-028 order pdf > the PDF is saved straight away without a preview', async ({ page, storefrontOrderDetailPage }) => {
      await storefrontOrderDetailPage.downloadOrder();

      expect(page.context().pages()).toHaveLength(1);
      await expect(page).toHaveURL(new RegExp(`/my-account/orders/${ORD_COD.id}$`));
    });

    test('TC-HAPPY-029 order pdf > the Download button calls the PDF endpoint (200, application/octet-stream)', async ({
      storefrontOrderDetailPage,
    }) => {
      const { response } = await storefrontOrderDetailPage.downloadOrderWithResponse(ORD_COD.id);

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('application/octet-stream');
    });

    test('TC-HAPPY-030 order pdf > the PDF document title is "Order Confirmation - Liana\'s Candelas"', async ({
      storefrontOrderDetailPage,
    }, testInfo) => {
      const pdf = await downloadPdf(storefrontOrderDetailPage, testInfo.outputPath('order.pdf'));

      expect(pdf.title).toBe("Order Confirmation - Liana's Candelas");
    });
  });

  // One download of Order_4608.pdf, compared field by field with the #4608 page (the reference).
  test.describe('PDF matches the Order Detail page (#4608)', () => {
    let pdf: OrderPdf;

    test.beforeAll(async ({ browser }, testInfo) => {
      const context = await browser.newContext({ storageState: CUSTOMER_STATE, acceptDownloads: true });
      const detail = new StorefrontOrderDetailPage(await context.newPage());
      await detail.goto(ORD_COD.id);
      pdf = await downloadPdf(detail, testInfo.outputPath(`Order_${ORD_COD.id}.pdf`));
      await context.close();
    });

    test('TC-HAPPY-031 order pdf > the header shows the brand name and document heading', async () => {
      pdf.assertContains("LIANA'S CANDELAS");
      pdf.assertContains('Order Confirmation');
    });

    test('TC-HAPPY-032 order pdf > the PDF shows the same Order # as the page', async () => {
      pdf.assertContains(`Order #: ${ORD_COD.id}`);
    });

    test("TC-HAPPY-033 order pdf > the Order Date uses the page's format", async () => {
      test.fail(true, 'Known defect D-03: the PDF shows "September 25, 2026"');
      pdf.assertContains(`Order Date: ${ORD_COD.date}`);
    });

    test('TC-HAPPY-034 order pdf > the PDF shows the same Status as the page', async () => {
      pdf.assertContains(`Status: ${ORD_COD.status}`);
    });

    test('TC-HAPPY-035 order pdf > the PDF shows the same Payment method as the page', async () => {
      pdf.assertContains(`Payment: ${ORD_COD.payment}`);
    });

    test('TC-HAPPY-036 order pdf > the Shipping Address does not show the postal code', async () => {
      test.fail(true, 'Known defect D-04: the PDF shows the postal code');
      for (const part of [ORD_COD.recipient, ...ORD_COD.address]) pdf.assertContains(part);
      pdf.assertNotContains(ORD_COD.postalCode);
    });

    test("TC-HAPPY-037 order pdf > the phone number uses the page's format", async () => {
      test.fail(true, 'Known defect D-05: the PDF shows "+1 1234567890"');
      pdf.assertContains(ORD_COD.phone);
    });

    test('TC-HAPPY-038 order pdf > the PDF shows the same email as the page', async () => {
      pdf.assertContains(ORD_COD.email);
    });

    test('TC-HAPPY-039 order pdf > the PDF shows the Delivery Instructions', async () => {
      test.fail(true, 'Known defect D-07: the PDF has no Delivery Instructions');
      pdf.assertContains(ORD_COD.instructions);
    });

    test('TC-HAPPY-040 order pdf > the Items table shows the same line data as the page', async () => {
      const { name, sku, unitPrice, quantity, lineTotal } = ORD_COD.item;
      pdf.assertContains(`${name} ${sku} ${unitPrice} ${quantity} ${lineTotal}`);
    });

    test('TC-HAPPY-041 order pdf > the Items table shows a product image', async () => {
      test.fail(true, 'Known defect D-08: the PDF has no product image');
      expect(pdf.imageCount).toBeGreaterThan(0);
    });

    test('TC-HAPPY-042 order pdf > the Tax line shows the tax rate', async () => {
      test.fail(true, 'Known defect D-06: the PDF Tax line has no rate');
      pdf.assertContains(ORD_COD.taxLabel);
    });

    test('TC-HAPPY-043 order pdf > Subtotal, Tax, Discount and TOTAL match the page', async () => {
      pdf.assertContains(`Subtotal ${ORD_COD.subtotal}`);
      pdf.assertContains(`Tax ${ORD_COD.tax}`);
      pdf.assertContains(`Discount ${ORD_COD.discount}`);
      pdf.assertContains(`TOTAL ${ORD_COD.total}`);
    });

    test('TC-HAPPY-044 order pdf > the Totals block shows a Shipping fee line', async () => {
      test.fail(true, 'Known defect D-09: the PDF has no Shipping fee line (value pending G01)');
      // Only the Totals block counts ("Shipping Address:" earlier in the PDF must not match).
      pdf.assertContains(/Subtotal CAD [\d.,]+ .*Shipping.* TOTAL CAD/i);
    });

    test('TC-HAPPY-046 order pdf > the footer shows the contact message', async () => {
      pdf.assertContains('Thank you for your order! If you have any questions, contact us at phung.nguyen@digicommercegroup.com');
    });

    test('TC-HAPPY-047 order pdf > the footer shows the copyright line', async () => {
      pdf.assertContains("© 2026 Liana's Candelas. All rights reserved.");
    });
  });

  test('TC-HAPPY-045 order pdf > the amounts match the page for a discounted order', async ({ storefrontOrderDetailPage }, testInfo) => {
    await storefrontOrderDetailPage.goto(ORD_DISC.id);

    const pdf = await downloadPdf(storefrontOrderDetailPage, testInfo.outputPath('order.pdf'));

    pdf.assertContains(`Subtotal ${ORD_DISC.subtotal}`);
    pdf.assertContains(`Tax ${ORD_DISC.tax}`);
    pdf.assertContains(`Discount ${ORD_DISC.discount}`);
    pdf.assertContains(`TOTAL ${ORD_DISC.total}`);
  });
});

async function downloadPdf(detail: StorefrontOrderDetailPage, savePath: string): Promise<OrderPdf> {
  const download = await detail.downloadOrder();
  await download.saveAs(savePath);
  return OrderPdf.fromFile(savePath);
}
