'use strict';
const porterosService = require('./porteros.service');

class PorterosController {
  /** GET /api/porteros */
  async listar(req, res) {
    const porteros = await porterosService.listar();
    return res.json({ ok: true, data: { porteros } });
  }

  /** GET /api/porteros/mis-bloques */
  async misBloques(req, res) {
    const bloques = await porterosService.misBloques(req.user.sub, req.user.rol);
    return res.json({ ok: true, data: { bloques } });
  }

  /** POST /api/porteros */
  async crear(req, res) {
    const { email, nombre, contacto } = req.body;
    const portero = await porterosService.crear(email, nombre, contacto);
    return res.status(201).json({ ok: true, message: 'Portero creado correctamente', data: { portero } });
  }

  /** PUT /api/porteros/:usuarioId/bloques */
  async asignarBloques(req, res) {
    const { usuarioId } = req.params;
    const { bloques } = req.body;
    const portero = await porterosService.asignarBloques(usuarioId, bloques);
    return res.json({ ok: true, message: 'Bloques de portero actualizados', data: { portero } });
  }

  /** DELETE /api/porteros/:usuarioId */
  async eliminar(req, res) {
    await porterosService.eliminar(req.params.usuarioId);
    return res.json({ ok: true, message: 'Portero eliminado correctamente' });
  }
}

module.exports = new PorterosController();
