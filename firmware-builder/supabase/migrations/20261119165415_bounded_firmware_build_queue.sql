create or replace function public.reserve_firmware_build_request(
  p_variant text,
  p_gpio_config jsonb,
  p_status_token_hash text,
  p_request_fingerprint_hash text,
  p_max_active integer default 5
)
returns table(build_id uuid, result text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active integer;
  v_build_id uuid;
begin
  if p_variant not in ('via_wifi', 'via_chronos', 'mochi_chronos')
     or jsonb_typeof(p_gpio_config) <> 'object'
     or p_status_token_hash !~ '^[a-f0-9]{64}$'
     or p_request_fingerprint_hash !~ '^[a-f0-9]{64}$'
     or p_max_active < 1 or p_max_active > 20 then
    return query select null::uuid, 'invalid_request'::text;
    return;
  end if;

  perform pg_advisory_xact_lock(741852963);

  update public.firmware_builds
  set status = 'failed',
      finished_at = now(),
      error_code = 'build_timed_out',
      error_message_safe = 'The build expired before completion. Please submit a new build.'
  where status in ('queued', 'building')
    and updated_at < now() - interval '45 minutes';

  if not public.consume_firmware_build_quota(
    p_request_fingerprint_hash, 3600, 3
  ) then
    return query select null::uuid, 'rate_limited'::text;
    return;
  end if;

  select count(*) into v_active
  from public.firmware_builds
  where status in ('queued', 'building')
    and expires_at > now();

  if v_active >= p_max_active then
    return query select null::uuid, 'capacity_full'::text;
    return;
  end if;

  insert into public.firmware_builds (
    variant, gpio_config, status_token_hash, request_fingerprint_hash
  )
  values (
    p_variant, p_gpio_config, p_status_token_hash, p_request_fingerprint_hash
  )
  returning id into v_build_id;

  return query select v_build_id, 'queued'::text;
end;
$$;

revoke all on function public.reserve_firmware_build_request(text, jsonb, text, text, integer) from public, anon, authenticated;
grant execute on function public.reserve_firmware_build_request(text, jsonb, text, text, integer) to service_role;
