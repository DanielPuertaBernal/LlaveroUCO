'use strict';
const equipoService = require('./equipo.service');

class EquipoController {
  /** GET /api/inventario */
  async listar(req, res) {
    const equipos = await equipoService.listar();
    return res.json({ ok: true, data: { equipos } });
  }
  /** GET /api/inventario/disponibles */
  async disponibles(req, res) {
    const equipos = await equipoService.disponibles();
    return res.json({ ok: true, data: { equipos } });
  }
  /** POST /api/inventario */
  async crear(req, res) {
    const equipo = await equipoService.registrar(req.body);
    return res.status(201).json({ ok: true, message: 'Equipo registrado', data: { equipo } });
  }
  /** PUT /api/inventario/:id */
  async actualizar(req, res) {
    const equipo = await equipoService.actualizar(req.params.id, req.body);
    return res.json({ ok: true, message: 'Equipo actualizado', data: { equipo } });
  }
  /** GET /api/inventario/barcode/:codigo */
  async buscarPorBarcode(req, res) {
    const equipo = await equipoService.buscarPorCodigoBarras(req.params.codigo);
    return res.json({ ok: true, data: { equipo } });
  }

  /** GET /api/inventario/buscar?q=texto */
  async buscarPorTexto(req, res) {
    const equipos = await equipoService.buscarPorTexto(req.query.q);
    return res.json({ ok: true, data: { equipos } });
  }

  /** DELETE /api/inventario/:id */
  async eliminar(req, res) {
    await equipoService.eliminar(req.params.id);
    return res.json({ ok: true, message: 'Equipo eliminado' });
  }
}

module.exports = new EquipoController();
