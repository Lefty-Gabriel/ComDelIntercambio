import {
  httpSecuritySettings,
  configureHttpSecurity,
} from './http-security.js';
import { EventEmitter } from 'node:events';
describe('transport and security boundary', () => {
  it('keeps localhost usable and allows only explicit frontend origins', () => {
    expect(httpSecuritySettings({ NODE_ENV: 'development' }).origins).toEqual([
      'http://localhost:5174',
      'http://127.0.0.1:5174',
    ]);
  });
  it.each([
    { NODE_ENV: 'production' },
    { NODE_ENV: 'production', CORS_ORIGINS: '*' },
    {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'http://example.com',
      PUBLIC_API_URL: 'https://api.example.com',
    },
    {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://example.com/path',
      PUBLIC_API_URL: 'https://api.example.com',
    },
  ])('refuses unsafe deployment settings %j', (env) =>
    expect(() => httpSecuritySettings(env)).toThrow(),
  );
  it('forces TLS without trusting client-supplied host names', async () => {
    let middleware: any;
    const app: any = {
      getHttpAdapter: () => ({
        getInstance: () => ({ disable() {}, set() {} }),
      }),
      enableCors: vi.fn(),
      get: () => ({ client: { schema: () => ({}) } }),
      use: (fn: any) => {
        middleware = fn;
      },
    };
    configureHttpSecurity(app, {
      NODE_ENV: 'production',
      CORS_ORIGINS: 'https://app.example.com',
      PUBLIC_API_URL: 'https://api.example.com',
    });
    const res: any = new EventEmitter();
    res.setHeader = vi.fn();
    res.redirect = vi.fn();
    res.json = vi.fn();
    res.status = vi.fn(() => res);
    const next = vi.fn();
    await middleware(
      {
        secure: false,
        method: 'GET',
        originalUrl: '/courses',
        headers: { host: 'evil.test' },
      },
      res,
      next,
    );
    expect(res.redirect).toHaveBeenCalledWith(
      308,
      'https://api.example.com/courses',
    );
    await middleware(
      { secure: false, method: 'POST', originalUrl: '/auth/login' },
      res,
      next,
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
    await middleware({ secure: true, method: 'GET' }, res, next);
    expect(res.setHeader).toHaveBeenCalledWith(
      'Strict-Transport-Security',
      'max-age=31536000',
    );
    expect(next).toHaveBeenCalledOnce();
  });
});
