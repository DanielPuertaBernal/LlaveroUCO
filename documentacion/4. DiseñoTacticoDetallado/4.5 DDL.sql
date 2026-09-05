-- =============================================================================
-- Llavero (AulaSync) — DDL del esquema de datos
-- =============================================================================
--
-- Esquema completo de la base de datos PostgreSQL del sistema Llavero.
--
-- ORIGEN: este archivo NO se escribe a mano. Es el volcado del esquema real
-- generado con `pg_dump --schema-only` sobre una base con las 21 migraciones
-- de `LlaveroBack/migrations/` aplicadas. La fuente de verdad siguen siendo
-- las migraciones Knex; este archivo es su resultado consolidado, útil para
-- revisar el esquema completo de un vistazo sin reconstruirlo mentalmente
-- migración por migración.
--
-- REGENERAR:
--   docker exec llavero-postgres sh -c \
--     'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --schema-only \
--      --no-owner --no-privileges \
--      --exclude-table=knex_migrations --exclude-table=knex_migrations_lock'
--
-- NO EJECUTAR ESTE ARCHIVO PARA CREAR LA BASE. Use `knex migrate:latest`:
-- aplicar este DDL directamente dejaría la tabla `knex_migrations` vacía y
-- las migraciones futuras intentarían recrear objetos ya existentes.
--
-- CONTENIDO
--   - 3 extensiones: unaccent, pg_trgm, btree_gist
--   - 2 funciones: set_updated_at(), block_soft_delete_with_active_children(),
--     immutable_unaccent()
--   - 25 tablas
--   - 1 vista: v_programaciones
--
-- CONVENCIONES TRANSVERSALES DEL ESQUEMA
--   - Columnas universales en toda tabla de negocio:
--       id uuid PRIMARY KEY            -- UUID v7 generado por la aplicación
--       created_at / updated_at        -- timestamptz NOT NULL DEFAULT now()
--       deleted_at timestamptz NULL    -- soft delete: NULL = fila viva
--   - Toda FK es ON DELETE RESTRICT. No hay borrado en cascada en el esquema.
--   - Todo índice único es PARCIAL (`WHERE deleted_at IS NULL`): una fila
--     soft-eliminada libera el slot único sin desaparecer del historial.
--   - Trigger `trg_set_updated_at` en toda tabla: mantiene `updated_at`.
--   - Trigger `trg_block_soft_delete` en las tablas padre: impide soft-eliminar
--     una fila que aún tenga hijos vivos.
--
-- =============================================================================

--
-- PostgreSQL database dump
--


-- Dumped from database version 18.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: btree_gist; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA public;


--
-- Name: EXTENSION btree_gist; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION btree_gist IS 'support for indexing common datatypes in GiST';


--
-- Name: pg_trgm; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;


--
-- Name: EXTENSION pg_trgm; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pg_trgm IS 'text similarity measurement and index searching based on trigrams';


--
-- Name: unaccent; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;


--
-- Name: EXTENSION unaccent; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION unaccent IS 'text search dictionary that removes accents';


--
-- Name: block_soft_delete_with_active_children(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_soft_delete_with_active_children() RETURNS trigger
    LANGUAGE plpgsql
    AS $_$
    DECLARE
      i int;
      child_table text;
      child_col text;
      n bigint;
    BEGIN
      FOR i IN 0..(TG_NARGS - 1) BY 2 LOOP
        child_table := TG_ARGV[i];
        child_col := TG_ARGV[i + 1];
        EXECUTE format(
          'SELECT count(*) FROM %I WHERE %I = $1 AND deleted_at IS NULL',
          child_table, child_col
        ) INTO n USING OLD.id;
        IF n > 0 THEN
          RAISE EXCEPTION 'No se puede eliminar: % registro(s) activo(s) en %', n, child_table
            USING ERRCODE = 'restrict_violation';
        END IF;
      END LOOP;
      RETURN NEW;
    END;
    $_$;


--
-- Name: immutable_unaccent(text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.immutable_unaccent(text) RETURNS text
    LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
    AS $_$
      SELECT public.unaccent('public.unaccent'::regdictionary, $1)
    $_$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      NEW.updated_at := now();
      RETURN NEW;
    END;
    $$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: bloques; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bloques (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    nombre_bloque text NOT NULL
);


--
-- Name: comunidad; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.comunidad (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    numero_documento text NOT NULL,
    nombre text NOT NULL,
    tipo text NOT NULL,
    facultad text,
    correo text,
    id_carnet text,
    numero_contacto text,
    es_estudiante boolean DEFAULT false NOT NULL,
    es_empleado boolean DEFAULT false NOT NULL,
    CONSTRAINT comunidad_tipo_check CHECK ((tipo = ANY (ARRAY['docente'::text, 'estudiante'::text, 'empleado'::text])))
);


--
-- Name: configuracion_bloques; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.configuracion_bloques (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    bloque_id uuid,
    tiempo_maximo_prestamo_minutos integer DEFAULT 120 NOT NULL,
    intervalo_recordatorio_minutos integer DEFAULT 30 NOT NULL,
    max_recordatorios integer DEFAULT 5 NOT NULL,
    notificaciones_activas boolean DEFAULT true NOT NULL
);


--
-- Name: devolucion_equipos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devolucion_equipos (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    devolucion_id uuid NOT NULL,
    equipo_id uuid NOT NULL,
    nombre text DEFAULT ''::text,
    cantidad integer DEFAULT 1 NOT NULL,
    estado text DEFAULT 'bueno'::text
);


--
-- Name: devoluciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.devoluciones (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    prestamo_id uuid NOT NULL,
    docente_comunidad_id uuid,
    docente_codigo_nfc text DEFAULT ''::text,
    docente_nombre text DEFAULT ''::text,
    ubicacion_devolucion_id uuid,
    auxiliar_que_recibio text DEFAULT 'Auxiliar'::text,
    es_devolucion_completa boolean DEFAULT false NOT NULL,
    gestionado_por_usuario_id uuid
);


--
-- Name: equipos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.equipos (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    nombre text NOT NULL,
    marca text,
    consecutivo text,
    codigo_inventario text,
    codigo_barras text,
    descripcion text,
    estado text DEFAULT 'activo'::text NOT NULL,
    CONSTRAINT equipos_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'inactivo'::text, 'mantenimiento'::text])))
);


--
-- Name: knex_migrations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knex_migrations_lock_index_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knex_migrations_lock_index_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: monitores; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.monitores (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    docente_comunidad_id uuid NOT NULL,
    monitor_comunidad_id uuid NOT NULL,
    monitor_nombre text DEFAULT ''::text,
    monitor_id_carnet text DEFAULT ''::text,
    monitor_facultad text DEFAULT ''::text,
    monitor_correo text DEFAULT ''::text,
    programacion_id uuid,
    activo boolean DEFAULT true NOT NULL
);


