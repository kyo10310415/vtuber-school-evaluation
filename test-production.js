#!/usr/bin/env node
import pkg from 'pg';
import { pathToFileURL } from 'node:url';
import { getDatabaseConfig } from './src/lib/database-config.js';
const { Pool } = pkg;

export async function testPostgreSQL() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool(getDatabaseConfig(process.env.DATABASE_URL));
  try {
    await pool.query('SELECT 1 AS ready');
    const result = await pool.query(`SELECT COUNT(*)::int AS count FROM information_schema.tables WHERE table_name = 'youtube_oauth_tokens'`);
    const exists = Number(result.rows[0]?.count) > 0;
    console.log('DB接続確認: 成功');
    console.log(exists ? 'トークンテーブル: 確認済み' : 'トークンテーブル: 未確認');
    return exists;
  } finally {
    await pool.end();
  }
}

export async function testAPIEndpoints() {
  const target = process.env.DIAGNOSTIC_ORIGIN;
  if (!target) { console.log('ヘルス確認: 対象未指定のためスキップ'); return true; }
  let origin;
  try {
    origin = new URL(target);
    const localHttp = origin.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
    if ((origin.protocol !== 'https:' && !localHttp) || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/') throw new Error();
  } catch { throw new Error('Invalid diagnostic origin'); }
  const response = await fetch(origin.origin + '/health', { redirect: 'manual', signal: AbortSignal.timeout(10000) });
  console.log(`ヘルス応答ステータス: ${response.status}`);
  return response.status === 200;
}

export async function runDiagnostics() {
  try {
    if (!await testPostgreSQL()) return false;
    return await testAPIEndpoints();
  } catch {
    console.error('診断に失敗しました。設定・接続・アクセス権を確認してください。');
    return false;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDiagnostics().then(success => { if (!success) process.exitCode = 1; });
}
