import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { createClient as createCookieClient } from "./server";

export async function createRequestClient(request) {
  const authorization = request.headers.get("authorization");

  const accessToken = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!accessToken) {
    return {
      supabase: await createCookieClient(),
      accessToken: null,
    };
  }

  const supabase = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      global: {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    },
  );

  return {
    supabase,
    accessToken,
  };
}

export async function getRequestUser(supabase, accessToken) {
  if (accessToken) {
    return supabase.auth.getUser(accessToken);
  }

  return supabase.auth.getUser();
}
