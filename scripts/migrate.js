#!/usr/bin/env node
/**
 * Database Migration Script
 * Render PostgreSQLにマイグレーションを実行
 * 
 * 使い方:
 *   node scripts/migrate.js
 *   
 * 環境変数:
 *   DATABASE_URL - PostgreSQL接続URL
 */

import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import pkg from 'pg';
const { Pool } = pkg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL環境変数が設定されていません');
    console.error('');
    console.error('使い方:');
    console.error('  DATABASE_URL="postgresql://..." node scripts/migrate.js');
    process.exit(1);
  }

  console.log('🔄 データベースマイグレーション開始...\n');

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false,
    },
  });

  try {
    // マイグレーションファイルを読み込み
    const migrationPath = join(__dirname, '../migrations/001_create_youtube_oauth_tokens.sql');
    const migrationSql = await readFile(migrationPath, 'utf-8');

    console.log('📂 マイグレーションファイル:', migrationPath);
    console.log('');

    // SQLを実行
    await pool.query(migrationSql);

    console.log('✅ マイグレーション成功！');
    console.log('');
    console.log('作成されたテーブル:');
    console.log('  - youtube_oauth_tokens');
    console.log('');

    // テーブル構造を確認
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'youtube_oauth_tokens'
      ORDER BY ordinal_position
    `);

    console.log('カラム一覧:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type}) ${row.is_nullable === 'NO' ? 'NOT NULL' : ''}`);
    });

  } catch (error) {
    console.error('❌ マイグレーション失敗。接続設定とDBの状態を確認してください。');
    if (error.code === 'ECONNREFUSED') {
      console.error('');
      console.error('データベースに接続できません。DATABASE_URLを確認してください。');
    }
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

runMigration().catch(() => {
  console.error('❌ マイグレーションの終了処理に失敗しました');
  process.exitCode = 1;
});
