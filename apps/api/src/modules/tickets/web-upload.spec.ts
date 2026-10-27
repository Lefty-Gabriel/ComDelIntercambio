import { api, authStorage } from '../../../../web/src/api.ts';
import { uploadVideo } from '../../../../web/src/upload-video.ts';
describe('session-bound video upload', () => {
  afterEach(() => vi.restoreAllMocks());
  it('does not finalize an old upload with the next account credentials or emit stale progress', async () => {
    authStorage.setToken('account-a');
    vi.spyOn(api, 'createVideo').mockResolvedValue({
      video: { id: 'video-a' },
      upload: { signedUrl: 'https://storage.test/file' },
    } as any);
    const complete = vi.spyOn(api, 'completeVideo');
    let finish!: () => void;
    let progress!: (value: number) => void;
    const transfer = vi.fn(
      (_url: string, _file: File, onProgress?: (value: number) => void) => {
        progress = onProgress!;
        return new Promise<void>((resolve) => {
          finish = resolve;
        });
      },
    );
    const changed = vi.fn();
    const pending = uploadVideo(
      { courseId: 'course-a', title: 'A' },
      {} as File,
      changed,
      changed,
      undefined,
      transfer,
    );
    await vi.waitFor(() => expect(transfer).toHaveBeenCalledOnce());
    authStorage.clear();
    authStorage.setToken('account-b');
    changed.mockClear();
    progress(80);
    finish();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(complete).not.toHaveBeenCalled();
    expect(changed).not.toHaveBeenCalled();
  });
  it('finalizes the current account upload after storage transfer', async () => {
    authStorage.setToken('account-a');
    vi.spyOn(api, 'createVideo').mockResolvedValue({
      video: { id: 'video-a' },
      upload: { signedUrl: 'https://storage.test/file' },
    } as any);
    const complete = vi
      .spyOn(api, 'completeVideo')
      .mockResolvedValue({ id: 'video-a', status: 'ready' } as any);
    const result = await uploadVideo(
      { courseId: 'course-a', title: 'A' },
      {} as File,
      vi.fn(),
      vi.fn(),
      undefined,
      async () => {},
    );
    expect(result).toMatchObject({ id: 'video-a', status: 'ready' });
    expect(complete).toHaveBeenCalledWith('video-a', {
      sizeBytes: undefined,
      durationSeconds: undefined,
      mimeType: undefined,
    });
  });
});
