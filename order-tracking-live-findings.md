# Live order tracking findings — 2026-08-25

A read-only live D1 query found two recent pending test orders using only order code, invoice number, status, and timestamp. Public API verification returned HTTP 200 for both invoice-number and order-code lookup on the recent test order identifiers. The response included the order code, invoice number, pending status, pending courier status, and Bangla preparation message; no customer contact data was retrieved.

The public tracking page was opened with a prefilled invoice-number URL. After pressing Check status, the customer-facing result displayed `RNV-MT7YGCXO`, `RNV-INV-MT7YGCXO`, `pending`, and the Bangla message `আপনার অর্ডারটি প্রস্তুত করা হচ্ছে।` This confirms front-side invoice tracking works for the user's live test order.
