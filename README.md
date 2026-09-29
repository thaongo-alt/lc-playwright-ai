# lc-playwright-ai

Playwright E2E test suite cho LC UAT (Storefront + Backoffice), chạy trên `https://lc-uat.digicommerce.cloud`.

## Cấu trúc repo

```
tests/
  lc-uat/            # Spec files (test cases) theo tính năng
  pages/              # Page Object Model — 1 class / trang hoặc component
  fixtures/           # page-manager.fixture.ts — inject mọi Page Object qua fixture `test`
  auth.setup.ts        # Project "setup": login Storefront + Backoffice, lưu storageState
scripts/
  save-cf-auth.js      # Bước thủ công: lấy phiên Cloudflare Access (1 lần/ngày)
  cart-seed/            # Script phụ để seed dữ liệu giỏ hàng
reporters/
  qa-evidence-reporter.ts  # Custom reporter, xuất report.md / bugs.md / results.csv / screenshots / traces
playwright.config.ts
```

Test dùng Page Object Model: mỗi spec (`tests/lc-uat/*.spec.ts`) gọi các Page Object trong `tests/pages/`, được cung cấp sẵn qua fixture `test` trong [tests/fixtures/page-manager.fixture.ts](tests/fixtures/page-manager.fixture.ts) — import `{ test, expect }` từ file này thay vì từ `@playwright/test` trực tiếp.

## Yêu cầu môi trường

- Node.js + npm
- Có quyền truy cập Cloudflare Access vào `lc-uat.digicommerce.cloud` (email nhận mã OTP)

## Cài đặt

```bash
npm install
npx playwright install chromium
```

## Chạy test

### 1. Lấy phiên Cloudflare Access (bắt buộc, ~1 lần/ngày)

Toàn bộ site nằm sau Cloudflare Access nên cần chạy trước:

```bash
npm run save-cf-auth
```

Lệnh này mở một Chrome thật (headed) — tự nhập **email** rồi **mã OTP** từ inbox để qua Cloudflare Access (không đăng nhập app, script tự dừng khi thấy trang login Storefront). Phiên lưu vào `.auth/lc-uat-state-cf-only.json`, sống ~24h.

### 2. Chạy test suite

```bash
npx playwright test
```

Project `setup` sẽ tự động login Storefront + Backoffice từ phiên CF ở bước 1 và lưu `storageState` (`.auth/lc-uat-state.json`, `.auth/lc-uat-bo-state.json`) trước khi các spec chạy — không cần thao tác thêm.

Một số cách chạy khác:

```bash
# Chạy 1 file cụ thể
npx playwright test tests/lc-uat/shopping-cart.spec.ts

# Chạy có giao diện trình duyệt
npx playwright test --headed

# UI mode (debug từng bước, tua lại)
npx playwright test --ui

# Lọc theo tag, vd chỉ test guest
npx playwright test --grep @guest

# Chỉ liệt kê test, không chạy thật
npx playwright test --list
```

### 3. Xem kết quả

- Playwright HTML report: `npx playwright show-report`
- Evidence riêng của repo theo từng run (report tổng hợp, bug entries, CSV, screenshot, trace): `qa-evidence/<run-id>/`, sinh bởi [reporters/qa-evidence-reporter.ts](reporters/qa-evidence-reporter.ts)

## Tài khoản test

Mặc định hard-code trong [tests/auth.setup.ts](tests/auth.setup.ts) (Storefront + Backoffice). Muốn đổi account, set qua biến môi trường thay vì sửa file:

| Biến | Mục đích |
|---|---|
| `E2E_USERNAME` | Email tài khoản Storefront |
| `E2E_PASSWORD` | Mật khẩu tài khoản Storefront |
| `E2E_BO_ADMIN_EMAIL` | Email admin Backoffice |
| `E2E_BO_ADMIN_PASSWORD` | Mật khẩu admin Backoffice |

## Ghi chú

- Project `mobile-chrome` (Pixel 5) chỉ chạy `shopping-cart.spec.ts` với tag `@guest` — tránh đụng giỏ hàng dùng chung server-side với các run có tài khoản khách hàng ở project `chromium`.
- Nếu gặp lỗi `Missing .auth/lc-uat-state-cf-only.json` hoặc "Cloudflare Access session expired" → chạy lại `npm run save-cf-auth`.
