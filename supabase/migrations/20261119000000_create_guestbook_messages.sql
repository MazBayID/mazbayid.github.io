-- MazBayID public guestbook
-- Visitors can submit messages without an account.
-- New messages remain hidden until an administrator approves them.

create table if not exists public.guestbook_messages (
  id bigint generated always as identity primary key,
  name text not null default 'Anonymous',
  message text not null,
  created_at timestamptz not null default now(),
  approved boolean not null default false,

  constraint guestbook_name_length
    check (char_length(btrim(name)) between 1 and 40),

  constraint guestbook_message_length
    check (char_length(btrim(message)) between 1 and 500)
);

create index if not exists guestbook_messages_approved_created_at_idx
  on public.guestbook_messages (created_at desc)
  where approved = true;

alter table public.guestbook_messages enable row level security;

-- Anonymous visitors may only read approved messages.
grant select on table public.guestbook_messages to anon;

create policy "Anyone can read approved guestbook messages"
  on public.guestbook_messages
  for select
  to anon
  using (approved = true);

-- Anonymous visitors may submit unapproved messages only.
grant insert on table public.guestbook_messages to anon;

create policy "Anyone can submit unapproved guestbook messages"
  on public.guestbook_messages
  for insert
  to anon
  with check (
    approved = false
    and char_length(btrim(name)) between 1 and 40
    and char_length(btrim(message)) between 1 and 500
  );
