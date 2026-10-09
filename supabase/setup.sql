-- Aqua Finatics catalogue/admin schema for Supabase.
-- Run this in the Supabase SQL Editor. Apply the matching admin user UUID separately
-- (see SUPABASE_SETUP.md). Do not put a service-role key in the website.

create table if not exists public.products (
  id text primary key,
  name text not null,
  local_name text not null default '',
  detail text not null default '',
  category text not null check (category in ('fish', 'prawns', 'crustaceans', 'special')),
  price_low numeric(10, 2) not null check (price_low >= 0),
  price_high numeric(10, 2) not null check (price_high >= price_low),
  in_stock boolean not null default true,
  image_url text not null default '',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_catalog_order_idx
  on public.products (sort_order, name);

create index if not exists products_catalog_category_order_idx
  on public.products (category, sort_order, name);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.products enable row level security;
alter table public.admin_users enable row level security;

-- SECURITY DEFINER lets the policy check the private allow-list without exposing it.
create or replace function public.is_catalog_admin()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select exists (
    select 1
    from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_catalog_admin() from public;
grant execute on function public.is_catalog_admin() to authenticated;
revoke all on public.admin_users from anon, authenticated;

grant select on public.products to anon, authenticated;
grant insert, update, delete on public.products to authenticated;

drop policy if exists "Public can read product catalogue" on public.products;
create policy "Public can read product catalogue"
  on public.products for select
  to anon, authenticated
  using (true);

drop policy if exists "Catalogue admins can insert products" on public.products;
create policy "Catalogue admins can insert products"
  on public.products for insert
  to authenticated
  with check (public.is_catalog_admin());

drop policy if exists "Catalogue admins can update products" on public.products;
create policy "Catalogue admins can update products"
  on public.products for update
  to authenticated
  using (public.is_catalog_admin())
  with check (public.is_catalog_admin());

drop policy if exists "Catalogue admins can delete products" on public.products;
create policy "Catalogue admins can delete products"
  on public.products for delete
  to authenticated
  using (public.is_catalog_admin());

-- Publicly readable cut-outs; only the allow-listed admin can upload/replace/delete.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'product-images',
  'product-images',
  true,
  8388608,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public can view Aqua product images" on storage.objects;
create policy "Public can view Aqua product images"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "Catalogue admins can upload Aqua product images" on storage.objects;
create policy "Catalogue admins can upload Aqua product images"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images' and public.is_catalog_admin());

drop policy if exists "Catalogue admins can update Aqua product images" on storage.objects;
create policy "Catalogue admins can update Aqua product images"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images' and public.is_catalog_admin())
  with check (bucket_id = 'product-images' and public.is_catalog_admin());

drop policy if exists "Catalogue admins can delete Aqua product images" on storage.objects;
create policy "Catalogue admins can delete Aqua product images"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images' and public.is_catalog_admin());
