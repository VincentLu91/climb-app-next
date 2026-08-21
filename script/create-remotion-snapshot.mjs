import { addBundleToSandbox, createSandbox } from "@remotion/vercel";

console.log("Creating Vercel Sandbox...");

const sandbox = await createSandbox();

try {
  console.log("Adding Remotion bundle...");

  await addBundleToSandbox({
    sandbox,
    bundleDir: ".remotion",
  });

  console.log("Creating reusable snapshot...");

  const snapshot = await sandbox.snapshot({
    expiration: 0,
  });

  console.log("Snapshot created:");
  console.log(snapshot.snapshotId);
} catch (error) {
  await sandbox.stop().catch(() => {});
  throw error;
}
