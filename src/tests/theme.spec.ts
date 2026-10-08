import { describe, it, expect } from 'vitest';
import { themeAttribute, parseThemeMode, THEME_MODES, THEME_STORAGE_KEY } from '../app/theme-utils';

describe('themeAttribute', () => {
  it('claro força o tema claro', () => {
    expect(themeAttribute('claro')).toBe('light');
  });

  it('escuro força o tema escuro', () => {
    expect(themeAttribute('escuro')).toBe('dark');
  });

  it('auto remove o atributo e deixa o aparelho decidir', () => {
    expect(themeAttribute('auto')).toBeNull();
  });

  it('cobre todos os modos expostos no menu', () => {
    for (const m of THEME_MODES) {
      expect([null, 'light', 'dark']).toContain(themeAttribute(m));
    }
  });
});

describe('parseThemeMode', () => {
  it('aceita os valores válidos', () => {
    expect(parseThemeMode('claro')).toBe('claro');
    expect(parseThemeMode('escuro')).toBe('escuro');
    expect(parseThemeMode('auto')).toBe('auto');
  });

  it('qualquer outro valor vira auto', () => {
    expect(parseThemeMode(null)).toBe('auto');
    expect(parseThemeMode(undefined)).toBe('auto');
    expect(parseThemeMode('dark')).toBe('auto');
    expect(parseThemeMode('')).toBe('auto');
  });

  it('chave de armazenamento é estável', () => {
    expect(THEME_STORAGE_KEY).toBe('fpt-theme');
  });
});
