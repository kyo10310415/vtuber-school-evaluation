/**
 * OAuth Token Manager
 * Cloudflare KVを使用してOAuthトークンを永続化・管理
 */

import type { OAuthTokenInfo } from './youtube-analytics-client';

// KVのキー形式: youtube_oauth:{studentId}
function getTokenKey(studentId: string): string {
  return `youtube_oauth:${studentId}`;
}

/**
 * トークンをKVに保存
 */
export async function saveToken(
  kv: KVNamespace | undefined,
  studentId: string,
  tokenInfo: OAuthTokenInfo
): Promise<void> {
  if (!kv) {
    console.warn('[OAuth Token Manager] KV namespace not available, skipping save');
    return;
  }

  const key = getTokenKey(studentId);
  const data = {
    studentId,
    accessToken: tokenInfo.accessToken,
    refreshToken: tokenInfo.refreshToken,
    expiresAt: tokenInfo.expiresAt,
    tokenType: tokenInfo.tokenType,
    savedAt: Date.now(),
  };

  // KVに保存（有効期限はexpiresAtから計算）
  const ttl = Math.max(0, Math.floor((tokenInfo.expiresAt - Date.now()) / 1000));
  
  await kv.put(key, JSON.stringify(data), {
    expirationTtl: ttl > 0 ? ttl : 3600, // 最低1時間
  });

  console.log('[OAuth Token Manager] Token saved:', {
    studentId,
    expiresAt: new Date(tokenInfo.expiresAt).toISOString(),
    ttl: `${ttl}s`,
  });
}

/**
 * トークンをKVから取得
 */
export async function getToken(
  kv: KVNamespace | undefined,
  studentId: string
): Promise<OAuthTokenInfo | null> {
  if (!kv) {
    console.warn('[OAuth Token Manager] KV namespace not available');
    return null;
  }

  const key = getTokenKey(studentId);
  const data = await kv.get(key, 'json');

  if (!data) {
    console.log('[OAuth Token Manager] Token not found:', studentId);
    return null;
  }

  console.log('[OAuth Token Manager] Token found:', {
    studentId,
    expiresAt: new Date((data as any).expiresAt).toISOString(),
    hasRefreshToken: !!(data as any).refreshToken,
  });

  return data as OAuthTokenInfo;
}

/**
 * トークンをKVから削除
 */
export async function deleteToken(
  kv: KVNamespace | undefined,
  studentId: string
): Promise<void> {
  if (!kv) {
    console.warn('[OAuth Token Manager] KV namespace not available');
    return;
  }

  const key = getTokenKey(studentId);
  await kv.delete(key);

  console.log('[OAuth Token Manager] Token deleted:', studentId);
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
  kv: KVNamespace | undefined,
  studentId: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokenInfo | null> {
  const tokenInfo = await getToken(kv, studentId);

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
    await deleteToken(kv, studentId);
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
    await saveToken(kv, studentId, newTokenInfo);

    console.log('[OAuth Token Manager] Token refreshed successfully:', studentId);
    return newTokenInfo;
  } catch (error: any) {
    console.error('[OAuth Token Manager] Failed to refresh token:', error);
    // リフレッシュに失敗したらトークンを削除
    await deleteToken(kv, studentId);
    return null;
  }
}

/**
 * 全トークンの一覧を取得（管理用）
 */
export async function listAllTokens(
  kv: KVNamespace | undefined
): Promise<Array<{ studentId: string; expiresAt: number; hasRefreshToken: boolean }>> {
  if (!kv) {
    console.warn('[OAuth Token Manager] KV namespace not available');
    return [];
  }

  const list = await kv.list({ prefix: 'youtube_oauth:' });
  const tokens: Array<{ studentId: string; expiresAt: number; hasRefreshToken: boolean }> = [];

  for (const key of list.keys) {
    const data = await kv.get(key.name, 'json');
    if (data) {
      const tokenData = data as any;
      tokens.push({
        studentId: tokenData.studentId,
        expiresAt: tokenData.expiresAt,
        hasRefreshToken: !!tokenData.refreshToken,
      });
    }
  }

  return tokens;
}
