create or replace function public.grant_credits_once(
  p_user_id uuid,
  p_bucket text,
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
  if p_amount <= 0 then
    raise exception 'Credit grant amount must be positive';
  end if;

  if p_bucket not in ('subscription', 'topup') then
    raise exception 'Invalid credit bucket';
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
    p_bucket,
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
    case when p_bucket = 'subscription' then p_amount else 0 end,
    case when p_bucket = 'topup' then p_amount else 0 end,
    now()
  )
  on conflict (user_id) do update
  set
    subscription_credits =
      public.credit_balances.subscription_credits +
      case when p_bucket = 'subscription' then p_amount else 0 end,
    topup_credits =
      public.credit_balances.topup_credits +
      case when p_bucket = 'topup' then p_amount else 0 end,
    updated_at = now();

  return true;
end;
$$;

revoke all on function public.grant_credits_once(
  uuid,
  text,
  bigint,
  text,
  text
) from public;

revoke all on function public.grant_credits_once(
  uuid,
  text,
  bigint,
  text,
  text
) from anon;

revoke all on function public.grant_credits_once(
  uuid,
  text,
  bigint,
  text,
  text
) from authenticated;

grant execute on function public.grant_credits_once(
  uuid,
  text,
  bigint,
  text,
  text
) to service_role;