--
-- Name: nfc_eventos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.nfc_eventos (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    evento_id text NOT NULL,
    id_carnet text DEFAULT ''::text NOT NULL,
    ubicacion_id uuid,
    ok boolean DEFAULT false NOT NULL,
    tipo_resultado text DEFAULT ''::text,
    mensaje_resultado text DEFAULT ''::text,
    payload_resultado jsonb,
    procesado_en timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notificaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notificaciones (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    destinatario_nombre text NOT NULL,
    destinatario_documento text NOT NULL,
    destinatario_correo text NOT NULL,
    tipo_mensaje text DEFAULT 'predeterminado'::text NOT NULL,
    asunto text NOT NULL,
    mensaje text DEFAULT ''::text,
    llave_id uuid,
    reserva_id uuid,
    salon_id uuid,
    salon text DEFAULT ''::text,
    tipo_notificacion text DEFAULT 'manual'::text NOT NULL,
    es_delegado boolean DEFAULT false NOT NULL,
    nombre_docente_representado text DEFAULT ''::text,
    numero_recordatorio integer DEFAULT 0 NOT NULL,
    numero_contacto_destinatario text DEFAULT ''::text,
    estado_envio text DEFAULT 'pendiente'::text NOT NULL,
    intentos_envio integer DEFAULT 0 NOT NULL,
    proximo_reintento timestamp with time zone,
    error_envio text DEFAULT ''::text,
    enviado_por text DEFAULT ''::text,
    fecha_envio timestamp with time zone DEFAULT now() NOT NULL,
    fecha_hora_prestamo timestamp with time zone,
    reserva_fecha text DEFAULT ''::text,
    reserva_hora_inicio text DEFAULT ''::text,
    reserva_hora_fin text DEFAULT ''::text,
    horario_clase text DEFAULT ''::text,
    materia text DEFAULT ''::text,
    CONSTRAINT notificaciones_estado_envio_check CHECK ((estado_envio = ANY (ARRAY['pendiente'::text, 'enviado'::text, 'fallido'::text, 'descartado'::text]))),
    CONSTRAINT notificaciones_tipo_mensaje_check CHECK ((tipo_mensaje = ANY (ARRAY['predeterminado'::text, 'personalizado'::text]))),
    CONSTRAINT notificaciones_tipo_notificacion_check CHECK ((tipo_notificacion = ANY (ARRAY['manual'::text, 'vencimiento_inicial'::text, 'recordatorio'::text, 'reserva_no_reclamada'::text, 'delegado_vencimiento'::text, 'delegado_recordatorio'::text])))
);


--
-- Name: novedades; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.novedades (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    llave_id uuid,
    equipo_id uuid,
    prestamo_id uuid,
    reportado_por_comunidad_id uuid,
    reportado_por text DEFAULT ''::text NOT NULL,
    reportado_por_nombre text DEFAULT ''::text,
    salon_id uuid,
    salon text DEFAULT ''::text,
    categoria text NOT NULL,
    descripcion character varying(500) DEFAULT ''::character varying,
    estado text DEFAULT 'abierta'::text NOT NULL,
    resolucion text DEFAULT ''::text,
    fecha_reporte timestamp with time zone DEFAULT now() NOT NULL,
    fecha_resolucion timestamp with time zone,
    notificacion_admin_enviada boolean DEFAULT false NOT NULL,
    en_revision_por text,
    en_revision_en timestamp with time zone,
    resuelto_por text,
    CONSTRAINT ck_novedades_recurso_exclusivo CHECK ((num_nonnulls(llave_id, equipo_id) <= 1)),
    CONSTRAINT novedades_categoria_check CHECK ((categoria = ANY (ARRAY['sin_novedad'::text, 'daño_fisico'::text, 'no_funciona'::text, 'perdida'::text, 'otro'::text, 'demora_entrega'::text]))),
    CONSTRAINT novedades_estado_check CHECK ((estado = ANY (ARRAY['abierta'::text, 'en_revision'::text, 'resuelta'::text])))
);


--
-- Name: portero_bloques; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.portero_bloques (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    usuario_id uuid NOT NULL,
    bloque_id uuid NOT NULL,
    permite_identificacion boolean DEFAULT false NOT NULL,
    permite_prestamo_llaves boolean DEFAULT false NOT NULL,
    permite_devolucion_llaves boolean DEFAULT false NOT NULL,
    permite_recepcion_equipos boolean DEFAULT false CONSTRAINT portero_bloques_permite_prestamo_equipos_not_null NOT NULL
);


--
-- Name: prestamo_equipos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prestamo_equipos (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    prestamo_id uuid NOT NULL,
    equipo_id uuid NOT NULL,
    equipo_nombre text DEFAULT ''::text,
    equipo_marca text DEFAULT ''::text,
    equipo_codigo text DEFAULT ''::text,
    equipo_consecutivo text DEFAULT ''::text,
    equipo_codigo_barras text DEFAULT ''::text,
    estado_equipo text DEFAULT 'entregado'::text NOT NULL,
    fecha_entrega timestamp with time zone,
    fecha_devolucion timestamp with time zone,
    auxiliar_que_recibio_devolucion text DEFAULT ''::text,
    tipo_entrega text DEFAULT ''::text,
    CONSTRAINT prestamo_equipos_estado_equipo_check CHECK ((estado_equipo = ANY (ARRAY['entregado'::text, 'devuelto'::text]))),
    CONSTRAINT prestamo_equipos_tipo_entrega_check CHECK ((tipo_entrega = ANY (ARRAY['manual'::text, 'carnet'::text, ''::text])))
);


--
-- Name: prestamos; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.prestamos (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    docente_comunidad_id uuid,
    docente_codigo_nfc text NOT NULL,
    docente_nombre text DEFAULT ''::text,
    solicitante_tipo text DEFAULT ''::text,
    docente_responsable_id uuid,
    docente_responsable_nombre text DEFAULT ''::text,
    auxiliar_prestamista text DEFAULT 'Auxiliar'::text,
    ubicacion_prestamo_id uuid,
    estado text DEFAULT 'activo'::text NOT NULL,
    gestionado_por_usuario_id uuid,
    CONSTRAINT prestamos_estado_check CHECK ((estado = ANY (ARRAY['activo'::text, 'parcialmente_devuelto'::text, 'completamente_devuelto'::text]))),
    CONSTRAINT prestamos_solicitante_tipo_check CHECK ((solicitante_tipo = ANY (ARRAY['docente'::text, 'estudiante'::text, 'empleado'::text, ''::text])))
);


--
-- Name: programacion_semestres; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programacion_semestres (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    codigo_raw text,
    codigo text NOT NULL,
    anio integer NOT NULL,
    periodo text NOT NULL,
    fecha_inicio date NOT NULL,
    fecha_fin date NOT NULL,
    fecha_carga timestamp with time zone,
    cargado_por text,
    total_registros integer,
    CONSTRAINT programacion_semestres_periodo_check CHECK ((periodo = ANY (ARRAY['1'::text, '2'::text])))
);


--
-- Name: programaciones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programaciones (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    tipo text NOT NULL,
    semestre_id uuid,
    docente_id uuid,
    docente_nombre text DEFAULT ''::text,
    dia text,
    horario text DEFAULT ''::text,
    hora_inicio time without time zone,
    hora_fin time without time zone,
    salon_id uuid,
    aula text DEFAULT ''::text,
    facultad text DEFAULT ''::text,
    materia text DEFAULT ''::text,
    codigo_materia text DEFAULT ''::text,
    grupo text DEFAULT ''::text,
    nivel_grupo text DEFAULT ''::text,
    estudiantes_prematriculados integer DEFAULT 0,
    estudiantes_matriculados integer DEFAULT 0,
    total_estudiantes integer DEFAULT 0,
    observaciones text DEFAULT ''::text,
    es_intensivo boolean DEFAULT false NOT NULL,
    sin_entrega_llave boolean DEFAULT false NOT NULL,
    CONSTRAINT programaciones_dia_check CHECK ((dia = ANY (ARRAY['lunes'::text, 'martes'::text, 'miercoles'::text, 'jueves'::text, 'viernes'::text, 'sabado'::text, 'domingo'::text]))),
    CONSTRAINT programaciones_tipo_check CHECK ((tipo = ANY (ARRAY['regular'::text, 'semestral'::text, 'fantasma'::text])))
);


--
-- Name: programaciones_fantasma; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programaciones_fantasma (
    programacion_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    fantasma_de_programacion_id uuid,
    fantasma_de_codigo_materia text DEFAULT ''::text
);


--
-- Name: programaciones_regulares; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programaciones_regulares (
    programacion_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone
);


--
-- Name: programaciones_semestrales; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.programaciones_semestrales (
    programacion_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    consecutivo integer,
    cancelada boolean DEFAULT false NOT NULL,
    fecha_cancelacion timestamp with time zone,
    motivo_cancelacion text DEFAULT ''::text,
    grupo_id uuid,
    creado_manualmente boolean DEFAULT false NOT NULL,
    tipo_solicitante text,
    responsable_id uuid,
    responsable_nombre text DEFAULT ''::text,
    bloque_id uuid,
    CONSTRAINT programaciones_semestrales_tipo_solicitante_check CHECK ((tipo_solicitante = ANY (ARRAY['docente'::text, 'estudiante'::text])))
);


--
-- Name: registros_llaves; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.registros_llaves (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    comunidad_id uuid,
    docente_nombre text DEFAULT ''::text,
    programacion_id uuid,
    salon_id uuid,
    aula text DEFAULT ''::text,
    dia text DEFAULT ''::text,
    horario text DEFAULT ''::text,
    facultad text DEFAULT ''::text,
    materia text DEFAULT ''::text,
    fecha_hora_entrega timestamp with time zone NOT NULL,
    fecha_hora_devolucion timestamp with time zone,
    duracion_minutos integer,
    se_reclamo_a_tiempo boolean DEFAULT false,
    tiempo_retraso_minutos integer,
    retraso_entrega boolean DEFAULT false,
    tiempo_retraso_devolucion_minutos integer,
    tipo_entrega text DEFAULT ''::text,
    tipo_devolucion text DEFAULT ''::text,
    origen_registro text DEFAULT ''::text,
    ubicacion_prestamo_id uuid,
    ubicacion_devolucion_id uuid,
    quien_reclama text DEFAULT ''::text,
    reclama_comunidad_id uuid,
    nombre_reclama text DEFAULT ''::text,
    quien_entrega text DEFAULT ''::text,
    entrega_comunidad_id uuid,
    nombre_entrega text DEFAULT ''::text,
    numero_contacto text DEFAULT ''::text,
    estado text DEFAULT 'en_prestamo'::text NOT NULL,
    dia_entrega date,
    gestionado_por_usuario_id uuid,
    CONSTRAINT registros_llaves_estado_check CHECK ((estado = ANY (ARRAY['en_prestamo'::text, 'en_mora'::text, 'demora_entrega'::text, 'entregado'::text]))),
    CONSTRAINT registros_llaves_origen_registro_check CHECK ((origen_registro = ANY (ARRAY['individual'::text, 'programacion'::text, 'reserva_semestral'::text, ''::text]))),
    CONSTRAINT registros_llaves_quien_entrega_check CHECK ((quien_entrega = ANY (ARRAY['docente'::text, 'monitor'::text, ''::text]))),
    CONSTRAINT registros_llaves_quien_reclama_check CHECK ((quien_reclama = ANY (ARRAY['docente'::text, 'monitor'::text, 'otra_persona'::text, ''::text]))),
    CONSTRAINT registros_llaves_tipo_devolucion_check CHECK ((tipo_devolucion = ANY (ARRAY['manual'::text, 'carnet'::text, 'automatica'::text, ''::text]))),
    CONSTRAINT registros_llaves_tipo_entrega_check CHECK ((tipo_entrega = ANY (ARRAY['manual'::text, 'carnet'::text, ''::text])))
);


--
-- Name: reservas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reservas (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    solicitante_comunidad_id uuid,
    solicitante_nombre text DEFAULT ''::text NOT NULL,
    bloque_id uuid NOT NULL,
    salon_id uuid NOT NULL,
    fecha date NOT NULL,
    hora_inicio time without time zone NOT NULL,
    hora_fin time without time zone NOT NULL,
    motivo text DEFAULT ''::text,
    estado text DEFAULT 'pendiente'::text NOT NULL,
    entregar_llave boolean DEFAULT true NOT NULL,
    llave_entregada boolean DEFAULT false NOT NULL,
    registro_llave_id uuid,
    checkin_estado text DEFAULT 'pendiente_nfc'::text NOT NULL,
    checkin_canal text DEFAULT ''::text,
    checkin_at timestamp with time zone,
    tipo_solicitante text DEFAULT 'docente'::text,
    responsable_comunidad_id uuid,
    responsable_nombre text DEFAULT ''::text,
    aprobado_por_usuario_id uuid,
    aprobado_por_nombre text DEFAULT ''::text,
    creado_por_rol text DEFAULT ''::text,
    CONSTRAINT reservas_checkin_canal_check CHECK ((checkin_canal = ANY (ARRAY['oficina'::text, 'nfc'::text, ''::text]))),
    CONSTRAINT reservas_checkin_estado_check CHECK ((checkin_estado = ANY (ARRAY['entregado_oficina'::text, 'pendiente_nfc'::text, 'nfc_anticipado'::text, 'nfc_en_tiempo'::text, 'nfc_retraso'::text, 'no_show'::text]))),
    CONSTRAINT reservas_estado_check CHECK ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text, 'rechazada'::text, 'cancelada'::text, 'completada'::text, 'no_reclamada'::text]))),
    CONSTRAINT reservas_tipo_solicitante_check CHECK ((tipo_solicitante = ANY (ARRAY['docente'::text, 'estudiante'::text])))
);


