import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ToastService } from './toast.service';

// Avisos rápidos (Estados.dc.html): pilha no canto inferior direito, cada um
// um .panel com texto e botão de texto "Fechar". Erro ganha borda var(--bad). Sem ícones.
@Component({
  selector: 'app-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="stack" aria-live="polite">
      @for (t of toast.toasts(); track t.id) {
        <div class="panel item" [class.err]="t.kind === 'error'" role="status">
          <span [class.up]="t.kind === 'error'">{{ t.message }}</span>
          <button type="button" class="btn btnQ close" (click)="toast.dismiss(t.id)">Fechar</button>
        </div>
      }
    </div>
  `,
  styles: [`
    .stack { position: fixed; right: 16px; bottom: 16px; z-index: 9999; display: flex; flex-direction: column; gap: 8px; width: min(92vw, 380px); }
    .item { padding: 10px 14px; display: flex; gap: 12px; align-items: center; box-shadow: 0 8px 24px rgba(0, 0, 0, .18); }
    .item > span { flex: 1; min-width: 0; }
    .err { border-color: var(--bad); }
    .close { margin-left: auto; min-height: 32px; flex: none; }
  `],
})
export class ToastComponent {
  toast = inject(ToastService);
}
