/**
 * api/_crypto.js — Utilitaires cryptographiques (Node.js built-ins uniquement, 0 dépendance npm)
 *
 * - Hachage de mots de passe : scrypt + sel aléatoire
 * - Tokens JWT-like : HMAC-SHA256
 *
 * Variable d'environnement requise :
 *   JWT_SECRET — clé de signature des tokens (changer en production !)
 */

import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'crypto';

const getSecret = () => process.env.JWT_SECRET || 'mhz-secret-change-in-production-2026';

/**
 * Hache un mot de passe avec scrypt + sel aléatoire.
 * @returns {string} "sel:hash" (hex)
 */
export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Vérifie un mot de passe en clair contre un hash stocké.
 * Utilise timingSafeEqual pour éviter les attaques temporelles.
 */
export function verifyPassword(plain, stored) {
  try {
    const i = stored.indexOf(':');
    if (i === -1) return false;
    const salt = stored.slice(0, i);
    const hash = stored.slice(i + 1);
    const key  = scryptSync(plain, salt, 64);
    return timingSafeEqual(Buffer.from(hash, 'hex'), key);
  } catch {
    return false;
  }
}

/**
 * Génère un mot de passe temporaire lisible de type "Kxyz-1234".
 */
export function generateTempPassword() {
  const c = 'abcdefghjkmnpqrstuvwxyz';
  let p = c[Math.floor(Math.random() * c.length)].toUpperCase();
  for (let i = 0; i < 3; i++) p += c[Math.floor(Math.random() * c.length)];
  p += '-';
  for (let i = 0; i < 4; i++) p += (Math.floor(Math.random() * 9) + 1);
  return p;
}

/**
 * Signe un payload JWT-like HS256, expiration 7 jours.
 * @returns {string} "header.body.signature" base64url
 */
export function signToken(payload) {
  const h   = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const b   = Buffer.from(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 7 * 86400,
  })).toString('base64url');
  const sig = createHmac('sha256', getSecret()).update(`${h}.${b}`).digest('base64url');
  return `${h}.${b}.${sig}`;
}

/**
 * Vérifie un token et retourne le payload, ou null si invalide/expiré.
 */
export function verifyToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const [h, b, sig] = token.split('.');
    if (!h || !b || !sig) return null;
    const expected = createHmac('sha256', getSecret()).update(`${h}.${b}`).digest('base64url');
    if (sig !== expected) return null;
    const p = JSON.parse(Buffer.from(b, 'base64url').toString('utf8'));
    if (p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}
