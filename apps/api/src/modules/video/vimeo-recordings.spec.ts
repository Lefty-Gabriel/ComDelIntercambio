import { describe, it, expect, vi } from 'vitest';
import { ForbiddenException } from '@nestjs/common';
import { VideosService, vimeoEmbedUrl } from './videos.service.js';

describe('Vimeo recordings', () => {
  it('preserves unlisted hash and removes share tracking', () => {
    expect(vimeoEmbedUrl('https://vimeo.com/1240033628/d4ff966bc1?share=copy&fl=sv&fe=ci')).toBe('https://player.vimeo.com/video/1240033628?h=d4ff966bc1');
    expect(vimeoEmbedUrl('https://player.vimeo.com/video/1240033628?h=d4ff966bc1')).toBe('https://player.vimeo.com/video/1240033628?h=d4ff966bc1');
  });
  it.each(['https://vimeo.com.evil.test/123', 'javascript:alert(1)', 'http://vimeo.com/123', 'https://vimeo.com/channels/123', 'https://user:pass@vimeo.com/123'])('rejects unsafe or unsupported URL %s', url => {
    expect(() => vimeoEmbedUrl(url)).toThrow();
  });
  function service(enrolled: boolean) {
    const storage = { from: vi.fn() };
    const courses = { isEnrolled: vi.fn().mockResolvedValue(enrolled) };
    const api = new VideosService({ client: { storage } } as any, courses as any, {} as any);
    vi.spyOn(api as any, 'getRowOrFail').mockResolvedValue({ id: 'video', course_id: 'course', status: 'ready', source_type: 'vimeo', external_url: 'https://player.vimeo.com/video/123?h=abc', storage_path: null });
    return { api, storage, courses };
  }
  it('authorizes recording access before returning embed URL, without Storage calls', async () => {
    const { api, courses, storage } = service(true);
    expect(await api.playback({ id: 'student', role: 'estudiante' } as any, 'video')).toMatchObject({ kind: 'vimeo', url: 'https://player.vimeo.com/video/123?h=abc' });
    expect(courses.isEnrolled).toHaveBeenCalledWith('course', 'student', 'can_view_recordings');
    expect(storage.from).not.toHaveBeenCalled();
  });
  it('denies a student without recording access', async () => {
    await expect(service(false).api.playback({ id: 'student', role: 'estudiante' } as any, 'video')).rejects.toBeInstanceOf(ForbiddenException);
  });
  it('denies external publication by assigned mentors', async () => {
    const api = new VideosService({} as any, { getCourseDocenteId: async () => 'mentor' } as any, {} as any);
    await expect(api.create({ id: 'mentor', role: 'mentor' } as any, { courseId: 'course', title: 'Class', externalUrl: 'https://vimeo.com/123' })).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('original database compatibility', () => {
  it('persists a link when Vimeo columns have not been migrated and plays it after authorization', async () => {
    let stored: any;
    const insert = vi.fn().mockImplementation((record: any) => ({
      select: () => ({ single: async () => {
        if ('external_url' in record) return { data: null, error: { code: 'PGRST204', message: "Could not find external_url in schema cache" } };
        stored = record;
        return { data: record, error: null };
      } }),
    }));
    const storage = { from: vi.fn() };
    const api = new VideosService({ client: { schema: () => ({ from: () => ({ insert }) }), storage } } as any, { isEnrolled: async () => true } as any, { get: () => '180' } as any);
    const result = await api.create({ id: 'admin', role: 'admin' } as any, { courseId: 'course', title: 'Recorded class', externalUrl: 'https://vimeo.com/1240033628/d4ff966bc1' });
    expect(result.video.status).toBe('ready');
    expect(result.upload).toBeNull();
    expect(insert).toHaveBeenCalledTimes(2);
    expect(stored).not.toHaveProperty('external_url');
    expect(stored.storage_path).toMatch(/^external\/vimeo\//);
    vi.spyOn(api as any, 'getRowOrFail').mockResolvedValue(stored);
    expect(await api.playback({ id: 'student', role: 'estudiante' } as any, stored.id)).toMatchObject({ url: 'https://player.vimeo.com/video/1240033628?h=d4ff966bc1', kind: 'vimeo' });
    expect(storage.from).not.toHaveBeenCalled();
    const eq = vi.fn().mockResolvedValue({ error: null });
    (api as any).supabase.client.schema = () => ({ from: () => ({ delete: () => ({ eq }) }) });
    await api.remove({ id: 'admin', role: 'admin' } as any, stored.id);
    expect(eq).toHaveBeenCalledWith('id', stored.id);
    expect(storage.from).not.toHaveBeenCalled();
  });
  it('does not retry ambiguous errors or report a false save', async () => {
    const single = vi.fn().mockResolvedValue({ data: null, error: { code: '500', message: 'Network failure' } });
    const api = new VideosService({ client: { schema: () => ({ from: () => ({ insert: () => ({ select: () => ({ single }) }) }) }) } } as any, {} as any, { get: () => '180' } as any);
    await expect(api.create({ id: 'admin', role: 'admin' } as any, { courseId: 'course', title: 'Recorded class', externalUrl: 'https://vimeo.com/123' })).rejects.toThrow('Network failure');
    expect(single).toHaveBeenCalledTimes(1);
  });
});