--
-- Name: salones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.salones (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    nombre_salon text NOT NULL,
    bloque_id uuid NOT NULL,
    capacidad_estudiantes integer,
    tipo_silleteria_id uuid
);


--
-- Name: tipos_silleteria; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tipos_silleteria (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    nombre text NOT NULL
);


--
-- Name: ubicaciones_operativas; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ubicaciones_operativas (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    clave text NOT NULL,
    nombre text NOT NULL,
    descripcion text,
    activa boolean DEFAULT true NOT NULL,
    permite_identificacion boolean DEFAULT false NOT NULL,
    permite_prestamo_llaves boolean DEFAULT false NOT NULL,
    permite_devolucion_llaves boolean DEFAULT false NOT NULL,
    permite_prestamo_equipos boolean DEFAULT false NOT NULL,
    creado_por text,
    actualizado_por text,
    CONSTRAINT chk_ubicaciones_clave_lower CHECK ((clave = lower(clave)))
);


--
-- Name: usuario_sesiones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuario_sesiones (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    usuario_id uuid NOT NULL,
    token_hash text NOT NULL,
    user_agent text DEFAULT ''::text,
    ip inet,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone
);


--
-- Name: usuarios; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usuarios (
    id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    deleted_at timestamp with time zone,
    usuario text NOT NULL,
    nombre text NOT NULL,
    email text NOT NULL,
    contacto text DEFAULT ''::text,
    rol text NOT NULL,
    hash_password text,
    activo boolean DEFAULT true NOT NULL,
    numero_documento text DEFAULT ''::text,
    proveedor_auth text DEFAULT 'local'::text NOT NULL,
    CONSTRAINT usuarios_proveedor_auth_check CHECK ((proveedor_auth = ANY (ARRAY['local'::text, 'office365'::text]))),
    CONSTRAINT usuarios_rol_check CHECK ((rol = ANY (ARRAY['admin_programacion'::text, 'auxiliar_programacion'::text, 'superadmin'::text, 'porteria'::text])))
);


