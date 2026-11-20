create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;

do $$
begin
  if not exists (
    select 1 from vault.secrets where name = 'firmware_storage_cleanup_token'
  ) then
    perform vault.create_secret(
      encode(extensions.gen_random_bytes(48), 'hex'),
      'firmware_storage_cleanup_token',
      'Shared token for scheduled firmware artifact cleanup Edge Function',
      null
    );
  end if;
end;
$$;

create or replace function public.get_firmware_storage_cleanup_token()
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = 'firmware_storage_cleanup_token'
  limit 1;
$$;

revoke all on function public.get_firmware_storage_cleanup_token() from public, anon, authenticated;
grant execute on function public.get_firmware_storage_cleanup_token() to service_role;
