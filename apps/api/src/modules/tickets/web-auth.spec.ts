import { api, authStorage } from '../../../../web/src/api.ts';
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
describe('web authentication invalidation', () => {
  it('uses the configured public API origin without duplicate slashes', async () => {
    vi.stubEnv('VITE_API_URL', 'https://api.example.test/');
    vi.resetModules();
    const fetchMock = vi.fn(async () => new Response('[]'));
    vi.stubGlobal('fetch', fetchMock);
    const { api: configuredApi } = await import('../../../../web/src/api.ts');
    await configuredApi.getCourses();
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.example.test/courses');
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    const values = new Map<string, string>();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    });
    authStorage.clear();
  });
  afterEach(() => vi.unstubAllGlobals());
  it('keeps invalid login feedback in the login form without session invalidation', async () => {
    const listener = vi.fn();
    const unsubscribe = authStorage.subscribeInvalidation(listener);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response('{"message":"Invalid credentials"}', { status: 401 }),
      ),
    );
    await expect(api.login('bad@test', 'bad')).rejects.toMatchObject({
      statusCode: 401,
      message: 'Invalid credentials',
    });
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });
  it('notifies the application when the active account receives 401', async () => {
    authStorage.setToken('expired');
    const listener = vi.fn();
    const unsubscribe = authStorage.subscribeInvalidation(listener);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ message: 'Expired' }), { status: 401 }),
      ),
    );
    await expect(api.getTickets()).rejects.toMatchObject({ statusCode: 401 });
    expect(authStorage.getToken()).toBeNull();
    expect(listener).toHaveBeenCalledOnce();
    unsubscribe();
  });
  it('discards a delayed prior-account profile and preserves the new account', async () => {
    authStorage.setToken('old');
    const delayed = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => delayed.promise),
    );
    const pending = api.getMe();
    authStorage.clear();
    authStorage.setToken('new');
    authStorage.setUser({
      id: 'new',
      email: 'new@test',
      fullName: 'New',
      role: 'soporte',
    });
    delayed.resolve(new Response(JSON.stringify({ id: 'old', role: 'admin' })));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(authStorage.getUser()?.id).toBe('new');
  });
  it('does not log out a new account because an old request returns 401', async () => {
    authStorage.setToken('old');
    const delayed = deferred<Response>();
    vi.stubGlobal(
      'fetch',
      vi.fn(() => delayed.promise),
    );
    const pending = api.getTickets();
    authStorage.clear();
    authStorage.setToken('new');
    delayed.resolve(new Response('{}', { status: 401 }));
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    expect(authStorage.getToken()).toBe('new');
  });
});
