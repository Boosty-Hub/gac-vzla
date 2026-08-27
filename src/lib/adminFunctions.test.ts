import { describe, it, expect } from 'vitest';
import { needsRefresh, isSessionError, SESSION_EXPIRED_MESSAGE } from './adminFunctions';

const AHORA = new Date('2026-08-27T15:00:00Z').getTime();
/** Supabase entrega `expires_at` en SEGUNDOS, no en milisegundos. */
const enSegundos = (ms: number) => Math.floor(ms / 1000);

describe('needsRefresh', () => {
  it('renueva cuando no hay sesión', () => {
    expect(needsRefresh(null, AHORA)).toBe(true);
    expect(needsRefresh(undefined, AHORA)).toBe(true);
  });

  it('renueva cuando la sesión existe pero no trae token', () => {
    // Es el caso que producía el bug: sin token, `invoke` manda la clave pública del
    // proyecto como si fuera un JWT y la función responde "invalid token".
    expect(needsRefresh({ access_token: null, expires_at: enSegundos(AHORA + 3600_000) }, AHORA)).toBe(true);
    expect(needsRefresh({ access_token: '' }, AHORA)).toBe(true);
  });

  it('renueva un token ya vencido', () => {
    expect(needsRefresh({ access_token: 'jwt', expires_at: enSegundos(AHORA - 1000) }, AHORA)).toBe(true);
  });

  it('renueva el que vence dentro del margen', () => {
    // 30 segundos de vida: alcanza para empezar la petición y no para terminarla.
    expect(needsRefresh({ access_token: 'jwt', expires_at: enSegundos(AHORA + 30_000) }, AHORA)).toBe(true);
  });

  it('no renueva el que todavía tiene vida de sobra', () => {
    expect(needsRefresh({ access_token: 'jwt', expires_at: enSegundos(AHORA + 3600_000) }, AHORA)).toBe(false);
  });

  it('respeta el borde exacto del margen', () => {
    expect(needsRefresh({ access_token: 'jwt', expires_at: enSegundos(AHORA + 60_000) }, AHORA)).toBe(false);
    expect(needsRefresh({ access_token: 'jwt', expires_at: enSegundos(AHORA + 59_000) }, AHORA)).toBe(true);
  });

  it('no renueva si no sabe cuándo vence', () => {
    // Sin `expires_at` no hay motivo para gastar una renovación: que hable la función.
    expect(needsRefresh({ access_token: 'jwt' }, AHORA)).toBe(false);
  });

  it('acepta un margen distinto', () => {
    const s = { access_token: 'jwt', expires_at: enSegundos(AHORA + 120_000) };
    expect(needsRefresh(s, AHORA, 60_000)).toBe(false);
    expect(needsRefresh(s, AHORA, 300_000)).toBe(true);
  });
});

describe('isSessionError', () => {
  it('reconoce lo que devuelven las edge functions cuando el token no sirve', () => {
    // Textos reales de create-user / delete-user / create-client-user.
    expect(isSessionError('Unauthorized: invalid token')).toBe(true);
    expect(isSessionError('No authorization header')).toBe(true);
    expect(isSessionError('JWT expired')).toBe(true);
  });

  it('no se queda con errores que son de la operación, no de la sesión', () => {
    // Este tiene que llegarle al usuario tal cual: es accionable.
    expect(isSessionError('Ya existe un usuario registrado con ese correo.')).toBe(false);
    expect(isSessionError('Forbidden: admin role required')).toBe(false);
    expect(isSessionError('Email and password are required')).toBe(false);
  });
});

describe('SESSION_EXPIRED_MESSAGE', () => {
  it('dice qué hacer, no cómo se llama la falla', () => {
    expect(SESSION_EXPIRED_MESSAGE).toMatch(/sesión/i);
    expect(SESSION_EXPIRED_MESSAGE).toMatch(/volvé a entrar/i);
    expect(SESSION_EXPIRED_MESSAGE).not.toMatch(/token/i);
  });
});
