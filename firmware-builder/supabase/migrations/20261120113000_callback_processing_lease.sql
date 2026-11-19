alter table public.firmware_builds
  add column if not exists callback_claimed_at timestamptz;

create or replace function public.claim_firmware_build_callback(
  p_build_id uuid,
  p_run_id bigint,
  p_lease_seconds integer default 600
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare v_claimed integer;
begin
  if p_build_id is null or p_run_id is null or p_run_id < 1
     or p_lease_seconds < 60 or p_lease_seconds > 1800 then
    return false;
  end if;

  update public.firmware_builds
  set callback_claimed_at = now()
  where id = p_build_id
    and status in ('queued', 'building')
    and github_run_id = p_run_id
    and (callback_claimed_at is null
         or callback_claimed_at < now() - make_interval(secs => p_lease_seconds));

  get diagnostics v_claimed = row_count;
  return v_claimed = 1;
end;
$$;

revoke all on function public.claim_firmware_build_callback(uuid, bigint, integer)
  from public, anon, authenticated;
grant execute on function public.claim_firmware_build_callback(uuid, bigint, integer)
  to service_role;
