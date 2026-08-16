'use strict';
const { Router } = require('express');
const comunidadController = require('./comunidad.controller');
const { requireAuth, requireAdmin } = require('../auth/auth.middleware');
const { requireApiKey } = require('../../shared/middlewares/apiKey.middleware');
const { syncLimiter } = require('../../shared/middlewares/rate.limiter');

const router = Router();
const requireSyncApiKey = requireApiKey('COMUNIDAD_SYNC_API_KEY');

/**
 * @openapi
 * /comunidad:
 *   get:
 *     tags: [Comunidad]
 *     summary: Listar miembros de la comunidad
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: tipo
 *         schema:
 *           type: string
 *           enum: [docente, estudiante, empleado]
 *         description: Filtrar por tipo
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Búsqueda por nombre o documento
 *     responses:
 *       200:
 *         description: Lista de personas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     personas:
 *                       type: array
 *                       items:
 *                         $ref: '#/components/schemas/Comunidad'
 */
router.get('/', ...requireAuth, (req, res) => comunidadController.listar(req, res));

/**
 * @openapi
 * /comunidad/carnet/{idCarnet}:
 *   get:
 *     tags: [Comunidad]
 *     summary: Buscar por carnet NFC
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: idCarnet
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Persona encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     persona:
 *                       $ref: '#/components/schemas/Comunidad'
 *       404:
 *         $ref: '#/components/schemas/ErrorNoEncontrado'
 */
router.get('/carnet/:idCarnet', ...requireAuth, (req, res) => comunidadController.obtenerPorCarnet(req, res));

/**
 * @openapi
 * /comunidad/{documento}:
 *   get:
 *     tags: [Comunidad]
 *     summary: Buscar por número de documento
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: documento
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Persona encontrada
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     persona:
 *                       $ref: '#/components/schemas/Comunidad'
 *       404:
 *         $ref: '#/components/schemas/ErrorNoEncontrado'
 */
router.get('/:documento', ...requireAuth, (req, res) => comunidadController.obtener(req, res));

/**
 * @openapi
 * /comunidad:
 *   post:
 *     tags: [Comunidad]
 *     summary: Crear una persona manualmente
 *     security:
 *       - BearerAuth: []
 */
router.post('/', ...requireAdmin, (req, res) => comunidadController.crear(req, res));

/**
 * @openapi
 * /comunidad/sync/estudiantes:
 *   post:
 *     tags: [Comunidad]
 *     summary: Sincronizar registros desde el sistema fuente de estudiantes (ETL institucional)
 *     description: >
 *       Acepta un registro individual o un arreglo de registros, sin campo
 *       `tipo`. Sin sesión de usuario (integración servidor-a-servidor):
 *       requiere el header `X-Api-Key` con el valor de `COMUNIDAD_SYNC_API_KEY`.
 *     parameters:
 *       - in: header
 *         name: X-Api-Key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Registros sincronizados
 *       401:
 *         description: API key inválida o no proporcionada
 */
router.post('/sync/estudiantes', syncLimiter, requireSyncApiKey, (req, res) => comunidadController.syncEstudiantes(req, res));

/**
 * @openapi
 * /comunidad/sync/empleados:
 *   post:
 *     tags: [Comunidad]
 *     summary: Sincronizar registros desde el sistema fuente de empleados/RRHH (ETL institucional)
 *     description: >
 *       Acepta un registro individual o un arreglo de registros, sin campo
 *       `tipo`. Sin sesión de usuario (integración servidor-a-servidor):
 *       requiere el header `X-Api-Key` con el valor de `COMUNIDAD_SYNC_API_KEY`.
 *     parameters:
 *       - in: header
 *         name: X-Api-Key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Registros sincronizados
 *       401:
 *         description: API key inválida o no proporcionada
 */
router.post('/sync/empleados', syncLimiter, requireSyncApiKey, (req, res) => comunidadController.syncEmpleados(req, res));

router.patch('/:id', ...requireAdmin, (req, res) => comunidadController.actualizar(req, res));
router.delete('/:id', ...requireAdmin, (req, res) => comunidadController.eliminar(req, res));

module.exports = router;
