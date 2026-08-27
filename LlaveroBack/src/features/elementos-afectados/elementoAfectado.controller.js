'use strict';
const elementoAfectadoService = require('./elementoAfectado.service');
const { ROLES } = require('../auth/auth.middleware');

class ElementoAfectadoController {
  /** GET /api/elementos-afectados?incluir_inactivos */
  async listar(req, res) {
    const incluirInactivos = req.user?.rol === ROLES.ADMIN
      && String(req.query?.incluir_inactivos || '').toLowerCase() === 'true';
    const elementos = await elementoAfectadoService.listar({ incluirInactivos });
    return res.json({ ok: true, data: { elementos } });
  }

  /** POST /api/elementos-afectados */
  async crear(req, res) {
    const elemento = await elementoAfectadoService.registrar(req.body);
    return res.status(201).json({ ok: true, message: 'Elemento creado correctamente', data: { elemento } });
  }

  /** PATCH /api/elementos-afectados/:id */
  async actualizar(req, res) {
    const elemento = await elementoAfectadoService.actualizar(req.params.id, req.body);
    return res.json({ ok: true, message: 'Elemento actualizado correctamente', data: { elemento } });
  }

  /** DELETE /api/elementos-afectados/:id */
  async eliminar(req, res) {
    await elementoAfectadoService.eliminar(req.params.id);
    return res.json({ ok: true, message: 'Elemento eliminado correctamente' });
  }
}

module.exports = new ElementoAfectadoController();
