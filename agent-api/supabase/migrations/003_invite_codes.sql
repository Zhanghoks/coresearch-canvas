create table public.invite_codes (
    code text primary key check (code ~ '^[A-Z0-9]{4}-[A-Z0-9]{4}$'),
    expires_at timestamptz,
    redeemed_at timestamptz,
    redeemed_by uuid references auth.users (id) on delete set null,
    created_at timestamptz not null default now()
);

alter table public.invite_codes enable row level security;
revoke all on public.invite_codes from public, anon, authenticated;
grant all on public.invite_codes to service_role;