--
-- Name: v_programaciones; Type: VIEW; Schema: public; Owner: -
--

CREATE VIEW public.v_programaciones AS
 SELECT p.id,
    p.created_at,
    p.updated_at,
    p.deleted_at,
    p.tipo,
    p.semestre_id,
    p.docente_id,
    p.docente_nombre,
    p.dia,
    p.horario,
    p.hora_inicio,
    p.hora_fin,
    p.salon_id,
    p.aula,
    p.facultad,
    p.materia,
    p.codigo_materia,
    p.grupo,
    p.nivel_grupo,
    p.estudiantes_prematriculados,
    p.estudiantes_matriculados,
    p.total_estudiantes,
    p.observaciones,
    p.es_intensivo,
    p.sin_entrega_llave,
    (r.programacion_id IS NOT NULL) AS es_regular,
    s.consecutivo,
    s.cancelada,
    s.fecha_cancelacion,
    s.motivo_cancelacion,
    s.grupo_id,
    s.creado_manualmente,
    s.tipo_solicitante,
    s.responsable_id,
    s.responsable_nombre,
    s.bloque_id,
    f.fantasma_de_programacion_id,
    f.fantasma_de_codigo_materia
   FROM (((public.programaciones p
     LEFT JOIN public.programaciones_regulares r ON (((r.programacion_id = p.id) AND (r.deleted_at IS NULL))))
     LEFT JOIN public.programaciones_semestrales s ON (((s.programacion_id = p.id) AND (s.deleted_at IS NULL))))
     LEFT JOIN public.programaciones_fantasma f ON (((f.programacion_id = p.id) AND (f.deleted_at IS NULL))));


--
-- Name: bloques bloques_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bloques
    ADD CONSTRAINT bloques_pkey PRIMARY KEY (id);


--
-- Name: comunidad comunidad_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.comunidad
    ADD CONSTRAINT comunidad_pkey PRIMARY KEY (id);


--
-- Name: configuracion_bloques configuracion_bloques_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_bloques
    ADD CONSTRAINT configuracion_bloques_pkey PRIMARY KEY (id);


--
-- Name: devolucion_equipos devolucion_equipos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devolucion_equipos
    ADD CONSTRAINT devolucion_equipos_pkey PRIMARY KEY (id);


--
-- Name: devoluciones devoluciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devoluciones
    ADD CONSTRAINT devoluciones_pkey PRIMARY KEY (id);


--
-- Name: equipos equipos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.equipos
    ADD CONSTRAINT equipos_pkey PRIMARY KEY (id);


--
-- Name: reservas ex_reservas_no_overlap; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT ex_reservas_no_overlap EXCLUDE USING gist (salon_id WITH =, fecha WITH =, tsrange((fecha + hora_inicio), (fecha + hora_fin)) WITH &&) WHERE (((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text])) AND (deleted_at IS NULL)));


--
-- Name: monitores monitores_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitores
    ADD CONSTRAINT monitores_pkey PRIMARY KEY (id);


--
-- Name: nfc_eventos nfc_eventos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfc_eventos
    ADD CONSTRAINT nfc_eventos_pkey PRIMARY KEY (id);


--
-- Name: notificaciones notificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_pkey PRIMARY KEY (id);


--
-- Name: novedades novedades_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades
    ADD CONSTRAINT novedades_pkey PRIMARY KEY (id);


--
-- Name: portero_bloques portero_bloques_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portero_bloques
    ADD CONSTRAINT portero_bloques_pkey PRIMARY KEY (id);


--
-- Name: prestamo_equipos prestamo_equipos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_equipos
    ADD CONSTRAINT prestamo_equipos_pkey PRIMARY KEY (id);


--
-- Name: prestamos prestamos_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_pkey PRIMARY KEY (id);


--
-- Name: programacion_semestres programacion_semestres_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programacion_semestres
    ADD CONSTRAINT programacion_semestres_pkey PRIMARY KEY (id);


--
-- Name: programaciones_fantasma programaciones_fantasma_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_fantasma
    ADD CONSTRAINT programaciones_fantasma_pkey PRIMARY KEY (programacion_id);


--
-- Name: programaciones programaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones
    ADD CONSTRAINT programaciones_pkey PRIMARY KEY (id);


--
-- Name: programaciones_regulares programaciones_regulares_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_regulares
    ADD CONSTRAINT programaciones_regulares_pkey PRIMARY KEY (programacion_id);


--
-- Name: programaciones_semestrales programaciones_semestrales_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_semestrales
    ADD CONSTRAINT programaciones_semestrales_pkey PRIMARY KEY (programacion_id);


--
-- Name: registros_llaves registros_llaves_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_llaves
    ADD CONSTRAINT registros_llaves_pkey PRIMARY KEY (id);


--
-- Name: reservas reservas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_pkey PRIMARY KEY (id);


