import { it, expect, vi } from 'vitest';
import { VideosService } from './videos.service.js';
it('rejects files over the bucket limit before creating records or upload permissions', async () => {
 const getBucket = vi.fn().mockResolvedValue({ data: { file_size_limit: 50 * 1024 ** 2 }, error: null });
 const schema = vi.fn();
 const service = new VideosService({ client: { storage: { getBucket }, schema } } as any, {} as any, { get: () => undefined } as any);
 await expect(service.create({ role: 'admin', id: 'admin' } as any, { courseId: 'course', title: 'Class', sizeBytes: 259 * 1024 ** 2 })).rejects.toThrow('50 MB');
 expect(schema).not.toHaveBeenCalled();
});
it.each([null, { size: 99 }])('does not publish missing or incomplete Storage files', async object => {
 const schema = vi.fn();
 const service = new VideosService({ client: { schema, storage: { from: () => ({ info: async () => ({ data: object, error: null }) }) } } } as any, {} as any, {} as any);
 vi.spyOn(service as any, 'getRowOrFail').mockResolvedValue({ course_id: 'course', storage_path: 'course/file', size_bytes: 100 });
 await expect(service.complete({ role: 'admin' } as any, 'video', {})).rejects.toThrow();
 expect(schema).not.toHaveBeenCalled();
});
