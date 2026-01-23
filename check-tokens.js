#!/usr/bin/env node
/**
 * トークン確認スクリプト
 */

import pkg from 'pg';
const { Pool } = pkg;

const DATABASE_URL = 'postgresql://vtuber_school_evaluation_user:kWEZaVgrOyWvrZbCPWrSgP46SrIshaNI@dpg-d5ppgkq4d50c73acrj10-a.oregon-postgres.render.com:5432/vtuber_school_evaluation';

async function checkTokens() {
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const result = await pool.query(`
      SELECT 
        student_id,
        LEFT(access_token, 20) || '...' as access_token_preview,
        CASE WHEN refresh_token IS NOT NULL THEN 'あり' ELSE 'なし' END as refresh_token_status,
        expires_at,
        token_type,
        created_at,
        updated_at
      FROM youtube_oauth_tokens
      ORDER BY created_at DESC
    `);

    console.log('\n📊 保存されているトークン一覧\n');
    console.log(`総件数: ${result.rows.length}件\n`);

    if (result.rows.length === 0) {
      console.log('⚠️  まだトークンが保存されていません。');
      console.log('');
      console.log('次のステップ:');
      console.log('1. ブラウザで https://vtuber-school-evaluation.onrender.com/analytics-data を開く');
      console.log('2. 対象生徒の「認証する」ボタンをクリック');
      console.log('3. Google OAuth認証を完了');
      console.log('4. このスクリプトを再実行して確認');
    } else {
      result.rows.forEach((row, index) => {
        console.log(`${index + 1}. 学籍番号: ${row.student_id}`);
        console.log(`   アクセストークン: ${row.access_token_preview}`);
        console.log(`   リフレッシュトークン: ${row.refresh_token_status}`);
        
        const expiresAt = new Date(Number(row.expires_at));
        const now = new Date();
        const isExpired = expiresAt < now;
        const timeLeft = Math.floor((expiresAt.getTime() - now.getTime()) / 1000 / 60);
        
        console.log(`   有効期限: ${expiresAt.toLocaleString('ja-JP')} ${isExpired ? '(期限切れ)' : `(残り${timeLeft}分)`}`);
        console.log(`   作成日時: ${new Date(row.created_at).toLocaleString('ja-JP')}`);
        console.log(`   更新日時: ${new Date(row.updated_at).toLocaleString('ja-JP')}`);
        console.log();
      });

      console.log('✅ トークン管理が正常に動作しています！');
      console.log('');
      console.log('次のステップ:');
      console.log('1. 所属生データページで「データを読み込み」をクリック');
      console.log('2. YouTube Analyticsデータが表示されることを確認');
      console.log('3. 期限切れ時の自動リフレッシュをテスト（約1時間後）');
    }

  } catch (error) {
    console.error('❌ エラー:', error.message);
  } finally {
    await pool.end();
  }
}

checkTokens();
