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
