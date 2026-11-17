import { VideosService } from './videos.service.js';
const actor = (role: string) => ({ id: 'actor', role }) as any;
function setup() {
  const chain = (data: any[]) => { const query: any = { select: vi.fn(() => query), eq: vi.fn(() => query), in: vi.fn(() => query), order: () => query, limit: () => query, then: (resolve: any) => Promise.resolve({ data, error: null }).then(resolve) }; return query; };
  const lessons = chain([{ id: 'lesson', title: 'Lesson' }]);
  const questions = chain([{ id: 'question', lesson_id: 'lesson', student_id: 'student', question: 'How?', mentor_reply: 'Answer', created_at: '2026-11-13' }]);
  const profiles = chain([{ id: 'student', full_name: 'Ana', avatar_url: 'https://example.com/photo.jpg' }]);
  const from = vi.fn(table => table === 'lessons' ? lessons : table === 'lesson_questions' ? questions : profiles);
  const service = new VideosService({ client: { schema: () => ({ from }) } } as any, {} as any, {} as any);
  const access = vi.spyOn(service, 'getById').mockResolvedValue({ id: 'video' } as any);
  return { service, access, from, lessons, questions };
}
describe('recording questions panel', () => {
  it('checks video permissions before accessing student questions', async () => {
    const { service, access, from } = setup(); access.mockRejectedValue(new Error('Not enrolled'));
    await expect(service.discussion(actor('estudiante'), 'video')).rejects.toThrow('Not enrolled');
    expect(from).not.toHaveBeenCalled();
  });
  it('restricts students to their own questions and published lessons', async () => {
    const { service, lessons, questions } = setup(); const result = await service.discussion(actor('estudiante'), 'video');
    expect(lessons.eq).toHaveBeenCalledWith('video_id', 'video');
    expect(lessons.eq).toHaveBeenCalledWith('is_published', true);
    expect(questions.eq).toHaveBeenCalledWith('student_id', 'actor');
    expect(result.canReply).toBe(false); expect(result.canAsk).toBe(true);
  });
  it('lets an authorized mentor read student questions with profile images', async () => {
    const { service, questions } = setup(); const result = await service.discussion(actor('mentor'), 'video');
    expect(questions.eq).not.toHaveBeenCalledWith('student_id', 'actor');
    expect(result.canReply).toBe(true);
    expect(result.questions[0]).toMatchObject({ studentName: 'Ana', studentAvatar: 'https://example.com/photo.jpg', mentorReply: 'Answer' });
  });
});
