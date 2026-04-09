/**
 * PostgreSQL から欠席・リスケデータを取得
 * wannav_student_management の lesson_reports テーブルから直近3ヶ月を集計
 *
 * 欠席判定:
 *   - 「無断キャンセル」 → absenceCount としてカウント（欠席評価に使用）
 *   - 「生徒様都合でリスケ」 → カウントしない（評価に影響なし）
 *   - 「実施済み」 → 出席（カウントしない）
 *
 * 使用環境変数: STUDENT_MANAGEMENT_DATABASE_URL
 */

import { Client } from 'pg';
import type { AbsenceData } from '../types';

/**
 * PostgreSQL データベースから欠席・リスケデータを取得
 * @param databaseUrl STUDENT_MANAGEMENT_DATABASE_URL の値
 * @param month 評価対象月（YYYY-MM形式）
 * @returns 欠席データ配列（absenceCount=無断キャンセル回数, rescheduleCount=リスケ回数）
 */
export async function fetchAbsenceDataFromPostgres(
  databaseUrl: string,
  month: string
): Promise<AbsenceData[]> {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('[fetchAbsenceDataFromPostgres] Connected to PostgreSQL');

    // 直近3ヶ月の範囲を計算（評価月の3ヶ月前1日 〜 評価月の末日）
    const [year, monthNum] = month.split('-').map(Number);
    const threeMonthsAgo = new Date(year, monthNum - 4, 1); // 3ヶ月前の1日
    const endOfTargetMonth = new Date(year, monthNum, 0);   // 対象月の最終日

    const fromDate = threeMonthsAgo.toISOString().slice(0, 10);
    const toDate = endOfTargetMonth.toISOString().slice(0, 10);

    console.log('[fetchAbsenceDataFromPostgres] Date range:', { from: fromDate, to: toDate });

    // 無断キャンセルのみ欠席としてカウント（リスケは評価に影響しない）
    const result = await client.query(`
      SELECT
        student_id,
        COUNT(*) AS absence_count
      FROM lesson_reports
      WHERE
        lesson_date >= $1
        AND lesson_date <= $2
        AND lesson_result = '無断キャンセル'
      GROUP BY student_id
      ORDER BY absence_count DESC;
    `, [fromDate, toDate]);

    console.log(`[fetchAbsenceDataFromPostgres] Found ${result.rows.length} students with absences`);
    if (result.rows.length > 0) {
      console.log('[fetchAbsenceDataFromPostgres] Sample:', result.rows.slice(0, 3).map(r => ({
        student_id: r.student_id,
        absence_count: r.absence_count,
      })));
    }

    return result.rows.map(row => ({
      studentId: row.student_id,
      absenceCount: parseInt(row.absence_count, 10),
      rescheduleCount: 0,
      month,
    }));

  } catch (error: any) {
    console.error('[fetchAbsenceDataFromPostgres] Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}
