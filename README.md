# Aqua Finatics — Karachi seafood storefront

A mobile-responsive storefront plus a secure admin-panel scaffold, built with plain HTML, CSS and JavaScript. The storefront uses the client-supplied Aqua Finatics blue logo, an ocean-blue / aqua palette, and a subtle animated SVG wave in the hero. The site has no package manager, framework, or build step. Supabase is optional until configured; the public catalogue falls back to the bundled `products.js` data before the backend is connected.

## Preview locally

From this folder, run:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. The hero and catalogue search fields stay in sync, and more seafood loads automatically as visitors scroll (with a manual fallback for older browsers). The basket, filters and WhatsApp order message work from a static host. Until Supabase is configured, catalogue edits are not shared; online payment is not implemented.

## Deploy

Upload the project contents together to the Vercel project root (or another static web root). Keep the storefront files, `admin.html`, `admin.css`, `admin.js`, `supabase-config.js` and the `assets/` directory together. Apply the SQL and browser-key setup in `SUPABASE_SETUP.md` before expecting admin edits to update the shared storefront.

## Updating the site

- Edit prices, local names and availability in `products.js`.
- Update payment wording in `index.html` when the bank details are ready.
- The current payment note offers JazzCash/Easypaisa on **0370 3409201**; the WhatsApp order link is configured for **+92 370 3409201**. Karachi delivery is a flat **PKR 250 per order**.
- The page uses the intended canonical domain `aquafinatics.pk`. Please confirm the exact spelling before DNS/deployment: the original message's link target was `aquafanatics.pk` (without the extra “i”).
- The sample catalogue is based on the supplied **1–15 October 2026** list: 77 items across fish, prawns, lobster/crabs and special seafood. Prices are per kilogram; the three supplier-listed price ranges are retained as shown. White Sardine is unavailable per that list.

## Order flow

Customers add seafood in 0.5 kg steps, enter their name and Karachi delivery address, then send a prefilled order through WhatsApp. The basket calculates the listed per-kg prices plus the PKR 250 Karachi delivery charge and includes the total in the message. It asks Aqua Finatics to confirm availability and delivery details; advance payment is made after confirmation. Three supplier-listed product ranges remain displayed as ranges. No card/bank payment is collected on the site.

## Admin panel

Open `/admin.html` to manage products. The scaffold supports email/password sign-in, add/edit/delete across all four catalogue categories, per-kg prices and ranges, stock status, image uploads, and image URLs. To enable shared live changes, create a Supabase project and follow `SUPABASE_SETUP.md`; it includes RLS policies and a seed file for the existing 77 products. Add only the Supabase publishable/anon key to `supabase-config.js` after applying the policies—never a service-role key or password.

## Product imagery

Transparent seafood cut-outs are stored locally in `assets/images/`, so the preview does not depend on outside image servers. Fish cards use species-family overrides and a deterministic image rotation instead of falling back to the same generic fish for most of the catalogue. The cut-outs are illustrative stock images, not Aqua Finatics' own product photography; please verify each source's commercial-use and attribution terms (or replace with supplier-owned photos) before public launch. Sources are listed in `assets/IMAGE-SOURCES.md`.
