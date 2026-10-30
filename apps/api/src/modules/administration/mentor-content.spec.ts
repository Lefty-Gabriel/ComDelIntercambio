import { AdministrationService } from './administration.service.js';
import { ForbiddenException } from '@nestjs/common';

function setup(owner = 'mentor') {
  const query: any = { insert: vi.fn(() => query), update: vi.fn(() => query),
    eq: () => query, select: () => query, maybeSingle: async () => ({ data: { lesson_id: 'lesson' }, error: null }),
    single: async () => ({ data: { id: 'saved' }, error: null }) };
  const upload = vi.fn(async () => ({ error: null }));
  const service = new AdministrationService({ client: { schema: () => ({ from: () => query }),
    storage: { from: () => ({ upload }) } } } as any);
  vi.spyOn(service as any, 'course').mockResolvedValue({ id: 'course', docente_id: owner });
  vi.spyOn(service as any, 'module').mockResolvedValue({ id: 'module', course_id: 'course' });
  vi.spyOn(service as any, 'lesson').mockResolvedValue({ id: 'lesson', module_id: 'module' });
  return { service, query, upload };
}
const mentor: any = { id: 'mentor', role: 'mentor' };
describe('mentor curriculum permissions', () => {
  it('allows the assigned mentor to save modules, lessons, links, files and publication state', async () => {
    const { service, query, upload } = setup();
    await service.saveModule(mentor, 'course', { title: 'Tema', position: 0 });
    await service.saveLesson(mentor, 'module', { title: 'Clase', content: 'Contenido', position: 0, durationMinutes: 15, isPublished: true });
    await service.addResourceLink(mentor, 'lesson', { title: 'Material', externalUrl: 'https://example.com', kind: 'complementary', resourceType: 'link', isPublished: true });
    await service.uploadResource(mentor, 'lesson', { buffer: Buffer.from('demo'), originalname: 'material.txt', mimetype: 'text/plain', size: 4 });
    await service.resourceState(mentor, 'resource', true);
    expect(upload).toHaveBeenCalledOnce();
    expect(query.update).toHaveBeenCalledWith(expect.objectContaining({ is_published: true }));
  });
  it('rejects another mentor before any writes or storage upload', async () => {
    const { service, query, upload } = setup('other');
    for (const operation of [
      () => service.curriculum(mentor, 'course'),
      () => service.saveModule(mentor, 'course', { title: 'Tema', position: 0 }),
      () => service.saveLesson(mentor, 'module', {} as any),
      () => service.addResourceLink(mentor, 'lesson', {} as any),
      () => service.uploadResource(mentor, 'lesson', {} as any),
      () => service.resourceState(mentor, 'resource', true),
    ]) await expect(operation()).rejects.toBeInstanceOf(ForbiddenException);
    expect(query.insert).not.toHaveBeenCalled();
    expect(query.update).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
  it('keeps course reassignment and access management exclusive to administrators', async () => {
    const { service } = setup();
    await expect(service.updateCourse(mentor, 'course', {} as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.grantAccess(mentor, {} as any)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.listAccess(mentor, {})).rejects.toBeInstanceOf(ForbiddenException);
  });
});
