# Rinova BD — Customer Experience ও Admin UX Todo List

এই তালিকা বর্তমান repository code এবং live API contract দেখে তৈরি করা হয়েছে। প্রতিটি কাজ আলাদা phase হিসেবে করা হবে। একটি কাজের code change, backend check, browser/API verification এবং deployment শেষ না হওয়া পর্যন্ত পরের কাজ শুরু করা হবে না।

## Overall status

| বিষয় | বর্তমান অবস্থা | Priority |
|---|---|---:|
| Customer login ও account create | Backend route এবং session আছে; account page-এ customer name ও order list দেখানোর foundation আছে | ১ |
| Customer order history | `/api/account/orders` আছে, কিন্তু account page-এ order-এর item detail, tracking shortcut এবং invoice number prominently দেখানো হয়নি | ২ |
| Invoice number দিয়ে tracking | Tracking route এখন শুধু `order_code` বা phone দিয়ে lookup করে; `invoice_number` দিয়ে lookup binding নেই। এ কারণেই `RNV-INV-...` দিলে Order not found দেখা যাচ্ছে | ১ |
| Customer account থেকে order tracking | Account page-এ tracking button/link নেই; order history থেকে tracking access যোগ করতে হবে | ২ |
| Product quantity control | Product detail-এ সাধারণ number input আছে; plus/minus stepper নেই | ১ |
| Cart quantity control | Cart drawer-এ quantity stepper আছে কি না end-to-end verify করে প্রয়োজন হলে যোগ করতে হবে | ২ |
| Checkout quantity control | Checkout summary-তে quantity update flow end-to-end verify করতে হবে | ৩ |
| Hot Product / In Stock / New Product badges | D1 `badges_json`, Worker contract এবং admin checkbox foundation deployed; owner selection ও storefront rendering live data দিয়ে verify করতে হবে | ১ |
| Admin storefront preview থেকে edit | `admin_preview` context ও product detail edit shortcut foundation আছে; authenticated same-session flow browser-এ verify ও প্রয়োজন হলে polish করতে হবে | ২ |
| Theme colour | বর্তমানে neutral coral/cream palette আছে; user-provided hot-pink palette এখনো পুরো storefront ও admin-এ apply করা হয়নি | ৩ |
| Login method | বর্তমান mobile/password login অপরিবর্তিত থাকবে; Google login যোগ করা হবে না | সিদ্ধান্ত সম্পন্ন |

## Execution order

### Todo 1 — Customer account profile ও order history

Login বা account create করার পর customer-এর নিজের নাম, mobile/email, account status এবং order history পরিষ্কারভাবে দেখাতে হবে। প্রতিটি order-এ order number, invoice number, date, status, total, product summary, invoice link এবং tracking link থাকবে। এই phase শেষ হলে authenticated API ও account page আলাদাভাবে verify করা হবে।

### Todo 2 — Invoice number tracking fix

`/api/customer-tracking` route-এ `invoice_number` lookup যোগ করতে হবে। Order ID, Invoice Number এবং Mobile Number—তিনটি lookup-ই নিরাপদভাবে কাজ করবে। Invoice number দিয়ে valid order পাওয়া গেলে order status, courier status, tracking code এবং latest update দেখাবে। Invalid identifier-এ কেবল Not found message থাকবে।

### Todo 3 — Account থেকে product/order tracking

Customer account-এর প্রতিটি order-এর পাশে `Track order` button থাকবে। এটি order code বা invoice number context সহ tracking page খুলবে, যাতে customer-কে identifier manually copy করতে না হয়। Shipped, delivered, returned এবং pending status অনুযায়ী পরিষ্কার status presentation থাকবে।

### Todo 4 — Plus/minus quantity controls

Product detail, cart drawer এবং checkout—যেখানে quantity change করা যায় সেখানে minus/number/plus stepper যোগ করতে হবে। Minimum order quantity, available stock, zero-stock এবং quantity validation backend-এর সঙ্গে মিলিয়ে কাজ করবে। Manual typing optional থাকতে পারে, কিন্তু primary interaction হবে plus/minus।

### Todo 5 — Product merchandising badges

Admin → Products → Edit থেকে Hot Product, In Stock এবং New Product checkbox-এর selected state save করা হবে। Storefront-এ শুধু selected badge দেখাবে; stock শেষ হলে Stock out automatic দেখাবে। Live product API, admin save response এবং customer card/detail rendering—তিনটি verify করা হবে।

