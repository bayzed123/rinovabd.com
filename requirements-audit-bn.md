# Rinova BD Website Requirements Audit

**পরীক্ষার তারিখ:** ২৫ আগস্ট ২০২৬  
**পরীক্ষার ধরন:** Repository implementation review, live production endpoint checks এবং admin/storefront feature inventory।  
**সামগ্রিক ফলাফল:** Website-এর core commerce, admin, product catalogue, checkout, invoice, POS, courier, chatbot, reviews এবং CMS-এর বড় অংশ প্রস্তুত। তবে সব requirement এখনও ১০০% পূর্ণ হয়নি। সবচেয়ে বড় বাকি অংশ হলো Facebook/TikTok/Google server-side conversion tracking, Messenger/WhatsApp inbox order automation, Pathao integration, finance-entry screens এবং incomplete-cart recovery automation।

## Status কীভাবে পড়বেন

| Status | অর্থ |
|---|---|
| **পূর্ণ** | Feature-এর প্রয়োজনীয় route, UI এবং কার্যকর workflow বর্তমান system-এ আছে। |
| **আংশিক** | Backend/schema বা একটি অংশ আছে, কিন্তু সম্পূর্ণ automation, external integration বা owner-facing management এখনও বাকি। |
| **বাকি** | Requirement-এর মূল feature এখনও production workflow হিসেবে তৈরি হয়নি। |

## মূল Website Requirements

| নং | Requirement | বর্তমান অবস্থা | কী আছে | কী বাকি |
|---:|---|---|---|---|
| ১ | Future Clothing sector; backend/frontend প্রস্তুত কিন্তু hidden | **আংশিক** | Hidden Clothing category backend-এ রাখা হয়েছে এবং customer menu-তে দেখানো হচ্ছে না। | Clothing-specific size, colour, variant, measurement, fabric এবং fashion-design fields এখনো আলাদা করে তৈরি হয়নি। তাই future category shell আছে, কিন্তু পূর্ণ clothing product system এখনও নয়। |
| ২ | Barcode print ও POS direct checkout | **আংশিক** | Admin-এর **POS & Barcodes** screen, barcode field, barcode search/scan input, stock deduction, payment method এবং receipt print আছে। Keyboard barcode scanner দিয়ে search field ব্যবহার করা যাবে। | Product barcode label/print workflow আলাদা button বা printable barcode-sheet হিসেবে নিশ্চিতভাবে নেই। POS receipt print আছে; barcode label print আলাদা করে যোগ করা দরকার। |
| ৩ | Online/courier sale এবং দোকানের sale আলাদা হিসাব | **আংশিক** | Online order ও POS sale আলাদা table-এ রাখা হয়। Admin Assistant-এ ecommerce revenue, POS revenue এবং combined sales আলাদা data হিসেবে পাওয়া যায়। | Main Dashboard-এ dedicated Online Sales বনাম Store Sales comparison cards/report আরও স্পষ্টভাবে দেখানো দরকার। Monthly profit report-এ দুই channel-এর formal accounting breakdown দরকার। |
| ৪ | Messenger/WhatsApp AI live database reply ও inbox order confirm | **আংশিক** | Website-এর SmartGen customer chatbot live D1 product, price, stock, usage, delivery ও order context ব্যবহার করে reply দেয়। WhatsApp button সঠিক number-এ redirect করে। | Messenger webhook, WhatsApp Cloud/API inbox integration এবং inbox-এর ভিতরে automatic order confirmation এখনো connected নয়। বর্তমানে WhatsApp হলো click-to-chat redirect; full inbox order automation নয়। |
| ৫ | Product weight ও order-source সহ custom invoice | **আংশিক** | Invoice API ও invoice page-এ product name, quantity, unit price, product weight in grams, package weight, delivery fee, payment method এবং order source field রাখা/দেখানোর ব্যবস্থা আছে। Admin থেকে print invoice করা যায়। | Website/POS order source capture আছে, কিন্তু Messenger/WhatsApp/TikTok order ingestion এখনো connected নয়; তাই ওই channel থেকে order এলে source automaticভাবে আসছে না। |
| ৬ | Personal return dashboard ও courier delivery/return live update | **আংশিক** | Admin Returns screen, return status workflow, inventory restore, refund status এবং Steadfast status/webhook route আছে। | Steadfast callback token/configuration এবং operational monitoring নিশ্চিত করতে হবে। Pathao return/delivery live integration নেই। Browser push/live websocket নেই; dashboard refresh করে update দেখা হয়। |
| ৭ | Return হলে Facebook Pixel server-side cancel/return signal | **বাকি** | Steadfast event log রাখার জন্য integration event table আছে। | Facebook Conversions API event পাঠানোর route, Pixel/Dataset ID, access token, event deduplication এবং return/cancel event mapping নেই। |
| ৮ | Facebook Pixel, TikTok Pixel ও Google Ads server-side CAPI | **বাকি** | Storefront-এ সাধারণ internal event tracking hook আছে। | Facebook CAPI, TikTok Events API এবং Google Ads enhanced/server-side conversion setup নেই। Event ID, purchase value, currency, order ID, hashed customer data এবং external credentials/configuration দরকার। |
| ৯ | Mobile number/Order ID দিয়ে Steadfast/Pathao live tracking; AI status reply | **আংশিক** | Customer tracking page order ID বা mobile number দিয়ে order status দেখে। SmartGen supplied shop/order context অনুযায়ী shipment/delivery message দিতে পারে। Steadfast booking, status lookup ও webhook route আছে। | Pathao API নেই। Courier live status সম্পূর্ণ নির্ভরযোগ্য করতে Steadfast credentials, callback এবং mapping production-এ নিয়মিত active রাখতে হবে। |
| ১০ | District অনুযায়ী automatic delivery charge | **পূর্ণ** | Live test-এ Dhaka-এর জন্য ৳90, Rajshahi/ঢাকার বাইরের জন্য ৳150 এসেছে। `customerCanSelect: false` আছে। Emergency ৳250 customer checkout-এ selectable নয় এবং admin-only policy হিসেবে রাখা হয়েছে। | District directory আরও সম্পূর্ণ করা গেলে location fallback আরও নির্ভুল হবে; মূল requirement পূর্ণ। |
| ১১ | IP order security, repeat-order block, success rate ৬০%-এর নিচে হলে hold/advance fee | **আংশিক** | Customer trust calculation-এ success rate, cancel rate, failed/returned orders এবং risk label আছে। Admin customer trust route আছে। | ২৪ ঘণ্টার IP rate-limit/block নেই। Success rate ৬০%-এর নিচে হলে checkout automatically hold করা, advance delivery fee require করা অথবা WhatsApp escalation—এই enforcement এখনো checkout-এর সঙ্গে যুক্ত হয়নি। |
| ১২ | Incomplete order hidden page ও future conversion | **আংশিক** | `incomplete_checkouts` table/schema তৈরি আছে। | Checkout শুরু করে final submit না করা visitor-এর data save করার route, consent-safe capture, hidden admin listing, follow-up status এবং conversion workflow নেই। শুধু database placeholder আছে। |
| ১৩ | Messenger, WhatsApp, TikTok ও Website order এক central admin page-এ | **আংশিক** | Website orders admin Orders page-এ আছে। Steadfast booking এক admin workflow থেকে করা যায়। POS sale আলাদা table ও dashboard-এ আছে। | Messenger, WhatsApp এবং TikTok order webhook/connector নেই। তাই সব channel-এর order এখনো সত্যিকারের central inbox/order board-এ আসে না। |
| ১৪ | Gmail/WhatsApp confirmation ও promotional message; ভবিষ্যতে SMS | **আংশিক** | WhatsApp click-to-chat link, support number এবং mailto contact আছে। | Automated order confirmation message, transactional Gmail/email sending, WhatsApp template message এবং SMS provider integration নেই। Customer consent, opt-out ও promotional compliance workflow-ও দরকার। |
| ১৫ | Smart Cart Recovery ও reminder | **আংশিক** | Browser localStorage-এর মাধ্যমে একই device/browser-এ cart restore থাকে। | Server-side abandoned cart record, cross-device account cart, reminder queue, WhatsApp/email/SMS consent এবং automatic reminder delivery নেই। |

