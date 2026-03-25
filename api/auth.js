/**
 * api/auth.js — Authentification des utilisateurs
 *
 * POST /api/auth  action='login'           → { email, password } → { token, user }
 * POST /api/auth  action='change-password' → { newPassword } + Bearer token → { token }
 * POST /api/auth  action='verify'          → Bearer token → { user }
 *
 * Variables d'environnement :
 *   JWT_SECRET          — clé de signature des tokens
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_API_KEY
 */

import { verifyPassword, hashPassword, signToken, verifyToken } from './_crypto.js';
import { fsQuery, fsUpdate } from './_firestore.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { action, email, password, newPassword, token } = req.body ?? {};

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (action === 'login') {
    if (!email?.trim() || !password) {
      return res.status(400).json({ success: false, error: 'Email et mot de passe requis.' });
    }

    try {
      const users = await fsQuery('users', [['email', 'EQUAL', email.trim().toLowerCase()]]);
      const user  = users[0];

      // Même message d'erreur pour email inconnu et mauvais mot de passe (sécurité)
      if (!user || !verifyPassword(password, user.password || '')) {
        return res.status(401).json({ success: false, error: 'Email ou mot de passe incorrect.' });
      }

      if (user.statut === 'inactif') {
        return res.status(403).json({
          success: false,
          error: 'Compte désactivé. Contactez Info Experts au +269 331 27 22.',
        });
      }

      const tok = signToken({
        uid:               user.id,
        email:             user.email,
        nom:               user.nom,
        role:              user.role,
        mustChangePassword: user.mustChangePassword === true,
      });

      return res.status(200).json({
        success: true,
        token:   tok,
        user: {
          uid:               user.id,
          nom:               user.nom,
          email:             user.email,
          telephone:         user.telephone  || '',
          role:              user.role,
          mustChangePassword: user.mustChangePassword === true,
          specialite:        user.specialite || null,
          ville:             user.ville      || null,
        },
      });
    } catch (e) {
      console.error('[AUTH LOGIN]', e.message);
      return res.status(500).json({ success: false, error: 'Erreur serveur. Réessayez.' });
    }
  }

  // ── CHANGE PASSWORD ───────────────────────────────────────────────────────
  if (action === 'change-password') {
    const bearer  = (req.headers.authorization || '').replace('Bearer ', '') || token;
    const payload = verifyToken(bearer);

    if (!payload) {
      return res.status(401).json({ success: false, error: 'Session invalide. Veuillez vous reconnecter.' });
    }
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: 'Le mot de passe doit faire au moins 6 caractères.' });
    }

    try {
      await fsUpdate('users', payload.uid, {
        password:           hashPassword(newPassword),
        mustChangePassword: false,
        updatedAt:          new Date().toISOString(),
      });

      // Émet un nouveau token avec mustChangePassword = false
      const newTok = signToken({ ...payload, mustChangePassword: false });

      return res.status(200).json({
        success: true,
        token:   newTok,
        message: 'Mot de passe modifié avec succès.',
      });
    } catch (e) {
      console.error('[AUTH CHANGE-PWD]', e.message);
      return res.status(500).json({ success: false, error: 'Erreur serveur. Réessayez.' });
    }
  }

  // ── VERIFY TOKEN ──────────────────────────────────────────────────────────
  if (action === 'verify') {
    const bearer  = (req.headers.authorization || '').replace('Bearer ', '') || token;
    const payload = verifyToken(bearer);
    if (!payload) {
      return res.status(401).json({ success: false, error: 'Token invalide ou expiré.' });
    }
    return res.status(200).json({ success: true, user: payload });
  }

  return res.status(400).json({ success: false, error: `Action inconnue : "${action}"` });
}
