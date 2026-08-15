import Swal from '@/shared/lib/swal';
import { comunidadApi } from '@/features/comunidad/comunidadApi';

const cachePersonasPorTipo = new Map();

function normalizarTexto(valor = '') {
  return String(valor)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

function escapeHtml(valor = '') {
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalizar(valor = '') {
  const txt = String(valor || '').trim().toLowerCase();
  if (!txt) return 'N/D';
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

async function obtenerPersonas() {
  const key = 'all';
  if (cachePersonasPorTipo.has(key)) {
    return cachePersonasPorTipo.get(key);
  }
  const res = await comunidadApi.listar();
  const personas = Array.isArray(res?.data?.data?.personas) ? res.data.data.personas : [];
  cachePersonasPorTipo.set(key, personas);
  return personas;
}


async function abrirFormularioRegistroRapido(nombreBuscado) {
  let facultades = [];
  try {
    const personas = await obtenerPersonas();
    facultades = [...new Set(personas.map((p) => p.facultad).filter(Boolean))].sort();
  } catch { /* sin cache, select vacío */ }

  const opcionesFacultad = ['', ...facultades]
    .map((f) => `<option value="${escapeHtml(f)}">${f ? escapeHtml(f) : 'Seleccione...'}</option>`)
    .join('');

  const formHtml = `
    <style>
      .reg-form { display: flex; flex-direction: column; gap: 12px; text-align: left; }
      .reg-field { display: flex; flex-direction: column; gap: 4px; }
      .reg-label { font-size: 13px; font-weight: 500; color: hsl(var(--foreground)); }
      .reg-label .req { color: hsl(var(--destructive)); margin-left: 2px; }
      .reg-input, .reg-select {
        width: 100%; padding: 8px 12px;
        border: 1px solid hsl(var(--border));
        border-radius: 8px; font-size: 14px; box-sizing: border-box;
        background: hsl(var(--background)); color: hsl(var(--foreground));
      }
      .reg-input:focus, .reg-select:focus {
        outline: none;
        border-color: hsl(var(--ring));
        box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
      }
      .reg-opcional { font-weight: normal; color: hsl(var(--muted-foreground)); font-size: 12px; }
      .reg-hint { font-size: 11px; color: hsl(var(--muted-foreground)); margin-top: 2px; }
    </style>
    <div class="reg-form">
      <div class="reg-field">
        <label class="reg-label">Número de documento<span class="req">*</span></label>
        <input id="reg-documento" class="reg-input" placeholder="Solo dígitos" autocomplete="off" inputmode="numeric" />
        <span class="reg-hint">Solo se permiten números</span>
      </div>
      <div class="reg-field">
        <label class="reg-label">Nombre completo<span class="req">*</span></label>
        <input id="reg-nombre" class="reg-input" placeholder="Nombre" value="${escapeHtml(nombreBuscado)}" autocomplete="off" />
      </div>
      <div class="reg-field">
        <label class="reg-label">Tipo<span class="req">*</span></label>
        <select id="reg-tipo" class="reg-select">
          <option value="">Seleccione...</option>
          <option value="docente">Docente</option>
          <option value="estudiante">Estudiante</option>
          <option value="empleado">Empleado</option>
        </select>
      </div>
      <div class="reg-field">
        <label class="reg-label">Correo <span class="reg-opcional">(opcional)</span></label>
        <input id="reg-correo" class="reg-input" type="email" placeholder="correo@ejemplo.com" autocomplete="off" />
      </div>
      <div class="reg-field">
        <label class="reg-label">Facultad <span class="reg-opcional">(opcional)</span></label>
        <select id="reg-facultad" class="reg-select">${opcionesFacultad}</select>
      </div>
      <div class="reg-field">
        <label class="reg-label">Número de contacto <span class="reg-opcional">(opcional)</span></label>
        <input id="reg-contacto" class="reg-input" placeholder="Solo dígitos" autocomplete="off" inputmode="numeric" />
        <span class="reg-hint">Solo se permiten números</span>
      </div>
    </div>
  `;

  const resultado = await Swal.fire({
    title: 'Registrar persona',
    html: formHtml,
    width: 480,
    customClass: { popup: 'aulosync-f1' },
    confirmButtonText: 'Registrar',
    cancelButtonText: 'Volver al buscador',
    showCancelButton: true,
    reverseButtons: true,
    didOpen: () => {
      const popup = Swal.getPopup();
      const docInput = popup?.querySelector('#reg-documento');
      const contactoInput = popup?.querySelector('#reg-contacto');
      if (docInput) {
        docInput.focus();
        docInput.addEventListener('input', () => {
          docInput.value = docInput.value.replace(/\D/g, '');
        });
      }
      if (contactoInput) {
        contactoInput.addEventListener('input', () => {
          contactoInput.value = contactoInput.value.replace(/\D/g, '');
        });
      }
    },
    preConfirm: async () => {
      const documento = document.getElementById('reg-documento')?.value?.trim();
      const nombre = document.getElementById('reg-nombre')?.value?.trim();
      const tipo = document.getElementById('reg-tipo')?.value;
      const correo = document.getElementById('reg-correo')?.value?.trim();
      const facultad = document.getElementById('reg-facultad')?.value?.trim();
      const numero_contacto = document.getElementById('reg-contacto')?.value?.trim();

      if (!documento) { Swal.showValidationMessage('El número de documento es requerido'); return false; }
      if (!/^\d+$/.test(documento)) { Swal.showValidationMessage('El número de documento solo debe contener dígitos'); return false; }
      if (!nombre) { Swal.showValidationMessage('El nombre es requerido'); return false; }
      if (!tipo) { Swal.showValidationMessage('Selecciona un tipo'); return false; }
      if (numero_contacto && !/^\d+$/.test(numero_contacto)) { Swal.showValidationMessage('El número de contacto solo debe contener dígitos'); return false; }
      if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) { Swal.showValidationMessage('Correo no válido (ej: usuario@dominio.com)'); return false; }

      try {
        const res = await comunidadApi.crear({ numero_documento: documento, nombre, tipo, correo, facultad, numero_contacto });
        cachePersonasPorTipo.clear();
        return res.data.data.persona;
      } catch (err) {
        Swal.showValidationMessage(err.response?.data?.message || 'Error al registrar la persona');
        return false;
      }
    },
  });

  if (!resultado.isConfirmed) return null;
  return resultado.value || null;
}

export async function abrirBuscadorPersonaPorNombre({
  titulo = 'Buscar persona por nombre',
  tipo,
  placeholder = 'Escribe nombre, apellido, documento, facultad o rol',
}) {
  let personas = [];
  try {
    personas = await obtenerPersonas();
  } catch {
    await Swal.fire({
      icon: 'error',
      title: 'No se pudo cargar la comunidad',
      text: 'Intenta nuevamente en unos segundos.',
      customClass: { popup: 'aulosync-f1' },
    });
    return null;
  }

  let selectedId = null;
  let resultadosFiltrados = [];
  let registroSolicitado = { activo: false, nombre: '' };

  const html = `
    <style>
      .persona-search-wrap { display: flex; flex-direction: column; gap: 10px; }
      .persona-search-input {
        width: 100%; padding: 10px 12px;
        border: 1px solid hsl(var(--border));
        border-radius: 8px; font-size: 14px;
        background: hsl(var(--background)); color: hsl(var(--foreground));
        transition: border-color 0.15s;
      }
      .persona-search-input:focus {
        outline: none;
        border-color: hsl(var(--ring));
        box-shadow: 0 0 0 2px hsl(var(--ring) / 0.2);
      }
      .persona-search-meta { font-size: 12px; color: hsl(var(--muted-foreground)); text-align: left; }
      .persona-search-table-wrap {
        max-height: 340px; overflow: auto;
        border: 1px solid hsl(var(--border));
        border-radius: 8px;
      }
      .persona-search-table { width: 100%; border-collapse: collapse; font-size: 13px; text-align: left; }
      .persona-search-table thead {
        position: sticky; top: 0;
        background: hsl(var(--muted)); z-index: 1;
      }
      .persona-search-table th {
        padding: 10px; border-bottom: 1px solid hsl(var(--border));
        color: hsl(var(--muted-foreground)); font-weight: 600;
      }
      .persona-search-table td {
        padding: 10px; border-bottom: 1px solid hsl(var(--border));
        color: hsl(var(--foreground));
      }
      .persona-row { cursor: pointer; }
      .persona-row:hover { background: hsl(var(--muted)); }
      .persona-row.is-selected {
        background: hsl(var(--primary) / 0.15);
        font-weight: 600;
      }
      .btn-registrar-persona {
        margin-top: 2px; padding: 7px 16px;
        border: 1px solid hsl(var(--primary));
        background: transparent; color: hsl(var(--primary));
        border-radius: 8px; font-size: 13px; cursor: pointer; font-weight: 500;
      }
      .btn-registrar-persona:hover { background: hsl(var(--primary) / 0.1); }
    </style>
    <div class="persona-search-wrap">
      <input id="persona-search-input" class="persona-search-input" placeholder="${escapeHtml(placeholder)}" />
      <div id="persona-search-meta" class="persona-search-meta">Escribe al menos 2 letras para ver sugerencias.</div>
      <div class="persona-search-table-wrap">
        <table class="persona-search-table">
          <thead>
            <tr>
              <th style="width: 36%;">Nombre completo</th>
              <th style="width: 28%;">Facultad</th>
              <th style="width: 16%;">Rol</th>
              <th style="width: 20%;">Documento</th>
            </tr>
          </thead>
          <tbody id="persona-search-body"></tbody>
        </table>
      </div>
      <div id="persona-registrar-wrap" style="display:none; text-align:left;">
        <button id="btn-registrar-persona" class="btn-registrar-persona">+ Registrar persona nueva</button>
      </div>
    </div>
  `;

  const seleccion = await Swal.fire({
    title: titulo,
    html,
    width: 920,
    customClass: { popup: 'aulosync-f1' },
    confirmButtonText: 'Usar persona',
    cancelButtonText: 'Cancelar',
    showCancelButton: true,
    reverseButtons: true,
    didOpen: () => {
      const popup = Swal.getPopup();
      if (!popup) return;

      const input = popup.querySelector('#persona-search-input');
      const body = popup.querySelector('#persona-search-body');
      const meta = popup.querySelector('#persona-search-meta');
      const registrarWrap = popup.querySelector('#persona-registrar-wrap');
      const btnRegistrar = popup.querySelector('#btn-registrar-persona');
      if (!input || !body || !meta) return;

      const renderRows = (term) => {
        const terminoNormalizado = normalizarTexto(term);
        if (terminoNormalizado.length < 2) {
          resultadosFiltrados = [];
          selectedId = null;
          body.innerHTML = '<tr><td colspan="4" style="padding: 12px; color: hsl(var(--muted-foreground)); text-align: center;">Escribe al menos 2 letras para buscar.</td></tr>';
          meta.textContent = 'Escribe al menos 2 letras para ver sugerencias.';
          if (registrarWrap) registrarWrap.style.display = 'none';
          return;
        }

        // Busca en nombre, documento, facultad y tipo (rol)
        resultadosFiltrados = personas
          .filter((p) =>
            normalizarTexto(p?.nombre).includes(terminoNormalizado) ||
            normalizarTexto(p?.numero_documento).includes(terminoNormalizado) ||
            normalizarTexto(p?.facultad).includes(terminoNormalizado) ||
            normalizarTexto(p?.tipo).includes(terminoNormalizado)
          )
          .slice(0, 25);

        if (tipo) {
          const tipoPreferido = normalizarTexto(tipo);
          resultadosFiltrados.sort((a, b) => {
            const aPref = normalizarTexto(a?.tipo) === tipoPreferido ? 0 : 1;
            const bPref = normalizarTexto(b?.tipo) === tipoPreferido ? 0 : 1;
            return aPref - bPref;
          });
        }

        if (!resultadosFiltrados.some((p) => String(p._id || p.numero_documento || p.id_carnet || p.nombre) === selectedId)) {
          selectedId = null;
        }

        if (resultadosFiltrados.length === 0) {
          body.innerHTML = '<tr><td colspan="4" style="padding: 12px; color: hsl(var(--muted-foreground)); text-align: center;">Sin resultados para esa búsqueda.</td></tr>';
          meta.textContent = 'No hay coincidencias. Intenta con nombre, documento, facultad o rol.';
          if (registrarWrap) registrarWrap.style.display = 'block';
          return;
        }

        if (registrarWrap) registrarWrap.style.display = 'none';

        body.innerHTML = resultadosFiltrados
          .map((persona) => {
            const rowId = String(persona._id || persona.numero_documento || persona.id_carnet || `${persona.nombre}-${persona.tipo || ''}`);
            const selectedClass = rowId === selectedId ? 'is-selected' : '';
            return `
              <tr class="persona-row ${selectedClass}" data-row-id="${escapeHtml(rowId)}">
                <td>${escapeHtml(persona.nombre || 'Sin nombre')}</td>
                <td>${escapeHtml(persona.facultad || 'N/D')}</td>
                <td>${escapeHtml(capitalizar(persona.tipo))}</td>
                <td>${escapeHtml(persona.numero_documento || 'N/D')}</td>
              </tr>
            `;
          })
          .join('');

        meta.textContent = `${resultadosFiltrados.length} resultado(s). Selecciona una fila.`;
      };

      input.addEventListener('input', (e) => {
        renderRows(e.target.value || '');
      });

      body.addEventListener('click', (e) => {
        const fila = e.target.closest('.persona-row');
        if (!fila) return;
        selectedId = fila.getAttribute('data-row-id');
        const filas = body.querySelectorAll('.persona-row');
        filas.forEach((f) => f.classList.remove('is-selected'));
        fila.classList.add('is-selected');
      });

      if (btnRegistrar) {
        btnRegistrar.addEventListener('click', () => {
          registroSolicitado = { activo: true, nombre: input.value.trim() };
          Swal.close();
        });
      }

      renderRows('');
      input.focus();
    },
    preConfirm: () => {
      if (!selectedId) {
        Swal.showValidationMessage('Selecciona una persona de la tabla.');
        return null;
      }
      const personaSeleccionada = resultadosFiltrados.find(
        (p) => String(p._id || p.numero_documento || p.id_carnet || p.nombre) === selectedId
      );
      if (!personaSeleccionada) {
        Swal.showValidationMessage('La selección ya no es válida. Vuelve a elegir una fila.');
        return null;
      }
      return personaSeleccionada;
    },
  });

  if (registroSolicitado.activo) {
    const nuevaPersona = await abrirFormularioRegistroRapido(registroSolicitado.nombre);
    return nuevaPersona;
  }

  if (!seleccion.isConfirmed) return null;
  return seleccion.value || null;
}
