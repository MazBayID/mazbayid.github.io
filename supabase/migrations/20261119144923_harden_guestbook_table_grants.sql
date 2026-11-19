-- Remove default table privileges that are unnecessary for public visitors.
-- RLS still controls which rows can be read or inserted.
revoke truncate, references, trigger
on table public.guestbook_messages
from anon, authenticated;
