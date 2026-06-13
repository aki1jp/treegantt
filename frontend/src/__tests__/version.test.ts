import { describe, it, expect } from 'vitest';
import { FRONTEND_VERSION } from '../version';
import pkg from '../../package.json';

describe('FRONTEND_VERSION', () => {
  it('package.json の version と一致する', () => {
    expect(FRONTEND_VERSION).toBe((pkg as { version: string }).version);
  });
  it('非空の文字列である', () => {
    expect(typeof FRONTEND_VERSION).toBe('string');
    expect(FRONTEND_VERSION.length).toBeGreaterThan(0);
  });
});
