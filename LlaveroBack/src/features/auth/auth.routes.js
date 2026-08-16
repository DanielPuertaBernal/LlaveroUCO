'use strict';
const { Router } = require('express');
const { z } = require('zod');
const authController = require('./auth.controller');
const { verifyToken } = require('./auth.middleware');
const { validate } = require('../../shared/middlewares/validate.middleware');
const { authLimiter, refreshLimiter } = require('../../shared/middlewares/rate.limiter');

const router = Router();

// El refresh token ahora viaja principalmente como cookie httpOnly
// (`req.cookies.refreshToken`, ver `auth.controller.js`); se deja opcional
// en el body como transición para clientes que aún no migraron a cookies.
const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken requerido').optional(),
});

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     tags: [Auth]
 *     summary: Cerrar sesión
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Sesión cerrada
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorNoAutenticado'
 */
router.post('/logout', verifyToken, (req, res) => authController.logout(req, res));

/**
 * @openapi
 * /auth/me:
 *   get:
 *     tags: [Auth]
 *     summary: Obtener usuario autenticado
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Datos del usuario
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     usuario:
 *                       $ref: '#/components/schemas/Usuario'
 *       401:
 *         description: No autenticado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ErrorNoAutenticado'
 */
router.get('/me', verifyToken, (req, res) => authController.me(req, res));

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     tags: [Auth]
 *     summary: Refrescar token de acceso
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/RefreshRequest'
 *     responses:
 *       200:
 *         description: Token refrescado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *       401:
 *         description: Refresh token inválido
 */
router.post('/refresh', refreshLimiter, validate(refreshSchema), (req, res) => authController.refresh(req, res));

/**
 * @openapi
 * /auth/office365/login:
 *   get:
 *     tags: [Auth]
 *     summary: Iniciar login Office365 (Azure AD, authorization-code flow)
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirige al portal de autenticación de Microsoft
 *       400:
 *         description: Email faltante o dominio no autorizado
 */
router.get('/office365/login', authLimiter, (req, res) => authController.office365Login(req, res));

/**
 * @openapi
 * /auth/callback:
 *   get:
 *     tags: [Auth]
 *     summary: Callback del authorization-code flow de Microsoft
 *     parameters:
 *       - in: query
 *         name: code
 *         schema:
 *           type: string
 *       - in: query
 *         name: state
 *         schema:
 *           type: string
 *     responses:
 *       302:
 *         description: Redirige al frontend con token/refreshToken o un error
 */
router.get('/callback', (req, res) => authController.office365Callback(req, res));

module.exports = router;
