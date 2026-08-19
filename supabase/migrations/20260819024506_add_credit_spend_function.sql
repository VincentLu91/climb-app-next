create or replace function public.spend_credits(
  p_user_id uuid,
  p_amount bigint,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  current_subscription_credits bigint;
  current_topup_credits bigint;
  subscription_spend bigint;
  topup_spend bigint;
begin
  if p_amount <= 0 then
    raise exception 'Credit spend amount must be positive';
  end if;

  insert into public.credit_balances (
    user_id,
    subscription_credits,
    topup_credits,
    updated_at
  )
  values (
    p_user_id,
    0,
    0,
    now()
  )
  on conflict (user_id) do nothing;

  select
    subscription_credits,
    topup_credits
  into
    current_subscription_credits,
    current_topup_credits
  from public.credit_balances
  where user_id = p_user_id
  for update;

  if current_subscription_credits + current_topup_credits < p_amount then
    return false;
  end if;

  subscription_spend :=
    least(current_subscription_credits, p_amount);

  topup_spend :=
    p_amount - subscription_spend;

  update public.credit_balances
  set
    subscription_credits =
      subscription_credits - subscription_spend,
    topup_credits =
      topup_credits - topup_spend,
    updated_at = now()
  where user_id = p_user_id;

  if subscription_spend > 0 then
    insert into public.credit_transactions (
      user_id,
      bucket,
      amount,
      reason
    )
    values (
      p_user_id,
      'subscription',
      -subscription_spend,
      p_reason
    );
  end if;

  if topup_spend > 0 then
    insert into public.credit_transactions (
      user_id,
      bucket,
      amount,
      reason
    )
    values (
      p_user_id,
      'topup',
      -topup_spend,
      p_reason
    );
  end if;

  return true;
end;
$$;

revoke all on function public.spend_credits(
  uuid,
  bigint,
  text
) from public;

revoke all on function public.spend_credits(
  uuid,
  bigint,
  text
) from anon;

revoke all on function public.spend_credits(
  uuid,
  bigint,
  text
) from authenticated;

grant execute on function public.spend_credits(
  uuid,
  bigint,
  text
) to service_role;