--
-- Name: salones salones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salones
    ADD CONSTRAINT salones_pkey PRIMARY KEY (id);


--
-- Name: tipos_silleteria tipos_silleteria_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tipos_silleteria
    ADD CONSTRAINT tipos_silleteria_pkey PRIMARY KEY (id);


--
-- Name: ubicaciones_operativas ubicaciones_operativas_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ubicaciones_operativas
    ADD CONSTRAINT ubicaciones_operativas_pkey PRIMARY KEY (id);


--
-- Name: usuario_sesiones usuario_sesiones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_sesiones
    ADD CONSTRAINT usuario_sesiones_pkey PRIMARY KEY (id);


--
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- Name: idx_comunidad_id_carnet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comunidad_id_carnet ON public.comunidad USING btree (id_carnet);


--
-- Name: idx_comunidad_nombre_trgm; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comunidad_nombre_trgm ON public.comunidad USING gin (public.immutable_unaccent(nombre) public.gin_trgm_ops);


--
-- Name: idx_comunidad_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comunidad_tipo ON public.comunidad USING btree (tipo);


--
-- Name: idx_devolucion_equipos_devolucion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devolucion_equipos_devolucion_id ON public.devolucion_equipos USING btree (devolucion_id);


--
-- Name: idx_devoluciones_gestionado_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devoluciones_gestionado_por ON public.devoluciones USING btree (gestionado_por_usuario_id);


--
-- Name: idx_devoluciones_prestamo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_devoluciones_prestamo_id ON public.devoluciones USING btree (prestamo_id);


--
-- Name: idx_equipos_codigo_barras; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipos_codigo_barras ON public.equipos USING btree (codigo_barras);


--
-- Name: idx_equipos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_equipos_estado ON public.equipos USING btree (estado);


--
-- Name: idx_monitores_docente_comunidad_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monitores_docente_comunidad_id ON public.monitores USING btree (docente_comunidad_id);


--
-- Name: idx_monitores_monitor_comunidad_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monitores_monitor_comunidad_id ON public.monitores USING btree (monitor_comunidad_id);


--
-- Name: idx_monitores_programacion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_monitores_programacion_id ON public.monitores USING btree (programacion_id);


--
-- Name: idx_nfc_eventos_id_carnet; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_nfc_eventos_id_carnet ON public.nfc_eventos USING btree (id_carnet);


--
-- Name: idx_notificaciones_destinatario_documento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_destinatario_documento ON public.notificaciones USING btree (destinatario_documento, fecha_envio DESC);


--
-- Name: idx_notificaciones_estado_envio_reintento; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_estado_envio_reintento ON public.notificaciones USING btree (estado_envio, proximo_reintento);


--
-- Name: idx_notificaciones_fecha_envio; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notificaciones_fecha_envio ON public.notificaciones USING btree (fecha_envio DESC);


--
-- Name: idx_novedades_equipo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_novedades_equipo_id ON public.novedades USING btree (equipo_id);


--
-- Name: idx_novedades_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_novedades_estado ON public.novedades USING btree (estado);


--
-- Name: idx_novedades_fecha_reporte; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_novedades_fecha_reporte ON public.novedades USING btree (fecha_reporte);


--
-- Name: idx_novedades_llave_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_novedades_llave_id ON public.novedades USING btree (llave_id);


--
-- Name: idx_novedades_reportado_por_comunidad_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_novedades_reportado_por_comunidad_id ON public.novedades USING btree (reportado_por_comunidad_id);


--
-- Name: idx_portero_bloques_bloque_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portero_bloques_bloque_id ON public.portero_bloques USING btree (bloque_id);


--
-- Name: idx_portero_bloques_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_portero_bloques_usuario_id ON public.portero_bloques USING btree (usuario_id);


--
-- Name: idx_prestamo_equipos_equipo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prestamo_equipos_equipo_id ON public.prestamo_equipos USING btree (equipo_id);


--
-- Name: idx_prestamo_equipos_prestamo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prestamo_equipos_prestamo_id ON public.prestamo_equipos USING btree (prestamo_id);


--
-- Name: idx_prestamos_docente_codigo_nfc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prestamos_docente_codigo_nfc ON public.prestamos USING btree (docente_codigo_nfc);


--
-- Name: idx_prestamos_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prestamos_estado ON public.prestamos USING btree (estado);


--
-- Name: idx_prestamos_gestionado_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_prestamos_gestionado_por ON public.prestamos USING btree (gestionado_por_usuario_id);


--
-- Name: idx_programacion_semestres_fechas; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programacion_semestres_fechas ON public.programacion_semestres USING btree (fecha_inicio, fecha_fin);


--
-- Name: idx_programaciones_dia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_dia ON public.programaciones USING btree (dia);


--
-- Name: idx_programaciones_docente_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_docente_id ON public.programaciones USING btree (docente_id);


--
-- Name: idx_programaciones_es_intensivo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_es_intensivo ON public.programaciones USING btree (es_intensivo) WHERE es_intensivo;


--
-- Name: idx_programaciones_fantasma_de; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_fantasma_de ON public.programaciones_fantasma USING btree (fantasma_de_programacion_id);


--
-- Name: idx_programaciones_salon_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_salon_id ON public.programaciones USING btree (salon_id);


--
-- Name: idx_programaciones_semestrales_consecutivo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_semestrales_consecutivo ON public.programaciones_semestrales USING btree (consecutivo);


--
-- Name: idx_programaciones_semestrales_grupo_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_semestrales_grupo_id ON public.programaciones_semestrales USING btree (grupo_id);


--
-- Name: idx_programaciones_semestre_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_semestre_id ON public.programaciones USING btree (semestre_id);


--
-- Name: idx_programaciones_semestre_id_dia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_semestre_id_dia ON public.programaciones USING btree (semestre_id, dia);


--
-- Name: idx_programaciones_semestre_id_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_semestre_id_tipo ON public.programaciones USING btree (semestre_id, tipo);


--
-- Name: idx_programaciones_tipo; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_tipo ON public.programaciones USING btree (tipo);


--
-- Name: idx_programaciones_tipo_dia; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_programaciones_tipo_dia ON public.programaciones USING btree (tipo, dia);


--
-- Name: idx_registros_llaves_comunidad_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registros_llaves_comunidad_id ON public.registros_llaves USING btree (comunidad_id);


--
-- Name: idx_registros_llaves_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registros_llaves_estado ON public.registros_llaves USING btree (estado);


--
-- Name: idx_registros_llaves_fecha_hora_entrega; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registros_llaves_fecha_hora_entrega ON public.registros_llaves USING btree (fecha_hora_entrega);


--
-- Name: idx_registros_llaves_gestionado_por; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registros_llaves_gestionado_por ON public.registros_llaves USING btree (gestionado_por_usuario_id);


--
-- Name: idx_registros_llaves_programacion_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_registros_llaves_programacion_id ON public.registros_llaves USING btree (programacion_id);


