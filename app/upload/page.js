import UploadForm from "./upload-form";
import StartSessionButton from "./start-session-button";

export default function UploadPage() {
  return (
    <>
      <h1>Climbing Coach</h1>

      <StartSessionButton />

      <p>Or start immediately with an attempt:</p>

      <UploadForm />
    </>
  );
}
