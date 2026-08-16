'use strict';
const crypto = require('crypto');
const { createRemoteJWKSet, jwtVerify } = require('jose');

/**
 * Helpers puros del protocolo OAuth2 / Microsoft Identity Platform (v2.0)
 * para el login Office365 (authorization-code flow). No conocen usuarios ni
 * JWT propios de la app — eso vive en `auth.service.js`, que orquesta estos
 * helpers junto con `usuario.repository.js` y la emisión de tokens propia.
 *
 * Implementado a mano con `fetch` nativo de Node (sin `@azure/msal-node` por
 * decisión explícita de alcance) y `crypto` para firmar `state` con
 * HMAC-SHA256 (no un JWT: es solo un valor opaco firmado + expiración).
 */

const STATE_TTL_MS = 5 * 60 * 1000; // 5 minutos
const OAUTH_SCOPE = 'openid profile email';

function getEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Variable de entorno requerida no definida: ${name}`);
  }
  return value;
}

function signStatePayload(encodedPayload) {
  const secret = getEnv('OAUTH_STATE_SIGNING_SECRET');
  return crypto.createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

/**
 * Firma un `state` opaco = base64url({ email, ts }) + '.' + HMAC-SHA256(payload).
 * @param {string} email
 * @returns {string}
 */
function signState(email) {
  const payload = JSON.stringify({ email, ts: Date.now() });
  const encodedPayload = Buffer.from(payload, 'utf8').toString('base64url');
  const signature = signStatePayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

/**
 * Valida la firma HMAC y la expiración (5 min) de un `state` recibido en el
 * callback.
 * @param {string} state
 * @returns {{ok: true, email: string} | {ok: false, reason: string}}
 */
function verifyState(state) {
  if (!state || typeof state !== 'string' || !state.includes('.')) {
    return { ok: false, reason: 'state_malformado' };
  }

  const [encodedPayload, signature] = state.split('.');
  if (!encodedPayload || !signature) {
    return { ok: false, reason: 'state_malformado' };
  }

  let expectedSignature;
  try {
    expectedSignature = signStatePayload(encodedPayload);
  } catch {
    return { ok: false, reason: 'firma_invalida' };
  }

  const signatureBuffer = Buffer.from(signature, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return { ok: false, reason: 'firma_invalida' };
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    return { ok: false, reason: 'payload_invalido' };
  }

  if (!payload || typeof payload.email !== 'string' || typeof payload.ts !== 'number') {
    return { ok: false, reason: 'payload_invalido' };
  }

  if (Date.now() - payload.ts > STATE_TTL_MS) {
    return { ok: false, reason: 'state_expirado' };
  }

  return { ok: true, email: payload.email };
}

/**
 * Construye la URL de autorización de Microsoft Identity Platform (v2.0)
 * para iniciar el authorization-code flow, con `login_hint` para prellenar
 * el correo en el portal de Office.
 * @param {string} email
 * @returns {string}
 */
function buildAuthorizationUrl(email) {
  const state = signState(email);
  const params = new URLSearchParams({
    client_id: getEnv('AZURE_CLIENT_ID'),
    response_type: 'code',
    redirect_uri: getEnv('AZURE_REDIRECT_URI'),
    response_mode: 'query',
    scope: OAUTH_SCOPE,
    state,
    login_hint: email,
  });

  return `https://login.microsoftonline.com/${getEnv('AZURE_TENANT_ID')}/oauth2/v2.0/authorize?${params.toString()}`;
}

/**
 * Intercambia el `code` de autorización por tokens (POST al endpoint
 * `/oauth2/v2.0/token`).
 * @param {string} code
 * @returns {Promise<{id_token: string, access_token: string, [key: string]: unknown}>}
 */
async function exchangeCodeForTokens(code) {
  const body = new URLSearchParams({
    client_id: getEnv('AZURE_CLIENT_ID'),
    client_secret: getEnv('AZURE_CLIENT_SECRET'),
    code,
    redirect_uri: getEnv('AZURE_REDIRECT_URI'),
    grant_type: 'authorization_code',
    scope: OAUTH_SCOPE,
  });

  const tenantId = getEnv('AZURE_TENANT_ID');
  const response = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = data.error_description || data.error || 'Error intercambiando code por tokens';
    const err = new Error(message);
    err.oauthError = data;
    throw err;
  }

  return data;
}

// JWKS remoto de Microsoft cacheado en memoria por proceso (createRemoteJWKSet
// ya implementa su propio cache/refresh de claves internamente). Se crea de
// forma perezosa —no al cargar el módulo— porque `AZURE_TENANT_ID` puede no
// estar seteada en ambientes donde el login Office365 nunca se usa (ver nota
// en `server.js`).
let jwksCache = null;

function getJwks() {
  if (!jwksCache) {
    const tenantId = getEnv('AZURE_TENANT_ID');
    jwksCache = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`)
    );
  }
  return jwksCache;
}

/**
 * Verifica la firma criptográfica del `id_token` (JWT) devuelto por
 * Microsoft contra el JWKS público del tenant, y valida `iss`/`aud`, antes
 * de confiar en cualquier claim (incluido el email). Reemplaza el decode
 * "a ciegas" anterior: ya no basta con que el token llegue por un canal
 * servidor-a-servidor autenticado, se verifica criptográficamente.
 * @param {string} idToken
 * @returns {Promise<object>} payload verificado del JWT
 */
async function decodeIdTokenPayload(idToken) {
  const parts = String(idToken || '').split('.');
  if (parts.length !== 3) {
    throw new Error('id_token con formato inválido');
  }

  const tenantId = getEnv('AZURE_TENANT_ID');
  const clientId = getEnv('AZURE_CLIENT_ID');
  const jwks = getJwks();

  const { payload } = await jwtVerify(idToken, jwks, {
    issuer: [
      `https://login.microsoftonline.com/${tenantId}/v2.0`,
      `https://sts.windows.net/${tenantId}/`,
    ],
    audience: clientId,
  });

  return payload;
}

/**
 * @param {object} idTokenPayload
 * @returns {string} email normalizado a lowercase (vacío si no hay claim usable)
 */
function extractEmailFromIdTokenPayload(idTokenPayload) {
  const email = idTokenPayload?.email || idTokenPayload?.preferred_username || '';
  return String(email).trim().toLowerCase();
}

module.exports = {
  signState,
  verifyState,
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  decodeIdTokenPayload,
  extractEmailFromIdTokenPayload,
};
