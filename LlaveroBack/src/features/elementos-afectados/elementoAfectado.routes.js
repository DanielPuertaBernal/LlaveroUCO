'use strict';
const { Router } = require('express');
const { z } = require('zod');
const elementoAfectadoController = require('./elementoAfectado.controller');
const { requireAdmin, requireAuth } = require('../auth/auth.middleware');
const { validate } = require('../../shared/middlewares/validate.middleware');

const router = Router();

const crearSchema = z.object({
  clave: z.string().min(2, 'La clave es requerida'),
  nombre: z.string().min(2, 'El nombre es requerido'),
  descripcion: z.string().optional().default(''),
  activo: z.boolean().optional().default(true),
  orden: z.number().int().optional().default(0),
});

const actualizarSchema = crearSchema.partial().refine((obj) => Object.keys(obj).length > 0, {
  message: 'Debe enviar al menos un campo para actualizar',
});

/**
 * @openapi
 * /elementos-afectados:
 *   get:
 *     tags: [Elementos afectados]
 *     summary: Catálogo de elementos que puede afectar una novedad
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: incluir_inactivos
 *         description: Solo admin; incluye los elementos desactivados
 *         schema:
 *           type: boolean
 *     responses:
 *       200:
 *         description: Lista de elementos
 *       401:
 *         $ref: '#/components/responses/NoAutenticado'
 */
router.get(
  '/',
  ...requireAuth,
  (req, res) => elementoAfectadoController.listar(req, res)
);

/**
 * @openapi
 * /elementos-afectados:
 *   post:
 *     tags: [Elementos afectados]
 *     summary: Crear un elemento del catálogo (solo admin)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clave, nombre]
 *             properties:
 *               clave:
 *                 type: string
 *               nombre:
 *                 type: string
 *               descripcion:
 *                 type: string
 *               activo:
 *                 type: boolean
 *               orden:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Elemento creado
 *       400:
 *         $ref: '#/components/responses/ErrorValidacion'
 *       403:
 *         $ref: '#/components/responses/NoAutorizado'
 */
router.post(
  '/',
  ...requireAdmin,
  validate(crearSchema),
  (req, res) => elementoAfectadoController.crear(req, res)
);

/**
 * @openapi
 * /elementos-afectados/{id}:
 *   patch:
 *     tags: [Elementos afectados]
 *     summary: Actualizar un elemento del catálogo (solo admin)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Elemento actualizado
 *       404:
 *         $ref: '#/components/responses/NoEncontrado'
 */
router.patch(
  '/:id',
  ...requireAdmin,
  validate(actualizarSchema),
  (req, res) => elementoAfectadoController.actualizar(req, res)
);

/**
 * @openapi
 * /elementos-afectados/{id}:
 *   delete:
 *     tags: [Elementos afectados]
 *     summary: Eliminar un elemento del catálogo (solo admin)
 *     description: >
 *       Falla si alguna novedad todavía lo referencia (guarda de soft-delete
 *       en base). En ese caso hay que desactivarlo, no borrarlo, para no
 *       romper el histórico.
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Elemento eliminado
 *       404:
 *         $ref: '#/components/responses/NoEncontrado'
 */
router.delete(
  '/:id',
  ...requireAdmin,
  (req, res) => elementoAfectadoController.eliminar(req, res)
);

module.exports = router;
