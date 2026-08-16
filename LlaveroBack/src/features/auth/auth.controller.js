'use strict';
/**
 * Auth Controller - Orquesta login/logout/me
 */
const authService = require('./auth.service');
const ApiError = require('../../shared/errors/api.error');
const { isDominioAutorizado } = require('./auth.constants');
const { createLogger } = require('../../shared/utils/logger');

const log = createLogger('Auth');

class AuthController {
  /**
   * POST /api/auth/logout
   * JWT es stateless; el cliente debe eliminar el token.
   * En una implementación con blacklist se agregaría aquí.
   */
  async logout(req, res) {
    await authService.logout(req.user?.sub, req.body?.refreshToken || '');
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
   */
  async refresh(req, res) {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ ok: false, message: 'refreshToken requerido' });
    }
    const result = await authService.refresh(refreshToken, {
      userAgent: req.headers['user-agent'],
      ip: req.ip,
    });
    return res.status(200).json({ ok: true, data: { token: result.token, refreshToken: result.refreshToken } });
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
   * Callback del authorization-code flow de Microsoft. Los tokens propios
   * de la app (no los de Microsoft) se devuelven en query params porque es
   * un redirect de navegador, no un fetch — el frontend debe leerlos y
   * limpiarlos de la URL inmediatamente.
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

    const params = new URLSearchParams({ token: result.token, refreshToken: result.refreshToken });
    return res.redirect(302, `${redirectBase}?${params.toString()}`);
  }
}

module.exports = new AuthController();
