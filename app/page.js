import { createClient } from "../lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main>
      <h1>Climbing App</h1>
      <p>{user ? `Logged in as ${user.email}` : "Not logged in"}</p>
    </main>
  );
}
