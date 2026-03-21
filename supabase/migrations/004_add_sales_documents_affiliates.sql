-- Sales tracking (from Shopify or manual input)
create table if not exists sales_data (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  date date not null,
  sales_count int default 0,
  sales_revenue numeric(10,2) default 0,
  add_to_cart_count int default 0,
  source text default 'manual' check (source in ('shopify', 'pinterest', 'manual')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(org_id, date, source)
);

create index if not exists sales_data_org_date_idx on sales_data(org_id, date);

-- Client documents (agency shares docs with clients)
create table if not exists client_documents (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  title text not null,
  description text,
  file_url text not null,
  file_type text,
  file_size bigint,
  uploaded_by uuid references users(id) on delete set null,
  created_at timestamptz default now()
);

create index if not exists client_documents_org_idx on client_documents(org_id);

-- Affiliate partners (referral tracking)
create table if not exists affiliate_partners (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  name text not null,
  email text,
  code text unique not null,
  commission_rate numeric(5,2) default 10,
  total_clicks int default 0,
  total_conversions int default 0,
  total_earnings numeric(10,2) default 0,
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists affiliate_partners_org_idx on affiliate_partners(org_id);
create index if not exists affiliate_partners_code_idx on affiliate_partners(code);

-- Affiliate pin links (product links in pins)
create table if not exists affiliate_pin_links (
  id uuid default gen_random_uuid() primary key,
  org_id uuid references organizations(id) on delete cascade not null,
  pin_id uuid references pins(id) on delete set null,
  product_url text not null,
  affiliate_tag text,
  clicks int default 0,
  sales int default 0,
  revenue numeric(10,2) default 0,
  created_at timestamptz default now()
);

create index if not exists affiliate_pin_links_org_idx on affiliate_pin_links(org_id);

-- RLS policies
alter table sales_data enable row level security;
alter table client_documents enable row level security;
alter table affiliate_partners enable row level security;
alter table affiliate_pin_links enable row level security;

-- Sales data policies
create policy "Users can view own org sales data" on sales_data
  for select using (org_id = user_org_id() or is_agency_admin());
create policy "Agency admins can insert sales data" on sales_data
  for insert with check (is_agency_admin() or org_id = user_org_id());
create policy "Agency admins can update sales data" on sales_data
  for update using (is_agency_admin() or org_id = user_org_id());

-- Client documents policies
create policy "Users can view own org documents" on client_documents
  for select using (org_id = user_org_id() or is_agency_admin());
create policy "Agency admins can manage documents" on client_documents
  for insert with check (is_agency_admin());
create policy "Agency admins can delete documents" on client_documents
  for delete using (is_agency_admin());

-- Affiliate partners policies
create policy "Users can view own org affiliate partners" on affiliate_partners
  for select using (org_id = user_org_id() or is_agency_admin());
create policy "Agency admins can manage affiliate partners" on affiliate_partners
  for insert with check (is_agency_admin() or org_id = user_org_id());
create policy "Agency admins can update affiliate partners" on affiliate_partners
  for update using (is_agency_admin() or org_id = user_org_id());

-- Affiliate pin links policies
create policy "Users can view own org affiliate pin links" on affiliate_pin_links
  for select using (org_id = user_org_id() or is_agency_admin());
create policy "Users can manage own org affiliate pin links" on affiliate_pin_links
  for insert with check (is_agency_admin() or org_id = user_org_id());
