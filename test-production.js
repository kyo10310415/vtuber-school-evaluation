#!/usr/bin/env node
/**
 * 本番環境テストスクリプト
 * PostgreSQL接続とOAuth機能のテスト
 */

const DATABASE_URL = 'postgresql://vtuber_school_evaluation_user:kWEZaVgrOyWvrZbCPWrSgP46SrIshaNI@dpg-d5ppgkq4d50c73acrj10-a.oregon-postgres.render.com:5432/vtuber_school_evaluation';

async function testPostgreSQL() {
  console.log('🔍 PostgreSQL接続テスト\n');
  
  const { default: pkg } = await import('pg');
  const { Pool } = pkg;
  
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // 接続テスト
    const result = await pool.query('SELECT NOW() as current_time');
    console.log('✅ PostgreSQL接続成功');
    console.log(`   現在時刻: ${result.rows[0].current_time}`);

    // テーブル確認
    const tableCheck = await pool.query(`
      SELECT COUNT(*) as count FROM youtube_oauth_tokens
    `);
    console.log(`✅ youtube_oauth_tokens テーブル: ${tableCheck.rows[0].count}件のデータ\n`);

    return true;
  } catch (error) {
    console.error('❌ PostgreSQLエラー:', error.message);
    return false;
  } finally {
    await pool.end();
  }
}

async function testAPIEndpoints() {
  console.log('🔍 APIエンドポイントテスト\n');

  const baseUrl = 'https://vtuber-school-evaluation.onrender.com';
  
  const endpoints = [
    { path: '/api/analytics/students', description: '対象生徒一覧' },
    { path: '/api/analytics/tokens', description: 'トークン一覧' },
  ];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(`${baseUrl}${endpoint.path}`);
      const status = response.status;
      
      if (status === 200) {
        const data = await response.json();
        console.log(`✅ ${endpoint.description} (${endpoint.path})`);
        console.log(`   Status: ${status}`);
        
        if (Array.isArray(data)) {
          console.log(`   データ件数: ${data.length}件`);
          if (data.length > 0) {
            console.log(`   サンプル:`, JSON.stringify(data[0], null, 2).substring(0, 200));
          }
        } else if (data.success !== undefined) {
          console.log(`   Success: ${data.success}`);
          if (data.tokens) {
            console.log(`   トークン件数: ${data.tokens.length}件`);
          }
        }
      } else {
        console.log(`⚠️  ${endpoint.description} (${endpoint.path})`);
        console.log(`   Status: ${status}`);
      }
      console.log();
    } catch (error) {
      console.error(`❌ ${endpoint.description} エラー:`, error.message);
      console.log();
    }
  }
}

async function runTests() {
  console.log('🚀 本番環境テスト開始\n');
  console.log('='.repeat(50));
  console.log();

  const dbOk = await testPostgreSQL();
  
  if (dbOk) {
    await testAPIEndpoints();
  } else {
    console.log('⚠️  PostgreSQL接続に失敗したため、APIテストをスキップします');
  }

  console.log('='.repeat(50));
  console.log('\n🎯 次のステップ:');
  console.log('1. ブラウザで https://vtuber-school-evaluation.onrender.com/analytics-data を開く');
  console.log('2. 対象生徒が表示されるか確認');
  console.log('3. 「認証する」ボタンで OAuth認証をテスト');
  console.log('4. 認証後、PostgreSQLにトークンが保存されるか確認');
}

runTests();
