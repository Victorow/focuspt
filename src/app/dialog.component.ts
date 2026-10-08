import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { DialogService } from './dialog.service';

// Diálogo do sistema visual (Estados.dc.html): painel com sombra, título 15/600,
// corpo em .nt e botões no rodapé. Perigo usa .btnD; o resto, .btnP. Sem ícones.
@Component({
  selector: 'app-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (dialog.state(); as d) {
      <div class="scrim" (click)="d.kind === 'alert' ? dialog.resolve(false) : null">
        <div class="panel box" role="dialog" aria-modal="true" aria-labelledby="dlg-title" (click)="$event.stopPropagation()">
          <div id="dlg-title" class="title">{{ d.title }}</div>
          <div class="nt body">{{ d.message }}</div>
          <div class="foot">
            @if (d.kind === 'confirm') {
              <button type="button" class="btn" (click)="dialog.resolve(false)">{{ d.cancelText }}</button>
            }
            <button type="button" class="btn" [class.btnD]="isDanger(d.tone)" [class.btnP]="!isDanger(d.tone)"
                    (click)="dialog.resolve(true)">{{ d.confirmText }}</button>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .scrim { position: fixed; inset: 0; z-index: 10000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, .45); }
    .box { width: 100%; max-width: 420px; padding: 20px; display: flex; flex-direction: column; gap: 12px; box-shadow: 0 12px 32px rgba(0, 0, 0, .25); }
    .title { font-weight: 600; font-size: 15px; line-height: 20px; }
    .body { white-space: pre-line; }
    .foot { display: flex; justify-content: flex-end; gap: 8px; padding-top: 4px; flex-wrap: wrap; }
  `],
})
export class DialogComponent {
  dialog = inject(DialogService);

  isDanger(tone: string): boolean {
    return tone === 'danger' || tone === 'error';
  }
}