## Hidden হিসাব ও ব্যবসা ব্যবস্থাপনা Requirements

| নং | Requirement | বর্তমান অবস্থা | কী আছে | কী বাকি |
|---:|---|---|---|---|
| ১ | Supplier & Purchase Management, supplier invoice ও BSTI document | **আংশিক** | D1 migration-এ suppliers, purchases এবং purchase_items table তৈরি আছে। | Admin CRUD screen, supplier profile, purchase entry, product-cost update, document upload/storage, BSTI file management এবং purchase report নেই। R2 enable হলে document storage করা যাবে। |
| ২ | Expense Management ও প্রকৃত Profit report | **আংশিক** | D1 migration-এ expenses table আছে। Product cost ধরে gross profit dashboard হিসাব করে। | Advertising, packaging, salary, rent, electricity ইত্যাদির expense-entry screen নেই। Expense বাদ দিয়ে net profit, monthly comparison, category report এবং export নেই। |

## ইতিমধ্যে Requirement List-এর বাইরে সম্পন্ন গুরুত্বপূর্ণ Feature

Product detail page-এ multiple image/video media support, direct R2 upload-এর প্রস্তুত UI/API, View Mode থেকে storefront preview এবং Edit Mode shortcut, verified buyer ৫-star review, admin review approval, rating aggregation এবং ৪.৫+ rating-এর Top Collection eligibility যুক্ত হয়েছে। R2 account এখনও enable করা হয়নি, তাই upload controls deploy করা থাকলেও বাস্তব file transfer শুরু হবে R2 enable ও `PRODUCT_IMAGES` bucket binding-এর পরে।

