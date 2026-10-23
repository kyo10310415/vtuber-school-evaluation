import { readSecurityConfig } from './security-config.js';
import { createAccessMiddleware } from './access.js';

export const ssoAuthMiddleware = createAccessMiddleware(readSecurityConfig());
