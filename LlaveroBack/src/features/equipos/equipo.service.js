'use strict';
/**
 * Equipo Service
 * Equivale a application/services/equipo_service.py
 * Código de barras: INV-{codigo}-{consecutivo:03d}
 */
const equipoRepository = require('./equipo.repository');
const ApiError = require('../../shared/errors/api.error');
const { normalizeString } = require('../../shared/utils/normalize.helper');
const { createLogger } = require('../../shared/utils/logger');

const logger = createLogger('Equipos');

// Sin 0/O, 1/I/L — se prestan a confusión al leerlos o transcribirlos a mano.
const ALFABETO_ALEATORIO = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function codigoAleatorio(longitud = 6) {
  let out = '';
  for (let i = 0; i < longitud; i++) {
    out += ALFABETO_ALEATORIO[Math.floor(Math.random() * ALFABETO_ALEATORIO.length)];
  }
  return out;
}

/**
 * Genera el código de barras de un equipo. Si tiene `codigo_inventario`
 * físico, usa ese como base (`INV-{codigo}-{consecutivo}`, comportamiento
 * original, determinístico). Si no lo tiene (ej. equipos genéricos como
 * "Extensión" o "Bafle" que nunca tuvieron placa de inventario), genera un
 * código corto y aleatorio (`EQ-XXXXXX`) — no depende del largo del nombre
 * (evita colisiones por truncado entre nombres parecidos) y, al ser
 * independiente del nombre, no hay que regenerarlo si el equipo se renombra.
 * Reintenta si por azar choca con uno ya existente.
 */
async function generarCodigoBarras({ codigo_inventario, consecutivo }) {
  if (codigo_inventario) {
    const codigoBase = String(codigo_inventario).split('-')[0];
    const cons = String(parseInt(consecutivo, 10) || 0).padStart(3, '0');
    return `INV-${codigoBase}-${cons}`;
  }
  for (let intento = 0; intento < 8; intento++) {
    const candidato = `EQ-${codigoAleatorio()}`;
    const existe = await equipoRepository.findByCodigoBarras(candidato);
    if (!existe) return candidato;
  }
  throw ApiError.badRequest('No se pudo generar un código de barras único, intente de nuevo');
}

class EquipoService {
  async listar() { return equipoRepository.findAll(); }
  async disponibles() { return equipoRepository.findDisponibles(); }
  async obtener(id) {
    const e = await equipoRepository.findById(id);
    if (!e) throw ApiError.notFound('Equipo no encontrado');
    return e;
  }
  async buscarPorCodigoBarras(cb) {
    const e = await equipoRepository.findByCodigoBarras(cb);
    if (!e) throw ApiError.notFound('Equipo no encontrado');
    return e;
  }

  async buscarPorTexto(q) {
    if (!q || String(q).trim().length < 2) throw ApiError.badRequest('El parámetro q debe tener al menos 2 caracteres');
    return equipoRepository.searchByText(String(q).trim());
  }

  /**
   * Registra un nuevo equipo
   * Genera código de barras automático: INV-{codigo}-{consecutivo:03d}
   */
  async registrar({ nombre, marca, consecutivo, codigo_inventario, descripcion }) {
    if (codigo_inventario) {
      const existing = await equipoRepository.findByCodigo(codigo_inventario);
      if (existing) {
        throw ApiError.conflict(`Ya existe un equipo con código '${codigo_inventario}'`);
      }
    }
    const cons = parseInt(consecutivo, 10);
    const codigo_barras = await generarCodigoBarras({ codigo_inventario, consecutivo: cons });

    try {
      return await equipoRepository.create({
        nombre: normalizeString(nombre),
        marca: normalizeString(marca),
        consecutivo: cons,
        codigo_inventario: codigo_inventario ? normalizeString(codigo_inventario) : null,
        codigo_barras,
        descripcion: normalizeString(descripcion),
      });
    } catch (err) {
      // Respaldo ante la carrera del check-then-insert de arriba: dos altas
      // concurrentes con el mismo código pasan ambas la validación previa,
      // pero solo una gana el índice único `ux_equipos_codigo_inventario`.
      if (err.code === '23505') {
        throw ApiError.conflict(`Ya existe un equipo con código '${codigo_inventario}'`);
      }
      throw err;
    }
  }

  async actualizar(id, datos) {
    logger.debug('Actualizando equipo', { id });
    const actual = await equipoRepository.findById(id);
    if (!actual) throw ApiError.notFound('Equipo no encontrado');

    const updates = { ...datos };

    if (updates.codigo_inventario) {
      updates.codigo_inventario = String(updates.codigo_inventario).trim();
      if (updates.codigo_inventario !== actual.codigo_inventario) {
        const existing = await equipoRepository.findByCodigo(updates.codigo_inventario);
        if (existing && String(existing.id) !== String(id)) {
          throw ApiError.conflict(`Ya existe un equipo con código '${updates.codigo_inventario}'`);
        }
      }
    }

    if (updates.consecutivo !== undefined) {
      updates.consecutivo = parseInt(updates.consecutivo, 10);
      if (Number.isNaN(updates.consecutivo)) {
        throw ApiError.badRequest('Consecutivo inválido');
      }
    }

    const codigoInventarioFinal = updates.codigo_inventario || actual.codigo_inventario;
    const consecutivoFinal = updates.consecutivo !== undefined ? updates.consecutivo : actual.consecutivo;
    // El código aleatorio (equipo sin codigo_inventario) es independiente
    // del nombre/consecutivo — no se regenera solo porque el equipo se
    // renombra (eso invalidaría una etiqueta física ya impresa). Solo se
    // recalcula cuando hay codigo_inventario de por medio (código
    // determinístico INV-...) y cambió el código o el consecutivo, o si el
    // equipo no tenía código de barras todavía.
    if (codigoInventarioFinal && (updates.codigo_inventario !== undefined || updates.consecutivo !== undefined)) {
      updates.codigo_barras = await generarCodigoBarras({
        codigo_inventario: codigoInventarioFinal,
        consecutivo: consecutivoFinal,
      });
    } else if (!actual.codigo_barras) {
      updates.codigo_barras = await generarCodigoBarras({
        codigo_inventario: codigoInventarioFinal,
        consecutivo: consecutivoFinal,
      });
    }

    try {
      const updated = await equipoRepository.update(id, updates);
      if (!updated) throw ApiError.notFound('Equipo no encontrado');
      return updated;
    } catch (err) {
      if (err.code === '23505') {
        throw ApiError.conflict(`Ya existe un equipo con código '${updates.codigo_inventario}'`);
      }
      throw err;
    }
  }

  async eliminar(id) {
    const deleted = await equipoRepository.deleteById(id);
    if (!deleted) throw ApiError.notFound('Equipo no encontrado');
    return { ok: true };
  }
}

module.exports = new EquipoService();