Customer SmartGen verified active catalogue থেকে clickable product cards ও product detail links দেয়। Sitemap route live আছে। Admin Bengali guide এবং Dashboard-এর সকালের shortcut checklist-ও live আছে।

## Live Verification Evidence

| Check | Result |
|---|---|
| `/api/health` | HTTP 200 |
| `/api/config` | HTTP 200; delivery policy ও payment methods পাওয়া গেছে |
| `/api/products` | HTTP 200 |
| Product detail API | HTTP 200 |
| Product reviews API | HTTP 200 |
| Dhaka delivery fee | ৳90; `customerCanSelect: false` |
| Outside Dhaka delivery fee | ৳150; `customerCanSelect: false` |
| `/sitemap.xml` | HTTP 200 |
| Admin overview/products/reviews without session | HTTP 401 |
| Product-media upload without admin session | HTTP 401 |
| Invalid review without verified purchase | HTTP 403 |
| Empty order payload | HTTP 400 |
| `/admin/guide/` | HTTP 200 |
| R2 bucket listing | HTTP 403; account-level R2 activation এখনও pending |

## মোট অবস্থার সারাংশ

এই audit অনুযায়ী **১৭টি requirement মিলিয়ে ১টি পূর্ণ, ১৪টি আংশিক এবং ২টি মূল integration বাকি**। এর মধ্যে ১৫টি মূল website requirement-এর ১টি পূর্ণ, ১২টি আংশিক এবং ২টি বাকি; hidden হিসাবের ২টি requirement আংশিক প্রস্তুত। আংশিক feature-গুলোর অনেকগুলোর backend foundation তৈরি আছে; কিন্তু external channel automation এবং owner-facing finance screens ছাড়া সেগুলোকে সম্পূর্ণ বলা যাবে না। তাই website-কে এখন “core commerce ready” বলা যায়, কিন্তু “সব requirement ১০০% complete” বলা সঠিক হবে না।

## সবচেয়ে জরুরি পরবর্তী কাজের ক্রম

**প্রথম অগ্রাধিকার:** Facebook CAPI, TikTok Events API, Google Ads conversion এবং return/cancel event sync। Ads চালানোর আগে এই অংশগুলি ঠিক করা উচিত, কারণ শুধু browser pixel দিয়ে reliable purchase/return attribution পাওয়া যাবে না।

**দ্বিতীয় অগ্রাধিকার:** Messenger/WhatsApp central order integration, inbox confirmation এবং Pathao tracking। এগুলোর জন্য সংশ্লিষ্ট business/API credentials ও webhook configuration লাগবে।

**তৃতীয় অগ্রাধিকার:** Supplier/Purchase, Expense এবং Incomplete Checkout hidden management screens। এগুলো ছাড়া প্রকৃত net profit, supplier cost এবং abandoned order conversion পরিচালনা করা যাবে না।

**চতুর্থ অগ্রাধিকার:** IP rate-limit, ৬০%-এর নিচের customer trust enforcement, advance fee/WhatsApp escalation, barcode label printing এবং automated customer messaging।

**পঞ্চম অগ্রাধিকার:** Cloudflare R2 enable করে product image upload চালু করা। Code ও UI প্রস্তুত; account activation এবং bucket binding owner-side action।

## Owner-এর কাছ থেকে ভবিষ্যতে যে তথ্য/credential লাগবে

Facebook Pixel/Dataset ID ও Conversions API access token, TikTok Pixel/Event API token, Google Ads conversion ID/label, Messenger Page token ও webhook verify token, WhatsApp Cloud API/BSP credentials, Pathao merchant API credentials, SMS provider details এবং R2 activation/bucket binding প্রয়োজন হবে। এগুলো chat-এ প্রকাশ না করে নিরাপদ secret configuration-এ দিতে হবে।

## References

[1]: https://github.com/bayzed123/rinovabd.com/blob/main/worker/src/index.ts "Rinova BD Worker API routes and business logic"

[2]: https://github.com/bayzed123/rinovabd.com/tree/main/worker/migrations "Rinova BD D1 migrations"

[3]: https://github.com/bayzed123/rinovabd.com/blob/main/web/admin/index.html "Rinova BD Admin Dashboard interface"

[4]: https://rinovabd-worker.abdussalam8480.workers.dev/api/config "Live Rinova BD configuration and delivery policy"

[5]: https://rinovabd-worker.abdussalam8480.workers.dev/api/products "Live Rinova BD product catalogue API"

[6]: https://rinovabd-worker.abdussalam8480.workers.dev/sitemap.xml "Live Rinova BD product sitemap"

[7]: https://rinovabd-worker.abdussalam8480.workers.dev/admin/guide/ "Live Bengali Rinova BD admin guide"
