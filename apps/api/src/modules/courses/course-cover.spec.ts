import { describe, it, expect, vi } from 'vitest';
import { CoursesService } from './courses.service.js';
import { ForbiddenException, BadRequestException } from '@nestjs/common';

describe('course cover upload', () => {
  function setup(failed = false) {
    let updating = false;
    const query: any = { select: () => query, eq: () => query, update: vi.fn(() => { updating = true; return query; }), maybeSingle: async () => updating ? { data: { id: 'course', thumbnail_url: 'https://example.com/cover.jpg' }, error: null } : { data: { id: 'course' }, error: null } };
    const storage = { upload: vi.fn(async () => ({ error: failed ? { message: 'Upload failed' } : null })), getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/cover.jpg' } }), remove: vi.fn() };
    return { service: new CoursesService({ client: { schema: () => ({ from: () => query }), storage: { from: () => storage } } } as any), storage, query };
  }
  const file = { buffer: Buffer.from('image'), mimetype: 'image/jpeg', size: 5 };
  it('requires an administrator and an accepted image within the size limit', async () => {
    const { service, storage } = setup();
    await expect(service.uploadCover('course', file, { role: 'mentor' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.uploadCover('course', { ...file, mimetype: 'text/html' }, { role: 'admin' } as any)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.uploadCover('course', { ...file, size: 6 * 1024 * 1024 }, { role: 'admin' } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(storage.upload).not.toHaveBeenCalled();
  });
  it('uploads the file and persists the cover URL in the course', async () => {
    const { service, storage, query } = setup();
    expect(await service.uploadCover('course', file, { role: 'admin' } as any)).toMatchObject({ id: 'course', thumbnail: 'https://example.com/cover.jpg' });
    expect(storage.upload).toHaveBeenCalled();
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ thumbnail_url: 'https://example.com/cover.jpg' }));
  });
  it('does not change the course when storage fails', async () => {
    const { service, query } = setup(true);
    await expect(service.uploadCover('course', file, { role: 'admin' } as any)).rejects.toThrow('Upload failed');
    expect(query.update).not.toHaveBeenCalled();
  });
});

describe('creating a course with a cover', () => {
  it.each([false, true])('stores the image before inserting the course and cleans it up on failure (%s)', async failInsert => {
    const insert = vi.fn();
    const query: any = { insert: (data: unknown) => { insert(data); return query; }, select: () => query, single: async () => ({ data: failInsert ? null : { id: 'new', title: 'Course', thumbnail_url: 'https://example.com/new.jpg' }, error: failInsert ? { message: 'Insert failed' } : null }) };
    const storage = { upload: vi.fn(async () => ({ error: null })), getPublicUrl: () => ({ data: { publicUrl: 'https://example.com/new.jpg' } }), remove: vi.fn(async () => ({ error: null })) };
    const service = new CoursesService({ client: { schema: () => ({ from: () => query }), storage: { from: () => storage } } } as any);
    const creation = service.create({ title: 'Course' }, { id: 'admin', role: 'admin' } as any, { buffer: Buffer.from('image'), mimetype: 'image/png', size: 5 });
    if (failInsert) { await expect(creation).rejects.toThrow('Insert failed'); expect(storage.remove).toHaveBeenCalled(); }
    else { await expect(creation).resolves.toMatchObject({ thumbnail: 'https://example.com/new.jpg' }); expect(storage.remove).not.toHaveBeenCalled(); }
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({ thumbnail_url: 'https://example.com/new.jpg', title: 'Course' }));
  });
});

describe('removing a course cover', () => {
  it('clears only the cover URL and requires an administrator', async () => {
    const query: any = { update: vi.fn(() => query), eq: vi.fn(() => query), select: () => query, maybeSingle: async () => ({ data: { id: 'course', thumbnail_url: null }, error: null }) };
    const service = new CoursesService({ client: { schema: () => ({ from: () => query }) } } as any);
    await expect(service.removeCover('course', { role: 'mentor' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(query.update).not.toHaveBeenCalled();
    await expect(service.removeCover('course', { role: 'admin' } as any)).resolves.toMatchObject({ id: 'course', thumbnail: '' });
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ thumbnail_url: null }));
    expect(query.eq).toHaveBeenCalledWith('id', 'course');
  });
});
