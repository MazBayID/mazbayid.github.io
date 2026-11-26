-- Admin allowlist for the NekOS Skin Manager Edge Function.
-- No browser roles can read or modify this table; the function uses service_role.
create table if not exists public.skin_manager_admins (
  email text primary key,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  constraint skin_manager_admins_email_lowercase check (email = lower(email))
);

alter table public.skin_manager_admins enable row level security;
revoke all on public.skin_manager_admins from anon, authenticated;
grant all on public.skin_manager_admins to service_role;

insert into public.skin_manager_admins (email, enabled)
values ('limited.corporated@gmail.com', true)
on conflict (email) do update set enabled = excluded.enabled;