--
-- Name: idx_reservas_checkin_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_checkin_estado ON public.reservas USING btree (checkin_estado);


--
-- Name: idx_reservas_estado; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_estado ON public.reservas USING btree (estado);


--
-- Name: idx_reservas_fecha; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_fecha ON public.reservas USING btree (fecha);


--
-- Name: idx_reservas_salon_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_salon_id ON public.reservas USING btree (salon_id);


--
-- Name: idx_reservas_solicitante_comunidad_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_reservas_solicitante_comunidad_id ON public.reservas USING btree (solicitante_comunidad_id);


--
-- Name: idx_salones_bloque_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_salones_bloque_id ON public.salones USING btree (bloque_id);


--
-- Name: idx_ubicaciones_operativas_activa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ubicaciones_operativas_activa ON public.ubicaciones_operativas USING btree (activa);


--
-- Name: idx_usuario_sesiones_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuario_sesiones_expires_at ON public.usuario_sesiones USING btree (expires_at);


--
-- Name: idx_usuario_sesiones_usuario_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usuario_sesiones_usuario_id ON public.usuario_sesiones USING btree (usuario_id);


--
-- Name: ux_bloques_nombre_bloque; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_bloques_nombre_bloque ON public.bloques USING btree (nombre_bloque) WHERE (deleted_at IS NULL);


--
-- Name: ux_comunidad_numero_documento; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_comunidad_numero_documento ON public.comunidad USING btree (numero_documento) WHERE (deleted_at IS NULL);


--
-- Name: ux_configuracion_bloques_bloque_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_configuracion_bloques_bloque_id ON public.configuracion_bloques USING btree (COALESCE((bloque_id)::text, '__defaults__'::text)) WHERE (deleted_at IS NULL);


--
-- Name: ux_equipos_codigo_inventario; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_equipos_codigo_inventario ON public.equipos USING btree (codigo_inventario) WHERE (deleted_at IS NULL);


--
-- Name: ux_monitores_docente_monitor_programacion; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_monitores_docente_monitor_programacion ON public.monitores USING btree (docente_comunidad_id, monitor_comunidad_id, programacion_id) WHERE (deleted_at IS NULL);


--
-- Name: ux_nfc_eventos_evento_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_nfc_eventos_evento_id ON public.nfc_eventos USING btree (evento_id) WHERE (deleted_at IS NULL);


--
-- Name: ux_notificaciones_dedupe_llave; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_notificaciones_dedupe_llave ON public.notificaciones USING btree (llave_id, tipo_notificacion, numero_recordatorio) WHERE ((deleted_at IS NULL) AND (llave_id IS NOT NULL));


--
-- Name: ux_notificaciones_dedupe_reserva; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_notificaciones_dedupe_reserva ON public.notificaciones USING btree (reserva_id, tipo_notificacion) WHERE ((deleted_at IS NULL) AND (reserva_id IS NOT NULL));


--
-- Name: ux_portero_bloques_usuario_bloque; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_portero_bloques_usuario_bloque ON public.portero_bloques USING btree (usuario_id, bloque_id) WHERE (deleted_at IS NULL);


--
-- Name: ux_prestamo_equipos_equipo_activo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_prestamo_equipos_equipo_activo ON public.prestamo_equipos USING btree (equipo_id) WHERE (estado_equipo = 'entregado'::text);


--
-- Name: ux_programacion_semestres_codigo; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_programacion_semestres_codigo ON public.programacion_semestres USING btree (codigo) WHERE (deleted_at IS NULL);


--
-- Name: ux_registros_llaves_dedupe_dia_horario; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_registros_llaves_dedupe_dia_horario ON public.registros_llaves USING btree (comunidad_id, salon_id, dia_entrega, horario) WHERE (deleted_at IS NULL);


--
-- Name: ux_reservas_slot; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_reservas_slot ON public.reservas USING btree (salon_id, fecha, hora_inicio) WHERE ((estado = ANY (ARRAY['pendiente'::text, 'aprobada'::text])) AND (deleted_at IS NULL));


--
-- Name: ux_salones_nombre_salon; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_salones_nombre_salon ON public.salones USING btree (nombre_salon) WHERE (deleted_at IS NULL);


--
-- Name: ux_tipos_silleteria_nombre; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_tipos_silleteria_nombre ON public.tipos_silleteria USING btree (nombre) WHERE (deleted_at IS NULL);


--
-- Name: ux_ubicaciones_operativas_clave; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_ubicaciones_operativas_clave ON public.ubicaciones_operativas USING btree (clave) WHERE (deleted_at IS NULL);


--
-- Name: ux_usuario_sesiones_token_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_usuario_sesiones_token_hash ON public.usuario_sesiones USING btree (token_hash) WHERE (deleted_at IS NULL);


--
-- Name: ux_usuarios_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_usuarios_email ON public.usuarios USING btree (email) WHERE (deleted_at IS NULL);


--
-- Name: ux_usuarios_usuario; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ux_usuarios_usuario ON public.usuarios USING btree (usuario) WHERE (deleted_at IS NULL);


--
-- Name: bloques trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.bloques FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('salones', 'bloque_id', 'portero_bloques', 'bloque_id');


--
-- Name: comunidad trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.comunidad FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('programaciones', 'docente_id', 'programaciones_semestrales', 'responsable_id', 'registros_llaves', 'comunidad_id', 'registros_llaves', 'reclama_comunidad_id', 'registros_llaves', 'entrega_comunidad_id', 'monitores', 'docente_comunidad_id', 'monitores', 'monitor_comunidad_id', 'prestamos', 'docente_comunidad_id', 'prestamos', 'docente_responsable_id', 'devoluciones', 'docente_comunidad_id', 'reservas', 'solicitante_comunidad_id', 'reservas', 'responsable_comunidad_id', 'novedades', 'reportado_por_comunidad_id');


--
-- Name: devoluciones trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.devoluciones FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('devolucion_equipos', 'devolucion_id');


--
-- Name: equipos trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.equipos FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('prestamo_equipos', 'equipo_id', 'devolucion_equipos', 'equipo_id', 'novedades', 'equipo_id');


--
-- Name: prestamos trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.prestamos FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('prestamo_equipos', 'prestamo_id', 'devoluciones', 'prestamo_id', 'novedades', 'prestamo_id');


--
-- Name: programacion_semestres trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.programacion_semestres FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('programaciones', 'semestre_id');


--
-- Name: programaciones trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.programaciones FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('registros_llaves', 'programacion_id', 'monitores', 'programacion_id');


--
-- Name: registros_llaves trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.registros_llaves FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('reservas', 'registro_llave_id', 'notificaciones', 'llave_id', 'novedades', 'llave_id');


--
-- Name: reservas trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.reservas FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('notificaciones', 'reserva_id');


