export function readSecurityConfig(env = process.env) {
  function secret(name) {
    const value = env[name];
    if (typeof value !== 'string' || value.trim().length < 32 || /change-in-production|your-shared-secret/i.test(value)) {
      throw new Error(`${name} must be a strong secret of at least 32 characters`);
    }
    return value;
  }
  const jwtSecret = secret('JWT_SECRET');
  const jobSecret = secret('EVALUATION_JOB_TOKEN');
  if (jwtSecret === jobSecret) throw new Error('Job and SSO keys must be different');
  let origin;
  try { origin = new URL(env.APP_ORIGIN); } catch { throw new Error('APP_ORIGIN is required'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
      (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))) {
    throw new Error('APP_ORIGIN must be an HTTPS origin');
  }
  return { jwtSecret, jobSecret, origin: origin.origin,
    dashboardUrl: env.DASHBOARD_URL || 'https://wannav-main.onrender.com' };
}
