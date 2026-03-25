/**
 * api/_firestore.js — Client Firestore REST (sans dépendances npm)
 *
 * Variables d'environnement :
 *   FIREBASE_PROJECT_ID — identifiant du projet Firebase (ex: mhono-wa-hazi)
 *   FIREBASE_API_KEY    — clé API web Firebase (visible dans firebase-config.js)
 *
 * Sécurité : les opérations sont protégées par les règles Firestore.
 * Passer du mode test à des règles restrictives en production.
 */

const PROJECT = process.env.FIREBASE_PROJECT_ID || 'mhono-wa-hazi';
const APIKEY  = process.env.FIREBASE_API_KEY   || '';
const BASE    = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// ── Conversion valeurs Firestore ──────────────────────────────────────────────

function tv(v) {
  if (v == null)              return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number')  return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string')  return { stringValue: v };
  if (Array.isArray(v))       return { arrayValue: { values: v.map(tv) } };
  if (typeof v === 'object')  return { mapValue: { fields: tf(v) } };
  return { stringValue: String(v) };
}

function fv(v) {
  if ('nullValue'      in v) return null;
  if ('booleanValue'   in v) return v.booleanValue;
  if ('integerValue'   in v) return parseInt(v.integerValue, 10);
  if ('doubleValue'    in v) return v.doubleValue;
  if ('stringValue'    in v) return v.stringValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue'     in v) return (v.arrayValue.values || []).map(fv);
  if ('mapValue'       in v) return ff(v.mapValue.fields || {});
  return null;
}

const tf     = obj    => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, tv(v)]));
const ff     = fields => Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, fv(v)]));
const docObj = doc    => ({ id: doc.name.split('/').pop(), ...ff(doc.fields || {}) });

function apiUrl(path) {
  const u = `${BASE}${path}`;
  return APIKEY ? `${u}${u.includes('?') ? '&' : '?'}key=${APIKEY}` : u;
}

// ── CRUD ─────────────────────────────────────────────────────────────────────

/** Crée un document dans une collection. Retourne { id, ...fields }. */
export async function fsCreate(col, data) {
  const r = await fetch(apiUrl(`/${col}`), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields: tf(data) }),
  });
  if (!r.ok) throw new Error(`Firestore create/${col}: ${r.status} — ${await r.text()}`);
  return docObj(await r.json());
}

/** Lit un document par ID. Retourne null si introuvable. */
export async function fsGet(col, id) {
  const r = await fetch(apiUrl(`/${col}/${id}`));
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`Firestore get/${col}/${id}: ${r.status}`);
  return docObj(await r.json());
}

/** Met à jour (merge partiel) un document. */
export async function fsUpdate(col, id, data) {
  const fields = tf(data);
  const p      = new URLSearchParams();
  if (APIKEY) p.set('key', APIKEY);
  for (const k of Object.keys(fields)) p.append('updateMask.fieldPaths', k);
  const r = await fetch(`${BASE}/${col}/${id}?${p}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`Firestore update/${col}/${id}: ${r.status} — ${await r.text()}`);
  return docObj(await r.json());
}

/** Supprime un document. */
export async function fsDelete(col, id) {
  const r = await fetch(apiUrl(`/${col}/${id}`), { method: 'DELETE' });
  if (!r.ok && r.status !== 404) throw new Error(`Firestore delete/${col}/${id}: ${r.status}`);
}

/**
 * Requête structurée sur une collection.
 * @param {string} col
 * @param {Array}  where    — [[field, op, value], ...]  op = 'EQUAL' | 'GREATER_THAN' | etc.
 * @param {{ field: string, dir?: 'ASCENDING'|'DESCENDING' }} orderBy
 * @param {number} limit
 */
export async function fsQuery(col, where = [], orderBy = null, limit = 200) {
  const q = { from: [{ collectionId: col }], limit };

  if (where.length === 1) {
    const [f, op, v] = where[0];
    q.where = { fieldFilter: { field: { fieldPath: f }, op, value: tv(v) } };
  } else if (where.length > 1) {
    q.where = {
      compositeFilter: {
        op: 'AND',
        filters: where.map(([f, op, v]) => ({
          fieldFilter: { field: { fieldPath: f }, op, value: tv(v) },
        })),
      },
    };
  }

  if (orderBy) {
    q.orderBy = [{ field: { fieldPath: orderBy.field }, direction: orderBy.dir || 'ASCENDING' }];
  }

  const r = await fetch(apiUrl(':runQuery'), {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ structuredQuery: q }),
  });
  if (!r.ok) throw new Error(`Firestore query/${col}: ${r.status} — ${await r.text()}`);
  return (await r.json()).filter(x => x.document).map(x => docObj(x.document));
}
