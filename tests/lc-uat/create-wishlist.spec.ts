import path from 'path';
import { test, expect } from '../fixtures/page-manager.fixture';

const CF_ONLY_STATE = path.join(__dirname, '../../.auth/lc-uat-state-cf-only.json');
const LOGGED_IN_STATE = path.join(__dirname, '../../.auth/lc-uat-state.json');
const BASE_URL = 'https://lc-uat.digicommerce.cloud';

const NAME_MAX = 50;
const DESC_MAX = 200;

function uniqueName(label: string): string {
  return `${label} ${Date.now()}`;
}

test.describe('Create New Wishlist', () => {
  // All tests below share one UAT account's server-side wishlist list, so they must not run
  // concurrently with each other or count-based assertions (TC-VAL-002, TC-HAPPY-020/021) race.
  test.describe.serial('Logged in', () => {
    test.use({ storageState: LOGGED_IN_STATE });

    test.describe('Accessing Create Wishlist', () => {
      // TC-HAPPY-001
      test('clicking "Add New" on the Wishlists List Page opens the Create New Wishlist modal', async ({
        homePage,
        wishlistsListPage,
        createWishlistModalPage,
      }) => {
        await homePage.goto();
        await homePage.openWishlistsFromHeaderIcon();
        await wishlistsListPage.assertOnWishlistsListPage();

        await wishlistsListPage.clickAddNew();

        await createWishlistModalPage.assertOpen();
      });

      // TC-HAPPY-002
      test('navigating My Account -> Wishlists -> Add New opens the Create New Wishlist modal', async ({
        homePage,
        wishlistsListPage,
        createWishlistModalPage,
      }) => {
        await homePage.goto();
        await homePage.goToMyAccountWishlists();
        await wishlistsListPage.assertOnWishlistsListPage();

        await wishlistsListPage.clickAddNew();

        await createWishlistModalPage.assertOpen();
      });

      // TC-PERM-003
      test('a logged-in user can access the Create New Wishlist modal from the Wishlists List Page', async ({
        wishlistsListPage,
        createWishlistModalPage,
      }) => {
        await wishlistsListPage.goto();

        await wishlistsListPage.clickAddNew();

        await createWishlistModalPage.assertOpen();
      });
    });

    test.describe('Modal structure', () => {
      test.beforeEach(async ({ wishlistsListPage }) => {
        await wishlistsListPage.goto();
        await wishlistsListPage.clickAddNew();
      });

      // TC-HAPPY-003
      test('displays the title "Create New Wishlist"', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.assertTitleVisible();
      });

      // TC-HAPPY-004
      test('is a small, horizontally centered modal', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.assertModalIsSmallAndCentered();
      });

      // TC-HAPPY-005
      test('auto-focuses the Wishlist Name field on open', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.assertNameAutoFocused();
      });

      // TC-HAPPY-006
      test('shows the Name field placeholder text', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.assertNamePlaceholder('e.g., Christmas Gifts, Birthday Ideas');
      });

      // TC-HAPPY-007
      test('shows the Description field placeholder text', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.assertDescriptionPlaceholder('Add notes about this wishlist...');
      });

      // TC-HAPPY-008
      test('renders the Description field as a 3-row textarea', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.assertDescriptionIsThreeRowTextarea();
      });

      // TC-HAPPY-009
      test('updates the Name counter live as the user types', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.typeNameSequentially('Christmas');

        await createWishlistModalPage.assertNameCounter('9 / 50 characters');
      });

      // TC-HAPPY-022 (gap G002 resolved via live DOM confirmation 2026-08-27: Description has its
      // own live counter, same pattern as Name)
      test('updates the Description counter live as the user types', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.typeDescriptionSequentially('Gifts');

        await createWishlistModalPage.assertDescriptionCounter('5 / 200 characters');
      });

      // TC-HAPPY-010 / TC-HAPPY-011: exact pink/gray color values were not confirmed against the
      // live DOM (Low automation feasibility per the test suite doc) — this checks the one
      // structural fact the requirement actually implies: Cancel renders left of Create.
      test('positions CANCEL to the left of CREATE', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.assertCancelIsLeftOfCreate();
      });
    });

    test.describe('Success flow', () => {
      test.beforeEach(async ({ wishlistsListPage }) => {
        await wishlistsListPage.goto();
      });

      // TC-HAPPY-012 (corrected 2026-08-27, Gap G004 — see below)
      test('creates a wishlist with only a valid Name', async ({
        wishlistsListPage,
        createWishlistModalPage,
        wishlistDetailPage,
        toastPage,
      }) => {
        const name = uniqueName('Birthday Ideas');
        await wishlistsListPage.clickAddNew();

        await createWishlistModalPage.createWishlist(name);

        await toastPage.assertSuccessMessageVisible();
        await createWishlistModalPage.assertClosed();
        await wishlistDetailPage.assertOnDetailPageFor(name);
      });

      // TC-HAPPY-013 (corrected 2026-08-27, Gap G004)
      test('creates a wishlist with a valid Name and Description', async ({
        wishlistsListPage,
        createWishlistModalPage,
        wishlistDetailPage,
        toastPage,
      }) => {
        const name = uniqueName('Christmas Gifts');
        await wishlistsListPage.clickAddNew();

        await createWishlistModalPage.createWishlist(name, 'Gifts to buy before Dec 25');

        await toastPage.assertSuccessMessageVisible();
        await wishlistDetailPage.assertOnDetailPageFor(name);
      });

      // TC-HAPPY-014
      test('closes the modal after successful creation', async ({ wishlistsListPage, createWishlistModalPage }) => {
        await wishlistsListPage.clickAddNew();

        await createWishlistModalPage.createWishlist(uniqueName('Wedding Registry'));

        await createWishlistModalPage.assertClosed();
      });

      // TC-HAPPY-015
      test('shows a success toast after successful creation', async ({ wishlistsListPage, createWishlistModalPage, toastPage }) => {
        await wishlistsListPage.clickAddNew();

        await createWishlistModalPage.createWishlist(uniqueName('Baby Shower'));

        await toastPage.assertSuccessMessageVisible();
      });

      // TC-HAPPY-016 (corrected 2026-08-27, Gap G004: creation redirects away from the List Page,
      // so "appears in the table" is checked by navigating back to the List Page afterward, not by
      // staying put as AC4 originally described)
      test('shows the new wishlist in the table after navigating back to the Wishlists List Page', async ({
        wishlistsListPage,
        createWishlistModalPage,
      }) => {
        const name = uniqueName('Anniversary');
        await wishlistsListPage.clickAddNew();
        await createWishlistModalPage.createWishlist(name);

        await wishlistsListPage.goto();

        await wishlistsListPage.assertWishlistRowVisible(name);
      });

      // TC-HAPPY-020 (corrected 2026-08-27, Gap G004: navigates back to the List Page between/after
      // creations since each CREATE redirects to the new wishlist's own detail page)
      test('allows creating a second wishlist with a duplicate name', async ({ wishlistsListPage, createWishlistModalPage }) => {
        const name = uniqueName('Favorites');
        await wishlistsListPage.clickAddNew();
        await createWishlistModalPage.createWishlist(name);

        await wishlistsListPage.goto();
        await wishlistsListPage.clickAddNew();
        await createWishlistModalPage.createWishlist(name);

        await wishlistsListPage.goto();
        expect(await wishlistsListPage.getRowCountForName(name)).toBe(2);
      });

      // TC-HAPPY-021
      test('CANCEL closes the modal without creating a wishlist', async ({ wishlistsListPage, createWishlistModalPage }) => {
        const name = uniqueName('Should Not Save');
        await wishlistsListPage.clickAddNew();
        await createWishlistModalPage.fillName(name);

        await createWishlistModalPage.clickCancel();

        await createWishlistModalPage.assertClosed();
        expect(await wishlistsListPage.getRowCountForName(name)).toBe(0);
      });

      // TC-HAPPY-019 (corrected 2026-08-27, Gap G004: navigates back to the List Page before each
      // subsequent creation since CREATE redirects away to the new wishlist's detail page)
      test('allows creating more than one wishlist with no upper limit enforced', async ({
        wishlistsListPage,
        createWishlistModalPage,
        toastPage,
      }) => {
        await wishlistsListPage.clickAddNew();
        await createWishlistModalPage.createWishlist(uniqueName('Test List 3'));
        await toastPage.assertSuccessMessageVisible();

        await wishlistsListPage.goto();
        await wishlistsListPage.clickAddNew();
        await createWishlistModalPage.createWishlist(uniqueName('Test List 4'));

        await toastPage.assertSuccessMessageVisible();
        await expect(wishlistsListPage.page.getByText('Failed to create wishlist. Please try again.')).toHaveCount(0);
      });
    });

    // TC-HAPPY-017 / TC-HAPPY-018
    // GAP G004 (found during automation, 2026-08-27): the requirement's AC4 describes this
    // redirect-to-detail-page behavior as exclusive to the My Account entry point, implying the
    // Wishlists List Page entry point instead stays put with the table updating in place. Live UAT
    // verification found this is NOT the case — creating from the List Page ALSO redirects to the
    // new wishlist's detail page (confirmed via tests\create-wishlist.spec.ts "Success flow" above).
    // This test still exercises the My Account path specifically, but the behavior it asserts is
    // now confirmed to apply to both entry points, not just this one. See gap note in
    // gen-ai/testcases/lc-storefront-create-wishlist-testcases.md.
    test.describe('My Account entry point redirect', () => {
      test("redirects to the new wishlist's detail page, which starts with 0 items", async ({
        homePage,
        wishlistsListPage,
        createWishlistModalPage,
        wishlistDetailPage,
      }) => {
        const name = uniqueName('Housewarming');
        await homePage.goto();
        await homePage.goToMyAccountWishlists();
        await wishlistsListPage.clickAddNew();

        await createWishlistModalPage.createWishlist(name);

        await wishlistDetailPage.assertOnDetailPageFor(name);
        await wishlistDetailPage.assertZeroItems();
      });
    });

    test.describe('Boundary values', () => {
      test.beforeEach(async ({ wishlistsListPage }) => {
        await wishlistsListPage.goto();
        await wishlistsListPage.clickAddNew();
      });

      // TC-BOUNDARY-001
      test('accepts a 50-character Name and creates the wishlist', async ({ createWishlistModalPage, toastPage }) => {
        await createWishlistModalPage.fillName('A'.repeat(NAME_MAX));

        await createWishlistModalPage.clickCreate();

        await toastPage.assertSuccessMessageVisible();
      });

      // TC-BOUNDARY-002
      test('blocks typing beyond 50 characters in Name (hard cap)', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.typeNameSequentially('A'.repeat(NAME_MAX + 1));

        expect((await createWishlistModalPage.getNameValue()).length).toBe(NAME_MAX);
      });

      // TC-BOUNDARY-003
      test('accepts a single-character Name and creates the wishlist', async ({ createWishlistModalPage, toastPage }) => {
        await createWishlistModalPage.fillName('A');

        await createWishlistModalPage.clickCreate();

        await toastPage.assertSuccessMessageVisible();
      });

      // TC-BOUNDARY-004
      test('accepts a 200-character Description and creates the wishlist', async ({ createWishlistModalPage, toastPage }) => {
        await createWishlistModalPage.fillName(uniqueName('Boundary Desc 200'));
        await createWishlistModalPage.fillDescription('B'.repeat(DESC_MAX));

        await createWishlistModalPage.clickCreate();

        await toastPage.assertSuccessMessageVisible();
      });

      // TC-BOUNDARY-005
      test('blocks typing beyond 200 characters in Description (hard cap)', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.typeDescriptionSequentially('B'.repeat(DESC_MAX + 1));

        expect((await createWishlistModalPage.getDescriptionValue()).length).toBe(DESC_MAX);
      });

      // TC-BOUNDARY-006
      test('shows "50 / 50 characters" when the Name field reaches its maximum length', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.fillName('A'.repeat(NAME_MAX));

        await createWishlistModalPage.assertNameCounter('50 / 50 characters');
      });
    });

    test.describe('Validation', () => {
      test.beforeEach(async ({ wishlistsListPage }) => {
        await wishlistsListPage.goto();
        await wishlistsListPage.clickAddNew();
      });

      // TC-VAL-001 (adapted to confirmed live behavior, 2026-08-27)
      // GAP: the requirement documents an inline "This field is requried." message on submit
      // (gen-ai/requirements/lc-storefront-create-wishlist-requirement.md, AC5). Live UAT
      // verification found no such message ever renders (typed-then-cleared, blurred, and
      // force-clicked all showed no such text) — the app disables CREATE instead. This asserts
      // the confirmed real behavior; the message copy itself needs a BA/dev follow-up.
      test('keeps CREATE disabled when the Name field is empty', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.assertCreateButtonDisabled();
      });

      // TC-VAL-002 (adapted: since CREATE is natively disabled, this confirms the guard isn't
      // merely a UI convenience — forcing a click through it still creates nothing)
      test('does not create a wishlist even if the disabled CREATE button is force-clicked', async ({
        wishlistsListPage,
        createWishlistModalPage,
      }) => {
        const before = await wishlistsListPage.getWishlistCount();

        await createWishlistModalPage.createButton.click({ force: true }).catch(() => undefined);

        await createWishlistModalPage.assertOpen();
        expect(await wishlistsListPage.getWishlistCount()).toBe(before);
      });

      // TC-VAL-003 (requirement corrected 2026-08-27: live UAT rejects whitespace-only Name,
      // contradicting the earlier clarification answer that it should be accepted — see gap note
      // in gen-ai/testcases/lc-storefront-create-wishlist-testcases.md)
      test('keeps CREATE disabled for a whitespace-only Name', async ({ createWishlistModalPage }) => {
        await createWishlistModalPage.fillName('   ');

        await createWishlistModalPage.assertCreateButtonDisabled();
      });

      // TC-VAL-004
      test('creates a wishlist without entering a Description (optional field)', async ({
        createWishlistModalPage,
        toastPage,
      }) => {
        await createWishlistModalPage.fillName(uniqueName('No Description List'));

        await createWishlistModalPage.clickCreate();

        await toastPage.assertSuccessMessageVisible();
      });
    });
  });

  test.describe('Logged out', () => {
    // The Storefront sits behind Cloudflare Access. This state has CF Access already satisfied
    // but no app-level session, so guarded routes redirect to the real app login page instead of
    // a CF Access challenge screen.
    test.use({ storageState: CF_ONLY_STATE });

    // TC-PERM-001
    test('redirects a logged-out user from the Wishlists List Page to the login page', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-account/wishlists`, { waitUntil: 'domcontentloaded' });

      await page.waitForURL(/\/login(\?|$)/);
    });

    // TC-PERM-002
    test('redirects a logged-out user from My Account to the login page', async ({ page }) => {
      await page.goto(`${BASE_URL}/my-account`, { waitUntil: 'domcontentloaded' });

      await page.waitForURL(/\/login(\?|$)/);
    });
  });
});
