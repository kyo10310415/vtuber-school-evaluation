/**
 * OAuth Token Manager - PostgreSQL版
 * Render PostgreSQLを使用してOAuthトークンを永続化・管理
 */

import type { OAuthTokenInfo } from './youtube-analytics-client';

/**
 * PostgreSQL接続を作成
 */
async function getDbConnection(databaseUrl: string) {
  // Node.js環境（Render）でのみpgモジュールを使用
  const { Pool } = await import('pg');
  return new Pool({
    connectionString: databaseUrl,
    ssl: {
      rejectUnauthorized: false, // Renderの証明書を信頼
    },
  });
}

/**
 * トークンをPostgreSQLに保存
 */
export async function saveToken(
  databaseUrl: string | undefined,
  studentId: string,
  tokenInfo: OAuthTokenInfo
): Promise<void> {
  if (!databaseUrl) {
    console.warn('[OAuth Token Manager] DATABASE_URL not available, skipping save');
    return;
  }

  const pool = await getDbConnection(databaseUrl);

  try {
    const query = `
      INSERT INTO youtube_oauth_tokens (student_id, access_token, refresh_token, expires_at, token_type, updated_at)
      VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
      ON CONFLICT (student_id)
      DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        token_type = EXCLUDED.token_type,
        updated_at = CURRENT_TIMESTAMP
    `;

    await pool.query(query, [
      studentId,
      tokenInfo.accessToken,
      tokenInfo.refreshToken || null,
      tokenInfo.expiresAt,
      tokenInfo.tokenType,
    ]);

    console.log('[OAuth Token Manager] Token saved:', {
      studentId,
      expiresAt: new Date(tokenInfo.expiresAt).toISOString(),
      hasRefreshToken: !!tokenInfo.refreshToken,
    });
  } catch (error) {
    console.error('[OAuth Token Manager] Save error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * トークンをPostgreSQLから取得
 */
export async function getToken(
  databaseUrl: string | undefined,
  studentId: string
): Promise<OAuthTokenInfo | null> {
  if (!databaseUrl) {
    console.warn('[OAuth Token Manager] DATABASE_URL not available');
    return null;
  }

  const pool = await getDbConnection(databaseUrl);

  try {
    const query = `
      SELECT student_id, access_token, refresh_token, expires_at, token_type
      FROM youtube_oauth_tokens
      WHERE student_id = $1
    `;

    const result = await pool.query(query, [studentId]);

    if (result.rows.length === 0) {
      console.log('[OAuth Token Manager] Token not found:', studentId);
      return null;
    }

    const row = result.rows[0];

    console.log('[OAuth Token Manager] Token found:', {
      studentId,
      expiresAt: new Date(parseInt(row.expires_at)).toISOString(),
      hasRefreshToken: !!row.refresh_token,
    });

    return {
      studentId: row.student_id,
      accessToken: row.access_token,
      refreshToken: row.refresh_token || undefined,
      expiresAt: parseInt(row.expires_at),
      tokenType: row.token_type,
    };
  } catch (error) {
    console.error('[OAuth Token Manager] Get error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * トークンをPostgreSQLから削除
 */
export async function deleteToken(
  databaseUrl: string | undefined,
  studentId: string
): Promise<void> {
  if (!databaseUrl) {
    console.warn('[OAuth Token Manager] DATABASE_URL not available');
    return;
  }

  const pool = await getDbConnection(databaseUrl);

  try {
    const query = `
      DELETE FROM youtube_oauth_tokens
      WHERE student_id = $1
    `;

    await pool.query(query, [studentId]);

    console.log('[OAuth Token Manager] Token deleted:', studentId);
  } catch (error) {
    console.error('[OAuth Token Manager] Delete error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * トークンの有効期限をチェック
 */
export function isTokenExpired(tokenInfo: OAuthTokenInfo): boolean {
  // 5分のバッファを持たせる
  const buffer = 5 * 60 * 1000; // 5分
  return Date.now() + buffer >= tokenInfo.expiresAt;
}

/**
 * トークンを取得し、期限切れの場合は自動的にリフレッシュ
 */
export async function getValidToken(
  databaseUrl: string | undefined,
  studentId: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokenInfo | null> {
  const tokenInfo = await getToken(databaseUrl, studentId);

  if (!tokenInfo) {
    console.log('[OAuth Token Manager] No token found for student:', studentId);
    return null;
  }

  // トークンが有効ならそのまま返す
  if (!isTokenExpired(tokenInfo)) {
    console.log('[OAuth Token Manager] Token is valid:', studentId);
    return tokenInfo;
  }

  console.log('[OAuth Token Manager] Token expired, refreshing...', studentId);

  // リフレッシュトークンがない場合は再認証が必要
  if (!tokenInfo.refreshToken) {
    console.warn('[OAuth Token Manager] No refresh token available:', studentId);
    // トークンを削除して再認証を促す
    await deleteToken(databaseUrl, studentId);
    return null;
  }

  // トークンをリフレッシュ
  try {
    const { refreshAccessToken } = await import('./youtube-analytics-client');
    const newTokenInfo = await refreshAccessToken(
      tokenInfo.refreshToken,
      clientId,
      clientSecret
    );

    newTokenInfo.studentId = studentId;

    // 新しいトークンを保存
    await saveToken(databaseUrl, studentId, newTokenInfo);

    console.log('[OAuth Token Manager] Token refreshed successfully:', studentId);
    return newTokenInfo;
  } catch (error: any) {
    console.error('[OAuth Token Manager] Failed to refresh token:', error);
    // リフレッシュに失敗したらトークンを削除
    await deleteToken(databaseUrl, studentId);
    return null;
  }
}

/**
 * 全トークンの一覧を取得（管理用）
 */
export async function listAllTokens(
  databaseUrl: string | undefined
): Promise<Array<{ studentId: string; expiresAt: number; hasRefreshToken: boolean }>> {
  if (!databaseUrl) {
    console.warn('[OAuth Token Manager] DATABASE_URL not available');
    return [];
  }

  const pool = await getDbConnection(databaseUrl);

  try {
    const query = `
      SELECT student_id, expires_at, refresh_token
      FROM youtube_oauth_tokens
      ORDER BY updated_at DESC
    `;

    const result = await pool.query(query);

    return result.rows.map(row => ({
      studentId: row.student_id,
      expiresAt: parseInt(row.expires_at),
      hasRefreshToken: !!row.refresh_token,
    }));
  } catch (error) {
    console.error('[OAuth Token Manager] List error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

/**
 * 期限切れトークンをクリーンアップ（メンテナンス用）
 */
export async function cleanupExpiredTokens(
  databaseUrl: string | undefined
): Promise<number> {
  if (!databaseUrl) {
    console.warn('[OAuth Token Manager] DATABASE_URL not available');
    return 0;
  }

  const pool = await getDbConnection(databaseUrl);

  try {
    const now = Date.now();
    const query = `
      DELETE FROM youtube_oauth_tokens
      WHERE expires_at < $1 AND refresh_token IS NULL
    `;

    const result = await pool.query(query, [now]);

    console.log('[OAuth Token Manager] Cleaned up expired tokens:', result.rowCount);
    return result.rowCount || 0;
  } catch (error) {
    console.error('[OAuth Token Manager] Cleanup error:', error);
    throw error;
  } finally {
    await pool.end();
  }
}
