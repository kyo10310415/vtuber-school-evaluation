import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const marker = 'SYNTHETIC_PRIVATE_OPERATION_VALUE';
function capture() {
  const output = [];
  return { output, console: { log: (...args) => output.push(args.join(' ')), error: (...args) => output.push(args.join(' ')) } };
}

test('server startup does not log environment values and preserves application bindings', async () => {
  const log = capture();
  const env = Object.fromEntries(['GOOGLE_SERVICE_ACCOUNT', 'GEMINI_API_KEY', 'STUDENT_MASTER_SPREADSHEET_ID',
    'ABSENCE_SPREADSHEET_ID', 'PAYMENT_SPREADSHEET_ID', 'RESULT_SPREADSHEET_ID', 'YOUTUBE_API_KEY',
    'X_BEARER_TOKEN', 'DATABASE_URL', 'YOUTUBE_ANALYTICS_CLIENT_ID', 'YOUTUBE_ANALYTICS_CLIENT_SECRET',
    'YOUTUBE_ANALYTICS_REDIRECT_URI', 'ANALYTICS_TARGET_SPREADSHEET_ID'].map(key => [key, marker]));
  env.PORT = '10000';
  let options, bindings;
  class Hono {
    use() {}
    route() {}
    fetch(req, received) { bindings = received; return new Response('fixture'); }
  }
  const source = (await readFile(new URL('../server.js', import.meta.url), 'utf8')).replace(/^import .*\r?\n/gm, '');
  vm.runInNewContext(source, { ...log, process: { env }, Hono, app: {},
    serve: received => { options = received; }, serveStatic: () => {}, Response });
  assert.equal(options.port, 10000);
  await options.fetch(new Request('http://localhost/'));
  assert.deepEqual(Object.keys(bindings).sort(), Object.keys(env).filter(key => key !== 'PORT').sort());
  assert.ok(Object.values(bindings).every(value => value === marker));
  assert.equal(log.output.join('\n').includes(marker), false);
});

async function migrationFixture({ failQuery = false, failEnd = false } = {}) {
  const log = capture(); let ended = 0, queries = 0;
  const proc = { env: { DATABASE_URL: marker }, exitCode: 0, exit() { throw new Error('unexpected hard exit'); } };
  class Pool {
    async query() { queries++; if (failQuery) throw Object.assign(new Error(marker), { code: 'ECONNREFUSED' }); return { rows: [] }; }
    async end() { ended++; if (failEnd) throw new Error(marker); }
  }
  let source = await readFile(new URL('../scripts/migrate.js', import.meta.url), 'utf8');
  source = source.replace(/^#!.*\r?\n/, '').replace(/^import .*\r?\n/gm, '').replace('const __filename = fileURLToPath(import.meta.url);', "const __filename = '/fixture/scripts/migrate.js';")
    .replace('runMigration().catch(', 'await runMigration().catch(');
  await vm.runInNewContext(`(async () => { ${source}\n})()`, { ...log, process: proc, pkg: { Pool },
    readFile: async () => 'fixture migration SQL', join: (...parts) => parts.join('/'), dirname: () => '/fixture/scripts' });
  return { ...log, proc, ended, queries };
}

test('migration failures omit provider details, close the pool and set a failing exit status', async () => {
  const result = await migrationFixture({ failQuery: true });
  assert.equal(result.queries, 1);
  assert.equal(result.ended, 1);
  assert.equal(result.proc.exitCode, 1);
  assert.equal(result.output.join('\n').includes(marker), false);
  assert.ok(result.output.some(line => line.includes('DATABASE_URLを確認')));
});

test('migration cleanup failures are masked and normal migration query flow is retained', async () => {
  const failed = await migrationFixture({ failEnd: true });
  assert.equal(failed.proc.exitCode, 1);
  assert.equal(failed.output.join('\n').includes(marker), false);
  const success = await migrationFixture();
  assert.equal(success.queries, 2);
  assert.equal(success.ended, 1);
  assert.equal(success.proc.exitCode, 0);
});
