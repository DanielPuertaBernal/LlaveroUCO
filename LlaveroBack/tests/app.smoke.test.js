/**
 * `src/app.js` exporta la app de Express sin `listen()` (eso vive en
 * `server.js`), así que supertest la levanta en memoria. Este smoke cubre lo
 * que atraviesa TODA petición — health check, 404, guard de auth, cabeceras
 * de seguridad y parseo de body — sin tocar la base: los caminos probados
 * cortan antes de cualquier consulta.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../src/app.js';

const SECRET = 'secreto-solo-para-tests';
const EMISOR = { issuer: 'llavero-api', audience: 'llavero-clients' };
const RUTA_PROTEGIDA = '/api/llaves/pendientes';

const firmar = (payload, opciones = {}) => jwt.sign(payload, SECRET, { ...EMISOR, ...opciones });

let secretoPrevio;
beforeAll(() => {
  secretoPrevio = process.env.JWT_SECRET;
  process.env.JWT_SECRET = SECRET;
});
afterAll(() => {
  process.env.JWT_SECRET = secretoPrevio;
});

describe('health check', () => {
  it('responde ok con una marca de tiempo ISO', async () => {
    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(new Date(res.body.timestamp).toISOString()).toBe(res.body.timestamp);
  });
});

describe('documentación OpenAPI', () => {
  it('sirve el spec como JSON', async () => {
    const res = await request(app).get('/api/docs.json');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('openapi');
    expect(res.body).toHaveProperty('paths');
  });
});

describe('404', () => {
  it('responde con el contrato de error y nombra método y ruta', async () => {
    const res = await request(app).get('/api/no-existe');

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ ok: false, message: 'Ruta GET /api/no-existe no encontrada' });
  });

  it('también cubre un método no montado sobre un prefijo que sí existe', async () => {
    const res = await request(app).delete('/api/llaves');

    expect(res.status).toBe(404);
    expect(res.body.ok).toBe(false);
  });
});

describe('guard de autenticación', () => {
  it('rechaza sin cabecera Authorization', async () => {
    const res = await request(app).get(RUTA_PROTEGIDA);

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ ok: false, message: 'Token no proporcionado' });
  });

  it('rechaza una cabecera que no usa el esquema Bearer', async () => {
    const res = await request(app).get(RUTA_PROTEGIDA).set('Authorization', 'Basic dXNlcjpwYXNz');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token no proporcionado');
  });

  it('rechaza un token que no es un JWT', async () => {
    const res = await request(app).get(RUTA_PROTEGIDA).set('Authorization', 'Bearer no-es-un-jwt');

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token inválido');
  });

  it('rechaza un token vencido', async () => {
    const token = firmar({ sub: 'u1', type: 'access' }, { expiresIn: '-1s' });
    const res = await request(app).get(RUTA_PROTEGIDA).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token expirado');
  });

  it('rechaza un refresh token usado como si fuera de acceso', async () => {
    // Firma válida, emisor válido, pero `type` equivocado: el guard corta
    // antes de ir a la base a buscar el usuario.
    const token = firmar({ sub: 'u1', type: 'refresh' });
    const res = await request(app).get(RUTA_PROTEGIDA).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Tipo de token inválido');
  });

  it('rechaza un token firmado con otro secreto', async () => {
    const token = jwt.sign({ sub: 'u1', type: 'access' }, 'secreto-ajeno', EMISOR);
    const res = await request(app).get(RUTA_PROTEGIDA).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token inválido');
  });

  it('rechaza un token emitido para otra audiencia', async () => {
    const token = jwt.sign({ sub: 'u1', type: 'access' }, SECRET, {
      issuer: 'llavero-api',
      audience: 'otra-app',
    });
    const res = await request(app).get(RUTA_PROTEGIDA).set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Token inválido');
  });
});

describe('middlewares globales', () => {
  it('aplica las cabeceras de seguridad de helmet', async () => {
    const res = await request(app).get('/health');

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('permite credenciales desde el origen configurado', async () => {
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');

    expect(res.headers['access-control-allow-origin']).toBe('http://localhost:5173');
    expect(res.headers['access-control-allow-credentials']).toBe('true');
  });

  it('convierte un JSON malformado en un 400 con el contrato de error', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"usuario": ');

    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });
});
