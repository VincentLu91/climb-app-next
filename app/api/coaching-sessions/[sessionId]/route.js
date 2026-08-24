import { createRequestClient, getRequestUser } from "@/lib/supabase/request";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export async function DELETE(request, context) {
  const { sessionId } = await context.params;

  if (!sessionId) {
    return Response.json({ error: "Missing session id" }, { status: 400 });
  }

  const { supabase, accessToken } = await createRequestClient(request);

  const {
    data: { user },
  } = await getRequestUser(supabase, accessToken);

  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify the authenticated user owns this coaching session. Scoping by
  // both id and user_id (in addition to RLS) ensures another user's session
  // is treated identically to a nonexistent one.
  const { data: coachingSession, error: coachingSessionError } = await supabase
    .from("coaching_sessions")
    .select("id")
    .eq("id", sessionId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (coachingSessionError) {
    console.error("Failed to look up coaching session:", coachingSessionError);

    return Response.json(
      { error: "Failed to look up coaching session" },
      { status: 500 },
    );
  }

  if (!coachingSession) {
    return Response.json(
      { error: "Coaching session not found" },
      { status: 404 },
    );
  }

  // Collect every upload belonging to this session (and this user) so we
  // know exactly which media_path objects to remove from Storage and which
  // rows must be explicitly deleted (uploads.coaching_session_id is
  // ON DELETE SET NULL, so deleting the session alone would orphan them).
  const { data: uploads, error: uploadsError } = await supabase
    .from("uploads")
    .select("id, media_path")
    .eq("coaching_session_id", sessionId)
    .eq("user_id", user.id);

  if (uploadsError) {
    console.error("Failed to load session uploads:", uploadsError);

    return Response.json(
      { error: "Failed to load coaching session uploads" },
      { status: 500 },
    );
  }

  const uploadIds = (uploads || []).map((upload) => upload.id);
  const mediaPaths = (uploads || [])
    .map((upload) => upload.media_path)
    .filter(Boolean);

  const supabaseAdmin = getSupabaseAdmin();

  // Delete Storage objects first. If this fails, abort before touching any
  // database rows so we never report success while media still exists.
  if (mediaPaths.length > 0) {
    const { error: storageError } = await supabaseAdmin.storage
      .from("climbing-media")
      .remove(mediaPaths);

    if (storageError) {
      console.error("Failed to delete session media:", storageError);

      return Response.json(
        { error: "Failed to delete coaching session media" },
        { status: 500 },
      );
    }
  }

  // chat_history has ON DELETE CASCADE from coaching_sessions, but we delete
  // it explicitly (still scoped to this user and session) so behavior does
  // not depend on that cascade remaining unchanged.
  const { error: chatHistoryDeleteError } = await supabaseAdmin
    .from("chat_history")
    .delete()
    .eq("coaching_session_id", sessionId)
    .eq("user_id", user.id);

  if (chatHistoryDeleteError) {
    console.error("Failed to delete chat history:", chatHistoryDeleteError);

    return Response.json(
      { error: "Failed to delete coaching session chat history" },
      { status: 500 },
    );
  }

  // analyses has ON DELETE CASCADE from uploads, but delete explicitly here
  // too, scoped to the uploads we already confirmed belong to this user.
  if (uploadIds.length > 0) {
    const { error: analysesDeleteError } = await supabaseAdmin
      .from("analyses")
      .delete()
      .in("upload_id", uploadIds);

    if (analysesDeleteError) {
      console.error("Failed to delete analyses:", analysesDeleteError);

      return Response.json(
        { error: "Failed to delete coaching session analyses" },
        { status: 500 },
      );
    }
  }

  // uploads.coaching_session_id is ON DELETE SET NULL, so these rows must be
  // deleted explicitly rather than relying on the session delete below.
  const { error: uploadsDeleteError } = await supabaseAdmin
    .from("uploads")
    .delete()
    .eq("coaching_session_id", sessionId)
    .eq("user_id", user.id);

  if (uploadsDeleteError) {
    console.error("Failed to delete uploads:", uploadsDeleteError);

    return Response.json(
      { error: "Failed to delete coaching session uploads" },
      { status: 500 },
    );
  }

  const { error: coachingSessionDeleteError } = await supabaseAdmin
    .from("coaching_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", user.id);

  if (coachingSessionDeleteError) {
    console.error(
      "Failed to delete coaching session:",
      coachingSessionDeleteError,
    );

    return Response.json(
      { error: "Failed to delete coaching session" },
      { status: 500 },
    );
  }

  return Response.json({ sessionId });
}