--
-- Name: salones trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.salones FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('programaciones', 'salon_id', 'registros_llaves', 'salon_id', 'reservas', 'salon_id', 'notificaciones', 'salon_id', 'novedades', 'salon_id');


--
-- Name: tipos_silleteria trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.tipos_silleteria FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('salones', 'tipo_silleteria_id');


--
-- Name: ubicaciones_operativas trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.ubicaciones_operativas FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('registros_llaves', 'ubicacion_prestamo_id', 'registros_llaves', 'ubicacion_devolucion_id', 'prestamos', 'ubicacion_prestamo_id', 'devoluciones', 'ubicacion_devolucion_id', 'nfc_eventos', 'ubicacion_id');


--
-- Name: usuarios trg_block_soft_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_block_soft_delete BEFORE UPDATE ON public.usuarios FOR EACH ROW WHEN (((old.deleted_at IS NULL) AND (new.deleted_at IS NOT NULL))) EXECUTE FUNCTION public.block_soft_delete_with_active_children('reservas', 'aprobado_por_usuario_id', 'portero_bloques', 'usuario_id', 'registros_llaves', 'gestionado_por_usuario_id', 'prestamos', 'gestionado_por_usuario_id', 'devoluciones', 'gestionado_por_usuario_id');


--
-- Name: bloques trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.bloques FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: comunidad trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.comunidad FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: configuracion_bloques trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.configuracion_bloques FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: devolucion_equipos trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.devolucion_equipos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: devoluciones trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.devoluciones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: equipos trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.equipos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: monitores trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.monitores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: nfc_eventos trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.nfc_eventos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: notificaciones trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.notificaciones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: novedades trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.novedades FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: portero_bloques trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.portero_bloques FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: prestamo_equipos trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.prestamo_equipos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: prestamos trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.prestamos FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: programacion_semestres trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.programacion_semestres FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: programaciones trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.programaciones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: programaciones_fantasma trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.programaciones_fantasma FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: programaciones_regulares trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.programaciones_regulares FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: programaciones_semestrales trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.programaciones_semestrales FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: registros_llaves trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.registros_llaves FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: reservas trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.reservas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: salones trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.salones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: tipos_silleteria trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.tipos_silleteria FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: ubicaciones_operativas trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.ubicaciones_operativas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: usuario_sesiones trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.usuario_sesiones FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: usuarios trg_set_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_set_updated_at BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: configuracion_bloques configuracion_bloques_bloque_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.configuracion_bloques
    ADD CONSTRAINT configuracion_bloques_bloque_id_fkey FOREIGN KEY (bloque_id) REFERENCES public.bloques(id) ON DELETE RESTRICT;


--
-- Name: devolucion_equipos devolucion_equipos_devolucion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devolucion_equipos
    ADD CONSTRAINT devolucion_equipos_devolucion_id_fkey FOREIGN KEY (devolucion_id) REFERENCES public.devoluciones(id) ON DELETE RESTRICT;


--
-- Name: devolucion_equipos devolucion_equipos_equipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devolucion_equipos
    ADD CONSTRAINT devolucion_equipos_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES public.equipos(id) ON DELETE RESTRICT;


