/**
 * api/_email.js — Helper envoi email via Resend REST API
 * Préfixe _ : Vercel n'expose pas ce fichier comme une route
 */

const RESEND_API = 'https://api.resend.com/emails';

async function sendEmail({ to, subject, html }) {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn('[EMAIL] RESEND_API_KEY non configurée — email ignoré');
    return;
  }
  const from = process.env.EMAIL_FROM || 'noreply@info-experts.fr';
  try {
    const r = await fetch(RESEND_API, {
      method:  'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body:    JSON.stringify({ from, to: [].concat(to), subject, html }),
    });
    if (!r.ok) {
      console.error('[EMAIL] Erreur Resend', r.status, await r.text());
    } else {
      console.log('[EMAIL] Envoyé →', [].concat(to).join(', '));
    }
  } catch (e) {
    console.error('[EMAIL] Exception:', e.message);
  }
}

function fmtDate(iso) {
  try {
    const d = new Date(new Date(iso).getTime() + 3 * 3600_000);
    return d.toLocaleString('fr-FR', { dateStyle: 'full', timeStyle: 'short' }) + ' (heure Comores)';
  } catch { return iso; }
}

const BANNER_URL = 'https://info-experts.fr/email-banner-opt.jpg';

function wrap(inner) {
  return `<!DOCTYPE html><html lang="fr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
    <div style="width:100%;line-height:0">
      <img src="${BANNER_URL}" alt="Info Experts — Moroni, Comores" width="600"
           style="width:100%;max-width:600px;height:auto;display:block;border:0">
    </div>
    <div style="background:#0D6B4A;padding:20px 28px">
      <div style="font-size:20px;font-weight:800;color:#fff">Mhono <span style="color:#7EFFC5">wa Hazi</span></div>
      <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-top:4px">Plateforme de services — Comores · Par Info Experts</div>
    </div>
    ${inner}
    <div style="padding:14px 28px;background:#f8fafc;border-top:1px solid #e5e7eb;font-size:11px;color:#9ca3af;text-align:center">
      Info Experts · Moroni, Comores ·
      <a href="https://info-experts.fr" style="color:#0D6B4A">info-experts.fr</a> ·
      <a href="tel:+269331272" style="color:#0D6B4A">+269 331 27 22</a>
    </div>
  </div>
</body></html>`;
}

function tableRow(label, value) {
  return `<tr>
    <td style="padding:8px 12px;background:#f8fafc;font-weight:600;color:#6b7280;white-space:nowrap;border-bottom:1px solid #e5e7eb;font-size:12px">${label}</td>
    <td style="padding:8px 12px;color:#111827;border-bottom:1px solid #e5e7eb;font-size:13px">${value}</td>
  </tr>`;
}

