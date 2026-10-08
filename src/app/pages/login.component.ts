import { Component, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { SupabaseService } from '../supabase.service';

// Layout: fpt-design/project/Login.dc.html (tela dividida; à direita uma pilha
// 3D com o comparativo de um aluno que inclina com o mouse).
const ROWS: ReadonlyArray<{ l: string; v: string; d: string; c: 'nt' | 'dn' | 'up' }> = [
  { l: 'Peso', v: '49,2 kg', d: '−0,1', c: 'nt' },
  { l: 'Gordura corporal', v: '23,7 %', d: '−3,4', c: 'dn' },
  { l: 'Músculo esquelético', v: '31,0 %', d: '+1,4', c: 'dn' },
  { l: 'Massa magra', v: '37,5 kg', d: '+1,6', c: 'dn' },
  { l: 'Cintura', v: '64,0 cm', d: '−0,5', c: 'dn' },
  { l: 'Gordura visceral', v: '3', d: '−1', c: 'dn' },
  { l: 'Somatório 7 dobras', v: '148 mm', d: '+14', c: 'up' },
];

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div class="lg">
      <section class="lgL">
        <a href="/" class="brand">
          <span class="mk" aria-hidden="true"><i class="r"></i><i class="b"></i><i class="t1"></i><i class="t2"></i><i class="c"></i></span>
          <span class="wm">FocusPT</span>
        </a>

        <div>
          <h1 class="big">Entrar</h1>
          <div class="k">Avaliação física, evolução e relatório num só lugar.</div>
        </div>

        <form class="form" [formGroup]="loginForm" (ngSubmit)="onSubmit()" novalidate>
          <div>
            <label class="lb" for="email">E-mail</label>
            <input id="email" class="f tall" type="email" formControlName="email" autocomplete="email" placeholder="exemplo@focuspt.com" />
            @if (loginForm.get('email')?.touched && loginForm.get('email')?.invalid) {
              <div class="k up msg">Insira um e-mail válido.</div>
            }
          </div>

          <div>
            <label class="lb" for="senha">Senha</label>
            <div class="pw">
              <input id="senha" class="f tall" [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="current-password" />
              <button type="button" class="btn btnQ toggle" (click)="togglePasswordVisibility()" [attr.aria-pressed]="showPassword()">
                {{ showPassword() ? 'Ocultar' : 'Mostrar' }}
              </button>
            </div>
            @if (loginForm.get('password')?.touched && loginForm.get('password')?.invalid) {
              <div class="k up msg">A senha deve ter pelo menos 6 caracteres.</div>
            }
          </div>

          @if (errorMessage()) {
            <div class="tag tagW err" role="alert">{{ errorMessage() }}</div>
          }

          <button type="submit" class="btn btnP tall" [disabled]="loginForm.invalid || isLoading()">
            {{ isLoading() ? 'Autenticando...' : 'Entrar' }}
          </button>
        </form>

        <div class="k">Esqueceu a senha? Fale com o administrador.</div>
        <div class="k foot">Dados hospedados no Brasil · LGPD · <a href="/">Conhecer o FocusPT</a></div>
      </section>

      <section class="lgR" aria-label="Exemplo de evolução de aluno">
        <div class="grid3d" aria-hidden="true"></div>
        <div class="lgRIn">
          <div class="rise" style="animation-delay:.1s">
            <div class="k dim">{{ reducedMotion ? 'Exemplo' : 'Passe o mouse' }}</div>
            <div class="h2">O que seu aluno vê depois de 105 dias.</div>
          </div>

          <div class="stage" (mousemove)="onMove($event)" (mouseleave)="onLeave()">
            <div class="float">
              <div class="card3" [style.transform]="tilt()">
                <div class="layer panel l1">
                  <div class="ph"><span>Marina C. R. · 03/10 vs 20/06</span><span class="k">105 dias</span></div>
                  <div class="rows">
                    @for (r of rows; track r.l; let i = $index) {
                      <div class="rowIn" [style.animation-delay]="(0.3 + i * 0.16) + 's'">
                        <span>{{ r.l }}</span><span>{{ r.v }} <span [class]="r.c" class="sm">{{ r.d }}</span></span>
                      </div>
                    }
                  </div>
                </div>
                <div class="layer kpi l2">
                  <div><div class="k">Gordura</div><div class="big">23,7 %</div><div class="dn sm">−3,4 · normal</div></div>
                  <div><div class="k">Massa magra</div><div class="big">37,5 kg</div><div class="dn sm">+1,6</div></div>
                </div>
                <div class="layer panel l3"><div class="fig"><div class="body"><div class="sil"></div><div class="head"></div></div><span class="lbl">21/06 · início</span></div><div class="fig after"><div class="body"><div class="sil"></div><div class="head"></div></div><span class="lbl">05/10 · 105 dias</span></div></div>
                <div class="layer l4" aria-hidden="true"><span class="tag">Fotos pareadas por sessão</span></div>
              </div>
            </div>
          </div>

          <div class="rise k dim" style="animation-delay:1.6s">Omron HBF-514C · Jackson &amp; Pollock 7 · PDF em um clique</div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .lg { min-height: 100vh; display: grid; grid-template-columns: minmax(360px, 480px) 1fr; }
    .lgL { display: flex; flex-direction: column; justify-content: center; padding: 48px 56px; gap: 20px; background: var(--sf); border-right: 1px solid var(--bd); }
    .brand { display: flex; align-items: center; gap: 10px; color: var(--tx); width: fit-content; }
    .brand:hover { text-decoration: none; }
    .wm { font-weight: 600; letter-spacing: -.02em; font-size: 16px; }
    h1.big { margin: 0; }
    .form { display: flex; flex-direction: column; gap: 14px; }
    .tall { min-height: 44px; }
    .pw { position: relative; }
    .pw .f { padding-right: 84px; }
    .toggle { position: absolute; right: 0; top: 0; min-height: 44px; font-size: 12px; }
    .msg { margin-top: 4px; }
    .err { padding: 8px 10px; border-radius: 5px; white-space: normal; }
    .foot { margin-top: auto; }

    /* Símbolo (fpt-design Logo.dc.html), segue o tema pelos tokens */
    .mk { position: relative; display: inline-block; width: 32px; height: 32px; border-radius: 8px; background: var(--mkbg, var(--pb)); flex: none; }
    .mk i { position: absolute; display: block; }
    .mk .r { inset: 22.5%; border: 2.5px solid var(--mkfg, var(--pt)); border-radius: 50%; }
    .mk .b { left: 15%; right: 15%; top: 50%; height: 3px; margin-top: -1.5px; background: var(--mkfg, var(--pt)); border-radius: 2px; }
    .mk .t1, .mk .t2 { top: 50%; width: 3px; height: 9px; margin-top: -4.5px; background: var(--mkfg, var(--pt)); border-radius: 1px; }
    .mk .t1 { left: 15%; } .mk .t2 { right: 15%; }
    .mk .c { left: 50%; top: 50%; width: 6px; height: 6px; margin: -3px 0 0 -3px; border-radius: 50%; background: var(--mkbg, var(--pb)); box-shadow: 0 0 0 2.5px var(--mkfg, var(--pt)); }

    /* Palco escuro (sempre escuro, independe do tema) */
    .lgR { position: relative; overflow: hidden; background: #1A1B1E; color: #E6E6E3;
      --sf: #202124; --sf2: #242529; --bd: #2A2B2F; --bd2: #3A3B40; --tx: #E6E6E3; --tx2: #8A8B90; --ok: #86C7A3; --bad: #E39A86;
      --ref: #2E2F34; --refok: #3E5A7E; --hov: #242529; --ph: #2E2F34; --pb: #E6E6E3; --pt: #1A1B1E;
      display: flex; align-items: center; justify-content: center; padding: 48px; }
    .lgR::before { content: ""; position: absolute; inset: -40%; background: radial-gradient(ellipse at 30% 30%, rgba(143,180,232,.10), transparent 55%); pointer-events: none; }
    .lgRIn { position: relative; display: flex; flex-direction: column; gap: 28px; width: 100%; max-width: 560px; }
    .dim { color: #8A8B90; }
    .h2 { font-size: 20px; font-weight: 600; letter-spacing: -.01em; }
    .sm { font-size: 12px; }
    .grid3d { position: absolute; inset: 0; background-image: linear-gradient(rgba(230,230,227,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(230,230,227,.05) 1px, transparent 1px); background-size: 40px 40px; transform: perspective(900px) rotateX(62deg) translateY(30%) scale(1.6); transform-origin: 50% 100%; -webkit-mask-image: linear-gradient(to top, rgba(0,0,0,.9), transparent 70%); mask-image: linear-gradient(to top, rgba(0,0,0,.9), transparent 70%); pointer-events: none; }

    /* Pilha 3D (fpt-design lp.py TILT_CSS + stack3d(480)) */
    .stage { perspective: 1400px; perspective-origin: 50% 40%; width: 480px; height: 452px; position: relative; margin: 0 auto; max-width: 100%; }
    .float { position: absolute; inset: 0; transform-style: preserve-3d; animation: flt 7s ease-in-out infinite; }
    @keyframes flt { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
    .card3 { position: absolute; inset: 0; transform-style: preserve-3d; transition: transform .35s ease-out; will-change: transform; }
    .layer { position: absolute; transform-style: preserve-3d; }
    .l1 { left: 0; top: 40px; width: 374px; transform: translateZ(0); box-shadow: 0 30px 60px rgba(0,0,0,.35); }
    .rows { padding: 4px 14px; }
    .rowIn { display: flex; justify-content: space-between; gap: 12px; padding: 7px 0; border-bottom: 1px solid var(--bd); opacity: 0; transform: translateY(6px); animation: rowIn .5s ease-out forwards; }
    @keyframes rowIn { to { opacity: 1; transform: none; } }
    .l2 { left: 172px; top: 0; width: 307px; grid-template-columns: 1fr 1fr; transform: translateZ(70px); box-shadow: 0 24px 50px rgba(0,0,0,.35); }
    .l3 { left: 249px; top: 249px; width: 220px; padding: 10px; display: flex; gap: 8px; transform: translateZ(130px); box-shadow: 0 24px 50px rgba(0,0,0,.4); }
    .l3 .ph2 { flex: 1; }
    .fig{position:relative;flex:1;aspect-ratio:3/4;border-radius:3px;overflow:hidden;background:linear-gradient(180deg,var(--sf2),var(--bd))}.fig .body{position:absolute;left:18%;right:18%;top:9%;bottom:14%;transform-origin:50% 100%}.fig .sil{position:absolute;inset:0;background:var(--tx2);opacity:.55;clip-path:polygon(55% 13.04%,56% 16.09%,75% 18.7%,81% 23.91%,84% 36.96%,86% 50%,85% 54.35%,81% 54.78%,79% 50%,75% 36.96%,73% 28.26%,70% 26.52%,70% 32.61%,66% 43.48%,73% 54.35%,74% 61.3%,73% 71.74%,69% 80.43%,70% 86.96%,64% 95.65%,68% 98.26%,56% 98.26%,56% 95.65%,55% 86.96%,55% 80.43%,53% 69.57%,50% 63.48%,47% 69.57%,45% 80.43%,45% 86.96%,44% 95.65%,44% 98.26%,32% 98.26%,36% 95.65%,30% 86.96%,31% 80.43%,27% 71.74%,26% 61.3%,27% 54.35%,34% 43.48%,30% 32.61%,30% 26.52%,27% 28.26%,25% 36.96%,21% 50%,19% 54.78%,15% 54.35%,14% 50%,16% 36.96%,19% 23.91%,25% 18.7%,44% 16.09%,45% 13.04%)}.fig .head{position:absolute;left:39%;top:2.96%;width:22%;height:9.57%;border-radius:999px;background:var(--tx2);opacity:.55}.fig .lbl{position:absolute;left:0;right:0;bottom:0;padding:4px 6px;font-size:11px;line-height:14px;color:var(--tx);background:rgba(0,0,0,.28)}.fig.after .body{transform:scaleX(.9)}.fig.after .sil,.fig.after .head{opacity:.85}
    .l3 .after { background: var(--refok); }
    .l4 { left: 249px; top: 423px; transform: translateZ(130px); }
    .l4 .tag { background: var(--sf); }
    .rise { opacity: 0; transform: translateY(18px); animation: rise .7s ease-out forwards; }
    @keyframes rise { to { opacity: 1; transform: none; } }
    @media (max-width: 1100px) { .stage { transform: scale(.8); transform-origin: top center; height: 340px; } }
    /* Depois das regras base para vencer a cascata */
    @media (max-width: 900px) { .lg { grid-template-columns: 1fr; } .lgR { display: none; } }
    @media (max-width: 480px) { .lgL { padding: 32px 20px; } }
    @media (prefers-reduced-motion: reduce) {
      .float, .rowIn, .rise { animation: none; opacity: 1; transform: none; }
      .card3 { transition: none; }
    }
  `],
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private supa = inject(SupabaseService);

  readonly rows = ROWS;
  readonly reducedMotion =
    typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  showPassword = signal(false);
  isLoading = signal(false);
  errorMessage = signal('');

  // Inclinação da pilha: repouso em rotateX(8) rotateY(-16), ±10/±14 com o mouse.
  private rx = signal(0);
  private ry = signal(0);
  tilt = computed(() =>
    this.reducedMotion ? 'rotateX(8deg) rotateY(-16deg)'
      : `rotateX(${8 + this.rx()}deg) rotateY(${-16 + this.ry()}deg)`);

  onMove(e: MouseEvent) {
    if (this.reducedMotion) return;
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    this.rx.set(-y * 10);
    this.ry.set(x * 14);
  }

  onLeave() {
    this.rx.set(0);
    this.ry.set(0);
  }

  togglePasswordVisibility() {
    this.showPassword.update(v => !v);
  }

  async onSubmit() {
    if (this.loginForm.invalid) return;
    this.isLoading.set(true);
    this.errorMessage.set('');

    const { email, password } = this.loginForm.value;
    const { error } = await this.supa.signIn(email, password);

    if (error) {
      this.errorMessage.set('E-mail ou senha inválidos.');
    } else {
      this.router.navigate(['/']);
    }
    this.isLoading.set(false);
  }
}
