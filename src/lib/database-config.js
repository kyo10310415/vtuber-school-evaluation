import { readFileSync } from 'node:fs';

// Render's short internal Postgres host uses a self-signed certificate.
// All other targets must pass the platform's certificate/hostname checks.
export function getDatabaseConfig(databaseUrl, env = typeof process === 'undefined' ? {} : process.env) {
  let url;
  try {
    url = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || url.searchParams.has('host')) {
      throw new Error();
    }
  } catch {
    throw new Error('Invalid PostgreSQL connection configuration');
  }
  const certificates = {};
  try {
    // Preserve existing CA/mTLS file configuration, but never its verification
    // policy. pg must not reparse these URL options over the enforced ssl object.
    for (const [parameter, property] of [['sslrootcert', 'ca'], ['sslcert', 'cert'], ['sslkey', 'key']]) {
      const path = url.searchParams.get(parameter);
      if (path) certificates[property] = readFileSync(path, 'utf8');
    }
  } catch {
    throw new Error('Invalid PostgreSQL TLS certificate configuration');
  }
  // pg lets URL SSL parameters replace the explicit ssl object, including CA
  // settings. Enforce this policy after removing those override parameters.
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith('ssl') || key.toLowerCase() === 'uselibpqcompat') url.searchParams.delete(key);
  }
  const internal = env.RENDER === 'true' && /^dpg-[a-z0-9]+(?:-[a-z0-9]+)*$/.test(url.hostname);
  if (env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error('Global TLS verification bypass is not supported');
  }
  return { connectionString: url.toString(), ssl: { ...certificates, rejectUnauthorized: !internal } };
}
