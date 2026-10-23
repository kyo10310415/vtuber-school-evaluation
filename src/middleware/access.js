import jwt from 'jsonwebtoken';
import { getCookie, setCookie } from 'hono/cookie';

export const JOB_PATHS = new Set([
  '/api/analytics/auto-fetch', '/api/auto-evaluate',
  '/api/auto-evaluate-x-only', '/api/x/evaluate-batch-auto',
]);

// Explicit read routes only: several legacy GET endpoints run evaluations or
// refresh OAuth tokens, so HTTP method alone cannot establish read-only access.
export function canCrewRead(method, path) {
  if (!['GET', 'HEAD'].includes(method)) return false;
  return ['/', '/monthly-report', '/evaluation-detail', '/api/students',
    '/api/analytics/students', '/api/wanami-usage', '/api/auto-evaluate/status', '/api/x/quota'].includes(path) ||
    /^\/static\//.test(path) || /^\/analytics-history\/[^/]+$/.test(path) ||
    /^\/api\/(results|prolevel|monthly-report|evaluation\/complete|analytics\/history)\/[^/]+$/.test(path);
}

export function createAccessMiddleware(config, clock = () => Date.now()) {
  const usedJobs = new Map();
  return async (c, next) => {
    const path = c.req.path;
    c.header('Cache-Control', 'no-store');
    if (path === '/api/admin/run-migrations') return c.json({ error: 'HTTP migrations are disabled' }, 410);
    if (path === '/api/health' && ['GET', 'HEAD'].includes(c.req.method)) return c.json({ status: 'ok' });
    const authorization = c.req.header('Authorization') || '';
    if (authorization.startsWith('Bearer ')) {
      if (c.req.method !== 'POST' || !JOB_PATHS.has(path)) return c.json({ error: 'Forbidden' }, 403);
      try {
        const now = Math.floor(clock() / 1000);
        const claims = jwt.verify(authorization.slice(7), config.jobSecret, {
          algorithms: ['HS256'], audience: config.origin, issuer: 'school-evaluation-jobs',
          maxAge: '120s', clockTimestamp: now,
        });
        if (!Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) || claims.iat > now + 5 ||
            claims.exp - claims.iat > 120 || claims.scope !== path ||
            typeof claims.jti !== 'string' || !/^[a-f0-9-]{36}$/.test(claims.jti)) throw new Error();
        for (const [id, expires] of usedJobs) if (expires <= now) usedJobs.delete(id);
        if (usedJobs.has(claims.jti)) return c.json({ error: 'Job replay rejected' }, 409);
        if (usedJobs.size >= 10000) return c.json({ error: 'Job capacity exceeded' }, 503);
        usedJobs.set(claims.jti, claims.exp);
        c.set('job', { scope: path });
        return next();
      } catch { return c.json({ error: 'Unauthorized' }, 401); }
    }
    const tokenFromQuery = !path.startsWith('/api/') && c.req.method === 'GET' ? c.req.query('auth_token') : null;
    const token = tokenFromQuery || getCookie(c, 'wannav_sso');
    const reject = () => path.startsWith('/api/') ? c.json({ error: 'Unauthorized' }, 401) : c.redirect(config.dashboardUrl);
    if (!token) return reject();
    try {
      const claims = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'], maxAge: '1h' });
      if (claims.type !== 'sso' || !Number.isInteger(claims.iat) || !Number.isInteger(claims.exp) ||
          claims.iat > Math.floor(clock() / 1000) + 5 || claims.exp <= claims.iat ||
          claims.exp - claims.iat > 3600 || !claims.userId || typeof claims.username !== 'string' ||
          new URL(claims.targetUrl).origin !== config.origin) throw new Error();
      if (!['admin', 'leader', 'crew'].includes(claims.role)) return c.json({ error: 'Forbidden' }, 403);
      c.set('user', { id: claims.userId, username: claims.username, role: claims.role });
      if (claims.role === 'crew' && !canCrewRead(c.req.method, path)) return c.json({ error: 'Read-only access' }, 403);
      if (tokenFromQuery) {
        setCookie(c, 'wannav_sso', token, { httpOnly: true, secure: config.origin.startsWith('https:'), sameSite: 'Lax', maxAge: 3600, path: '/' });
        const url = new URL(c.req.url); url.searchParams.delete('auth_token');
        return c.redirect(url.pathname + url.search);
      }
      // Some legacy GET APIs perform evaluation or cache writes. Block browser
      // cross-origin invocation too, while preserving the OAuth return route.
      const site = c.req.header('Sec-Fetch-Site');
      if (path.startsWith('/api/') && path !== '/api/analytics/auth/callback' &&
          site && !['same-origin', 'none'].includes(site)) return c.json({ error: 'Forbidden' }, 403);
      if (!['GET', 'HEAD', 'OPTIONS'].includes(c.req.method) && c.req.header('Origin') !== config.origin) {
        return c.json({ error: 'Forbidden' }, 403);
      }
      return next();
    } catch { return reject(); }
  };
}
