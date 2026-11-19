-- New public guestbook submissions are approved immediately.
-- Existing pending rows are intentionally left unchanged.
alter table public.guestbook_messages
  alter column approved set default true;

drop policy if exists "Anyone can submit unapproved guestbook messages"
  on public.guestbook_messages;

create policy "Anyone can submit approved guestbook messages"
  on public.guestbook_messages
  for insert
  to anon
  with check (
    approved = true
    and char_length(btrim(name)) between 1 and 40
    and char_length(btrim(message)) between 1 and 500
  );
