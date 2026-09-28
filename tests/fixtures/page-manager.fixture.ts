import { test as base } from '@playwright/test';
import { HomePage } from '../pages/home.page';
import { LoginPage } from '../pages/login.page';
import { RegistrationPage } from '../pages/registration.page';
import { PlpPage } from '../pages/plp.page';
import { PdpPage } from '../pages/pdp.page';
import { CartPage } from '../pages/cart.page';
import { CheckoutPage } from '../pages/checkout.page';
import { OrderConfirmationPage } from '../pages/order-confirmation.page';
import { OrderHistoryPage } from '../pages/order-history.page';
import { WishlistsListPage } from '../pages/wishlists-list.page';
import { CreateWishlistModalPage } from '../pages/create-wishlist-modal.page';
import { WishlistDetailPage } from '../pages/wishlist-detail.page';
import { ToastPage } from '../pages/toast.page';
import { SearchPage } from '../pages/search.page';
import { BoLoginPage } from '../pages/bo-login.page';
import { ProductListPage } from '../pages/product-list.page';
import { ProductFormPage } from '../pages/product-form.page';
import { CreateOrderPage } from '../pages/create-order.page';
import { BoCheckoutPage } from '../pages/bo-checkout.page';
import { OrderDetailPage } from '../pages/order-detail.page';
import { OrderSummary } from '../pages/order-summary.page';
import { AddressFormDialog } from '../pages/address-form.page';
import { AddressBookPage } from '../pages/address-book.page';
import { StorefrontOrderDetailPage } from '../pages/sf-order-detail.page';

export type Pages = {
  homePage: HomePage;
  loginPage: LoginPage;
  registrationPage: RegistrationPage;
  plpPage: PlpPage;
  pdpPage: PdpPage;
  cartPage: CartPage;
  checkoutPage: CheckoutPage;
  orderConfirmationPage: OrderConfirmationPage;
  orderHistoryPage: OrderHistoryPage;
  wishlistsListPage: WishlistsListPage;
  createWishlistModalPage: CreateWishlistModalPage;
  wishlistDetailPage: WishlistDetailPage;
  toastPage: ToastPage;
  searchPage: SearchPage;
  boLoginPage: BoLoginPage;
  productListPage: ProductListPage;
  productFormPage: ProductFormPage;
  createOrderPage: CreateOrderPage;
  boCheckoutPage: BoCheckoutPage;
  orderDetailPage: OrderDetailPage;
  orderSummary: OrderSummary;
  addressFormDialog: AddressFormDialog;
  addressBookPage: AddressBookPage;
  storefrontOrderDetailPage: StorefrontOrderDetailPage;
};

export const test = base.extend<Pages>({
  homePage: async ({ page }, use) => {
    await use(new HomePage(page));
  },
  loginPage: async ({ page }, use) => {
    await use(new LoginPage(page));
  },
  registrationPage: async ({ page }, use) => {
    await use(new RegistrationPage(page));
  },
  plpPage: async ({ page }, use) => {
    await use(new PlpPage(page));
  },
  pdpPage: async ({ page }, use) => {
    await use(new PdpPage(page));
  },
  cartPage: async ({ page }, use) => {
    await use(new CartPage(page));
  },
  checkoutPage: async ({ page }, use) => {
    await use(new CheckoutPage(page));
  },
  orderConfirmationPage: async ({ page }, use) => {
    await use(new OrderConfirmationPage(page));
  },
  orderHistoryPage: async ({ page }, use) => {
    await use(new OrderHistoryPage(page));
  },
  wishlistsListPage: async ({ page }, use) => {
    await use(new WishlistsListPage(page));
  },
  createWishlistModalPage: async ({ page }, use) => {
    await use(new CreateWishlistModalPage(page));
  },
  wishlistDetailPage: async ({ page }, use) => {
    await use(new WishlistDetailPage(page));
  },
  toastPage: async ({ page }, use) => {
    await use(new ToastPage(page));
  },
  searchPage: async ({ page }, use) => {
    await use(new SearchPage(page));
  },
  boLoginPage: async ({ page }, use) => {
    await use(new BoLoginPage(page));
  },
  productListPage: async ({ page }, use) => {
    await use(new ProductListPage(page));
  },
  productFormPage: async ({ page }, use) => {
    await use(new ProductFormPage(page));
  },
  createOrderPage: async ({ page }, use) => {
    await use(new CreateOrderPage(page));
  },
  boCheckoutPage: async ({ page }, use) => {
    await use(new BoCheckoutPage(page));
  },
  orderDetailPage: async ({ page }, use) => {
    await use(new OrderDetailPage(page));
  },
  orderSummary: async ({ page }, use) => {
    await use(new OrderSummary(page));
  },
  addressFormDialog: async ({ page }, use) => {
    await use(new AddressFormDialog(page));
  },
  addressBookPage: async ({ page }, use) => {
    await use(new AddressBookPage(page));
  },
  storefrontOrderDetailPage: async ({ page }, use) => {
    await use(new StorefrontOrderDetailPage(page));
  },
});

export { expect } from '@playwright/test';
