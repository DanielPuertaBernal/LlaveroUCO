'use strict';
const rateLimit = require('express-rate-limit');

const QUINCE_MINUTOS_MS = 15 * 60 * 1000;
const UN_MINUTO_MS = 60 * 1000;
const AUTH_MAX_INTENTOS = 10;
const REFRESH_MAX_INTENTOS = 20;
const NFC_MAX_LECTURAS_DEFAULT = 120;
// El endpoint acepta un arreglo con miles de registros por llamada (el
// repositorio los divide en lotes internamente), así que no hace falta un
// límite alto de llamadas — pero se deja generoso para no bloquear un ETL
// que reintente o pagine por lotes grandes.
const SYNC_MAX_INTENTOS_DEFAULT = 300;

const authLimiter = rateLimit({
  windowMs: QUINCE_MINUTOS_MS,
  max: AUTH_MAX_INTENTOS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiados intentos. Intente de nuevo en 15 minutos.' },
});

const refreshLimiter = rateLimit({
  windowMs: QUINCE_MINUTOS_MS,
  max: REFRESH_MAX_INTENTOS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas solicitudes de refresh. Intente más tarde.' },
});

const nfcLimiter = rateLimit({
  windowMs: UN_MINUTO_MS,
  max: parseInt(process.env.NFC_RATE_LIMIT_MAX || String(NFC_MAX_LECTURAS_DEFAULT), 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas lecturas NFC en poco tiempo. Intente nuevamente en un minuto.' },
});

const syncLimiter = rateLimit({
  windowMs: QUINCE_MINUTOS_MS,
  max: parseInt(process.env.SYNC_RATE_LIMIT_MAX || String(SYNC_MAX_INTENTOS_DEFAULT), 10),
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, message: 'Demasiadas solicitudes de sincronización. Intente más tarde.' },
});

module.exports = { authLimiter, refreshLimiter, nfcLimiter, syncLimiter };
