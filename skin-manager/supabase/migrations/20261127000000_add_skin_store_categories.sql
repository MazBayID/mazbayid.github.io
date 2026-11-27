alter table public.skins
  add column if not exists category text not null default 'Basic';

alter table public.skins
  drop constraint if exists skins_category_check;

alter table public.skins
  add constraint skins_category_check
  check (category in ('Free', 'Basic', 'Premium', 'Exclusive'));

comment on column public.skins.category is
  'Store merchandising category; independent from price_amount.';
