#!/usr/bin/env node
import pkg from 'pg';
import { pathToFileURL } from 'node:url';
import { getDatabaseConfig } from './src/lib/database-config.js';
const { Pool } = pkg;

export async function checkTokens() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
  const pool = new Pool(getDatabaseConfig(process.env.DATABASE_URL));
  try {
    const result = await pool.query(`
      SELECT COUNT(*)::int AS total,
             COUNT(*) FILTER (WHERE expires_at < $1)::int AS expired
      FROM youtube_oauth_tokens
    `, [Date.now()]);
    console.log(`登録件数: ${Number(result.rows[0]?.total) || 0}`);
    console.log(`期限切れ件数: ${Number(result.rows[0]?.expired) || 0}`);
  } finally {
    await pool.end();
  }
}

export async function runTokenCheck() {
  try { await checkTokens(); return true; }
  catch { console.error('トークン集計の確認に失敗しました。設定・DB接続・テーブルを確認してください。'); return false; }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runTokenCheck().then(success => { if (!success) process.exitCode = 1; });
}
