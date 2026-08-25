# Admin preview-to-edit live verification — 2026-08-25

The authenticated admin session remained available in the same browser tab. `/?admin_preview=1` rendered the live storefront preview with product links carrying `admin_preview=1`. Directly opening the Blush & Bloom detail route with that context displayed `Edit this product in Admin Dashboard →`. Following that link opened `/admin/?view=products&edit=10` in the authenticated dashboard and loaded Products view normally. The product editor route is therefore working end-to-end without exposing the admin surface to unauthenticated visitors.
