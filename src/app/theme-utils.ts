// Parte pura do tema (sem DOM) — testada em src/tests/theme.spec.ts.

export type ThemeMode = 'auto' | 'claro' | 'escuro';

export const THEME_STORAGE_KEY = 'fpt-theme';

export const THEME_MODES: readonly ThemeMode[] = ['claro', 'escuro', 'auto'];

/** Valor do atributo `data-theme` em <html>; `null` remove o atributo (segue o aparelho). */
export function themeAttribute(mode: ThemeMode): 'light' | 'dark' | null {
  switch (mode) {
    case 'claro': return 'light';
    case 'escuro': return 'dark';
    default: return null;
  }
}

/** Normaliza o valor lido do localStorage; qualquer lixo vira 'auto'. */
export function parseThemeMode(raw: string | null | undefined): ThemeMode {
  return raw === 'claro' || raw === 'escuro' ? raw : 'auto';
}
