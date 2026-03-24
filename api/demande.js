/**
 * api/demande.js — Vercel Serverless Function
 * Route : POST /api/demande
 *
 * Gère deux types :
 *   type = "reservation"    → réservation d'un prestataire spécifique
 *   type = "service_request" → demande de service générique
 *
 * Envoie un email admin (contact@info-experts.fr) + email client si fourni
 */

import { sendAdminEmail, sendClientEmail } from './_email.js';

export default async function handler(req, res) {
  // ── CORS ─────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Méthode non autorisée.' });
  }

  const {
    type,          // 'reservation' | 'service_request'
    prestataire,   // nom du prestataire (reservation)
    service,       // service choisi (reservation)
    serviceType,   // catégorie (service_request)
    description,   // description du besoin (service_request)
    nom,           // nom du client
    email,         // email client (optionnel)
    contact_wa,    // WhatsApp client
    localisation,  // adresse / quartier
    date,          // date souhaitée
    creneau,       // créneau horaire (reservation)
    tarif,         // tarif estimé
    paiement,      // mode de paiement choisi
  } = req.body ?? {};

  // ── Validation ────────────────────────────────────────────────────────────
  if (!type || !['reservation', 'service_request'].includes(type)) {
    return res.status(400).json({ success: false, error: 'type invalide.' });
  }
  if (!contact_wa?.trim()) {
    return res.status(400).json({ success: false, error: 'Le champ "contact_wa" est requis.' });
  }

  // ── Référence unique ──────────────────────────────────────────────────────
  const prefix    = type === 'reservation' ? 'MWH-RDV' : 'MWH-DEM';
  const timestamp = Date.now().toString(36).toUpperCase();
  const random    = Math.random().toString(36).substr(2, 4).toUpperCase();
  const ref       = `${prefix}-${timestamp}-${random}`;

  const demande = {
    ref,
    type,
    prestataire:  prestataire?.trim()  || null,
    service:      service?.trim()      || null,
    serviceType:  serviceType?.trim()  || null,
    description:  description?.trim()  || null,
    nom:          nom?.trim()          || null,
    email:        email?.trim()        || null,
    contact_wa:   contact_wa.trim(),
    localisation: localisation?.trim() || null,
    date:         date?.trim()         || null,
    creneau:      creneau?.trim()      || null,
    tarif:        tarif?.trim()        || null,
    paiement:     paiement?.trim()     || null,
    statut:       'nouveau',
    createdAt:    new Date().toISOString(),
  };

  console.log('[DEMANDE]', JSON.stringify(demande));

  // ── Emails ────────────────────────────────────────────────────────────────
  await Promise.all([
    sendAdminEmail(demande),
    sendClientEmail(demande),
  ]).catch(e => console.error('[EMAIL] Erreur:', e.message));

  return res.status(200).json({
    success: true,
    ref:     demande.ref,
    message: type === 'reservation'
      ? 'Réservation enregistrée. Info Experts vous contactera sous 2h.'
      : 'Demande enregistrée. Info Experts vous contactera sous 2h.',
  });
}
