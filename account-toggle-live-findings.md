# Account authentication toggle verification

After deployment, the public account page at `/account.html` opened in Sign in mode with only the mobile-number/password form visible. The Create account tab remained available, and the existing phone/password authentication fields were unchanged.

Clicking Create account switched the panel to only Name, Mobile number, Email and Password plus the Create account action. The Sign in form was hidden. The issue was caused by the inline `.stack{display:grid}` rule overriding the browser's default `[hidden]` behavior; `.stack[hidden]{display:none!important}` now ensures JavaScript toggles remain effective. Tab semantics now include `role=tab`, `aria-selected` and `aria-controls`.
