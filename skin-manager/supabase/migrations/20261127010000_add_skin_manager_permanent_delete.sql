create or replace function public.skin_manager_delete_skin(p_skin_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_order_ids uuid[];
  v_payment_count integer := 0;
  v_entitlement_count integer := 0;
  v_order_count integer := 0;
  v_skin_count integer := 0;
begin
  if not exists (select 1 from public.skins where id = p_skin_id) then
    raise exception 'skin_not_found';
  end if;

  select coalesce(array_agg(id), array[]::uuid[])
    into v_order_ids
    from private.skin_orders
    where skin_id = p_skin_id;

  delete from private.skin_entitlements where skin_id = p_skin_id;
  get diagnostics v_entitlement_count = row_count;

  if cardinality(v_order_ids) > 0 then
    delete from private.skin_payments where order_id = any(v_order_ids);
    get diagnostics v_payment_count = row_count;

    delete from private.skin_orders where id = any(v_order_ids);
    get diagnostics v_order_count = row_count;
  end if;

  delete from public.skins where id = p_skin_id;
  get diagnostics v_skin_count = row_count;

  return jsonb_build_object(
    'skin_deleted', v_skin_count,
    'orders_deleted', v_order_count,
    'payments_deleted', v_payment_count,
    'entitlements_deleted', v_entitlement_count
  );
end;
$$;

revoke all on function public.skin_manager_delete_skin(uuid) from public, anon, authenticated;
grant execute on function public.skin_manager_delete_skin(uuid) to service_role;

comment on function public.skin_manager_delete_skin(uuid) is
  'Permanently deletes one skin and its test orders, payments, and entitlements. Callable only by service_role.';