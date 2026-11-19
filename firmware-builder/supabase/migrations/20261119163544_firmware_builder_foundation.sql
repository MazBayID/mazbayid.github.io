create extension if not exists pgcrypto;

create table public.firmware_builds (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'queued'
    check (status in ('queued', 'building', 'succeeded', 'failed', 'cancelled')),
  variant text not null
    check (variant in ('via_wifi', 'via_chronos', 'mochi_chronos')),
  gpio_config jsonb not null default '{}'::jsonb
    check (jsonb_typeof(gpio_config) = 'object'),
  config_schema_version integer not null default 1
    check (config_schema_version > 0),
  status_token_hash text not null unique,
  request_fingerprint_hash text not null,
  github_run_id bigint,
  github_run_attempt integer,
  source_commit_sha text,
  error_code text,
  error_message_safe text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  expires_at timestamptz not null default (now() + interval '7 days')
);

create index firmware_builds_status_created_idx
  on public.firmware_builds (status, created_at desc);
create index firmware_builds_expiry_idx
  on public.firmware_builds (expires_at);

create table public.firmware_build_artifacts (
  id uuid primary key default gen_random_uuid(),
  build_id uuid not null references public.firmware_builds(id) on delete cascade,
  artifact_type text not null
    check (artifact_type in ('merged_bin', 'advanced_zip', 'build_info')),
  bucket_id text not null default 'firmware-artifacts',
  object_path text not null,
  size_bytes bigint not null check (size_bytes > 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  unique (build_id, artifact_type),
  unique (bucket_id, object_path)
);

create table public.firmware_build_rate_limits (
  fingerprint_hash text primary key,
  window_started_at timestamptz not null default now(),
  request_count integer not null default 0 check (request_count >= 0),
  blocked_until timestamptz
);

create or replace function public.touch_firmware_build_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger firmware_builds_touch_updated_at
before update on public.firmware_builds
for each row execute function public.touch_firmware_build_updated_at();

create or replace function public.consume_firmware_build_quota(
  p_fingerprint_hash text,
  p_window_seconds integer default 3600,
  p_max_requests integer default 3
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_fingerprint_hash is null or length(p_fingerprint_hash) < 32
     or p_window_seconds < 1 or p_max_requests < 1 then
    return false;
  end if;

  insert into public.firmware_build_rate_limits as limits
    (fingerprint_hash, window_started_at, request_count)
  values
    (p_fingerprint_hash, now(), 1)
  on conflict (fingerprint_hash) do update
    set window_started_at = case
          when limits.window_started_at + make_interval(secs => p_window_seconds) <= now()
          then now()
          else limits.window_started_at
        end,
        request_count = case
          when limits.window_started_at + make_interval(secs => p_window_seconds) <= now()
          then 1
          else limits.request_count + 1
        end,
        blocked_until = case
          when limits.window_started_at + make_interval(secs => p_window_seconds) <= now()
          then null
          else limits.blocked_until
        end
  returning request_count into v_count;

  if v_count > p_max_requests then
    update public.firmware_build_rate_limits
      set blocked_until = now() + make_interval(secs => p_window_seconds)
      where fingerprint_hash = p_fingerprint_hash;
    return false;
  end if;

  return true;
end;
$$;

alter table public.firmware_builds enable row level security;
alter table public.firmware_build_artifacts enable row level security;
alter table public.firmware_build_rate_limits enable row level security;

revoke all on public.firmware_builds from anon, authenticated;
revoke all on public.firmware_build_artifacts from anon, authenticated;
revoke all on public.firmware_build_rate_limits from anon, authenticated;
revoke all on function public.consume_firmware_build_quota(text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_firmware_build_quota(text, integer, integer) to service_role;
grant all on public.firmware_builds to service_role;
grant all on public.firmware_build_artifacts to service_role;
grant all on public.firmware_build_rate_limits to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'firmware-artifacts',
  'firmware-artifacts',
  false,
  20971520,
  array['application/octet-stream', 'application/zip', 'application/json', 'text/plain']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
