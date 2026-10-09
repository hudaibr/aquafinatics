# Admin panel: Supabase + Vercel setup

The storefront is still deployable as plain static files. The admin panel uses Supabase Auth for sign-in, Postgres for the shared catalogue, and Supabase Storage for uploaded product images. No build step or Supabase JavaScript CDN is required.

## What is included

- `/admin.html` — responsive catalogue manager with email/password sign-in, product search and category filter.
- Add, edit, and delete products in all four categories: Fish, Prawns, Crab & lobster, and Special seafood.
- Edit local name, detail, price per kg (including supplier-listed ranges), stock status, and image.
- Upload JPG/PNG/WebP files (up to 8 MB) to the `product-images` bucket or paste an HTTP(S) image URL.
- The public storefront reads the shared table when connected. It keeps the bundled catalogue as a fallback until the backend is configured or if the request fails.
- `supabase/setup.sql` creates the table, private admin allow-list, row-level security policies, and public-read/admin-write image bucket.
- `supabase/seed-products.sql` seeds the current 77 products once; it does not overwrite existing rows when re-run.

## 1. Create the Supabase project

Create a Supabase project and choose a region reasonably close to your customers. Wait for provisioning to finish.

## 2. Create the schema and import the current catalogue

In the Supabase dashboard, open **SQL Editor** and run these files in order:

1. `supabase/setup.sql`
2. `supabase/seed-products.sql`

The product table is publicly readable so the storefront can display it. Insert/update/delete permissions are limited by RLS to a user explicitly listed in `public.admin_users`. The image bucket is public-read so customers can see product pictures; upload, replacement, and delete operations are admin-only.

## 3. Create the first admin account

In Supabase, open **Authentication → Users** and create one email/password user. Use a new, private password; do not reuse any credential previously shared in chat or place a password in this project.

Copy that user's UUID from the Auth Users page. In SQL Editor, add it to the private admin allow-list:

```sql
insert into public.admin_users (user_id)
values ('PASTE_THE_AUTH_USER_UUID_HERE')
on conflict (user_id) do nothing;
```

The person can sign in with the email/password created in Supabase. A valid Supabase user who is not in this allow-list can sign in but cannot manage products or upload images.

## 4. Configure the browser-safe project key

In Supabase **Project Settings → API**, copy the **Project URL** and the **publishable/anon key**. Put them in `supabase-config.js`:

```js
window.AQUA_SUPABASE_CONFIG = {
  url: 'https://YOUR_PROJECT.supabase.co',
  publishableKey: 'YOUR_SUPABASE_PUBLISHABLE_KEY'
};
```

The publishable/anon key is designed for browser use only when the policies in `supabase/setup.sql` are active. **Never paste a `service_role` or secret key into `supabase-config.js`, HTML, JavaScript, or any other public file.** Do not add an admin password to the project.

## 5. Deploy to Vercel and test

Deploy the project folder as a static site. Then:

1. Open the storefront. It should load its products from Supabase.
2. Open `/admin.html` and sign in with the allow-listed Supabase account.
3. Add or edit a test product, then refresh the storefront to confirm the change.
4. Upload a test image and confirm it appears both in the admin list and storefront.

The admin page is marked `noindex`, but that only discourages indexing. It is **not** a security control. Security comes from Supabase Auth and the database/storage RLS policies.

## Notes

- Before configuration, the sign-in controls are intentionally disabled and the public store keeps using its bundled catalogue.
- A storefront tab already open during an edit may need a reload before it shows the change.
- Products with no custom image use the existing illustrative cut-outs. Uploaded or pasted image URLs override that fallback.
- The catalogue is public by design, but admin write access is not. Do not weaken the supplied RLS policies to make the editor work; check the project URL/key and the admin UUID instead.
- Verify commercial-use rights for all images before launch. Admin-uploaded files are restricted to JPG, PNG, or WebP and stored in Supabase Storage.
