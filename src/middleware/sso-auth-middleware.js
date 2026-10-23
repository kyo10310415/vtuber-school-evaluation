/**
 * WannaV Dashboard SSO認証ミドルウェア (ES6 Module)
 * 
 * 使い方:
 * 1. このファイルをプロジェクトに配置
 * 2. メインファイルで以下のようにインポート:
 *    import ssoAuthMiddleware from './middleware/sso-auth-middleware.js';
 * 3. すべてのルートの前にミドルウェアを追加:
 *    app.use(ssoAuthMiddleware);
 */

import jwt from 'jsonwebtoken';
import { readSecurityConfig } from './security-config.js';
import { canCrewRead } from './access.js';

// WannaV Dashboardと同じJWT_SECRETを使用
const config = readSecurityConfig();
const JWT_SECRET = config.jwtSecret;
const DASHBOARD_URL = process.env.DASHBOARD_URL || 'https://wannav-main.onrender.com';

function ssoAuthMiddleware(req, res, next) {
  // 認証トークンをチェック
  const api = req.path === '/api' || req.path.startsWith('/api/');
  const tokenFromQuery = !api && req.method === 'GET' ? req.query.auth_token : null;
  const tokenFromCookie = req.cookies?.wannav_sso;

  const token = tokenFromQuery || tokenFromCookie;

  // トークンがない場合はダッシュボードにリダイレクト
  if (!token) {
    console.log('❌ SSO トークンなし → ダッシュボードにリダイレクト');
    return res.redirect(DASHBOARD_URL);
  }

  try {
    // トークンを検証
    const decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'], maxAge: '1h' });
    
    // SSOトークンかチェック
    if (decoded.type !== 'sso' || !['admin', 'leader', 'crew'].includes(decoded.role) || new URL(decoded.targetUrl).origin !== config.origin) {
      console.log('❌ 無効なトークンタイプ');
      return res.redirect(DASHBOARD_URL);
    }

    if (decoded.role === 'crew' && !canCrewRead(req.method, req.path)) {
      return res.status(403).json({ error: 'Read-only access' });
    }

    console.log('SSO authentication succeeded');

    // ユーザー情報をrequestに追加
    req.user = {
      id: decoded.userId,
      username: decoded.username,
      role: decoded.role
    };

    // クエリパラメータからトークンを取得した場合、Cookieに保存
    if (tokenFromQuery) {
      res.cookie('wannav_sso', token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 60 * 60 * 1000,
        sameSite: 'lax'
      });
      
      // トークンをURLから削除してリダイレクト
      const urlWithoutToken = req.originalUrl.split('?')[0];
      return res.redirect(urlWithoutToken);
    }

    next();
  } catch (error) {
    console.error('❌ SSO トークン検証エラー:', error.message);
    
    // トークンが期限切れの場合、Cookieをクリア
    res.clearCookie('wannav_sso');
    
    return res.redirect(DASHBOARD_URL);
  }
}

export default ssoAuthMiddleware;
