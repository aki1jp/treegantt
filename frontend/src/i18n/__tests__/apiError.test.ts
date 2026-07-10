// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiError, apiFetch } from '../../utils/api';
import { apiErrorMessage } from '../apiError';

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(body: unknown, ok = true, status = ok ? 200 : 400): Response {
  return { ok, status, json: async () => body } as Response;
}

describe('ApiError', () => {
  it('code を保持する', () => {
    const err = new ApiError('見つかりません', 'NOT_FOUND');
    expect(err.message).toBe('見つかりません');
    expect(err.code).toBe('NOT_FOUND');
    expect(err.name).toBe('ApiError');
    expect(err).toBeInstanceOf(Error);
  });

  it('code なしでも生成できる', () => {
    const err = new ApiError('unknown error');
    expect(err.code).toBeUndefined();
  });
});

describe('apiFetch', () => {
  it('body.code がある失敗レスポンスで ApiError を code 付きで投げる', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      jsonResponse({ error: 'Circular dependency detected', code: 'DEP_CYCLE_DETECTED' }, false, 400)));

    await expect(apiFetch('/tasks/1')).rejects.toMatchObject({
      message: 'Circular dependency detected',
      code: 'DEP_CYCLE_DETECTED',
    });
  });

  it('body.code がない失敗レスポンスでも ApiError を投げる（code は undefined）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ error: 'boom' }, false, 500)));

    let caught: unknown;
    try {
      await apiFetch('/tasks/1');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBeUndefined();
    expect((caught as ApiError).message).toBe('boom');
  });
});

describe('apiErrorMessage', () => {
  it('既知の code (ja) を翻訳する', () => {
    const err = new ApiError('Circular dependency detected', 'DEP_CYCLE_DETECTED');
    const msg = apiErrorMessage(err, 'ja');
    expect(msg).not.toBe('Circular dependency detected');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('既知の code (en) を翻訳する', () => {
    const err = new ApiError('Circular dependency detected', 'DEP_CYCLE_DETECTED');
    const msg = apiErrorMessage(err, 'en');
    expect(msg.length).toBeGreaterThan(0);
  });

  it('未知の code は元の message にフォールバックする', () => {
    const err = new ApiError('Something odd happened', 'SOME_UNKNOWN_CODE');
    expect(apiErrorMessage(err, 'ja')).toBe('Something odd happened');
    expect(apiErrorMessage(err, 'en')).toBe('Something odd happened');
  });

  it('code なしは元の message にフォールバックする', () => {
    const err = new ApiError('plain error');
    expect(apiErrorMessage(err, 'ja')).toBe('plain error');
  });

  it('ApiError でない Error も message にフォールバックする', () => {
    const err = new Error('generic failure');
    expect(apiErrorMessage(err, 'ja')).toBe('generic failure');
  });
});
