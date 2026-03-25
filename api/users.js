/**
 * api/users.js — Gestion des comptes utilisateurs (admin uniquement)
 *
 * Toutes les routes nécessitent le header : X-Admin-Key = ADMIN_PWD
 *
 * GET  /api/users                       → liste (sans mots de passe)
 * POST /api/users  action='create'      → créer un compte
 * POST /api/users  action='update'      → modifier les infos
 * POST /api/users  action='reset-pwd'   → nouveau mot de passe temporaire
 * POST /api/users  action='toggle'      → activer / désactiver
 * POST /api/users  action='delete'      → supprimer
 *
 * Variables d'environnement :
 *   ADMIN_PWD          — mot de passe admin (même que window.ADMIN_PWD côté client)
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_API_KEY
 */

import { hashPassword, generateTempPassword } from './_crypto.js';
import { fsCreate, fsUpdate, fsDelete, fsQuery } from './_firestore.js';
import { sendWelcomeEmail } from './_email.js';

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Key',
};

const isAdmin = req =>
  (req.headers['x-admin-key'] || '') === (process.env.ADMIN_PWD || 'InfoExperts2026!');

// Retire le champ password avant de renvoyer un utilisateur au client
const strip = ({ password, ...rest }) => rest;

export default async function handler(req, res) {
  Object.entries(CORS).forEach(([k, v]) => res.setHeader(k, v));
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Accès refusé. Clé admin invalide.' });
  }

  // ── GET — liste des utilisateurs ──────────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const users = await fsQuery('users', [], { field: 'createdAt', dir: 'DESCENDING' });
      return res.status(200).json({ success: true, users: users.map(strip) });
    } catch (e) {
      console.error('[USERS GET]', e.message);
      return res.status(500).json({ success: false, error: 'Erreur serveur lors de la récupération.' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée.' });
  }

  const { action, uid, ...body } = req.body ?? {};

  // ── CREATE ────────────────────────────────────────────────────────────────
  if (action === 'create') {
    const { nom, email, telephone, role, statut, tempPassword, specialite, ville } = body;

    if (!nom?.trim() || !email?.trim() || !role) {
      return res.status(400).json({ success: false, error: 'Nom, email et rôle sont obligatoires.' });
    }
    if (!['client', 'prestataire'].includes(role)) {
      return res.status(400).json({ success: false, error: 'Rôle invalide (client ou prestataire).' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ success: false, error: 'Format email invalide.' });
    }

    // Vérification unicité email
    try {
      const exists = await fsQuery('users', [['email', 'EQUAL', email.trim().toLowerCase()]]);
      if (exists.length > 0) {
        return res.status(409).json({ success: false, error: 'Cet email est déjà utilisé par un autre compte.' });
      }
    } catch { /* si l'index n'existe pas encore, on continue */ }

    const pwd = tempPassword?.trim() || generateTempPassword();
    const now = new Date().toISOString();

    const data = {
      nom:                nom.trim(),
      email:              email.trim().toLowerCase(),
      telephone:          telephone?.trim() || '',
      role,
      statut:             statut || 'actif',
      password:           hashPassword(pwd),
      mustChangePassword: true,
      createdAt:          now,
      updatedAt:          now,
    };

    if (role === 'prestataire') {
      data.specialite = specialite?.trim() || '';
      data.ville      = ville?.trim()      || '';
      data.validated  = false;
    }

    try {
      const user = await fsCreate('users', data);
      // Envoi email de bienvenue (fire & forget)
      sendWelcomeEmail({ nom: data.nom, email: data.email, tempPassword: pwd, role: data.role })
        .catch(err => console.error('[USERS CREATE EMAIL]', err.message));
      return res.status(201).json({
        success:     true,
        user:        strip(user),
        tempPassword: pwd,
        message:     `Compte créé. Mot de passe temporaire : ${pwd}`,
      });
    } catch (e) {
      console.error('[USERS CREATE]', e.message);
      return res.status(500).json({ success: false, error: 'Erreur lors de la création du compte.' });
    }
  }

  // ── UPDATE ────────────────────────────────────────────────────────────────
  if (action === 'update') {
    if (!uid) return res.status(400).json({ success: false, error: 'uid manquant.' });

    const { nom, email, telephone, statut, specialite, ville } = body;
    const updates = { updatedAt: new Date().toISOString() };
    if (nom?.trim())        updates.nom        = nom.trim();
    if (email?.trim())      updates.email      = email.trim().toLowerCase();
    if (telephone != null)  updates.telephone  = telephone.trim();
    if (statut)             updates.statut     = statut;
    if (specialite != null) updates.specialite = specialite.trim();
    if (ville != null)      updates.ville      = ville.trim();

    try {
      await fsUpdate('users', uid, updates);
      return res.status(200).json({ success: true, message: 'Compte mis à jour avec succès.' });
    } catch (e) {
      console.error('[USERS UPDATE]', e.message);
      return res.status(500).json({ success: false, error: 'Erreur lors de la mise à jour.' });
    }
  }

  // ── RESET PASSWORD ────────────────────────────────────────────────────────
  if (action === 'reset-pwd') {
    if (!uid) return res.status(400).json({ success: false, error: 'uid manquant.' });

    const pwd = generateTempPassword();
    try {
      await fsUpdate('users', uid, {
        password:           hashPassword(pwd),
        mustChangePassword: true,
        updatedAt:          new Date().toISOString(),
      });
      return res.status(200).json({
        success:      true,
        tempPassword: pwd,
        message:      `Mot de passe temporaire généré : ${pwd}`,
      });
    } catch (e) {
      console.error('[USERS RESET-PWD]', e.message);
      return res.status(500).json({ success: false, error: 'Erreur lors de la réinitialisation.' });
    }
  }

  // ── TOGGLE STATUS ─────────────────────────────────────────────────────────
  if (action === 'toggle') {
    if (!uid) return res.status(400).json({ success: false, error: 'uid manquant.' });
    const { newStatut } = body;
    if (!['actif', 'inactif'].includes(newStatut)) {
      return res.status(400).json({ success: false, error: 'Statut invalide (actif ou inactif).' });
    }
    try {
      await fsUpdate('users', uid, { statut: newStatut, updatedAt: new Date().toISOString() });
      return res.status(200).json({
        success: true,
        message: `Compte ${newStatut === 'actif' ? 'réactivé' : 'désactivé'} avec succès.`,
      });
    } catch (e) {
      console.error('[USERS TOGGLE]', e.message);
      return res.status(500).json({ success: false, error: 'Erreur lors du changement de statut.' });
    }
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    if (!uid) return res.status(400).json({ success: false, error: 'uid manquant.' });
    try {
      await fsDelete('users', uid);
      return res.status(200).json({ success: true, message: 'Compte supprimé définitivement.' });
    } catch (e) {
      console.error('[USERS DELETE]', e.message);
      return res.status(500).json({ success: false, error: 'Erreur lors de la suppression.' });
    }
  }

  return res.status(400).json({ success: false, error: `Action inconnue : "${action}"` });
}
