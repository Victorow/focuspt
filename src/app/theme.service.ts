import { Injectable, signal } from '@angular/core';
import { ThemeMode, THEME_STORAGE_KEY, parseThemeMode, themeAttribute } from './theme-utils';

/**
 * Tema do app: 'claro' | 'escuro' | 'auto' (segue o aparelho).
 * Persistido em localStorage ('fpt-theme') e aplicado como `data-theme` em <html>;
 * os tokens em styles.css reagem ao atributo.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly mode = signal<ThemeMode>('auto');

  constructor() {
    this.mode.set(parseThemeMode(this.read()));
    this.apply(this.mode());
  }

  set(mode: ThemeMode) {
    this.mode.set(mode);
    this.apply(mode);
    try { localStorage.setItem(THEME_STORAGE_KEY, mode); } catch { /* storage indisponível */ }
  }

  private read(): string | null {
    try { return typeof localStorage === 'undefined' ? null : localStorage.getItem(THEME_STORAGE_KEY); }
    catch { return null; }
  }

  private apply(mode: ThemeMode) {
    if (typeof document === 'undefined') return;
    const attr = themeAttribute(mode);
    const html = document.documentElement;
    if (attr) html.setAttribute('data-theme', attr);
    else html.removeAttribute('data-theme');
  }
}
