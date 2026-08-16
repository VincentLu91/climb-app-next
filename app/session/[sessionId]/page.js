import UploadForm from "@/app/upload/upload-form";

export default async function CoachingSessionPage({ params }) {
  const { sessionId } = await params;

  return (
    <>
      <h1>Climbing Session</h1>
      <p>Session: {sessionId}</p>

      <UploadForm initialCoachingSessionId={sessionId} />
    </>
  );
}
