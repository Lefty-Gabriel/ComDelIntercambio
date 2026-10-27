import { api, authStorage, uploadFileToSignedUrl } from "./api.ts";

// Keep the entire storage/API operation attached to the account that began it.
export async function uploadVideo(
  input: Parameters<typeof api.createVideo>[0],
  file: File,
  onProgress: (percent: number) => void,
  onStep: (step: string) => void,
  signal?: AbortSignal,
  transfer = uploadFileToSignedUrl,
) {
  const revision = authStorage.getRevision();
  const current = () =>
    revision === authStorage.getRevision() && !signal?.aborted;
  function assertCurrent() {
    if (!current())
      throw new DOMException("Upload session ended", "AbortError");
  }
  assertCurrent();
  onStep("Step 1/3: Registering video metadata...");
  const created = await api.createVideo(input);
  assertCurrent();
  onStep("Step 2/3: Uploading file bytes to storage...");
  await transfer(
    created.upload.signedUrl,
    file,
    (percent) => {
      if (current()) onProgress(percent);
    },
    signal,
  );
  assertCurrent();
  onStep("Step 3/3: Finalizing video record...");
  const completed = await api.completeVideo(created.video.id, {
    sizeBytes: input.sizeBytes,
    durationSeconds: input.durationSeconds,
    mimeType: input.mimeType,
  });
  assertCurrent();
  return completed;
}