--
-- Name: devoluciones devoluciones_docente_comunidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devoluciones
    ADD CONSTRAINT devoluciones_docente_comunidad_id_fkey FOREIGN KEY (docente_comunidad_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: devoluciones devoluciones_gestionado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devoluciones
    ADD CONSTRAINT devoluciones_gestionado_por_usuario_id_fkey FOREIGN KEY (gestionado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: devoluciones devoluciones_prestamo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devoluciones
    ADD CONSTRAINT devoluciones_prestamo_id_fkey FOREIGN KEY (prestamo_id) REFERENCES public.prestamos(id) ON DELETE RESTRICT;


--
-- Name: devoluciones devoluciones_ubicacion_devolucion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.devoluciones
    ADD CONSTRAINT devoluciones_ubicacion_devolucion_id_fkey FOREIGN KEY (ubicacion_devolucion_id) REFERENCES public.ubicaciones_operativas(id) ON DELETE RESTRICT;


--
-- Name: monitores monitores_docente_comunidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitores
    ADD CONSTRAINT monitores_docente_comunidad_id_fkey FOREIGN KEY (docente_comunidad_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: monitores monitores_monitor_comunidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitores
    ADD CONSTRAINT monitores_monitor_comunidad_id_fkey FOREIGN KEY (monitor_comunidad_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: monitores monitores_programacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.monitores
    ADD CONSTRAINT monitores_programacion_id_fkey FOREIGN KEY (programacion_id) REFERENCES public.programaciones(id) ON DELETE RESTRICT;


--
-- Name: nfc_eventos nfc_eventos_ubicacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.nfc_eventos
    ADD CONSTRAINT nfc_eventos_ubicacion_id_fkey FOREIGN KEY (ubicacion_id) REFERENCES public.ubicaciones_operativas(id) ON DELETE RESTRICT;


--
-- Name: notificaciones notificaciones_llave_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_llave_id_fkey FOREIGN KEY (llave_id) REFERENCES public.registros_llaves(id) ON DELETE RESTRICT;


--
-- Name: notificaciones notificaciones_reserva_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_reserva_id_fkey FOREIGN KEY (reserva_id) REFERENCES public.reservas(id) ON DELETE RESTRICT;


--
-- Name: notificaciones notificaciones_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notificaciones
    ADD CONSTRAINT notificaciones_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salones(id) ON DELETE RESTRICT;


--
-- Name: novedades novedades_equipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades
    ADD CONSTRAINT novedades_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES public.equipos(id) ON DELETE RESTRICT;


--
-- Name: novedades novedades_llave_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades
    ADD CONSTRAINT novedades_llave_id_fkey FOREIGN KEY (llave_id) REFERENCES public.registros_llaves(id) ON DELETE RESTRICT;


--
-- Name: novedades novedades_prestamo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades
    ADD CONSTRAINT novedades_prestamo_id_fkey FOREIGN KEY (prestamo_id) REFERENCES public.prestamos(id) ON DELETE RESTRICT;


--
-- Name: novedades novedades_reportado_por_comunidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades
    ADD CONSTRAINT novedades_reportado_por_comunidad_id_fkey FOREIGN KEY (reportado_por_comunidad_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: novedades novedades_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.novedades
    ADD CONSTRAINT novedades_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salones(id) ON DELETE RESTRICT;


--
-- Name: portero_bloques portero_bloques_bloque_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portero_bloques
    ADD CONSTRAINT portero_bloques_bloque_id_fkey FOREIGN KEY (bloque_id) REFERENCES public.bloques(id) ON DELETE RESTRICT;


--
-- Name: portero_bloques portero_bloques_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.portero_bloques
    ADD CONSTRAINT portero_bloques_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: prestamo_equipos prestamo_equipos_equipo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_equipos
    ADD CONSTRAINT prestamo_equipos_equipo_id_fkey FOREIGN KEY (equipo_id) REFERENCES public.equipos(id) ON DELETE RESTRICT;


--
-- Name: prestamo_equipos prestamo_equipos_prestamo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamo_equipos
    ADD CONSTRAINT prestamo_equipos_prestamo_id_fkey FOREIGN KEY (prestamo_id) REFERENCES public.prestamos(id) ON DELETE RESTRICT;


--
-- Name: prestamos prestamos_docente_comunidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_docente_comunidad_id_fkey FOREIGN KEY (docente_comunidad_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: prestamos prestamos_docente_responsable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_docente_responsable_id_fkey FOREIGN KEY (docente_responsable_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: prestamos prestamos_gestionado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_gestionado_por_usuario_id_fkey FOREIGN KEY (gestionado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: prestamos prestamos_ubicacion_prestamo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.prestamos
    ADD CONSTRAINT prestamos_ubicacion_prestamo_id_fkey FOREIGN KEY (ubicacion_prestamo_id) REFERENCES public.ubicaciones_operativas(id) ON DELETE RESTRICT;


--
-- Name: programaciones programaciones_docente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones
    ADD CONSTRAINT programaciones_docente_id_fkey FOREIGN KEY (docente_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: programaciones_fantasma programaciones_fantasma_fantasma_de_programacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_fantasma
    ADD CONSTRAINT programaciones_fantasma_fantasma_de_programacion_id_fkey FOREIGN KEY (fantasma_de_programacion_id) REFERENCES public.programaciones(id) ON DELETE RESTRICT;


--
-- Name: programaciones_fantasma programaciones_fantasma_programacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_fantasma
    ADD CONSTRAINT programaciones_fantasma_programacion_id_fkey FOREIGN KEY (programacion_id) REFERENCES public.programaciones(id) ON DELETE RESTRICT;


--
-- Name: programaciones_regulares programaciones_regulares_programacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_regulares
    ADD CONSTRAINT programaciones_regulares_programacion_id_fkey FOREIGN KEY (programacion_id) REFERENCES public.programaciones(id) ON DELETE RESTRICT;


--
-- Name: programaciones programaciones_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones
    ADD CONSTRAINT programaciones_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salones(id) ON DELETE RESTRICT;


--
-- Name: programaciones_semestrales programaciones_semestrales_bloque_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_semestrales
    ADD CONSTRAINT programaciones_semestrales_bloque_id_fkey FOREIGN KEY (bloque_id) REFERENCES public.bloques(id) ON DELETE RESTRICT;


--
-- Name: programaciones_semestrales programaciones_semestrales_programacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_semestrales
    ADD CONSTRAINT programaciones_semestrales_programacion_id_fkey FOREIGN KEY (programacion_id) REFERENCES public.programaciones(id) ON DELETE RESTRICT;


--
-- Name: programaciones_semestrales programaciones_semestrales_responsable_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones_semestrales
    ADD CONSTRAINT programaciones_semestrales_responsable_id_fkey FOREIGN KEY (responsable_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: programaciones programaciones_semestre_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.programaciones
    ADD CONSTRAINT programaciones_semestre_id_fkey FOREIGN KEY (semestre_id) REFERENCES public.programacion_semestres(id) ON DELETE RESTRICT;


--
-- Name: registros_llaves registros_llaves_comunidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_llaves
    ADD CONSTRAINT registros_llaves_comunidad_id_fkey FOREIGN KEY (comunidad_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: registros_llaves registros_llaves_entrega_comunidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_llaves
    ADD CONSTRAINT registros_llaves_entrega_comunidad_id_fkey FOREIGN KEY (entrega_comunidad_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: registros_llaves registros_llaves_gestionado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_llaves
    ADD CONSTRAINT registros_llaves_gestionado_por_usuario_id_fkey FOREIGN KEY (gestionado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: registros_llaves registros_llaves_programacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_llaves
    ADD CONSTRAINT registros_llaves_programacion_id_fkey FOREIGN KEY (programacion_id) REFERENCES public.programaciones(id) ON DELETE RESTRICT;


--
-- Name: registros_llaves registros_llaves_reclama_comunidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_llaves
    ADD CONSTRAINT registros_llaves_reclama_comunidad_id_fkey FOREIGN KEY (reclama_comunidad_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: registros_llaves registros_llaves_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_llaves
    ADD CONSTRAINT registros_llaves_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salones(id) ON DELETE RESTRICT;


--
-- Name: registros_llaves registros_llaves_ubicacion_devolucion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_llaves
    ADD CONSTRAINT registros_llaves_ubicacion_devolucion_id_fkey FOREIGN KEY (ubicacion_devolucion_id) REFERENCES public.ubicaciones_operativas(id) ON DELETE RESTRICT;


--
-- Name: registros_llaves registros_llaves_ubicacion_prestamo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.registros_llaves
    ADD CONSTRAINT registros_llaves_ubicacion_prestamo_id_fkey FOREIGN KEY (ubicacion_prestamo_id) REFERENCES public.ubicaciones_operativas(id) ON DELETE RESTRICT;


--
-- Name: reservas reservas_aprobado_por_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_aprobado_por_usuario_id_fkey FOREIGN KEY (aprobado_por_usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- Name: reservas reservas_bloque_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_bloque_id_fkey FOREIGN KEY (bloque_id) REFERENCES public.bloques(id) ON DELETE RESTRICT;


--
-- Name: reservas reservas_registro_llave_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_registro_llave_id_fkey FOREIGN KEY (registro_llave_id) REFERENCES public.registros_llaves(id) ON DELETE RESTRICT;


--
-- Name: reservas reservas_responsable_comunidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_responsable_comunidad_id_fkey FOREIGN KEY (responsable_comunidad_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: reservas reservas_salon_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_salon_id_fkey FOREIGN KEY (salon_id) REFERENCES public.salones(id) ON DELETE RESTRICT;


--
-- Name: reservas reservas_solicitante_comunidad_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reservas
    ADD CONSTRAINT reservas_solicitante_comunidad_id_fkey FOREIGN KEY (solicitante_comunidad_id) REFERENCES public.comunidad(id) ON DELETE RESTRICT;


--
-- Name: salones salones_bloque_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salones
    ADD CONSTRAINT salones_bloque_id_fkey FOREIGN KEY (bloque_id) REFERENCES public.bloques(id) ON DELETE RESTRICT;


--
-- Name: salones salones_tipo_silleteria_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.salones
    ADD CONSTRAINT salones_tipo_silleteria_id_fkey FOREIGN KEY (tipo_silleteria_id) REFERENCES public.tipos_silleteria(id) ON DELETE RESTRICT;


--
-- Name: usuario_sesiones usuario_sesiones_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usuario_sesiones
    ADD CONSTRAINT usuario_sesiones_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE RESTRICT;


--
-- PostgreSQL database dump complete
--