### Todo 6 — Admin storefront preview ও edit

Admin View Mode থেকে storefront খুলে product card/detail page দেখা যাবে। Authenticated admin preview context থাকলে product detail page-এ `Edit this product in Admin Dashboard` shortcut দেখাবে এবং সঠিক product editor খুলবে। Customer visitor-এর জন্য এই edit shortcut কখনো প্রকাশ পাবে না।

### Todo 7 — Hot-pink theme rollout

Login method না বদলে user-provided hot-pink palette-কে primary accent হিসেবে apply করা হবে। Readability বজায় রাখতে dark text, soft-pink surface এবং accessible contrast ব্যবহার করা হবে। Storefront, product detail, account, tracking, checkout এবং admin dashboard—সবগুলো surface একসঙ্গে যাচাই করা হবে।

## Verification rule

প্রতিটি Todo শেষ হলে local syntax/typecheck, relevant API status, authenticated/unauthenticated boundary, mobile layout এবং CI/CD deployment verify করা হবে। Verification সফল না হওয়া পর্যন্ত পরের Todo শুরু করা হবে না।


## Final completion status — 25 August 2026

| Todo | ফলাফল | প্রমাণ |
|---|---|---|
| ১. Customer account profile ও order history | সম্পন্ন | Account profile, own order history, invoice/tracking links deployed; CI/CD `32875095758` |
| ২. Invoice number tracking | সম্পন্ন | Invoice lookup deployed; live positive invoice and order-code tracking returned HTTP 200 |
| ৩. Account থেকে order tracking | সম্পন্ন | Account-originated tracking links include order/invoice context; public tracking verified with live test order |
| ৪. Plus/minus quantity controls | সম্পন্ন | Product detail, cart drawer এবং checkout stepper deployed; local build/typecheck passed; CI/CD `32875957528` |
| ৫. Product merchandising badges | সম্পন্ন | Temporary all-three-badge save/render test passed, then product ID 10 reset to `badgesJson: []`; CI/CD `32878163406` |
| ৬. Admin storefront preview ও edit | সম্পন্ন | Same authenticated session-এ preview → product detail → `/admin/?view=products&edit=10` verified |
| ৭. Hot-pink theme rollout | সম্পন্ন | `#F267A8`, `#D94D8D`, `#FFF1F7` এবং charcoal text storefront, product, account, checkout, tracking ও admin-এ verified; CI/CD `32880989696` |

### Final production smoke checks

`GET /api/health`, `GET /api/products`, product detail এবং valid test-invoice tracking প্রত্যেকটি HTTP 200 দিয়েছে। Unauthenticated admin session, admin product list এবং account order history প্রত্যেকটি HTTP 401 দিয়েছে। Served admin HTML-এ Cloudflare/Gemini/provider/credit wording পাওয়া যায়নি। Final documentation workflow `32881410732` সফল এবং repository working tree clean।

### Owner actions still pending

R2 account enable করে `rinovabd-product-images` bucket এবং `PRODUCT_IMAGES` binding না হওয়া পর্যন্ত direct product-image upload বাস্তবে চালু হবে না; upload UI/API প্রস্তুত আছে, কিন্তু R2 activation ছাড়া production transfer দাবি করা যাবে না। Real product descriptions ও Editor's Notes এখন Admin → Products → Edit থেকে plain text হিসেবে Bengali বা English-এ বসানো যাবে।


## Additional Todo — Storefront image viewer

Product image click এখন fullscreen popup খুলে; zoom in/out/reset, close/Escape, keyboard arrows, previous/next navigation এবং mobile right-to-left swipe/scroll যুক্ত হয়েছে। Product card এবং product detail—দুই জায়গার image viewer verify করা হয়েছে। Multiple image product-এর জন্য Admin-এর `mediaJson` gallery contract প্রস্তুত; live catalog-এ real multiple-image data যোগ হলে একই viewer-এ automatically দেখাবে। Commit `104c650`; CI/CD `32883043565` সফল।

### New product intake

নতুন products যোগ করার জন্য প্রতিটি product-এর নাম, category, selling price, compare-at price, stock, minimum order quantity, weight, description/editor note এবং কোন image primary/gallery হবে—এই তথ্যগুলো প্রয়োজন। শুধু supplied image দেখে price বা product details অনুমান করে live catalog তৈরি করা হয়নি।
