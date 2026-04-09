/**
 * PostgreSQL から欠席データを取得
 * lesson_reports テーブルから直近3ヶ月の欠席を集計
 */

import { Client } from 'pg';

export interface AbsenceData {
  studentId: string;
  absenceCount: number;
  month: string;
}

/**
 * PostgreSQL データベースから欠席データを取得
 * @param databaseUrl PostgreSQL接続文字列
 * @param month 評価対象月（YYYY-MM形式）
 * @returns 欠席データ配列
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

    // 直近3ヶ月の範囲を計算
    const [year, monthNum] = month.split('-').map(Number);
    const threeMonthsAgo = new Date(year, monthNum - 4, 1); // 3ヶ月前の1日
    const endOfTargetMonth = new Date(year, monthNum, 0); // 対象月の最終日

    console.log('[fetchAbsenceDataFromPostgres] Date range:', {
      from: threeMonthsAgo.toISOString().slice(0, 10),
      to: endOfTargetMonth.toISOString().slice(0, 10)
    });

    // 欠席データを集計
    // lesson_result が「実施済み」以外を欠席としてカウント
    const result = await client.query(`
      SELECT 
        student_id,
        COUNT(*) as absence_count
      FROM lesson_reports
      WHERE 
        lesson_date >= $1
        AND lesson_date <= $2
        AND lesson_result != '実施済み'
      GROUP BY student_id
      ORDER BY absence_count DESC;
    `, [threeMonthsAgo.toISOString().slice(0, 10), endOfTargetMonth.toISOString().slice(0, 10)]);

    console.log(`[fetchAbsenceDataFromPostgres] Found ${result.rows.length} students with absences`);
    console.log('[fetchAbsenceDataFromPostgres] Sample:', result.rows.slice(0, 5));

    return result.rows.map(row => ({
      studentId: row.student_id,
      absenceCount: parseInt(row.absence_count),
      month
    }));

  } catch (error: any) {
    console.error('[fetchAbsenceDataFromPostgres] Error:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}
