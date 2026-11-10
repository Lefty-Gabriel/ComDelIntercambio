import { it, expect, vi } from 'vitest';
import { LiveSessionsService } from './live-sessions.service.js';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
it.each(['mentor', 'estudiante', 'soporte'])('rejects deletion by %s', async role => {
 const service = new LiveSessionsService({} as any, {} as any);
 await expect(service.remove({ role } as any, 'session')).rejects.toBeInstanceOf(ForbiddenException);
});
it('deletes only the requested agenda row after confirming it exists', async () => {
 const maybeSingle = vi.fn().mockResolvedValue({ data: { id: 'session' }, error: null });
 const select = vi.fn(() => ({ maybeSingle }));
 const eq = vi.fn(() => ({ select }));
 const from = vi.fn(() => ({ delete: () => ({ eq }) }));
 const service = new LiveSessionsService({ client: { schema: () => ({ from }) } } as any, {} as any);
 vi.spyOn(service as any, 'getRowOrFail').mockResolvedValue({ id: 'session' });
 expect(await service.remove({ role: 'admin' } as any, 'session')).toEqual({ deleted: true });
 expect(from).toHaveBeenCalledWith('live_sessions');
 expect(eq).toHaveBeenCalledWith('id', 'session');
});
it('does not report success if the row is already gone', async () => {
 const service = new LiveSessionsService({ client: { schema: () => ({ from: () => ({ delete: () => ({ eq: () => ({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }) }) }) } } as any, {} as any);
 vi.spyOn(service as any, 'getRowOrFail').mockResolvedValue({ id: 'session' });
 await expect(service.remove({ role: 'admin' } as any, 'session')).rejects.toBeInstanceOf(NotFoundException);
});
