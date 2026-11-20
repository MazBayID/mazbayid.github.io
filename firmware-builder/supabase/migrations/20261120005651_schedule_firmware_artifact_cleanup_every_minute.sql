select cron.schedule(
  'firmware-artifact-cleanup',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://ymjhfaplponxbjhpvhuq.supabase.co/functions/v1/firmware-storage-cleanup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cleanup-token', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'firmware_storage_cleanup_token'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$
);
