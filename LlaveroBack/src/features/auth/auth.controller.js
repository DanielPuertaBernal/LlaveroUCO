'use strict';
/**
 * Auth Controller - Orquesta login/logout/me
 */
const authService = require('./auth.service');
const ApiError = require('../../shared/errors/api.error');
const { isDominioAutorizado } = require('./auth.constants');
const { createLogger } = require('../../shared/utils/logger');

const log = createLogger('Auth');

const REFRESH_COOKIE_NAME = 'refreshToken';
const REFRESH_COOKIE_PATH = '/api/auth';

class AuthController {
  /**
   * Setea el refresh token como cookie httpOnly (no accesible desde JS del
   * navegador), con la misma expiración real que el JWT firmado
   * (`authService.getRefreshCookieMaxAgeMs()`). `secure` solo se activa en
   * producción para no romper desarrollo local sin HTTPS.
   * @param {import('express').Response} res
   * @param {string} refreshToken
   */
  _setRefreshCookie(res, refreshToken) {
    res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: authService.getRefreshCookieMaxAgeMs(),
      path: REFRESH_COOKIE_PATH,
    });
  }

  _clearRefreshCookie(res) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }

  /**
   * POST /api/auth/logout
   * JWT es stateless; el cliente debe eliminar el token.
   * En una implementación con blacklist se agregaría aquí.
   */
  async logout(req, res) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken || '';
    await authService.logout(req.user?.sub, refreshToken);
    this._clearRefreshCookie(res);
    return res.status(200).json({ ok: true, message: 'Sesión cerrada correctamente' });
  }

  /**
   * GET /api/auth/me
   * Retorna el usuario autenticado (desde el token)
   */
  async me(req, res) {
    const usuario = await authService.getMe(req.user.sub);
    if (!usuario) {
      return res.status(404).json({ ok: false, message: 'Usuario no encontrado' });
    }
    return res.status(200).json({ ok: true, data: { usuario } });
  }

  /**
   * POST /api/auth/refresh
   * Lee el refresh token de la cookie httpOnly (fuente de verdad). Se
   * mantiene el fallback a `req.body.refreshToken` como transición mientras
   * clientes viejos migran, pero ya no se devuelve el refresh token en el
   * body de la respuesta: se rota y se re-setea como cookie httpOnly.
   */
  async refresh(req, res) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE_NAME] || req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ ok: false, message: 'refreshToken requerido' });
    }
    const result = await authService.refresh(refreshToken, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    this._setRefreshCookie(res, result.refreshToken);
    return res.status(200).json({ ok: true, data: { token: result.token } });
  }

  /**
   * GET /api/auth/office365/login?email=<email>
   * Redirige al usuario al portal de Microsoft para autenticarse (Office365).
   */
  async office365Login(req, res) {
    const email = String(req.query.email || '').trim().toLowerCase();
    if (!email) {
      throw ApiError.badRequest('email requerido');
    }
    if (!isDominioAutorizado(email)) {
      throw ApiError.badRequest('Dominio de correo no autorizado');
    }

    const authorizationUrl = authService.buildOffice365AuthorizationUrl(email);
    return res.redirect(302, authorizationUrl);
  }

  /**
   * GET /api/auth/callback
   * Callback del authorization-code flow de Microsoft. Ya NO se devuelve
   * ningún token propio de la app en la query string del redirect (antes
   * viajaban `token`/`refreshToken` en la URL, visibles en logs/historial/
   * Referer). El refresh token se setea como cookie httpOnly y el redirect
   * al frontend va limpio; la página de callback del frontend obtiene el
   * access token llamando a `POST /api/auth/refresh`, que ahora lee la
   * cookie recién seteada.
   */
  async office365Callback(req, res) {
    const redirectBase = process.env.FRONTEND_POST_LOGIN_REDIRECT_URL;
    const { code, state, error: azureError, error_description: azureErrorDescription } = req.query;

    if (azureError) {
      log.warn(`Azure AD devolvió error en /api/auth/callback: ${azureError} — ${azureErrorDescription}`);
      return res.redirect(
        302,
        `${redirectBase}?error=azure_error&error_description=${encodeURIComponent(azureErrorDescription || azureError)}`
      );
    }

    if (!code || !state) {
      return res.redirect(302, `${redirectBase}?error=invalid_request`);
    }

    const result = await authService.office365Callback(code, state, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });

    if (!result.ok) {
      return res.redirect(302, `${redirectBase}?error=${encodeURIComponent(result.reason)}`);
    }

    this._setRefreshCookie(res, result.refreshToken);
    return res.redirect(302, redirectBase);
  }
}

module.exports = new AuthController();
