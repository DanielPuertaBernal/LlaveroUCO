'use strict';
/**
 * API Key Middleware - Autentica integraciones servidor-a-servidor (sin
 * usuario humano detrás, por lo que no aplica el flujo JWT) mediante una
 * clave compartida fija tomada de una variable de entorno.
 */

/**
 * Retorna middleware que exige el header `X-Api-Key` y lo compara contra el
 * valor de `envVarName`. Si la variable de entorno no está configurada, el
 * endpoint queda bloqueado por completo (fail closed), nunca abierto.
 * @param {string} envVarName - Nombre de la variable de entorno con la clave esperada
 */
function requireApiKey(envVarName) {
  return (req, res, next) => {
    const claveEsperada = process.env[envVarName];
    if (!claveEsperada) {
      return res.status(503).json({ ok: false, message: 'Servicio no configurado' });
    }

    const claveRecibida = req.headers['x-api-key'];
    if (!claveRecibida || claveRecibida !== claveEsperada) {
      return res.status(401).json({ ok: false, message: 'API key inválida o no proporcionada' });
    }

    next();
  };
}

module.exports = { requireApiKey };
