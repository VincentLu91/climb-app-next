create or replace function public.refresh_subscription_credits_once(
  p_user_id uuid,
  p_amount bigint,
  p_reason text,
  p_stripe_event_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  transaction_inserted boolean;
begin
  if p_amount < 0 then
    raise exception 'Subscription credit amount cannot be negative';
  end if;

  insert into public.credit_transactions (
    user_id,
    bucket,
    amount,
    reason,
    stripe_event_id
  )
  values (
    p_user_id,
    'subscription',
    p_amount,
    p_reason,
    p_stripe_event_id
  )
  on conflict (stripe_event_id) do nothing
  returning true into transaction_inserted;

  if transaction_inserted is not true then
    return false;
  end if;

  insert into public.credit_balances (
    user_id,
    subscription_credits,
    topup_credits,
    updated_at
  )
  values (
    p_user_id,
    p_amount,
    0,
    now()
  )
  on conflict (user_id) do update
  set
    subscription_credits = p_amount,
    updated_at = now();

  return true;
end;
$$;

revoke all on function public.refresh_subscription_credits_once(
  uuid,
  bigint,
  text,
  text
) from public;

revoke all on function public.refresh_subscription_credits_once(
  uuid,
  bigint,
  text,
  text
) from anon;

revoke all on function public.refresh_subscription_credits_once(
  uuid,
  bigint,
  text,
  text
) from authenticated;

grant execute on function public.refresh_subscription_credits_once(
  uuid,
  bigint,
  text,
  text
) to service_role;