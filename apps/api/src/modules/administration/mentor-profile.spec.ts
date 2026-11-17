import { AdministrationService } from './administration.service.js';
import { MentorProfileDto } from './administration.dto.js';
import { validate } from 'class-validator';
const input = { fullName: '  Ana Mentor  ', title: 'Finanzas', company: 'Comunidad', bio: 'Experiencia', linkedin: '', website: '' };
describe('administrator mentor profile editing', () => {
  it.each(['mentor', 'estudiante', 'soporte'])('rejects %s before database access', async role => {
    const service = new AdministrationService({} as any);
    await expect(service.updateMentorProfile({ role } as any, 'mentor', input)).rejects.toThrow('Administrator');
  });
  it('updates only mentor profile fields', async () => {
    const query: any = { update: vi.fn(() => query), eq: vi.fn(() => query), select: () => query, maybeSingle: async () => ({ data: { id: 'mentor', full_name: 'Ana Mentor', role: 'mentor' }, error: null }) };
    const service = new AdministrationService({ client: { schema: () => ({ from: () => query }) } } as any);
    const result = await service.updateMentorProfile({ role: 'admin' } as any, 'mentor', { ...input, role: 'admin', email: 'other@example.com' } as any);
    expect(query.eq).toHaveBeenCalledWith('role', 'mentor');
    expect(query.eq).toHaveBeenCalledWith('id', 'mentor');
    expect(query.update).toHaveBeenCalledWith({ full_name: 'Ana Mentor', title: 'Finanzas', company: 'Comunidad', bio: 'Experiencia', linkedin: '', website: '' });
    expect(result.fullName).toBe('Ana Mentor');
  });
  it('rejects missing mentors', async () => {
    const query: any = { update: () => query, eq: () => query, select: () => query, maybeSingle: async () => ({ data: null, error: null }) };
    const service = new AdministrationService({ client: { schema: () => ({ from: () => query }) } } as any);
    await expect(service.updateMentorProfile({ role: 'admin' } as any, 'missing', input)).rejects.toThrow('Mentor no encontrado');
  });
  it('accepts empty links and rejects unsafe URLs', async () => {
    expect(await validate(Object.assign(new MentorProfileDto(), input))).toHaveLength(0);
    const errors = await validate(Object.assign(new MentorProfileDto(), input, { website: 'javascript:alert(1)' }));
    expect(errors.map(error => error.property)).toContain('website');
  });
});
