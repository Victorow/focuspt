import {
  Component, inject, OnInit, signal, ViewChild, ElementRef, AfterViewInit, NgZone
} from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { SupabaseService } from './supabase.service';
import {
  LGPD_TERM_TEXT, LGPD_TERM_VERSION,
  extractBase64FromDataUrl, isDataUrlSignatureEmpty,
  formatLgpdDate,
} from './lgpd-utils';
import { environment } from '../environments/environment';

@Component({
  selector: 'app-lgpd-sign',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="crumbs">
      <a routerLink="/alunos" class="k">Alunos</a><span class="k">›</span>
      <a [routerLink]="['/alunos', studentId()]" class="k">{{ studentName() || 'Aluno' }}</a><span class="k">›</span>
      <span>LGPD</span>
    </div>

    <div class="pad narrow">
      <div class="headLine">
        <h1 class="big">Consentimento LGPD@if (studentName()) { · {{ studentName() }}}</h1>
        <span class="k">termo v{{ termVersion }} · Lei 13.709/2018</span>
      </div>

      @if (alreadySigned()) {
        <section class="panel">
          <div class="ph"><span>Termo já assinado</span><span class="tag tagOk">LGPD assinado</span></div>
          <div class="body stack">
            <div class="nt">Assinado em {{ signedAt() }} · termo v{{ termVersion }}. Para revogar ou corrigir, fale com o personal.</div>
            @if (signatureUrl()) {
              <img class="sig" [src]="signatureUrl()" alt="Assinatura registrada do aluno" />
            }
            <div><a class="btn" [routerLink]="['/alunos', studentId()]">Voltar ao perfil</a></div>
          </div>
        </section>
      } @else {
        <div class="k">Entregue o aparelho ao aluno. Ele lê o termo e assina com o dedo ou o mouse.</div>

        <section class="panel">
          <div class="ph"><span>Termo de consentimento para tratamento de dados pessoais</span><span class="k">role até o fim</span></div>
          <div class="term" tabindex="0">{{ termText }}</div>
        </section>

        <section class="panel">
          <div class="ph"><span>Assinatura</span><button type="button" class="btn" (click)="clearSignature()">Limpar</button></div>
          <div class="body stack">
            <div class="padBox" [class.padOn]="isDrawing()">
              <div class="base" aria-hidden="true"></div>
              @if (!hasSigned()) {
                <span class="k hint">Assine sobre a linha</span>
              }
              <canvas #signatureCanvas width="700" height="200" aria-label="Área de assinatura"
                      (mousedown)="startDraw($event)"
                      (mousemove)="draw($event)"
                      (mouseup)="stopDraw()"
                      (mouseleave)="stopDraw()"
                      (touchstart)="startDrawTouch($event)"
                      (touchmove)="drawTouch($event)"
                      (touchend)="stopDraw()">
              </canvas>
            </div>

            <label class="chk">
              <input type="checkbox" [checked]="agreed()" (change)="agreed.set($any($event.target).checked)" />
              Li o termo e concordo com o tratamento dos meus dados para as finalidades descritas.
            </label>

            @if (errorMessage()) {
              <div class="k up" role="alert">{{ errorMessage() }}</div>
            }

            <div class="foot">
              <a class="btn" [routerLink]="['/alunos', studentId()]">Agora não</a>
              <button type="button" class="btn btnP" (click)="confirmSignature()" [disabled]="!hasSigned() || !agreed() || isSubmitting()">
                {{ isSubmitting() ? 'Registrando…' : 'Confirmar assinatura' }}
              </button>
            </div>
          </div>
        </section>
      }
    </div>
  `,
  styles: [`
    .crumbs a.k { color: var(--tx2); }
    .pad.narrow { max-width: 1000px; }
    .headLine { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .headLine h1 { margin: 0; }
    .body { padding: 14px; }
    .stack { display: flex; flex-direction: column; gap: 12px; }
    .term { padding: 14px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; }
    .term:focus-visible { outline: 2px solid var(--focus); outline-offset: -2px; }
    /* Papel da assinatura: sempre claro (a imagem gravada é a mesma do PDF, que é sempre claro). */
    .padBox { position: relative; height: 200px; border: 1px solid var(--bd2); border-radius: 5px; background: #FFFFFF; overflow: hidden; --tx2: #6B6C70; }
    .padOn { border-color: var(--focus); }
    .padBox canvas { position: relative; display: block; width: 100%; height: 200px; touch-action: none; cursor: crosshair; }
    .base { position: absolute; left: 24px; right: 24px; bottom: 48px; height: 1px; background: var(--tx2); }
    .hint { position: absolute; left: 24px; bottom: 24px; pointer-events: none; }
    .sig { max-height: 120px; max-width: 100%; background: #FFFFFF; border: 1px solid var(--bd2); border-radius: 5px; padding: 8px; object-fit: contain; }
    .foot { display: flex; justify-content: flex-end; gap: 8px; }
    @media (max-width: 720px) {
      .foot { flex-direction: column-reverse; }
      .foot .btn { width: 100%; }
    }
  `],
})
export class LgpdSignComponent implements OnInit, AfterViewInit {
  @ViewChild('signatureCanvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private supa = inject(SupabaseService);
  private zone = inject(NgZone);

  termText = LGPD_TERM_TEXT;
  termVersion = LGPD_TERM_VERSION;

  studentId = signal('');
  studentName = signal('');
  alreadySigned = signal(false);
  signedAt = signal('');
  signatureUrl = signal('');
  hasSigned = signal(false);
  agreed = signal(false);
  isDrawing = signal(false);
  isSubmitting = signal(false);
  errorMessage = signal('');

  private ctx: CanvasRenderingContext2D | null = null;

  ngOnInit() {
    this.route.params.subscribe(p => {
      const id = p['id'];
      if (id) {
        this.studentId.set(id);
        this.checkExistingSignature(id);
        this.loadStudentName(id);
      }
    });
  }

  ngAfterViewInit() {
    this.initCanvas();
  }

  private initCanvas() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) return;
    this.ctx.strokeStyle = '#1A1B1E'; // tinta escura sobre o papel claro
    this.ctx.lineWidth = 2.5;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
  }

  private async loadStudentName(id: string) {
    const { data: { session } } = await this.supa.client.auth.getSession();
    if (!session) return;
    const { data } = await this.supa.client
      .from('alunos').select('name').eq('id', id).single();
    if (data) this.studentName.set(data.name);
  }

  private async checkExistingSignature(alunoId: string) {
    try {
      const { data: { session } } = await this.supa.client.auth.getSession();
      if (!session) return;
      const res = await fetch(
        `${environment.functionsUrl}/lgpd-sign/${alunoId}`,
        { headers: { 'Authorization': `Bearer ${session.access_token}`, 'apikey': environment.supabaseAnonKey } }
      );
      const json = await res.json();
      if (json.signed) {
        this.alreadySigned.set(true);
        this.signedAt.set(formatLgpdDate(new Date(json.signed_at)));
        this.signatureUrl.set(json.signature_url ?? '');
      }
    } catch { /* não bloqueia */ }
  }

  // ---- Canvas drawing ----

  private getPos(e: MouseEvent): { x: number; y: number } {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleX = this.canvasRef.nativeElement.width / rect.width;
    const scaleY = this.canvasRef.nativeElement.height / rect.height;
    return { x: (e.clientX - rect.left) * scaleX, y: (e.clientY - rect.top) * scaleY };
  }

  private getTouchPos(e: TouchEvent): { x: number; y: number } {
    const rect = this.canvasRef.nativeElement.getBoundingClientRect();
    const scaleX = this.canvasRef.nativeElement.width / rect.width;
    const scaleY = this.canvasRef.nativeElement.height / rect.height;
    const t = e.touches[0];
    return { x: (t.clientX - rect.left) * scaleX, y: (t.clientY - rect.top) * scaleY };
  }

  startDraw(e: MouseEvent) {
    if (!this.ctx) return;
    const { x, y } = this.getPos(e);
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.isDrawing.set(true);
  }

  draw(e: MouseEvent) {
    if (!this.isDrawing() || !this.ctx) return;
    const { x, y } = this.getPos(e);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.hasSigned.set(true);
  }

  startDrawTouch(e: TouchEvent) {
    e.preventDefault();
    if (!this.ctx) return;
    const { x, y } = this.getTouchPos(e);
    this.ctx.beginPath();
    this.ctx.moveTo(x, y);
    this.isDrawing.set(true);
  }

  drawTouch(e: TouchEvent) {
    e.preventDefault();
    if (!this.isDrawing() || !this.ctx) return;
    const { x, y } = this.getTouchPos(e);
    this.ctx.lineTo(x, y);
    this.ctx.stroke();
    this.hasSigned.set(true);
  }

  stopDraw() {
    this.isDrawing.set(false);
    if (this.ctx) this.ctx.beginPath();
  }

  clearSignature() {
    if (!this.ctx || !this.canvasRef) return;
    const c = this.canvasRef.nativeElement;
    this.ctx.clearRect(0, 0, c.width, c.height);
    this.hasSigned.set(false);
    this.errorMessage.set('');
  }

  async confirmSignature() {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    if (!this.agreed()) {
      this.errorMessage.set('Marque a caixa de concordância para confirmar.');
      return;
    }

    const dataUrl = canvas.toDataURL('image/png');
    if (isDataUrlSignatureEmpty(dataUrl)) {
      this.errorMessage.set('A assinatura está em branco. Assine sobre a linha.');
      return;
    }

    const base64 = extractBase64FromDataUrl(dataUrl);
    this.isSubmitting.set(true);
    this.errorMessage.set('');

    try {
      const { data: { session } } = await this.supa.client.auth.getSession();
      if (!session) throw new Error('Sessão expirada. Entre de novo.');

      const res = await fetch(`${environment.functionsUrl}/lgpd-sign`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': environment.supabaseAnonKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ aluno_id: this.studentId(), signature_base64: base64 }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'Não foi possível salvar a assinatura.');

      this.zone.run(() => {
        this.router.navigate(['/alunos', this.studentId()]);
      });
    } catch (err) {
      this.errorMessage.set(err instanceof Error ? err.message : 'Não foi possível salvar. Verifique a conexão.');
      this.isSubmitting.set(false);
    }
  }
}
