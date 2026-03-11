/**
 * X API レート制限管理
 * v2エンドポイントのレート制限を管理し、429エラーを回避
 */

export interface RateLimitConfig {
  endpoint: string;
  limit: number; // 15分あたりの上限
  window: number; // ミリ秒（15分 = 900,000ms）
}

export interface RateLimitState {
  endpoint: string;
  count: number;
  resetAt: number; // タイムスタンプ
}

// X API v2のレート制限設定
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'user_lookup': {
    endpoint: '/2/users/by/username/:username',
    limit: 300,
    window: 15 * 60 * 1000 // 15分
  },
  'user_tweets': {
    endpoint: '/2/users/:id/tweets',
    limit: 900,
    window: 15 * 60 * 1000 // 15分
  },
  'user_by_id': {
    endpoint: '/2/users/:id',
    limit: 300,
    window: 15 * 60 * 1000 // 15分
  }
};

// レート制限状態を保持（メモリ内）
const rateLimitStates = new Map<string, RateLimitState>();

/**
 * レート制限状態を取得
 */
export function getRateLimitState(endpointKey: string): RateLimitState {
  const now = Date.now();
  const config = RATE_LIMITS[endpointKey];
  
  if (!config) {
    throw new Error(`Unknown endpoint key: ${endpointKey}`);
  }
  
  let state = rateLimitStates.get(endpointKey);
  
  // 状態がないか、リセット時刻を過ぎている場合は初期化
  if (!state || now >= state.resetAt) {
    state = {
      endpoint: config.endpoint,
      count: 0,
      resetAt: now + config.window
    };
    rateLimitStates.set(endpointKey, state);
  }
  
  return state;
}

/**
 * リクエストが可能かチェック
 */
export function canMakeRequest(endpointKey: string): boolean {
  const config = RATE_LIMITS[endpointKey];
  const state = getRateLimitState(endpointKey);
  
  // 残りリクエスト数を計算（10%のバッファを確保）
  const safeLimit = Math.floor(config.limit * 0.9);
  
  return state.count < safeLimit;
}

/**
 * リクエストをカウント
 */
export function recordRequest(endpointKey: string): void {
  const state = getRateLimitState(endpointKey);
  state.count++;
  
  const config = RATE_LIMITS[endpointKey];
  const remaining = config.limit - state.count;
  const resetIn = Math.ceil((state.resetAt - Date.now()) / 1000 / 60);
  
  console.log(`[Rate Limiter] ${endpointKey}: ${state.count}/${config.limit} (${remaining} remaining, resets in ${resetIn}min)`);
}

/**
 * 次のリクエストまでの待機時間を計算（ミリ秒）
 */
export function getWaitTime(endpointKey: string): number {
  const state = getRateLimitState(endpointKey);
  const now = Date.now();
  
  if (now >= state.resetAt) {
    return 0; // リセット済み
  }
  
  return state.resetAt - now;
}

/**
 * レート制限をリセット（テスト用）
 */
export function resetRateLimit(endpointKey: string): void {
  rateLimitStates.delete(endpointKey);
  console.log(`[Rate Limiter] Reset rate limit for ${endpointKey}`);
}

/**
 * 全レート制限状態を表示
 */
export function printRateLimitStatus(): void {
  console.log('[Rate Limiter] Current status:');
  for (const [key, state] of rateLimitStates.entries()) {
    const config = RATE_LIMITS[key];
    const remaining = config.limit - state.count;
    const resetIn = Math.ceil((state.resetAt - Date.now()) / 1000 / 60);
    console.log(`  ${key}: ${state.count}/${config.limit} (${remaining} remaining, resets in ${resetIn}min)`);
  }
}

/**
 * 安全なリクエスト実行（レート制限を考慮）
 */
export async function executeWithRateLimit<T>(
  endpointKey: string,
  fn: () => Promise<T>
): Promise<T> {
  // リクエスト可能かチェック
  if (!canMakeRequest(endpointKey)) {
    const waitTime = getWaitTime(endpointKey);
    const waitMin = Math.ceil(waitTime / 1000 / 60);
    console.warn(`[Rate Limiter] Rate limit approaching for ${endpointKey}. Waiting ${waitMin} minutes...`);
    
    // 待機
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  // リクエスト実行
  recordRequest(endpointKey);
  return await fn();
}
