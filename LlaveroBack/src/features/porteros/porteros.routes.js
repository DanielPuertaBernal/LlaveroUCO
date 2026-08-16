'use strict';
const { Router } = require('express');
const { z } = require('zod');
const porterosController = require('./porteros.controller');
const { requireAdmin, requireAuth } = require('../auth/auth.middleware');
const { validate } = require('../../shared/middlewares/validate.middleware');

const router = Router();

const crearSchema = z.object({
  email: z.string().trim().email('Email inválido'),
  nombre: z.string().trim().min(1, 'Nombre requerido'),
  contacto: z.string().trim().optional().default(''),
});

const bloqueAsignacionSchema = z.object({
  bloque_id: z.string().min(1, 'bloque_id requerido'),
  permite_identificacion: z.boolean().optional().default(false),
  permite_prestamo_llaves: z.boolean().optional().default(false),
  permite_devolucion_llaves: z.boolean().optional().default(false),
  permite_recepcion_equipos: z.boolean().optional().default(false),
});

const asignarBloquesSchema = z.object({
  bloques: z.array(bloqueAsignacionSchema).default([]),
});

/**
 * @openapi
 * /porteros:
 *   get:
 *     tags: [Porteros]
 *     summary: Listar usuarios porteros con sus bloques asignados
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de porteros
 */
router.get('/', ...requireAdmin, (req, res) => porterosController.listar(req, res));

/**
 * @openapi
 * /porteros:
 *   post:
 *     tags: [Porteros]
 *     summary: Crear un usuario portero (login exclusivo vía Office365)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       201:
 *         description: Portero creado
 *       400:
 *         description: Datos inválidos
 *       409:
 *         description: El email ya existe
 */
router.post('/', ...requireAdmin, validate(crearSchema), (req, res) => porterosController.crear(req, res));

/**
 * @openapi
 * /porteros/mis-bloques:
 *   get:
 *     tags: [Porteros]
 *     summary: Bloques asignados al usuario autenticado (solo si es portería; vacío en caso contrario)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Bloques del usuario autenticado
 */
router.get('/mis-bloques', ...requireAuth, (req, res) => porterosController.misBloques(req, res));

/**
 * @openapi
 * /porteros/{usuarioId}/bloques:
 *   put:
 *     tags: [Porteros]
 *     summary: Reemplaza los bloques y permisos asignados a un portero
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Bloques actualizados
 *       404:
 *         description: Portero no encontrado
 */
router.put('/:usuarioId/bloques', ...requireAdmin, validate(asignarBloquesSchema), (req, res) => porterosController.asignarBloques(req, res));

/**
 * @openapi
 * /porteros/{usuarioId}:
 *   delete:
 *     tags: [Porteros]
 *     summary: Elimina (soft-delete) un usuario portero
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Portero eliminado
 *       404:
 *         description: Portero no encontrado
 */
router.delete('/:usuarioId', ...requireAdmin, (req, res) => porterosController.eliminar(req, res));

module.exports = router;