// ── Email Admin ────────────────────────────────────────────────────────────────
export function sendAdminEmail(demande) {
  const admin   = process.env.EMAIL_TO || 'contact@info-experts.fr';
  const isRdv   = demande.type === 'reservation';
  const subject = `[Mhono wa Hazi] Nouvelle ${isRdv ? 'réservation' : 'demande'} — ${demande.nom || demande.contact_wa}`;

  const rows = [
    isRdv ? tableRow('Type', 'Réservation prestataire') : tableRow('Type', 'Demande de service'),
    demande.prestataire  ? tableRow('Prestataire',  demande.prestataire)  : '',
    demande.service      ? tableRow('Service',      demande.service)      : '',
    demande.serviceType  ? tableRow('Catégorie',    demande.serviceType)  : '',
    demande.nom          ? tableRow('Nom client',   demande.nom)          : '',
    demande.contact_wa   ? tableRow('WhatsApp',     demande.contact_wa)   : '',
    demande.localisation ? tableRow('Localisation', demande.localisation) : '',
    demande.date         ? tableRow('Date souhaitée', demande.date)       : '',
    demande.creneau      ? tableRow('Créneau',      demande.creneau)      : '',
    demande.tarif        ? tableRow('Tarif estimé', demande.tarif)        : '',
    demande.paiement     ? tableRow('Paiement',     demande.paiement)     : '',
    demande.description  ? tableRow('Description',  demande.description)  : '',
    tableRow('Référence', `<strong style="font-family:monospace;background:#e5e7eb;padding:2px 8px;border-radius:4px">${demande.ref}</strong>`),
    tableRow('Date',      fmtDate(demande.createdAt)),
  ].filter(Boolean).join('');

  const html = wrap(`
    <div style="padding:24px 28px">
      <p style="margin:0 0 16px;color:#374151;font-size:14px">
        🔔 Nouvelle ${isRdv ? 'réservation' : 'demande'} reçue sur <strong>Mhono wa Hazi</strong>.
      </p>
      <table style="width:100%;border-collapse:collapse;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
        ${rows}
      </table>
      <div style="margin-top:16px;padding:12px 16px;background:#E6F7F1;border-radius:8px;font-size:13px;color:#0D6B4A">
        Contactez le client au <strong>${demande.contact_wa || '—'}</strong> pour confirmer.
      </div>
    </div>`);

  return sendEmail({ to: admin, subject, html });
}

// ── Email Client ───────────────────────────────────────────────────────────────
export function sendClientEmail(demande) {
  if (!demande.email) return Promise.resolve();

  const isRdv   = demande.type === 'reservation';
  const subject = isRdv
    ? 'Votre réservation est enregistrée — Mhono wa Hazi'
    : 'Votre demande est enregistrée — Mhono wa Hazi';

  const html = wrap(`
    <div style="padding:24px 28px">
      <p style="margin:0 0 6px;font-size:16px;font-weight:800;color:#111827">Bonjour ${demande.nom || ''},</p>
      <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.6">
        ${isRdv
          ? 'Votre réservation a bien été enregistrée. Info Experts va contacter le prestataire et vous confirmera le rendez-vous sous <strong>2 heures</strong>.'
          : 'Votre demande a bien été reçue. Info Experts va trouver le bon prestataire et vous contactera sous <strong>2 heures</strong>.'}
      </p>

      <div style="background:#f9fafb;border-radius:10px;padding:14px 16px;font-size:13px;margin-bottom:14px;border:1px solid #e5e7eb">
        ${demande.prestataire ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f3f4f6">
          <span style="color:#6b7280">Prestataire</span>
          <span style="font-weight:600;color:#111827">${demande.prestataire}</span>
        </div>` : ''}
        ${demande.service || demande.serviceType ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f3f4f6">
          <span style="color:#6b7280">Service</span>
          <span style="font-weight:600;color:#111827">${demande.service || demande.serviceType}</span>
        </div>` : ''}
        ${demande.tarif ? `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #f3f4f6">
          <span style="color:#6b7280">Tarif estimé</span>
          <span style="font-weight:700;color:#0D6B4A">${demande.tarif}</span>
        </div>` : ''}
        <div style="display:flex;justify-content:space-between;padding:5px 0">
          <span style="color:#6b7280">Référence</span>
          <span style="font-family:monospace;font-weight:700;background:#e5e7eb;padding:2px 8px;border-radius:4px;font-size:11px">${demande.ref}</span>
        </div>
      </div>

      <div style="padding:12px 16px;background:#E6F7F1;border-radius:8px;font-size:13px;color:#0D6B4A;margin-bottom:14px">
        📞 Info Experts vous contactera au <strong>${demande.contact_wa || '—'}</strong> sur WhatsApp.
      </div>

      <div style="padding:12px 16px;background:#f0fdf4;border-radius:8px;font-size:13px;color:#166534">
        ✅ Merci de faire confiance à Mhono wa Hazi. Aucun paiement sans notre confirmation préalable.
      </div>
    </div>`);

  return sendEmail({ to: demande.email, subject, html });
}
