/**
 * WannaV Dashboard SSO認証ミドルウェア (Hono用)
 * 
 * 使い方:
 * 1. このファイルをsrc/middlewareに配置
 * 2. メインファイルで以下のようにインポート:
 *    import { ssoAuthMiddleware } from './middleware/sso-auth.js';
 * 3. すべてのルートの前にミドルウェアを追加:
 *    app.use('*', ssoAuthMiddleware);
 */

import jwt from 'jsonwebtoken';
import { getCookie, setCookie } from 'hono/cookie';

// WannaV Dashboardと同じJWT_SECRETを使用
const JWT_SECRET = process.env.JWT_SECRET || 'wannav-secret-key-change-in-production';
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://wannav-main.onrender.com';

export async function ssoAuthMiddleware(c, next) {
  // 認証トークンをチェック
  const tokenFromQuery = c.req.query('auth_token');
  const tokenFromCookie = getCookie(c, 'wannav_sso');

  const token = tokenFromQuery || tokenFromCookie;

  // トークンがない場合はダッシュボードにリダイレクト
  if (!token) {
    console.log('❌ SSO トークンなし → ダッシュボードにリダイレクト');
    return c.redirect(DASHBOARD_URL);
  }

  try {
    // トークンを検証
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // SSOトークンかチェック
    if (decoded.type !== 'sso') {
      console.log('❌ 無効なトークンタイプ');
      return c.redirect(DASHBOARD_URL);
    }

    console.log(`✅ SSO 認証成功: ${decoded.username} (${decoded.role})`);

    // ユーザー情報をコンテキストに追加
    c.set('user', {
      id: decoded.userId,
      username: decoded.username,
      role: decoded.role
    });

    // クエリパラメータからトークンを取得した場合、Cookieに保存
    if (tokenFromQuery) {
      setCookie(c, 'wannav_sso', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 7 * 24 * 60 * 60, // 7日間
        sameSite: 'Lax',
        path: '/'
      });
      
      // トークンをURLから削除してリダイレクト
      const url = new URL(c.req.url);
      url.searchParams.delete('auth_token');
      return c.redirect(url.pathname);
    }

    await next();
  } catch (error) {
    console.error('❌ SSO トークン検証エラー:', error.message);
    
    // トークンが期限切れの場合、Cookieをクリア
    setCookie(c, 'wannav_sso', '', {
      maxAge: 0,
      path: '/'
    });
    
    return c.redirect(DASHBOARD_URL);
  }
}
