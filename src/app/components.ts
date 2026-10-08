import { Component, inject, OnInit, signal, computed, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators, AbstractControl } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DataService, Student, StudentSummary, TrashedStudent, Assessment, DashboardStats, PhotoCategory, Photo } from './data';
import { SupabaseService } from './supabase.service';
import { extractBase64FromDataUrl } from './lgpd-utils';
import { generateAssessmentPDF, PdfPhoto } from './pdf-report';
import { ToastService } from './toast.service';
import { DialogService } from './dialog.service';
import { shouldConvertCmToMm, cmToMm, fieldRangeHint, toOptionalNumber, toOptionalBoolean, fatClassificationTone } from './assessment-utils';
import { buildAttentionGroups, countRecentlyAssessed, AttentionGroups } from './attention-utils';
import { todayYmd } from './date-utils';
import { selectRecentPhotos } from './media-utils';

// ==========================================
// PHOTO CATEGORY LABEL
// ==========================================
export function categoryLabel(cat: string): string {
  const MAP: Record<string, string> = {
    FRENTE: 'Frente',
    LADO_DIREITO: 'Lado Direito',
    LADO_ESQUERDO: 'Lado Esquerdo',
    COSTAS: 'Costas',
    PERFIL: 'Lateral',
  };
  return MAP[cat] ?? cat;
}

// ==========================================
// AUTH UTILITY — usa Supabase session real
// ==========================================
export function getTrainerToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    // Supabase v2 persiste a sessão com a chave: sb-{projectRef}-auth-token
    // Tenta múltiplos padrões para robustez a mudanças de versão
    const keys = Object.keys(localStorage);
    const sessionKey = keys.find(
      k => (k.startsWith('sb-') && k.endsWith('-auth-token')) ||
           k.includes('supabase.auth.token')
    );
    if (!sessionKey) return null;
    const raw = localStorage.getItem(sessionKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Supabase v2: { access_token, refresh_token, ... }
    // Supabase v2 novo formato: { session: { access_token, ... } }
    return parsed?.access_token ?? parsed?.session?.access_token ?? null;
  } catch {
    return null;
  }
}

/** Nome do personal trainer logado (lido da sessão Supabase no localStorage). */
export function getTrainerName(): string {
  if (typeof window === 'undefined') return 'Personal Trainer';
  try {
    const keys = Object.keys(localStorage);
    const sessionKey = keys.find(
      k => (k.startsWith('sb-') && k.endsWith('-auth-token')) ||
           k.includes('supabase.auth.token')
    );
    if (!sessionKey) return 'Personal Trainer';
    const raw = localStorage.getItem(sessionKey);
    if (!raw) return 'Personal Trainer';
    const parsed = JSON.parse(raw);
    const user = parsed?.user ?? parsed?.session?.user;
    return user?.user_metadata?.name ?? user?.email?.split('@')[0] ?? 'Personal Trainer';
  } catch {
    return 'Personal Trainer';
  }
}

// ==========================================
// 1. LOGIN COMPONENT (Tela de Autenticação)
// ==========================================
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="min-h-screen w-full bg-[#0A0A0B] flex items-center justify-center p-4">
      <div class="w-full max-w-md bg-[#141417] border border-white/5 p-8 rounded-2xl shadow-xl space-y-6 animate-fade-in animate-duration-300">
        <!-- Brand/Logo -->
        <div class="text-center space-y-2">
          <div class="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-blue-600 shadow-lg shadow-blue-600/20 mb-2">
            <mat-icon class="text-white !text-2xl flex items-center justify-center">fitness_center</mat-icon>
          </div>
          <h1 class="text-2xl font-extrabold tracking-tight text-white font-sans">FocusPT</h1>
          <p class="text-sm text-slate-400">Dashboard Antropométrico e Gestão</p>
        </div>

        <div class="bg-blue-600/10 border border-blue-500/20 rounded-lg p-3 text-xs text-blue-300 space-y-1">
          <p class="font-bold">Acesso FocusPT</p>
          <p>Utilize seu e-mail e senha cadastrados para acessar o sistema.</p>
        </div>

        <!-- Form -->
        <form [formGroup]="loginForm" (ngSubmit)="onSubmit()" class="space-y-4">
          <div class="space-y-1">
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider">E-mail do Personal</label>
            <div class="relative">
              <mat-icon class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 !text-sm">mail</mat-icon>
              <input 
                type="email" 
                formControlName="email"
                class="w-full pl-10 pr-4 py-3 bg-[#1C1C21] border border-white/5 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none"
                placeholder="exemplo@focuspt.com"
              />
            </div>
            @if (loginForm.get('email')?.touched && loginForm.get('email')?.invalid) {
              <p class="text-xs text-red-400 mt-1">Insira um e-mail válido.</p>
            }
          </div>

          <div class="space-y-1">
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Senha Secreta</label>
            <div class="relative">
              <mat-icon class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 !text-sm">lock</mat-icon>
              <input 
                [type]="showPassword() ? 'text' : 'password'" 
                formControlName="password"
                class="w-full pl-10 pr-12 py-3 bg-[#1C1C21] border border-white/5 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none"
                placeholder="******"
              />
              <button 
                type="button" 
                (click)="togglePasswordVisibility()" 
                class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
              >
                <mat-icon class="!text-sm">{{ showPassword() ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </div>
            @if (loginForm.get('password')?.touched && loginForm.get('password')?.invalid) {
              <p class="text-xs text-red-400 mt-1">A senha deve ter pelo menos 6 caracteres.</p>
            }
          </div>

          @if (errorMessage()) {
            <div class="p-3 bg-red-500/10 border border-red-500/20 text-xs text-red-400 rounded-lg">
              {{ errorMessage() }}
            </div>
          }

          <button 
            type="submit" 
            [disabled]="loginForm.invalid || isLoading()"
            class="w-full py-3 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed text-sm font-bold text-white rounded-xl transition-all shadow-lg shadow-blue-600/10 hover:shadow-blue-600/20 flex items-center justify-center gap-2"
          >
            @if (isLoading()) {
              <div class="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              Autenticando...
            } @else {
              Entrar no Painel
              <mat-icon class="!text-sm max-h-4">chevron_right</mat-icon>
            }
          </button>
        </form>
      </div>
    </div>
  `
})
export class LoginComponent {
  private fb = inject(FormBuilder);
  private router = inject(Router);
  private supa = inject(SupabaseService);

  loginForm: FormGroup = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]]
  });

  showPassword = signal(false);
  isLoading = signal(false);
  errorMessage = signal('');

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


// ==========================================
// 2. DASHBOARD COMPONENT (Geral & Home)
// ==========================================
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Welcome Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight text-white font-sans">Bem-vindo, {{ trainerName() }}!</h1>
          <p class="text-xs text-slate-400">Painel Geral de Atendimento • {{ currentDate }}</p>
        </div>
        <div class="flex items-center gap-2">
          <a routerLink="/alunos/novo" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-all shadow-md shadow-blue-600/10">
            <mat-icon class="!text-xs">add</mat-icon>
            Novo Aluno
          </a>
        </div>
      </div>

      <!-- Stats Grid -->
      @if (loadError()) {
        <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400">{{ loadError() }}</div>
      }
      @if (stats(); as s) {
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <!-- Card Alunos Ativos -->
          <div class="bg-[#141417] p-5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Alunos Ativos</p>
              <h2 class="text-3xl font-extrabold text-white">{{ s.activeStudents }}</h2>
              @if (students()) {
                <p class="text-[10px] text-slate-400 mt-1">{{ recentlyAssessed() }} avaliado(s) nos últimos 90 dias</p>
              }
            </div>
            <div class="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-400">
              <mat-icon>people</mat-icon>
            </div>
          </div>

          <!-- Card Total Avaliações -->
          <div class="bg-[#141417] p-5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Avaliações Feitas</p>
              <h2 class="text-3xl font-extrabold text-white">{{ s.totalAssessments }}</h2>
              <p class="text-[10px] text-blue-300 mt-1">Dobras & Bioimpedância</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center text-purple-400">
              <mat-icon>analytics</mat-icon>
            </div>
          </div>

          <!-- Card Alertas de Risco -->
          <div class="bg-[#141417] p-5 rounded-2xl border border-white/5 flex items-center justify-between">
            <div>
              <p class="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Risco Visceral Alto</p>
              <h2 class="text-3xl font-extrabold text-amber-500">{{ s.visceralAlerts }}</h2>
              <p class="text-[10px] text-slate-400 mt-1">Omron visceral &ge; 10</p>
            </div>
            <div class="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center text-amber-400">
              <mat-icon>warning</mat-icon>
            </div>
          </div>
        </div>

        <!-- Pedem atenção -->
        <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-4">
          <div class="flex items-center justify-between border-b border-white/5 pb-3">
            <div class="flex items-center gap-2">
              <mat-icon class="text-amber-500">notification_important</mat-icon>
              <h3 class="text-sm font-bold text-white">Pedem atenção</h3>
            </div>
            @if (attention(); as a) {
              @if (a.studentsCount > 0) {
                <span class="text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full font-semibold">
                  {{ a.studentsCount }} aluno(s)
                </span>
              }
            }
          </div>

          @if (studentsError()) {
            <p class="text-xs text-red-400">{{ studentsError() }}</p>
          } @else if (attention(); as a) {
            @if (a.studentsCount === 0) {
              <div class="py-6 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
                <mat-icon class="text-emerald-500">task_alt</mat-icon>
                Nada pendente hoje.
              </div>
            } @else {
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                @for (g of attentionSections(a); track g.key) {
                  <div class="bg-[#1C1C21] rounded-xl p-4 space-y-3">
                    <div class="flex items-center justify-between">
                      <p class="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5" [ngClass]="g.tone">
                        <mat-icon class="!text-sm h-4 w-4">{{ g.icon }}</mat-icon>
                        {{ g.title }}
                      </p>
                      <span class="text-[10px] font-mono font-bold text-slate-400">{{ g.items.length }}</span>
                    </div>
                    @if (g.items.length === 0) {
                      <p class="text-xs text-slate-500">Nenhum aluno.</p>
                    } @else {
                      <div class="divide-y divide-white/5">
                        @for (it of (expanded()[g.key] ? g.items : g.items.slice(0, 5)); track it.studentId) {
                          <a [routerLink]="it.link" class="py-2 flex items-center justify-between gap-2 hover:bg-white/[0.02] px-1 rounded-lg transition-colors group">
                            <div class="min-w-0">
                              <p class="text-xs font-semibold text-white truncate">{{ it.name }}</p>
                              <p class="text-[10px] text-slate-400">{{ it.reason }}</p>
                            </div>
                            <mat-icon class="!text-base text-slate-600 group-hover:text-slate-300 shrink-0">chevron_right</mat-icon>
                          </a>
                        }
                      </div>
                      @if (g.items.length > 5) {
                        <button type="button" (click)="toggleExpanded(g.key)" class="text-blue-500 hover:text-blue-400 text-[10px] uppercase font-bold">
                          {{ expanded()[g.key] ? 'Mostrar menos' : 'Ver todos (' + g.items.length + ')' }}
                        </button>
                      }
                    }
                  </div>
                }
              </div>
            }
          } @else {
            <div class="py-6 text-center text-slate-500 text-xs">Carregando alunos...</div>
          }
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Coluna Agenda do Dia -->
          <div class="lg:col-span-2 bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-4">
            <div class="flex items-center justify-between gap-2 border-b border-white/5 pb-3">
              <div class="flex items-center gap-2">
                <mat-icon class="text-blue-500">schedule</mat-icon>
                <h3 class="text-sm font-bold text-white">Agenda do Dia • Atendimentos</h3>
              </div>
              <div class="flex items-center gap-3">
                <span class="text-xs bg-blue-600/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full font-semibold">
                  {{ s.todayAgenda.length }} Treinos Agendados
                </span>
                <a routerLink="/agenda" class="text-blue-500 hover:text-blue-400 text-[10px] uppercase font-bold whitespace-nowrap">Ver agenda</a>
              </div>
            </div>

            <!-- List -->
            @if (s.todayAgenda.length === 0) {
              <div class="py-6 text-center text-slate-500 text-xs">Nenhum atendimento agendado para hoje.</div>
            }
            <div class="divide-y divide-white/5">
              @for (item of s.todayAgenda; track item.id) {
                <a routerLink="/agenda" class="py-3 flex items-center justify-between hover:bg-white/[0.01] px-2 rounded-lg transition-colors">
                  <div class="flex items-center gap-4">
                    <span class="text-xs font-mono font-bold bg-[#1C1C21] text-slate-300 px-2 py-1 rounded">
                      {{ item.time.slice(0, 5) }}
                    </span>
                    <div>
                      <p class="text-sm font-semibold text-white">{{ item.studentName }}</p>
                      <p class="text-xs text-slate-400">{{ item.focus }}</p>
                    </div>
                  </div>
                  <mat-icon class="text-slate-600">chevron_right</mat-icon>
                </a>
              }
            </div>
          </div>

          <!-- Coluna Atalhos de Apoio -->
          <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 flex flex-col justify-between space-y-4">
            <div>
              <h3 class="text-sm font-bold text-white mb-2">Monitoramento Balança Omron</h3>
              <p class="text-xs text-slate-400 leading-relaxed">
                Este sistema está pré-configurado de acordo com os padrões da bioimpedância <strong class="text-slate-300">Omron HBF-514C</strong> (Massa Magra, Massa Gorda %, Metabolismo, Idade Corporal e Gordura Visceral nível 1 a 30).
              </p>
              <div class="mt-4 p-3 bg-[#1C1C21] rounded-xl space-y-2">
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                  <span class="text-xs text-slate-300">1-9 Normal</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                  <span class="text-xs text-slate-300">10-14 Alto (Atenção)</span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="w-2.5 h-2.5 rounded-full bg-red-500"></span>
                  <span class="text-xs text-slate-300">15-30 Muito Alto (Risco Elevado)</span>
                </div>
              </div>
            </div>

            <div class="pt-4 border-t border-white/5">
              <a routerLink="/alunos" class="w-full py-2.5 bg-[#1C1C21] hover:bg-[#25252B] transition-colors rounded-xl text-xs font-bold text-white flex items-center justify-center gap-2">
                <mat-icon class="!text-sm h-4">group</mat-icon>
                Gerenciar Lista de Alunos
              </a>
            </div>
          </div>
        </div>
      @} @else {
        <div class="py-12 text-center text-slate-400">
          <div class="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          Carregando estatísticas...
        </div>
      }
    </div>
  `
})
export class DashboardComponent implements OnInit {
  private dataService = inject(DataService);
  private supa = inject(SupabaseService);

  stats = signal<DashboardStats | null>(null);
  loadError = signal('');
  trainerName = signal('Personal Trainer');
  currentDate = '';

  students = signal<StudentSummary[] | null>(null);
  studentsError = signal('');
  private today = todayYmd();
  attention = computed<AttentionGroups | null>(() => {
    const list = this.students();
    return list ? buildAttentionGroups(list, this.today) : null;
  });
  recentlyAssessed = computed(() => countRecentlyAssessed(this.students() ?? [], this.today));
  expanded = signal<Record<string, boolean>>({});

  attentionSections(a: AttentionGroups) {
    return [
      { key: 'overdue', title: 'Reavaliação vencida', icon: 'event_busy', tone: 'text-blue-400', items: a.overdue },
      { key: 'lgpd', title: 'Termo LGPD pendente', icon: 'gpp_maybe', tone: 'text-amber-400', items: a.lgpdPending },
      { key: 'visceral', title: 'Gordura visceral alta', icon: 'monitor_heart', tone: 'text-red-400', items: a.visceralHigh },
    ];
  }

  toggleExpanded(key: string) {
    this.expanded.update(e => ({ ...e, [key]: !e[key] }));
  }

  ngOnInit() {
    const d = new Date();
    this.currentDate = d.toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    this.dataService.getStudents().subscribe({
      next: (res) => this.students.set(res ?? []),
      error: () => this.studentsError.set('Falha ao carregar a lista de alunos.'),
    });

    this.supa.client.auth.getSession().then(({ data }) => {
      const name = data.session?.user?.user_metadata?.['name']
        ?? data.session?.user?.email?.split('@')[0]
        ?? 'Personal Trainer';
      this.trainerName.set(name);
    });

    this.dataService.getStats().subscribe({
      next: (res) => this.stats.set(res),
      error: () => this.loadError.set('Falha ao carregar estatísticas. Verifique sua conexão e recarregue.'),
    });
  }
}


// ==========================================
// 3. STUDENTS LIST COMPONENT (Alunos)
// ==========================================
@Component({
  selector: 'app-students-list',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6">
      <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight text-white font-sans">Gestão de Alunos</h1>
          <p class="text-xs text-slate-400">Visualize, busque e gerencie todos os alunos ativos.</p>
        </div>
        <div class="flex items-center gap-2">
          <button (click)="toggleTrash()" class="px-3.5 py-2 bg-[#1C1C21] hover:bg-[#25252B] border border-white/5 rounded-xl text-xs font-bold text-slate-300 flex items-center gap-2 transition-all">
            <mat-icon class="!text-xs">delete_outline</mat-icon>
            Lixeira{{ trashedStudents().length ? ' (' + trashedStudents().length + ')' : '' }}
          </button>
          <a routerLink="/alunos/novo" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-all shadow-md shadow-blue-600/10">
            <mat-icon class="!text-xs">add</mat-icon>
            Novo Aluno
          </a>
        </div>
      </div>

      <!-- Lixeira de Alunos -->
      @if (showTrash()) {
        <div class="bg-[#141417] p-5 rounded-2xl border border-white/5 space-y-3">
          <h3 class="text-sm font-bold text-white flex items-center gap-2">
            <mat-icon class="text-slate-400 !text-sm">delete_outline</mat-icon>
            Alunos na Lixeira
          </h3>
          @if (trashedStudents().length === 0) {
            <p class="text-xs text-slate-500 py-2">Nenhum aluno na lixeira.</p>
          } @else {
            <div class="space-y-2">
              @for (std of trashedStudents(); track std.id) {
                <div class="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-xl px-4 py-2.5">
                  <div class="text-xs">
                    <span class="font-semibold text-slate-200">{{ std.name }}</span>
                    @if (std.goal) { <span class="text-slate-500"> • {{ std.goal }}</span> }
                  </div>
                  <button (click)="onRestoreStudent(std.id)" class="px-2.5 py-1 bg-emerald-600/90 hover:bg-emerald-500 transition-colors rounded-lg text-xs font-bold text-white inline-flex items-center gap-1">
                    <mat-icon class="!text-xs">restore</mat-icon>
                    Restaurar
                  </button>
                </div>
              }
            </div>
          }
        </div>
      }

      <!-- Filtros e Busca -->
      <div class="flex gap-4 bg-[#141417] p-4 rounded-2xl border border-white/5">
        <div class="relative flex-1">
          <mat-icon class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 !text-sm">search</mat-icon>
          <input 
            type="text"
            (input)="onSearch($any($event.target).value)"
            placeholder="Buscar aluno por nome, objetivo, telefone..."
            class="w-full pl-10 pr-4 py-2 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      </div>

      <!-- Alunos List -->
      @if (isLoading()) {
        <div class="py-12 text-center text-slate-400">
          <div class="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          Carregando lista de alunos...
        </div>
      } @else {
        @if (filteredStudents().length === 0) {
          <div class="bg-[#141417] border border-white/5 p-12 rounded-2xl text-center space-y-3">
            <mat-icon class="text-slate-600 !text-4xl h-10 w-10">error_outline</mat-icon>
            <h3 class="text-base font-bold text-white">Nenhum aluno encontrado</h3>
            <p class="text-xs text-slate-400 max-w-sm mx-auto">Tente ajustar a busca ou cadastre um novo aluno para começar a gestão.</p>
            <a routerLink="/alunos/novo" class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-[#1C1C21] hover:bg-[#25252B] transition-colors rounded-xl text-xs font-bold text-white">
              Cadastrar Agora
            </a>
          </div>
        } @else {
          <!-- Grid Responsive (Card para celular, tabela para desktop) -->
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            @for (std of filteredStudents(); track std.id) {
              <div class="bg-[#141417] rounded-2xl border border-white/5 overflow-hidden flex flex-col justify-between group hover:border-slate-800 transition-all duration-200">
                <div class="p-5 space-y-4">
                  <!-- Header -->
                  <div class="flex items-start justify-between">
                    <div>
                      <h3 class="font-bold text-base text-white group-hover:text-blue-400 transition-colors">{{ std.name }}</h3>
                      <p class="text-xs text-slate-400">{{ std.goal }}</p>
                    </div>
                    <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full"
                          [ngClass]="std.gender === 'MALE' ? 'bg-blue-500/10 text-blue-450 border border-blue-500/20' : 'bg-pink-500/10 text-pink-400 border border-pink-500/20'">
                      {{ std.gender === 'MALE' ? 'Masc' : 'Fem' }}
                    </span>
                  </div>

                  <!-- Métricas Rápidas -->
                  <div class="grid grid-cols-2 gap-3 pt-3 border-t border-white/5">
                    <div>
                      <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Último Peso</span>
                      <p class="text-sm font-semibold text-white">
                        {{ std.last_weight ? std.last_weight + ' kg' : '--' }}
                      </p>
                    </div>
                    <div>
                      <span class="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Gordura Est.</span>
                      <p class="text-sm font-semibold text-emerald-400">
                        {{ std.last_fat_percentage ? std.last_fat_percentage + ' %' : '--' }}
                      </p>
                    </div>
                  </div>

                  <!-- Extra Info -->
                  <div class="text-[11px] text-slate-400 flex items-center justify-between">
                    <span>Altura: {{ std.height_cm }}cm</span>
                    <span class="flex items-center gap-1" [ngClass]="std.lgpd_consent_status === 'ACCEPTED' ? 'text-emerald-400' : 'text-amber-500'">
                      <mat-icon class="!text-xs h-3 w-3">gavel</mat-icon>
                      LGPD: {{ std.lgpd_consent_status === 'ACCEPTED' ? 'Permitido' : 'Pendente' }}
                    </span>
                  </div>
                </div>

                <!-- Footer Actions -->
                <div class="bg-white/[0.02] border-t border-white/5 px-4 py-3 flex items-center justify-between gap-2">
                  <button (click)="onDeleteStudent(std.id, std.name)" class="text-slate-600 hover:text-red-400 transition-colors p-1" title="Excluir Aluno">
                    <mat-icon class="!text-sm">delete</mat-icon>
                  </button>
                  <a [routerLink]="['/alunos', std.id]" class="px-2.5 py-1 bg-blue-600/10 hover:bg-blue-600 text-blue-400 hover:text-white transition-all rounded-lg text-[11px] font-bold flex items-center gap-1">
                    Ver Perfil
                    <mat-icon class="!text-xs h-3 w-3">chevron_right</mat-icon>
                  </a>
                </div>
              </div>
            }
          </div>
        }
      }
    </div>
  `
})
export class StudentsListComponent implements OnInit {
  private dataService = inject(DataService);
  private dialog = inject(DialogService);

  students = signal<StudentSummary[]>([]);
  trashedStudents = signal<TrashedStudent[]>([]);
  showTrash = signal(false);
  searchValue = signal('');
  isLoading = signal(true);

  filteredStudents = computed(() => {
    const val = this.searchValue().trim().toLowerCase();
    const all = this.students();
    if (!val) return all;
    return all.filter(s => 
      s.name.toLowerCase().includes(val) || 
      (s.goal && s.goal.toLowerCase().includes(val)) ||
      (s.phone_number && s.phone_number.includes(val))
    );
  });

  ngOnInit() {
    this.loadStudents();
    this.loadTrash();
  }

  loadStudents() {
    this.isLoading.set(true);
    this.dataService.getStudents().subscribe({
      next: (res) => {
        this.students.set(res);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.isLoading.set(false);
      }
    });
  }

  loadTrash() {
    this.dataService.getTrashedStudents().subscribe({
      next: (res) => this.trashedStudents.set(res),
      error: (err) => console.error(err),
    });
  }

  toggleTrash() {
    this.showTrash.update(v => !v);
    if (this.showTrash()) this.loadTrash();
  }

  onSearch(val: string) {
    this.searchValue.set(val);
  }

  async onDeleteStudent(id: string, name: string) {
    const ok = await this.dialog.confirm({
      title: 'Excluir aluno',
      message: `O aluno ${name} vai para a Lixeira (com fotos e avaliações) e pode ser restaurado depois. Deseja continuar?`,
      confirmText: 'Excluir',
    });
    if (!ok) return;
    this.dataService.deleteStudent(id).subscribe({
      next: () => { this.loadStudents(); this.loadTrash(); },
      error: () => this.dialog.alert({ title: 'Erro', message: 'Erro ao excluir aluno. Tente novamente.', tone: 'error' }),
    });
  }

  onRestoreStudent(id: string) {
    this.dataService.restoreStudent(id).subscribe({
      next: () => { this.loadStudents(); this.loadTrash(); },
      error: () => this.dialog.alert({ title: 'Erro', message: 'Erro ao restaurar aluno. Tente novamente.', tone: 'error' }),
    });
  }
}


// ==========================================
// 4. NEW STUDENT COMPONENT (Cadastro / Anamnese)
// ==========================================
@Component({
  selector: 'app-new-student',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6 max-w-3xl mx-auto">
      <div>
        <h1 class="text-2xl font-extrabold tracking-tight text-white font-sans">
          {{ isEditMode() ? 'Editar Cadastro do Aluno' : 'Cadastrar Aluno & Anamnese' }}
        </h1>
        <p class="text-xs text-slate-400">
          {{ isEditMode() ? 'Atualize os dados do aluno e o histórico clínico.' : 'Preencha as informações do aluno e do histórico clínico inicial.' }}
        </p>
      </div>

      <form [formGroup]="studentForm" (ngSubmit)="onSubmit()" class="space-y-6">
        <!-- Secção 1: Dados Pessoais -->
        <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-white/5">
            <mat-icon class="text-blue-500 !text-base">person</mat-icon>
            Dados Pessoais & Objetivo
          </h3>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nome Completo</label>
              <input 
                type="text" 
                formControlName="name"
                class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                placeholder="Ex: Carlos Roberto Silva"
              />
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Data de Nascimento</label>
              <input 
                type="date" 
                formControlName="birthDate"
                class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
              />
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Gênero Biológico</label>
              <select 
                formControlName="gender"
                class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
              >
                <option value="MALE">Masculino</option>
                <option value="FEMALE">Feminino</option>
              </select>
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Altura (cm)</label>
              <input 
                type="number" 
                inputMode="decimal"
                formControlName="heightCm"
                class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                placeholder="Ex: 178"
              />
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Objetivo do Aluno</label>
              <input 
                type="text" 
                formControlName="goal"
                class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                placeholder="Ex: Hipertrofia, Redução de Gordura..."
              />
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Nº de Telefone (WhatsApp)</label>
              <input 
                type="text" 
                formControlName="phoneNumber"
                class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                placeholder="DDD + Número (Apenas números)"
              />
            </div>
          </div>
        </div>

        <!-- Secção 2: Anamnese Clínica -->
        <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-white/5">
            <mat-icon class="text-red-500 !text-base">medical_services</mat-icon>
            Anamnese Rápida (Termo PAR-Q & Histórico)
          </h3>

          <div class="space-y-4" formGroupName="anamnesis">
            <div class="flex items-center justify-between p-3 bg-[#1C1C21] rounded-xl">
              <div>
                <p class="text-xs font-semibold text-white">Algum problema cardíaco diagnosticado?</p>
                <p class="text-[10px] text-slate-400">Restrição para atividade física intensa</p>
              </div>
              <input type="checkbox" formControlName="cardiacCondition" class="w-5 h-5 accent-blue-500" />
            </div>

            <div class="flex items-center justify-between p-3 bg-[#1C1C21] rounded-xl">
              <div>
                <p class="text-xs font-semibold text-white">Sente dores articulares ou ósseas?</p>
                <p class="text-[10px] text-slate-400">Joelhos, coluna, ombros de maior atenção</p>
              </div>
              <input type="checkbox" formControlName="jointPain" class="w-5 h-5 accent-blue-500" />
            </div>

            <div class="flex items-center justify-between p-3 bg-[#1C1C21] rounded-xl">
              <div>
                <p class="text-xs font-semibold text-white">Sente dor no peito durante a prática de exercícios?</p>
                <p class="text-[10px] text-slate-400">Exige liberação médica específica se ativo</p>
              </div>
              <input type="checkbox" formControlName="chestPainDuringExercise" class="w-5 h-5 accent-blue-500" />
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Cirurgias Recentes (Detalhar se houver)</label>
              <input 
                type="text"
                formControlName="recentSurgeryDescription"
                class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                placeholder="Ex: Artroscopia joelho esquerdo em 2025"
              />
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans">Medicamentos contínuos ativos</label>
              <input 
                type="text"
                formControlName="activeMedications"
                class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                placeholder="Medicamentos ou restrições clínicas"
              />
            </div>

            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Observações adicionais do Aluno</label>
              <textarea 
                rows="3"
                formControlName="notes"
                class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white placeholder-slate-500"
                placeholder="Anote rotinas, disponibilidade ou preferências do plano."
              ></textarea>
            </div>
          </div>
        </div>

        <!-- Secção 3: Consentimento LGPD -->
        <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-4">
          <h3 class="text-sm font-bold text-white flex items-center gap-2 pb-2 border-b border-white/5">
            <mat-icon class="text-emerald-500 !text-base">gavel</mat-icon>
            Consentimento de Proteção de Dados (LGPD)
          </h3>
          <p class="text-[11px] text-slate-400 leading-relaxed">
            De acordo com a Lei Geral de Proteção de Dados (Lei 13.709/2018), coletamos e processamos dados antropométricos e fotografias sensíveis de evolução corporal com a finalidade exclusiva de avaliação de saúde e desempenho físico conduzidos de forma privada.
          </p>

          <div class="flex items-center justify-between p-3 bg-[#1C1C21] rounded-xl border border-dashed border-white/5">
            <div>
              <p class="text-xs font-bold text-white">Consentimento LGPD</p>
              <p class="text-[10px] text-slate-400">O aceite é registrado somente pela assinatura digital do aluno, feita no perfil dele.</p>
            </div>
            <span class="px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg text-xs font-bold text-amber-400 flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full bg-amber-500"></span>
              Pendente
            </span>
          </div>
        </div>

        @if (errorMessage()) {
          <div class="p-3 bg-red-500/10 border border-red-500/20 text-xs text-red-500 rounded-lg">
            {{ errorMessage() }}
          </div>
        }

        <!-- Botões de Ação -->
        <div class="flex justify-end gap-3 pt-4">
          <a [routerLink]="isEditMode() ? ['/alunos', editStudentId()] : '/alunos'"
             class="px-5 py-2.5 bg-[#141417] hover:bg-[#1C1C21] border border-white/5 rounded-xl text-xs font-bold text-slate-300 transition-colors">
            Cancelar
          </a>
          <button
            type="submit"
            [disabled]="studentForm.invalid || isSubmitting()"
            class="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-all"
          >
            @if (isSubmitting()) {
              <div class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              {{ isEditMode() ? 'Salvando...' : 'Adicionando...' }}
            } @else {
              {{ isEditMode() ? 'Salvar Alterações' : 'Salvar Cadastro' }}
            }
          </button>
        </div>
      </form>
    </div>
  `
})
export class NewStudentComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dataService = inject(DataService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private toast = inject(ToastService);

  isSubmitting = signal(false);
  errorMessage = signal('');
  isEditMode = signal(false);
  editStudentId = signal<string | null>(null);

  studentForm: FormGroup = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    birthDate: ['', [Validators.required]],
    gender: ['MALE', [Validators.required]],
    heightCm: ['', [Validators.required, Validators.min(50), Validators.max(250)]],
    goal: [''],
    phoneNumber: [''],
    anamnesis: this.fb.group({
      cardiacCondition: [false],
      jointPain: [false],
      chestPainDuringExercise: [false],
      recentSurgeryDescription: [''],
      activeMedications: [''],
      notes: ['']
    })
  });

  ngOnInit() {
    this.route.params.subscribe(p => {
      const editId = p['id'] ?? null;
      if (editId && this.router.url.includes('/editar')) {
        this.isEditMode.set(true);
        this.editStudentId.set(editId);
        this.dataService.getStudent(editId).subscribe({
          next: (std) => this.prefillForEdit(std),
          error: () => this.errorMessage.set('Erro ao carregar dados do aluno.'),
        });
      }
    });
  }

  private prefillForEdit(std: Student) {
    const ana = std.anamneses;
    this.studentForm.patchValue({
      name: std.name,
      birthDate: std.birth_date,
      gender: std.gender,
      heightCm: std.height_cm,
      goal: std.goal ?? '',
      phoneNumber: std.phone_number ?? '',
      anamnesis: {
        cardiacCondition: ana?.cardiac_condition ?? false,
        jointPain: ana?.joint_pain ?? false,
        chestPainDuringExercise: ana?.chest_pain_during_exercise ?? false,
        recentSurgeryDescription: ana?.recent_surgery_description ?? '',
        activeMedications: ana?.active_medications ?? '',
        notes: ana?.notes ?? '',
      },
    });
  }

  onSubmit() {
    if (this.studentForm.invalid) return;
    this.isSubmitting.set(true);
    this.errorMessage.set('');

    const v = this.studentForm.value;
    const payload = {
      name: v.name?.trim(),
      birth_date: v.birthDate,
      gender: v.gender,
      height_cm: +v.heightCm,
      goal: v.goal ?? '',
      phone_number: v.phoneNumber || null,
      anamnesis: {
        cardiac_condition: !!v.anamnesis?.cardiacCondition,
        joint_pain: !!v.anamnesis?.jointPain,
        chest_pain_during_exercise: !!v.anamnesis?.chestPainDuringExercise,
        recent_surgery_description: v.anamnesis?.recentSurgeryDescription ?? '',
        active_medications: v.anamnesis?.activeMedications ?? '',
        notes: v.anamnesis?.notes ?? '',
      },
    };

    const editId = this.editStudentId();
    const req$ = editId
      ? this.dataService.updateStudent(editId, payload)
      : this.dataService.createStudent(payload);

    req$.subscribe({
      next: (std) => {
        this.toast.success(editId ? 'Cadastro atualizado com sucesso!' : 'Aluno cadastrado com sucesso!');
        this.router.navigate(['/alunos', std.id]);
      },
      error: (err) => {
        console.error(err);
        this.errorMessage.set(editId ? 'Erro ao atualizar cadastro.' : 'Erro ao criar aluno. Tente novamente mais tarde.');
        this.isSubmitting.set(false);
      }
    });
  }
}


// ==========================================
// 5. STUDENT PROFILE COMPONENT (Detalhes)
// ==========================================
@Component({
  selector: 'app-student-profile',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6 animate-fade-in">
      @if (isLoading()) {
        <div class="py-12 text-center text-slate-400">
          <div class="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          Carregando informações do aluno...
        </div>
      } @else {
        @if (student(); as std) {
          <!-- Perfil Hero Card -->
          <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
            <div class="space-y-2">
              <div class="flex items-center gap-3">
                <h1 class="text-2xl font-extrabold tracking-tight text-white font-sans">{{ std.name }}</h1>
                <span class="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full"
                      [ngClass]="std.gender === 'MALE' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : 'bg-pink-500/10 text-pink-400 border border-pink-500/30'">
                  {{ std.gender === 'MALE' ? 'Masculino' : 'Feminino' }}
                </span>
              </div>
              <p class="text-xs text-slate-400">
                Objetivo: <strong class="text-slate-300">{{ std.goal || 'A definir' }}</strong> • 
                Altura: <strong class="text-slate-300">{{ std.height_cm }} cm</strong> • 
                Idade: <strong class="text-slate-300">{{ getAge(std.birth_date) }} anos</strong>
              </p>
            </div>

            <!-- CTA Actions -->
            <div class="flex flex-wrap gap-2">
              <a [routerLink]="['/alunos', std.id, 'galeria']" class="px-3.5 py-2 bg-[#1C1C21] hover:bg-[#25252B] transition-colors rounded-xl text-xs font-bold text-white flex items-center gap-2 border border-white/5">
                <mat-icon class="!text-sm h-4">photo_library</mat-icon>
                Galeria Evolução
              </a>
              <a [routerLink]="['/alunos', std.id, 'editar']" class="px-3.5 py-2 bg-[#1C1C21] hover:bg-[#25252B] transition-colors rounded-xl text-xs font-bold text-white flex items-center gap-2 border border-white/5">
                <mat-icon class="!text-sm h-4">edit</mat-icon>
                Editar Cadastro
              </a>
              @if (std.lgpd_consent_status === 'PENDING') {
                <a [routerLink]="['/alunos', std.id, 'lgpd']"
                   class="px-3.5 py-2 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 transition-all rounded-xl text-xs font-bold text-amber-400 flex items-center gap-2">
                  <mat-icon class="!text-sm h-4">gavel</mat-icon>
                  Assinar LGPD
                </a>
              }
              <a [routerLink]="['/alunos', std.id, 'avaliacoes', 'nova']" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 transition-all rounded-xl text-xs font-bold text-white flex items-center gap-2 shadow-md shadow-blue-600/10">
                <mat-icon class="!text-xs h-3.5 w-3.5">add</mat-icon>
                Nova Avaliação Física
              </a>
            </div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Coluna 1 e 2: Histórico de Avaliações -->
            <div class="lg:col-span-2 space-y-4">
              <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-4">
                <div class="flex justify-between items-center border-b border-white/5 pb-3">
                  <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    <mat-icon class="text-blue-500 !text-sm">line_weight</mat-icon>
                    Linha do Tempo de Avaliações
                  </h3>
                  <span class="text-xs text-slate-400">{{ std.avaliacoes.length }} Avaliações</span>
                </div>

                @if (std.avaliacoes.length === 0) {
                  <div class="py-8 text-center space-y-3">
                    <mat-icon class="text-slate-600 !text-3xl">analytics</mat-icon>
                    <p class="text-xs text-slate-400">Nenhuma avaliação cadastrada.</p>
                    <a [routerLink]="['/alunos', std.id, 'avaliacoes', 'nova']" class="inline-flex items-center gap-2 px-3 py-1.5 bg-[#1C1C21] hover:bg-[#25252B] hover:text-white rounded-lg text-xs font-medium text-slate-300">
                      Cadastrar Primeira agora
                    </a>
                  </div>
                } @else {
                  <div class="overflow-x-auto">
                    <table class="w-full text-left text-xs text-slate-300 min-w-[500px]">
                      <thead>
                        <tr class="border-b border-white/5 text-slate-500 uppercase tracking-wider text-[10px] font-bold">
                          <th class="py-3 px-4">Data</th>
                          <th class="py-3 px-4">Peso</th>
                          <th class="py-3 px-4">Músculo%</th>
                          <th class="py-3 px-4">Gordura %</th>
                          <th class="py-3 px-4">Idade Corp.</th>
                          <th class="py-3 px-4 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody class="divide-y divide-white/5">
                        @for (aval of std.avaliacoes; track aval.id) {
                          <tr class="hover:bg-white/[0.01] transition-colors">
                            <td class="py-3 px-4 font-mono text-white">{{ aval.date | date:'dd/MM/yyyy' }}</td>
                            <td class="py-3 px-4 text-slate-100 font-semibold">{{ aval.bioimpedancias?.weight_kg ?? '—' }} kg</td>
                            <td class="py-3 px-4 font-semibold text-blue-400">{{ aval.bioimpedancias?.skeletal_muscle_percentage ?? '—' }}%</td>
                            <td class="py-3 px-4 font-semibold text-emerald-400">{{ aval.body_fat_percentage ?? '—' }}%</td>
                            <td class="py-3 px-4 font-mono">{{ aval.bioimpedancias?.body_age ?? '—' }} anos</td>
                            <td class="py-3 px-4 text-right flex items-center justify-end gap-2">
                              <button (click)="onDeleteAssessment(std.id, aval.id)" class="text-slate-500 hover:text-red-400 p-1" title="Excluir">
                                <mat-icon class="!text-sm">delete</mat-icon>
                              </button>
                              <a [routerLink]="['/alunos', std.id, 'avaliacoes', aval.id]" class="px-2.5 py-1 bg-blue-600 hover:bg-blue-500 transition-colors rounded-lg text-xs font-bold text-white inline-flex items-center gap-1">
                                Relatório
                                <mat-icon class="!text-xs">chevron_right</mat-icon>
                              </a>
                            </td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }

                <!-- Lixeira: avaliações excluídas (recuperáveis) -->
                @if (std.avaliacoes_trash?.length) {
                  <div class="pt-3 border-t border-white/5">
                    <button (click)="showTrash.set(!showTrash())" class="flex items-center gap-2 text-[11px] font-bold text-slate-400 hover:text-slate-200 transition-colors">
                      <mat-icon class="!text-sm">{{ showTrash() ? 'expand_less' : 'expand_more' }}</mat-icon>
                      Lixeira ({{ std.avaliacoes_trash?.length }})
                    </button>
                    @if (showTrash()) {
                      <div class="mt-2 space-y-2">
                        @for (aval of std.avaliacoes_trash; track aval.id) {
                          <div class="flex items-center justify-between bg-white/[0.02] border border-white/5 rounded-xl px-4 py-2.5">
                            <div class="text-xs text-slate-400">
                              <span class="font-mono text-slate-300">{{ aval.date | date:'dd/MM/yyyy' }}</span>
                              <span class="mx-2 text-slate-600">•</span>
                              {{ aval.bioimpedancias?.weight_kg ?? '—' }} kg
                              <span class="mx-2 text-slate-600">•</span>
                              {{ aval.body_fat_percentage ?? '—' }}% gordura
                            </div>
                            <button (click)="onRestoreAssessment(std.id, aval.id)" class="px-2.5 py-1 bg-emerald-600/90 hover:bg-emerald-500 transition-colors rounded-lg text-xs font-bold text-white inline-flex items-center gap-1">
                              <mat-icon class="!text-xs">restore</mat-icon>
                              Restaurar
                            </button>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
              </div>

              <!-- Anamnese do Aluno -->
              <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-4">
                <h3 class="text-sm font-bold text-white flex items-center gap-2 border-b border-white/5 pb-3">
                  <mat-icon class="text-red-500">medical_services</mat-icon>
                  Resultados da Anamnese Inicial
                </h3>
                
                <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div class="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1">
                    <span class="text-[9px] uppercase font-bold text-slate-500">Problema Cardíaco</span>
                    <p class="text-xs font-semibold" [ngClass]="std.anamneses?.cardiac_condition ? 'text-red-400' : 'text-slate-300'">
                      {{ std.anamneses?.cardiac_condition ? 'Sim (Exige Liberação)' : 'Não Relatado' }}
                    </p>
                  </div>
                  <div class="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1">
                    <span class="text-[9px] uppercase font-bold text-slate-500">Dor Articular</span>
                    <p class="text-xs font-semibold" [ngClass]="std.anamneses?.joint_pain ? 'text-amber-400' : 'text-slate-300'">
                      {{ std.anamneses?.joint_pain ? 'Sim (Cuidados com Carga)' : 'Não Relatado' }}
                    </p>
                  </div>
                  <div class="p-3 bg-white/[0.02] border border-white/5 rounded-xl space-y-1">
                    <span class="text-[9px] uppercase font-bold text-slate-500">Dor no peito sob esforço</span>
                    <p class="text-xs font-semibold" [ngClass]="std.anamneses?.chest_pain_during_exercise ? 'text-red-400' : 'text-slate-300'">
                      {{ std.anamneses?.chest_pain_during_exercise ? 'Sim (Risco Clínico)' : 'Não Relatado' }}
                    </p>
                  </div>
                </div>

                <div class="space-y-2 text-xs text-slate-300 leading-relaxed pt-2">
                  <p><strong>Medicamentos Contínuos:</strong> {{ std.anamneses?.active_medications || 'Nenhum' }}</p>
                  <p><strong>Observações Clínicas / Restrições adicionais:</strong> {{ std.anamneses?.notes || 'Nenhuma restrição identificada.' }}</p>
                </div>
              </div>
            </div>

            <!-- Coluna 3: Evolução Recente -->
            <div class="space-y-6">
              <!-- Card Consentimento -->
              <div class="bg-[#141417] p-5 rounded-2xl border border-white/5 space-y-3">
                <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Apoio de Proteção LGPD</h4>
                <div class="flex items-center gap-3">
                  <span class="w-2.5 h-2.5 rounded-full" [ngClass]="std.lgpd_consent_status === 'ACCEPTED' ? 'bg-emerald-500' : 'bg-amber-500'"></span>
                  <div class="flex-1">
                    <p class="text-xs font-bold text-white">
                      {{ std.lgpd_consent_status === 'ACCEPTED' ? 'Consentimento Assinado' : 'Aceite Pendente' }}
                    </p>
                    <p class="text-[10px] text-slate-400">
                      Coleta consentida para fins científicos e fisiológicos.
                    </p>
                  </div>
                  @if (std.lgpd_consent_status === 'PENDING') {
                    <a [routerLink]="['/alunos', std.id, 'lgpd']"
                       class="text-[10px] font-bold text-amber-400 hover:text-amber-300 underline underline-offset-2 transition-colors">
                      Assinar agora
                    </a>
                  }
                </div>
                @if (std.phone_number) {
                  <div class="pt-2 border-t border-white/5 flex justify-between items-center text-[11px] text-slate-400">
                    <span>Telefone: {{ std.phone_number }}</span>
                  </div>
                }
              </div>

              <!-- Fotos de Evolução Secção de Apoio -->
              <div class="bg-[#141417] p-5 rounded-2xl border border-white/5 space-y-4">
                <div class="flex justify-between items-center">
                  <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider">Mídia Recente</h4>
                  <a [routerLink]="['/alunos', std.id, 'galeria']" class="text-blue-500 hover:text-blue-400 text-[10px] uppercase font-bold">Ver Tudo</a>
                </div>

                @if (std.fotos.length === 0) {
                  <div class="py-6 text-center text-slate-500 text-xs">
                    Nenhuma evolução anexada.
                  </div>
                } @else {
                  <div class="grid grid-cols-2 gap-2">
                    @for (ph of recentPhotos(std.fotos); track ph.id) {
                      <div class="aspect-square bg-slate-800 rounded-lg overflow-hidden relative group border border-white/5">
                        <img [src]="ph.url ?? ph.storage_path" alt="Evolução" class="w-full h-full object-cover" referrerpolicy="no-referrer" />
                        <span class="absolute bottom-1 right-1 bg-black/60 text-[8px] text-slate-300 font-bold px-1.5 py-0.5 rounded uppercase">
                          {{ categoryLabel(ph.category) }}
                        </span>
                      </div>
                    }
                  </div>
                }
              </div>
            </div>
          </div>
        @} @else {
          <div class="py-12 bg-[#141417] rounded-2xl border border-white/5 text-center text-slate-400">
            Aluno não encontrado ou inexistente.
          </div>
        }
      }
    </div>
  `
})
export class StudentProfileComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  private dialog = inject(DialogService);

  student = signal<Student | null>(null);
  isLoading = signal(true);
  showTrash = signal(false);
  categoryLabel = categoryLabel;
  /** As 2 fotos mais recentes (data desc, depois created_at desc). */
  recentPhotos = (fotos: Photo[]) => selectRecentPhotos(fotos, 2);

  ngOnInit() {
    this.route.params.subscribe(p => {
      if (p['id']) {
        this.loadStudent(p['id']);
      }
    });
  }

  loadStudent(id: string) {
    this.isLoading.set(true);
    this.dataService.getStudent(id).subscribe({
      next: (res) => {
        this.student.set(res);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.isLoading.set(false);
      }
    });
  }

  getAge(birthDateString: string): number {
    const today = new Date();
    const birthDate = new Date(birthDateString);
    let age = today.getFullYear() - birthDate.getFullYear();
    const m = today.getMonth() - birthDate.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    return age;
  }

  async onDeleteAssessment(studentId: string, assessmentId: string) {
    const ok = await this.dialog.confirm({
      title: 'Excluir avaliação',
      message: 'Esta avaliação vai para a Lixeira e pode ser restaurada depois. Deseja continuar?',
      confirmText: 'Excluir',
    });
    if (ok) {
      this.dataService.deleteAssessment(assessmentId).subscribe({
        next: () => this.loadStudent(studentId),
        error: () => this.dialog.alert({ title: 'Erro', message: 'Erro ao excluir avaliação. Tente novamente.', tone: 'error' }),
      });
    }
  }

  onRestoreAssessment(studentId: string, assessmentId: string) {
    this.dataService.restoreAssessment(assessmentId).subscribe({
      next: () => this.loadStudent(studentId),
      error: () => this.dialog.alert({ title: 'Erro', message: 'Erro ao restaurar avaliação. Tente novamente.', tone: 'error' }),
    });
  }
}


// ==========================================
// 6. NEW ASSESSMENT COMPONENT (Core: Formulário)
// ==========================================
@Component({
  selector: 'app-new-assessment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6 max-w-4xl mx-auto animate-fade-in">
      <!-- Top Title and student label -->
      @if (student(); as std) {
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight text-white font-sans">{{ isEditMode() ? 'Editar Avaliação Física' : 'Nova Avaliação Física' }}</h1>
          <p class="text-xs text-slate-400">{{ isEditMode() ? 'Editando avaliação de' : 'Registrar medições para o aluno' }} <strong class="text-blue-400">{{ std.name }}</strong></p>
        </div>

        <!-- Progress Tracker Bar -->
        <div class="bg-[#141417] p-1 rounded-2xl border border-white/5 flex gap-1">
          <button 
            type="button" 
            (click)="activeStep.set(1)"
            [ngClass]="activeStep() === 1 ? 'bg-blue-600 text-white font-bold' : 'text-slate-450 hover:bg-white/[0.02]'"
            class="flex-1 py-3 text-xs rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            <span class="w-5 h-5 rounded-full bg-white/20 text-[10px] font-mono flex items-center justify-center">1</span>
            Passo 1: Balança Omron
          </button>
          <button 
            type="button" 
            (click)="activeStep.set(2)"
            [ngClass]="activeStep() === 2 ? 'bg-blue-600 text-white font-bold' : 'text-slate-450 hover:bg-white/[0.02]'"
            class="flex-1 py-3 text-xs rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            <span class="w-5 h-5 rounded-full bg-white/20 text-[10px] font-mono flex items-center justify-center">2</span>
            Passo 2: Circunferências
          </button>
          <button 
            type="button" 
            (click)="activeStep.set(3)"
            [ngClass]="activeStep() === 3 ? 'bg-blue-600 text-white font-bold' : 'text-slate-450 hover:bg-white/[0.02]'"
            class="flex-1 py-3 text-xs rounded-xl flex items-center justify-center gap-2 transition-all"
          >
            <span class="w-5 h-5 rounded-full bg-white/20 text-[10px] font-mono flex items-center justify-center">3</span>
            Passo 3: Dobras Cutâneas
          </button>
        </div>

        <form [formGroup]="assessmentForm" (ngSubmit)="onSubmit()" class="space-y-6">
          <!-- Configuração Geral -->
          <div class="bg-[#141417] p-5 rounded-2xl border border-white/5 flex flex-wrap gap-4 items-center justify-between">
            <div class="space-y-1">
              <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Data da Medição</label>
              <input type="date" formControlName="date" class="bg-[#1C1C21] border border-white/5 rounded-xl px-4 py-2.5 text-xs text-white" />
            </div>
            
            <!-- Quick calculator preview box -->
            <div class="text-right text-xs text-slate-400">
              <p>Massa Corporal Prevista: <strong class="text-slate-200">{{ assessmentForm.get('bioimpedance.weightKg')?.value || '--' }} kg</strong></p>
              <p>Altura: <span class="text-slate-300 font-semibold">{{ std.height_cm }} cm</span></p>
            </div>
          </div>

          <!-- PASSO 1: BALANÇA OMRON HBF-514C -->
          @if (activeStep() === 1) {
            <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-6 animate-fade-in" formGroupName="bioimpedance">
              <div class="border-b border-white/5 pb-3">
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <mat-icon class="text-purple-400">straighten</mat-icon>
                  Dados Omron HBF-514C
                </h3>
                <p class="text-[11px] text-slate-400 mt-1">Transcreva as leituras do monitor portátil da balança do aluno.</p>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Peso Total (kg)</label>
                  <input 
                    type="number" step="0.1" inputMode="decimal"
                    formControlName="weightKg"
                    class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                    placeholder="Ex: 85.2"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block font-sans">IMC Balança (Opcional)</label>
                  <input 
                    type="number" step="0.1" inputMode="decimal"
                    formControlName="bmi"
                    class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                    placeholder="Auto-calculado se vazio"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Gordura Corporal (%)</label>
                  <input 
                    type="number" step="0.1" inputMode="decimal"
                    formControlName="bodyFatPercentage"
                    class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                    placeholder="Ex: 15.5"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Músculo Esquelético (%)</label>
                  <input 
                    type="number" step="0.1" inputMode="decimal"
                    formControlName="skeletalMusclePercentage"
                    class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                    placeholder="Ex: 38.2"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Metabolismo Basal (kcal)</label>
                  <input 
                    type="number" inputMode="decimal"
                    formControlName="restingMetabolismKcal"
                    class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                    placeholder="Ex: 1740"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Idade Biológica Corporal</label>
                  <input 
                    type="number" inputMode="decimal"
                    formControlName="bodyAge"
                    class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                    placeholder="Ex: 28"
                  />
                </div>

                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Nível de Gordura Visceral (1 a 30)</label>
                  <input
                    type="number" min="1" max="30" inputMode="decimal"
                    formControlName="visceralFatLevel"
                    class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                    placeholder="Escala Omron 1 a 30"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">% Água Corporal <span class="text-slate-600">(opcional)</span></label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="waterPercentage"
                    class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" placeholder="Ex: 56.0" />
                </div>
              </div>
              <div class="flex items-center gap-3 pt-2">
                <input type="checkbox" formControlName="isAthlete" id="isAthlete"
                  class="w-4 h-4 rounded border-white/20 bg-[#1C1C21] accent-blue-500" />
                <label for="isAthlete" class="text-xs text-slate-400 cursor-pointer">
                  Modo Atleta Omron (marcar se o aluno for atleta de alto rendimento)
                </label>
              </div>
            </div>

            @if (student()?.gender === 'FEMALE') {
              <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-4 animate-fade-in mt-6">
                <div class="border-b border-white/5 pb-3">
                  <h3 class="text-sm font-bold text-white flex items-center gap-2">
                    <mat-icon class="text-pink-400">favorite</mat-icon>
                    Saúde Feminina
                  </h3>
                  <p class="text-[11px] text-slate-400 mt-1">Campos opcionais, específicos desta avaliação.</p>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Data da Última Menstruação <span class="text-slate-600">(opc.)</span></label>
                    <input type="date" formControlName="lastMenstruationDate" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ciclo Regular <span class="text-slate-600">(opc.)</span></label>
                    <select formControlName="menstrualCycleRegular" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white">
                      <option value="">Não informado</option>
                      <option value="true">Sim, regular</option>
                      <option value="false">Não, irregular</option>
                    </select>
                  </div>
                </div>
              </div>
            }
          }

          <!-- PASSO 2: PERÍMETROS (CIRCUNFERÊNCIAS) -->
          @if (activeStep() === 2) {
            <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-6 animate-fade-in" formGroupName="circumferences">
              <div class="border-b border-white/5 pb-3">
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <mat-icon class="text-blue-400">person_search</mat-icon>
                  Circunferências Corporais (Cm)
                </h3>
                <p class="text-[11px] text-slate-400 mt-1">Insira os perímetros recolhidos por fita métrica antropométrica.</p>
              </div>

              <!-- General Fields Grid -->
              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Pescoço</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="neckCm" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Ombros</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="shoulderCm" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tórax</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="chestCm" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Cintura</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="waistCm" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Abdomen</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="abdomenCm" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Quadril (Glúteos)</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="hipCm" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                @if (student()?.gender === 'FEMALE') {
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Busto/Mamas <span class="text-slate-600">(opc.)</span></label>
                    <input type="number" step="0.1" inputMode="decimal" formControlName="bustCm" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" placeholder="Ex: 92.0" />
                  </div>
                }
              </div>

              <!-- Lados Direito e Esquerdo Flexed/Relaxed -->
              <h4 class="text-xs font-bold text-slate-400 uppercase tracking-wider pt-4 border-t border-white/5 flex items-center gap-1">
                <mat-icon class="!text-xs h-3">sync_alt</mat-icon> Mapeamento de Simetria (Braços, Coxas e Panturrilhas)
              </h4>
              <p class="text-[11px] text-slate-400 -mt-1">
                Preencha pelo menos <strong class="text-slate-300">um lado completo</strong> (o lado predominante).
                O outro lado pode ficar em branco — mas, se começar a preencher um lado, conclua todos os campos dele.
              </p>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                <!-- Lado Direito -->
                <div class="p-4 bg-white/[0.01] border border-white/5 rounded-2xl space-y-3">
                  <div class="text-xs font-bold text-slate-300 border-b border-white/5 pb-1">Membros Direitos</div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Braço Relaxado</label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="rightArmRelaxedCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Braço Contraído</label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="rightArmFlexedCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Antebraço <span class="text-slate-600">(opc.)</span></label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="rightForearmCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" placeholder="—" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Coxa Proximal</label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="rightThighProximalCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Coxa Medial <span class="text-slate-600">(opc.)</span></label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="rightThighMedialCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" placeholder="—" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Coxa Distal <span class="text-slate-600">(opc.)</span></label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="rightThighDistalCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" placeholder="—" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Panturrilha</label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="rightCalfCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" />
                    </div>
                  </div>
                </div>

                <!-- Lado Esquerdo -->
                <div class="p-4 bg-white/[0.01] border border-white/5 rounded-2xl space-y-3">
                  <div class="text-xs font-bold text-slate-300 border-b border-white/5 pb-1">Membros Esquerdos</div>
                  <div class="grid grid-cols-2 gap-3">
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Braço Relaxado</label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="leftArmRelaxedCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Braço Contraído</label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="leftArmFlexedCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Antebraço <span class="text-slate-600">(opc.)</span></label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="leftForearmCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" placeholder="—" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Coxa Proximal</label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="leftThighProximalCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Coxa Medial <span class="text-slate-600">(opc.)</span></label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="leftThighMedialCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" placeholder="—" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Coxa Distal <span class="text-slate-600">(opc.)</span></label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="leftThighDistalCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" placeholder="—" />
                    </div>
                    <div class="space-y-1">
                      <label class="text-[9px] uppercase font-bold text-slate-500">Panturrilha</label>
                      <input type="number" step="0.1" inputMode="decimal" formControlName="leftCalfCm" class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-lg text-xs text-slate-200" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          }

          <!-- PASSO 3: DOBRAS CUTÂNEAS (ADIPOMETRIA) -->
          @if (activeStep() === 3) {
            <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-6 animate-fade-in" formGroupName="skinfolds">
              <div class="border-b border-white/5 pb-3">
                <h3 class="text-sm font-bold text-white flex items-center gap-2">
                  <mat-icon class="text-emerald-400">fitness_center</mat-icon>
                  Dobras Cutâneas (Mm)
                </h3>
                <p class="text-[11px] text-slate-400 mt-1">Jackson & Pollock 7 dobras calcula densidade e % de gordura. Bíceps e Panturrilha são opcionais e não entram no cálculo.</p>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Tríceps</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="tricepsMm" (blur)="maybeConvertSkinfold('tricepsMm')" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Bíceps <span class="text-slate-600">(opc.)</span></label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="bicepsMm" (blur)="maybeConvertSkinfold('bicepsMm')" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Subescapular</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="subscapularMm" (blur)="maybeConvertSkinfold('subscapularMm')" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Peitoral</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="chestMm" (blur)="maybeConvertSkinfold('chestMm')" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Axilar Média</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="midaxillaryMm" (blur)="maybeConvertSkinfold('midaxillaryMm')" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block block">Supra-ilíaca</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="suprailiacMm" (blur)="maybeConvertSkinfold('suprailiacMm')" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block block">Abdominal</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="abdominalMm" (blur)="maybeConvertSkinfold('abdominalMm')" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block block">Coxa Média</label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="midThighMm" (blur)="maybeConvertSkinfold('midThighMm')" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block block">Panturrilha Média <span class="text-slate-600">(opc.)</span></label>
                  <input type="number" step="0.1" inputMode="decimal" formControlName="calfMm" (blur)="maybeConvertSkinfold('calfMm')" class="w-full px-4 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white" />
                </div>
              </div>
            </div>
          }

          <!-- Botões do Stepper -->
          <div class="flex justify-between items-center bg-[#141417] p-4 rounded-2xl border border-white/5">
            <div>
              @if (activeStep() > 1) {
                <button 
                  type="button" 
                  (click)="activeStep.set(activeStep() - 1)"
                  class="px-5 py-2 bg-[#1C1C21] hover:bg-[#25252B] transition-colors rounded-xl text-xs font-bold text-slate-300"
                >
                  Anterior
                </button>
              }
            </div>

            <div class="flex gap-3">
              <a [routerLink]="['/alunos', std.id]" class="px-5 py-2 text-xs text-slate-450 hover:text-white transition-colors">
                Cancelar
              </a>
              @if (activeStep() < 3) {
                <button 
                  type="button" 
                  (click)="activeStep.set(activeStep() + 1)"
                  class="px-5 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white flex items-center gap-1 shadow-md shadow-blue-600/10"
                >
                  Próximo Passo
                  <mat-icon class="!text-xs">chevron_right</mat-icon>
                </button>
              } @else {
                <button 
                  type="submit"
                  [disabled]="isSubmitting()"
                  class="px-6 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-emerald-600/50 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-all shadow-md shadow-emerald-600/10"
                >
                  @if (isSubmitting()) {
                    <div class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                    Calculando...
                  } @else {
                    {{ isEditMode() ? 'Salvar Alterações' : 'Concluir Avaliação' }}
                  }
                </button>
              }
            </div>
          </div>
        </form>
      }

      <!-- Modal: campos obrigatórios faltando -->
      @if (showValidationModal()) {
        <div class="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
             (click)="closeValidationModal()">
          <div class="w-full max-w-lg bg-[#141417] border border-white/10 rounded-2xl shadow-2xl flex flex-col max-h-[85vh]"
               (click)="$event.stopPropagation()">
            <!-- Header -->
            <div class="p-5 border-b border-white/5 flex items-start gap-3">
              <div class="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
                <mat-icon class="text-amber-400 !text-lg">warning</mat-icon>
              </div>
              <div class="flex-1">
                <h2 class="text-sm font-extrabold text-white">Revise os campos obrigatórios</h2>
                <p class="text-[11px] text-slate-400 mt-0.5">
                  {{ missingFields().length }} campo(s) faltando ou fora da faixa permitida. Corrija abaixo para concluir.
                </p>
              </div>
              <button (click)="closeValidationModal()" class="text-slate-500 hover:text-white transition-colors">
                <mat-icon class="!text-lg">close</mat-icon>
              </button>
            </div>

            <!-- Lista de campos faltando, preenchível -->
            <div class="p-5 overflow-y-auto space-y-3 scrollbar-thin scrollbar-thumb-white/10">
              @for (f of missingFields(); track $index) {
                <div class="flex items-center gap-3">
                  <div class="flex-1 min-w-0">
                    <p class="text-xs font-bold text-white truncate">{{ f.label }}</p>
                    <p class="text-[10px] text-slate-500">{{ f.stepName }} • {{ f.hint }}</p>
                  </div>
                  @if (f.isDate) {
                    <input type="date" [formControl]="asFormControl(f.control)"
                           class="w-40 px-3 py-2 bg-[#1C1C21] border rounded-lg text-xs text-white"
                           [class.border-red-500/40]="f.control.invalid"
                           [class.border-emerald-500/40]="f.control.valid" />
                  } @else {
                    <input type="number" step="0.1" inputMode="decimal" placeholder="0,0"
                           [formControl]="asFormControl(f.control)"
                           class="w-28 px-3 py-2 bg-[#1C1C21] border rounded-lg text-xs text-white text-right"
                           [class.border-red-500/40]="f.control.invalid"
                           [class.border-emerald-500/40]="f.control.valid" />
                  }
                  <mat-icon class="!text-base shrink-0" [class.text-emerald-400]="f.control.valid" [class.text-slate-600]="f.control.invalid">
                    {{ f.control.valid ? 'check_circle' : 'radio_button_unchecked' }}
                  </mat-icon>
                </div>
              }
            </div>

            <!-- Footer -->
            <div class="p-5 border-t border-white/5 flex items-center justify-between gap-3">
              <button (click)="closeValidationModal()"
                      class="px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors">
                Voltar ao formulário
              </button>
              <button (click)="onSubmit()"
                      class="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-extrabold text-white flex items-center gap-2 transition-all shadow-md shadow-blue-600/10">
                <mat-icon class="!text-sm">save</mat-icon>
                Preencher e {{ isEditMode() ? 'Salvar Alterações' : 'Concluir Avaliação' }}
              </button>
            </div>
          </div>
        </div>
      }
    </div>
  `
})
export class NewAssessmentComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);

  student = signal<Student | null>(null);
  activeStep = signal(1);
  isSubmitting = signal(false);
  isEditMode = signal(false);
  editAssessmentId = signal<string | null>(null);

  // Modal de campos obrigatórios / inválidos
  showValidationModal = signal(false);
  missingFields = signal<{ label: string; stepName: string; hint: string; control: AbstractControl; isDate: boolean }[]>([]);

  // Metadados: rótulos amigáveis + passo de cada campo (inclui opcionais com faixa)
  private readonly fieldGroupsMeta: { key: string; stepName: string; fields: Record<string, string> }[] = [
    { key: '', stepName: 'Geral', fields: { date: 'Data da Medição' } },
    { key: 'bioimpedance', stepName: 'Passo 1 — Balança', fields: {
      weightKg: 'Peso (kg)', bodyFatPercentage: '% Gordura', skeletalMusclePercentage: '% Músculo Esquelético',
      restingMetabolismKcal: 'Metabolismo Basal (kcal)', bodyAge: 'Idade Corporal', visceralFatLevel: 'Gordura Visceral',
      waterPercentage: '% Água Corporal',
    } },
    { key: 'circumferences', stepName: 'Passo 2 — Circunferências', fields: {
      neckCm: 'Pescoço', shoulderCm: 'Ombro', chestCm: 'Tórax', waistCm: 'Cintura', abdomenCm: 'Abdômen', hipCm: 'Quadril',
      rightArmRelaxedCm: 'Braço D. (relaxado)', leftArmRelaxedCm: 'Braço E. (relaxado)',
      rightArmFlexedCm: 'Braço D. (contraído)', leftArmFlexedCm: 'Braço E. (contraído)',
      rightForearmCm: 'Antebraço D.', leftForearmCm: 'Antebraço E.',
      rightThighProximalCm: 'Coxa D. (proximal)', leftThighProximalCm: 'Coxa E. (proximal)',
      rightCalfCm: 'Panturrilha D.', leftCalfCm: 'Panturrilha E.',
    } },
    { key: 'skinfolds', stepName: 'Passo 3 — Dobras', fields: {
      tricepsMm: 'Tríceps', bicepsMm: 'Bíceps', subscapularMm: 'Subescapular', chestMm: 'Peitoral',
      midaxillaryMm: 'Axilar Média', suprailiacMm: 'Supra-ilíaca', abdominalMm: 'Abdominal',
      midThighMm: 'Coxa', calfMm: 'Panturrilha',
    } },
  ];

  private collectMissingFields() {
    const missing: { label: string; stepName: string; hint: string; control: AbstractControl; isDate: boolean }[] = [];
    for (const grp of this.fieldGroupsMeta) {
      const container = grp.key ? (this.assessmentForm.get(grp.key) as FormGroup) : this.assessmentForm;
      if (!container) continue;
      for (const [ctrlName, label] of Object.entries(grp.fields)) {
        const control = grp.key ? container.get(ctrlName) : this.assessmentForm.get(ctrlName);
        if (control && control.invalid) {
          missing.push({ label, stepName: grp.stepName, hint: fieldRangeHint(ctrlName), control, isDate: ctrlName === 'date' });
        }
      }
    }
    this.missingFields.set(missing);
    return missing;
  }

  asFormControl(c: AbstractControl): FormControl {
    return c as FormControl;
  }

  closeValidationModal() {
    this.showValidationModal.set(false);
  }

  // Formulário completo
  assessmentForm: FormGroup = this.fb.group({
    date: [new Date().toISOString().substring(0, 10), [Validators.required]],
    lastMenstruationDate: [''],       // Saúde feminina — opcional, só exibido para mulher
    menstrualCycleRegular: [''],      // '' | 'true' | 'false' — opcional, só exibido para mulher
    bioimpedance: this.fb.group({
      isAthlete: [false],                 // Omron: modo atleta
      weightKg: ['', [Validators.required, Validators.min(1)]],
      bmi: [''],                          // opcional — API calcula automaticamente
      bodyFatPercentage: ['', [Validators.required, Validators.min(0.1), Validators.max(80)]],
      skeletalMusclePercentage: ['', [Validators.required, Validators.min(0.1), Validators.max(80)]],
      restingMetabolismKcal: ['', [Validators.required, Validators.min(1)]],
      bodyAge: ['', [Validators.required, Validators.min(10), Validators.max(100)]],
      visceralFatLevel: ['', [Validators.required, Validators.min(1), Validators.max(30)]],
      waterPercentage: ['', [Validators.min(0), Validators.max(100)]],   // % água corporal (Omron)
    }),
    circumferences: this.fb.group({
      neckCm: ['', [Validators.required, Validators.min(0.1)]],
      shoulderCm: ['', [Validators.required, Validators.min(0.1)]],
      chestCm: ['', [Validators.required, Validators.min(0.1)]],
      waistCm: ['', [Validators.required, Validators.min(0.1)]],
      abdomenCm: ['', [Validators.required, Validators.min(0.1)]],
      hipCm: ['', [Validators.required, Validators.min(0.1)]],
      bustCm: ['', [Validators.min(0.1)]],   // Busto/mamas — só relevante para mulher, sempre opcional
      // Membros bilaterais: required é aplicado dinamicamente por lado
      // (ver updateSymmetryValidators). O personal mede só o lado predominante.
      rightArmRelaxedCm: ['', [Validators.min(0.1)]],
      leftArmRelaxedCm: ['', [Validators.min(0.1)]],
      rightArmFlexedCm: ['', [Validators.min(0.1)]],
      leftArmFlexedCm: ['', [Validators.min(0.1)]],
      rightForearmCm: ['', [Validators.min(0.1)]],   // Antebraço D (sempre opcional)
      leftForearmCm: ['', [Validators.min(0.1)]],    // Antebraço E (sempre opcional)
      rightThighProximalCm: ['', [Validators.min(0.1)]],
      leftThighProximalCm: ['', [Validators.min(0.1)]],
      rightThighMedialCm: ['', [Validators.min(0.1)]],   // Coxa medial D (sempre opcional)
      leftThighMedialCm: ['', [Validators.min(0.1)]],    // Coxa medial E (sempre opcional)
      rightThighDistalCm: ['', [Validators.min(0.1)]],   // Coxa distal D (sempre opcional)
      leftThighDistalCm: ['', [Validators.min(0.1)]],    // Coxa distal E (sempre opcional)
      rightCalfCm: ['', [Validators.min(0.1)]],
      leftCalfCm: ['', [Validators.min(0.1)]]
    }),
    skinfolds: this.fb.group({
      protocol: ['7_dobras'],            // protocolo de dobras
      tricepsMm: ['', [Validators.required, Validators.min(0.1)]],
      bicepsMm: ['', [Validators.min(0.1)]],             // opcional — não entra no JP7
      subscapularMm: ['', [Validators.required, Validators.min(0.1)]],
      chestMm: ['', [Validators.required, Validators.min(0.1)]],
      midaxillaryMm: ['', [Validators.required, Validators.min(0.1)]],
      suprailiacMm: ['', [Validators.required, Validators.min(0.1)]],
      abdominalMm: ['', [Validators.required, Validators.min(0.1)]],
      midThighMm: ['', [Validators.required, Validators.min(0.1)]],
      calfMm: ['', [Validators.min(0.1)]]                // opcional — não entra no JP7
    })
  });

  ngOnInit() {
    // Lado predominante: revalida quais campos de membro são obrigatórios
    // sempre que o personal digita (ver updateSymmetryValidators).
    this.circumferencesGroup.valueChanges.subscribe(() => this.updateSymmetryValidators());
    this.updateSymmetryValidators();

    this.route.params.subscribe(p => {
      const editId = p['id_aval'] ?? null;
      this.editAssessmentId.set(editId);
      this.isEditMode.set(!!editId);
      if (p['id']) {
        this.dataService.getStudent(p['id']).subscribe({
          next: (res) => {
            this.student.set(res);
            if (editId) this.prefillForEdit(res, editId);
          },
          error: (err) => console.error('Erro ao carregar aluno:', err),
        });
      }
    });
  }

  private get circumferencesGroup(): FormGroup {
    return this.assessmentForm.get('circumferences') as FormGroup;
  }

  // Campos que definem um "lado completo" (antebraço é sempre opcional).
  private readonly rightSideFields = ['rightArmRelaxedCm', 'rightArmFlexedCm', 'rightThighProximalCm', 'rightCalfCm'];
  private readonly leftSideFields = ['leftArmRelaxedCm', 'leftArmFlexedCm', 'leftThighProximalCm', 'leftCalfCm'];

  /**
   * Regra do lado predominante:
   * - Se um lado tem qualquer dado, os 4 campos desse lado ficam obrigatórios (não dá pra preencher meio lado).
   * - Se nenhum lado tem dado, exige o lado direito por padrão (garante ao menos um lado completo).
   * Assim, o modal de validação existente lista exatamente os campos que faltam.
   */
  private updateSymmetryValidators() {
    const grp = this.circumferencesGroup;
    if (!grp) return;

    const hasValue = (name: string) => {
      const v = grp.get(name)?.value;
      return v !== null && v !== undefined && `${v}`.trim() !== '';
    };
    const rightFilled = this.rightSideFields.some(hasValue);
    const leftFilled = this.leftSideFields.some(hasValue);

    let requireRight = rightFilled;
    let requireLeft = leftFilled;
    if (!requireRight && !requireLeft) requireRight = true; // padrão: ao menos um lado completo

    const apply = (names: string[], required: boolean) => {
      for (const name of names) {
        const ctrl = grp.get(name);
        if (!ctrl) continue;
        const validators = required
          ? [Validators.required, Validators.min(0.1)]
          : [Validators.min(0.1)];
        ctrl.setValidators(validators);
        ctrl.updateValueAndValidity({ emitEvent: false });
      }
    };
    apply(this.rightSideFields, requireRight);
    apply(this.leftSideFields, requireLeft);
  }

  private prefillForEdit(std: Student, assessmentId: string) {
    const aval = std.avaliacoes.find(a => a.id === assessmentId);
    if (!aval) {
      this.toast.error('Avaliação não encontrada para edição.');
      return;
    }
    const b = aval.bioimpedancias, c = aval.circunferencias, s = aval.dobras_cutaneas;
    this.assessmentForm.patchValue({
      date: aval.date,
      lastMenstruationDate: aval.last_menstruation_date ?? '',
      menstrualCycleRegular: aval.menstrual_cycle_regular === true ? 'true' : aval.menstrual_cycle_regular === false ? 'false' : '',
      bioimpedance: {
        isAthlete: b?.is_athlete ?? false,
        weightKg: b?.weight_kg ?? '',
        bodyFatPercentage: b?.body_fat_percentage ?? '',
        skeletalMusclePercentage: b?.skeletal_muscle_percentage ?? '',
        restingMetabolismKcal: b?.resting_metabolism_kcal ?? '',
        bodyAge: b?.body_age ?? '',
        visceralFatLevel: b?.visceral_fat_level ?? '',
        waterPercentage: b?.water_percentage ?? '',
      },
      circumferences: {
        neckCm: c?.neck_cm ?? '', shoulderCm: c?.shoulder_cm ?? '', chestCm: c?.chest_cm ?? '',
        waistCm: c?.waist_cm ?? '', abdomenCm: c?.abdomen_cm ?? '', hipCm: c?.hip_cm ?? '', bustCm: c?.bust_cm ?? '',
        rightArmRelaxedCm: c?.right_arm_relaxed_cm ?? '', leftArmRelaxedCm: c?.left_arm_relaxed_cm ?? '',
        rightArmFlexedCm: c?.right_arm_flexed_cm ?? '', leftArmFlexedCm: c?.left_arm_flexed_cm ?? '',
        rightForearmCm: c?.right_forearm_cm ?? '', leftForearmCm: c?.left_forearm_cm ?? '',
        rightThighProximalCm: c?.right_thigh_proximal_cm ?? '', leftThighProximalCm: c?.left_thigh_proximal_cm ?? '',
        rightThighMedialCm: c?.right_thigh_medial_cm ?? '', leftThighMedialCm: c?.left_thigh_medial_cm ?? '',
        rightThighDistalCm: c?.right_thigh_distal_cm ?? '', leftThighDistalCm: c?.left_thigh_distal_cm ?? '',
        rightCalfCm: c?.right_calf_cm ?? '', leftCalfCm: c?.left_calf_cm ?? '',
      },
      skinfolds: {
        protocol: s?.protocol ?? '7_dobras',
        tricepsMm: s?.triceps_mm ?? '', bicepsMm: s?.biceps_mm ?? '', subscapularMm: s?.subscapular_mm ?? '',
        chestMm: s?.chest_mm ?? '', midaxillaryMm: s?.midaxillary_mm ?? '', suprailiacMm: s?.suprailiac_mm ?? '',
        abdominalMm: s?.abdominal_mm ?? '', midThighMm: s?.mid_thigh_mm ?? '', calfMm: s?.calf_mm ?? '',
      },
    });
    this.updateSymmetryValidators();
  }

  onSubmit() {
    if (this.assessmentForm.invalid) {
      this.assessmentForm.markAllAsTouched();
      this.collectMissingFields();
      this.showValidationModal.set(true);
      return;
    }
    this.showValidationModal.set(false);
    const std = this.student();
    if (!std) return;

    this.isSubmitting.set(true);
    const v = this.assessmentForm.value;
    const lastMenstruationDate = v.lastMenstruationDate || null;
    const menstrualCycleRegular = toOptionalBoolean(v.menstrualCycleRegular) ?? null;
    const bioimpedance = {
      weight_kg: +v.bioimpedance.weightKg,
      body_fat_percentage: +v.bioimpedance.bodyFatPercentage,
      skeletal_muscle_percentage: +v.bioimpedance.skeletalMusclePercentage,
      resting_metabolism_kcal: +v.bioimpedance.restingMetabolismKcal,
      body_age: +v.bioimpedance.bodyAge,
      visceral_fat_level: +v.bioimpedance.visceralFatLevel,
      water_percentage: v.bioimpedance.waterPercentage ? +v.bioimpedance.waterPercentage : undefined,
      is_athlete: !!v.bioimpedance.isAthlete,
    };
    const circumferences = {
      neck_cm: +v.circumferences.neckCm,
      shoulder_cm: +v.circumferences.shoulderCm,
      chest_cm: +v.circumferences.chestCm,
      waist_cm: +v.circumferences.waistCm,
      abdomen_cm: +v.circumferences.abdomenCm,
      hip_cm: +v.circumferences.hipCm,
      bust_cm: toOptionalNumber(v.circumferences.bustCm),
      // Membros bilaterais: lado não medido vai como undefined (→ NULL no banco), nunca 0.
      right_arm_relaxed_cm: v.circumferences.rightArmRelaxedCm ? +v.circumferences.rightArmRelaxedCm : undefined,
      left_arm_relaxed_cm: v.circumferences.leftArmRelaxedCm ? +v.circumferences.leftArmRelaxedCm : undefined,
      right_arm_flexed_cm: v.circumferences.rightArmFlexedCm ? +v.circumferences.rightArmFlexedCm : undefined,
      left_arm_flexed_cm: v.circumferences.leftArmFlexedCm ? +v.circumferences.leftArmFlexedCm : undefined,
      right_forearm_cm: v.circumferences.rightForearmCm ? +v.circumferences.rightForearmCm : undefined,
      left_forearm_cm: v.circumferences.leftForearmCm ? +v.circumferences.leftForearmCm : undefined,
      right_thigh_proximal_cm: v.circumferences.rightThighProximalCm ? +v.circumferences.rightThighProximalCm : undefined,
      left_thigh_proximal_cm: v.circumferences.leftThighProximalCm ? +v.circumferences.leftThighProximalCm : undefined,
      right_thigh_medial_cm: toOptionalNumber(v.circumferences.rightThighMedialCm),
      left_thigh_medial_cm: toOptionalNumber(v.circumferences.leftThighMedialCm),
      right_thigh_distal_cm: toOptionalNumber(v.circumferences.rightThighDistalCm),
      left_thigh_distal_cm: toOptionalNumber(v.circumferences.leftThighDistalCm),
      right_calf_cm: v.circumferences.rightCalfCm ? +v.circumferences.rightCalfCm : undefined,
      left_calf_cm: v.circumferences.leftCalfCm ? +v.circumferences.leftCalfCm : undefined,
    };
    const skinfolds = {
      protocol: v.skinfolds.protocol ?? '7_dobras',
      triceps_mm: +v.skinfolds.tricepsMm,
      biceps_mm: toOptionalNumber(v.skinfolds.bicepsMm),
      subscapular_mm: +v.skinfolds.subscapularMm,
      chest_mm: +v.skinfolds.chestMm,
      midaxillary_mm: +v.skinfolds.midaxillaryMm,
      suprailiac_mm: +v.skinfolds.suprailiacMm,
      abdominal_mm: +v.skinfolds.abdominalMm,
      mid_thigh_mm: +v.skinfolds.midThighMm,
      calf_mm: toOptionalNumber(v.skinfolds.calfMm),
    };

    const editId = this.editAssessmentId();
    const request$ = editId
      ? this.dataService.updateAssessment({ avaliacao_id: editId, date: v.date, last_menstruation_date: lastMenstruationDate, menstrual_cycle_regular: menstrualCycleRegular, bioimpedance, circumferences, skinfolds })
      : this.dataService.addAssessment({ aluno_id: std.id, date: v.date, last_menstruation_date: lastMenstruationDate, menstrual_cycle_regular: menstrualCycleRegular, bioimpedance, circumferences, skinfolds });

    request$.subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.toast.success(editId ? 'Avaliação atualizada com sucesso!' : 'Avaliação salva com sucesso!');
        this.router.navigate(['/alunos', std.id]);
      },
      error: (err) => {
        console.error(err);
        this.isSubmitting.set(false);
        this.toast.error(err?.message ?? 'Erro ao guardar a avaliação.');
      }
    });
  }

  // Auto-conversão CM → MM para dobras cutâneas (valores < 6 quase sempre são cm)
  maybeConvertSkinfold(controlName: string) {
    const ctrl = (this.assessmentForm.get('skinfolds') as FormGroup)?.get(controlName);
    if (!ctrl) return;
    const num = parseFloat(ctrl.value);
    if (shouldConvertCmToMm(num)) {
      const mm = cmToMm(num);
      ctrl.setValue(mm);
      this.toast.info(`Medida ${num} cm convertida para ${mm} mm.`);
    }
  }
}


// ==========================================
// 7. ASSESSMENT REPORT COMPONENT (Linhas e Radar)
// ==========================================
@Component({
  selector: 'app-assessment-report',
  standalone: true,
  imports: [CommonModule, RouterLink, MatIconModule],
  template: `
    <div class="space-y-6 animate-fade-in" #reportContainer id="pdf-report-content">
      @if (isLoading()) {
        <div class="py-12 text-center text-slate-400">
          <div class="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          Carregando relatório de avaliação...
        </div>
      } @else {
        @if (student(); as std) {
          @if (assessment(); as current) {
            <!-- Header do Relatório -->
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-[#141417] p-6 rounded-2xl border border-white/5 no-print-section">
              <div>
                <h1 class="text-xl font-extrabold tracking-tight text-white font-sans flex items-center gap-1.5">
                  <mat-icon class="text-blue-500">assignment_turned_in</mat-icon>
                  Relatório de Avaliação Física
                </h1>
                <p class="text-xs text-slate-400">
                  Aluno: <span class="text-blue-400 font-semibold">{{ std.name }}</span> • 
                  Período: <span class="text-slate-350">{{ current.date | date:'dd/MM/yyyy' }}</span>
                </p>
              </div>

              <!-- Ações Export/WhatsApp -->
              <div class="flex items-center gap-2 ml-auto md:ml-0">
                <button 
                  (click)="sendWhatsApp(std, current)"
                  class="px-3.5 py-2 bg-[#1C1C21] hover:bg-[#25252B] border border-white/10 rounded-xl text-xs font-bold text-slate-300 flex items-center gap-1.5 transition-colors"
                >
                  <mat-icon class="!text-sm text-emerald-400">phone</mat-icon>
                  Enviar WhatsApp
                </button>
                <a
                  [routerLink]="['/alunos', std.id, 'avaliacoes', current.id, 'editar']"
                  class="px-3.5 py-2 bg-[#1C1C21] hover:bg-[#25252B] border border-white/10 rounded-xl text-xs font-bold text-slate-300 flex items-center gap-1.5 transition-colors"
                >
                  <mat-icon class="!text-sm text-amber-400">edit</mat-icon>
                  Editar
                </a>
                <button
                  (click)="exportPDF(std.name)"
                  [disabled]="isGeneratingPdf()"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-650 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all shadow-md shadow-blue-500/10"
                >
                  <mat-icon class="!text-sm">{{ isGeneratingPdf() ? 'hourglass_bottom' : 'cloud_download' }}</mat-icon>
                  {{ isGeneratingPdf() ? 'Gerando...' : 'Exportar PDF' }}
                </button>
              </div>
            </div>

            <!-- PDF Template Top Branding (Display apenas no PDF ou para identificar o relatório) -->
            <div class="hidden print-branding p-6 bg-[#141417] border-b border-white/5 rounded-t-2xl flex items-center justify-between">
              <div class="flex items-center gap-2">
                <div class="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-black text-white text-xs">FPT</div>
                <div>
                  <h2 class="text-sm font-bold text-white">FocusPT Personal</h2>
                  <p class="text-[9px] text-slate-400">Relatório Oficial de Estudo Antropométrico</p>
                </div>
              </div>
              <div class="text-right">
                <p class="text-xs font-bold text-white">Avaliação: {{ current.date | date:'dd/MM/yyyy' }}</p>
                <p class="text-[9px] text-slate-500">FocusPT Personal Trainer</p>
              </div>
            </div>

            <!-- Key Stats Row -->
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
              <!-- Peso -->
              <div class="bg-[#141417] p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
                <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Peso Corporal</span>
                <div class="flex items-baseline gap-1">
                  <h2 class="text-2xl font-extrabold text-white">{{ current.bioimpedancias.weight_kg }}</h2>
                  <span class="text-xs text-slate-400">kg</span>
                </div>
                <div class="mt-2 text-[10px] text-slate-400 flex items-center gap-1">
                  @if (weightDelta() !== 0) {
                    <span [ngClass]="weightDelta() < 0 ? 'text-emerald-400' : 'text-red-400'" class="font-bold">
                      {{ weightDelta() > 0 ? '+' : '' }}{{ weightDelta() | number:'1.1-1' }} kg
                    </span>
                    <span>vs anterior</span>
                  } @else {
                    <span>Estável</span>
                  }
                </div>
              </div>

              <!-- Gordura -->
              <div class="bg-[#141417] p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
                <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Gordura Corporal</span>
                <div class="flex items-baseline gap-1">
                  <h2 class="text-2xl font-extrabold text-white">{{ current.body_fat_percentage }}</h2>
                  <span class="text-xs text-slate-400">%</span>
                </div>
                <div class="mt-2 text-[10px] text-slate-450">
                  Classificação (bioimp.): <strong [ngClass]="fatClassColor(current.body_fat_classification)">{{ current.body_fat_classification }}</strong>
                </div>
              </div>

              <!-- Músculo -->
              <div class="bg-[#141417] p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
                <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Massa Músculo</span>
                <div class="flex items-baseline gap-1">
                  <h2 class="text-2xl font-extrabold text-white">{{ current.bioimpedancias.skeletal_muscle_percentage }}</h2>
                  <span class="text-xs text-slate-400">%</span>
                </div>
                <div class="mt-2 text-[10px] text-slate-400">
                  Massa Magra: <strong class="text-blue-400">{{ current.lean_mass_kg }} kg</strong>
                </div>
              </div>

              <!-- Gordura Visceral -->
              <div class="bg-[#141417] p-5 rounded-2xl border border-white/5 flex flex-col justify-between">
                <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider mb-2">Gordura Visceral</span>
                <div class="flex items-baseline justify-between">
                  <h2 class="text-2xl font-extrabold text-white">{{ current.bioimpedancias.visceral_fat_level }}</h2>
                  
                  <!-- Badge classificação Visceral Omron -->
                  <span class="text-[8px] tracking-wider px-2 py-0.5 rounded uppercase font-extrabold"
                        [ngClass]="getVisceralBadgeColor(current.bioimpedancias.visceral_fat_level)">
                    {{ getVisceralClassification(current.bioimpedancias.visceral_fat_level) }}
                  </span>
                </div>
                <p class="text-[9px] text-slate-500 mt-2">Nível Omron ideal: menor que 10</p>
              </div>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <!-- Radar Chart: Perímetros Estudo Antropométrico -->
              <div class="bg-[#141417] rounded-2xl border border-white/5 p-6 space-y-4">
                <div class="flex justify-between items-center border-b border-white/5 pb-3">
                  <div>
                    <h3 class="text-sm font-bold text-white">Antropometria (Perímetros)</h3>
                    <p class="text-[10px] text-slate-400">Análise de circunferências e biotipo de treino</p>
                  </div>
                  <div class="flex items-center gap-3 text-[9px] uppercase font-bold tracking-wider">
                    @if (previousAssessment()) {
                      <div class="flex items-center gap-1">
                        <span class="w-1.5 h-1.5 rounded-full bg-slate-600 block"></span>
                        Anterior
                      </div>
                    }
                    <div class="flex items-center gap-1 text-blue-400">
                      <span class="w-1.5 h-1.5 rounded-full bg-blue-500 block"></span>
                      Atual
                    </div>
                  </div>
                </div>

                <!-- Native Mathematical SVG Radar Chart -->
                <div class="flex items-center justify-center p-4">
                  <svg width="290" height="290" viewBox="0 0 300 300" class="max-w-full">
                    <!-- Base Spider Grids -->
                    <circle cx="150" cy="150" r="120" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
                    <circle cx="150" cy="150" r="90" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
                    <circle cx="150" cy="150" r="60" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1" />
                    <circle cx="150" cy="150" r="30" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="1" />

                    <!-- Rays lines -->
                    @for (ray of radarKeys(); track $index) {
                      @let angle = $index * (2 * 3.1415) / radarKeys().length - 3.1415/2;
                      @let sx = 150 + 120 * cosCos(angle);
                      @let sy = 150 + 120 * sinSin(angle);
                      <line x1="150" y1="150" [attr.x2]="sx" [attr.y2]="sy" stroke="rgba(255,255,255,0.03)" stroke-width="1" />
                      
                      <!-- Ray Labels -->
                      @let tx = 150 + 140 * cosCos(angle);
                      @let ty = 150 + 140 * sinSin(angle);
                      <text [attr.x]="tx" [attr.y]="ty" 
                            text-anchor="middle" 
                            dominant-baseline="middle"
                            fill="#94A3B8" 
                            font-size="9"
                            font-weight="bold">
                        {{ ray }}
                      </text>
                    }

                    <!-- Polígono Anterior se houver -->
                    @if (previousAssessment(); as prev) {
                      <polygon [attr.points]="getRadarPolygonPoints(prev)" 
                               fill="rgba(148, 163, 184, 0.15)" 
                               stroke="#64748B" 
                               stroke-width="1.5" />
                    }

                    <!-- Polígono Atual -->
                    <polygon [attr.points]="getRadarPolygonPoints(current)" 
                             fill="rgba(59, 130, 246, 0.25)" 
                             stroke="#3B82F6" 
                             stroke-width="2.5" />
                  </svg>
                </div>
              </div>

              <!-- Dobras Cutâneas & Composicão -->
              <div class="bg-[#141417] rounded-2xl border border-white/5 p-6 space-y-4 flex flex-col justify-between">
                <div>
                  <h3 class="text-sm font-bold text-white border-b border-white/5 pb-3 mb-4">Adipometria (Dobra Cutânea mm)</h3>
                  
                  <div class="space-y-2.5">
                    <!-- Progress Bar for Abdominal skinfold -->
                    <div class="space-y-1">
                      <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-450">Abdominal</span>
                        <div class="flex gap-2">
                          @if (previousAssessment()) {
                            <span class="text-slate-500 font-mono text-[10px]">{{ previousAssessment()?.dobras_cutaneas?.abdominal_mm }}mm</span>
                          }
                          <span class="text-white font-mono font-bold">{{ current.dobras_cutaneas.abdominal_mm }} mm</span>
                        </div>
                      </div>
                      <div class="h-1.5 bg-[#1C1C21] rounded-full overflow-hidden">
                        <div class="h-full bg-blue-500 rounded-full" [style.width.%]="current.dobras_cutaneas.abdominal_mm * 2"></div>
                      </div>
                    </div>

                    <!-- Suprailiaca -->
                    <div class="space-y-1">
                      <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-450">Supra-ilíaca</span>
                        <div class="flex gap-2">
                          @if (previousAssessment()) {
                            <span class="text-slate-500 font-mono text-[10px]">{{ previousAssessment()?.dobras_cutaneas?.suprailiac_mm }}mm</span>
                          }
                          <span class="text-white font-mono font-bold">{{ current.dobras_cutaneas.suprailiac_mm }} mm</span>
                        </div>
                      </div>
                      <div class="h-1.5 bg-[#1C1C21] rounded-full overflow-hidden">
                        <div class="h-full bg-[#10B981] rounded-full" [style.width.%]="current.dobras_cutaneas.suprailiac_mm * 2.5"></div>
                      </div>
                    </div>

                    <!-- Peitoral -->
                    <div class="space-y-1">
                      <div class="flex justify-between items-center text-xs">
                        <span class="text-slate-450">Peitoral</span>
                        <div class="flex gap-2">
                          @if (previousAssessment()) {
                            <span class="text-slate-500 font-mono text-[10px]">{{ previousAssessment()?.dobras_cutaneas?.chest_mm }}mm</span>
                          }
                          <span class="text-white font-mono font-bold">{{ current.dobras_cutaneas.chest_mm }} mm</span>
                        </div>
                      </div>
                      <div class="h-1.5 bg-[#1C1C21] rounded-full overflow-hidden">
                        <div class="h-full bg-indigo-500 rounded-full" [style.width.%]="current.dobras_cutaneas.chest_mm * 3"></div>
                      </div>
                    </div>

                    <div class="pt-4 border-t border-white/5 grid grid-cols-3 gap-2 text-center">
                      <div class="p-2 bg-[#1C1C21] rounded-xl">
                        <span class="text-[8px] font-bold text-slate-500 uppercase tracking-widest block">Tríceps</span>
                        <span class="text-xs font-semibold text-slate-200">{{ current.dobras_cutaneas.triceps_mm }}mm</span>
                      </div>
                      <div class="p-2 bg-[#1C1C21] rounded-xl">
                        <span class="text-[8px] font-bold text-slate-500 uppercase tracking-widest block">Bíceps</span>
                        <span class="text-xs font-semibold text-slate-200">{{ current.dobras_cutaneas.biceps_mm != null ? current.dobras_cutaneas.biceps_mm + 'mm' : '—' }}</span>
                      </div>
                      <div class="p-2 bg-[#1C1C21] rounded-xl">
                        <span class="text-[8px] font-bold text-slate-500 uppercase tracking-widest block">Coxa</span>
                        <span class="text-xs font-semibold text-slate-200">{{ current.dobras_cutaneas.mid_thigh_mm }}mm</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="pt-4 mt-4 border-t border-white/5 space-y-1.5">
                  <div class="flex items-center justify-between text-xs text-slate-400">
                    <span>Metabolismo Basal (Gerado no Exame)</span>
                    <strong class="text-white">{{ current.bioimpedancias.resting_metabolism_kcal }} kcal</strong>
                  </div>
                  <div class="flex items-center justify-between text-xs text-slate-400">
                    <span>Idade Biológica Corpórea</span>
                    <strong class="text-slate-200">{{ current.bioimpedancias.body_age }} anos</strong>
                  </div>
                </div>
              </div>
            </div>

            <!-- Tabela detalhada de Simetria e Perímetros -->
            <div class="bg-[#141417] rounded-2xl border border-white/5 p-6 space-y-4">
              <h3 class="text-sm font-bold text-white border-b border-white/5 pb-3">História Comparativa de Membros de Controle</h3>
              
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs text-slate-300">
                  <thead>
                    <tr class="text-slate-500 uppercase text-[9px] font-extrabold tracking-wider border-b border-white/5">
                      <th class="py-2">Membro</th>
                      <th class="py-2">Lado Direito (Cm)</th>
                      <th class="py-2">Lado Esquerdo (Cm)</th>
                      <th class="py-2">Diferença Simetria</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-white/5">
                    <tr>
                      <td class="py-2.5 font-bold text-white">Braço Relaxado</td>
                      <td class="py-2.5">{{ current.circunferencias.right_arm_relaxed_cm }} cm</td>
                      <td class="py-2.5">{{ current.circunferencias.left_arm_relaxed_cm }} cm</td>
                      <td class="py-2.5">
                        <span [ngClass]="getSimetriaColor(current.circunferencias.right_arm_relaxed_cm, current.circunferencias.left_arm_relaxed_cm)">
                          {{ getSimetriaValue(current.circunferencias.right_arm_relaxed_cm, current.circunferencias.left_arm_relaxed_cm) }}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td class="py-2.5 font-bold text-white">Braço Contraído</td>
                      <td class="py-2.5">{{ current.circunferencias.right_arm_flexed_cm }} cm</td>
                      <td class="py-2.5">{{ current.circunferencias.left_arm_flexed_cm }} cm</td>
                      <td class="py-2.5">
                        <span [ngClass]="getSimetriaColor(current.circunferencias.right_arm_flexed_cm, current.circunferencias.left_arm_flexed_cm)">
                          {{ getSimetriaValue(current.circunferencias.right_arm_flexed_cm, current.circunferencias.left_arm_flexed_cm) }}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td class="py-2.5 font-bold text-white">Coxa Proximal</td>
                      <td class="py-2.5">{{ current.circunferencias.right_thigh_proximal_cm }} cm</td>
                      <td class="py-2.5">{{ current.circunferencias.left_thigh_proximal_cm }} cm</td>
                      <td class="py-2.5">
                        <span [ngClass]="getSimetriaColor(current.circunferencias.right_thigh_proximal_cm, current.circunferencias.left_thigh_proximal_cm)">
                          {{ getSimetriaValue(current.circunferencias.right_thigh_proximal_cm, current.circunferencias.left_thigh_proximal_cm) }}
                        </span>
                      </td>
                    </tr>
                    <tr>
                      <td class="py-2.5 font-bold text-white">Panturrilha</td>
                      <td class="py-2.5">{{ current.circunferencias.right_calf_cm }} cm</td>
                      <td class="py-2.5">{{ current.circunferencias.left_calf_cm }} cm</td>
                      <td class="py-2.5">
                        <span [ngClass]="getSimetriaColor(current.circunferencias.right_calf_cm, current.circunferencias.left_calf_cm)">
                          {{ getSimetriaValue(current.circunferencias.right_calf_cm, current.circunferencias.left_calf_cm) }}
                        </span>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Observações do Relatório -->
            <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-3 no-print-section">
              <div class="flex items-center justify-between gap-3">
                <h3 class="text-sm font-bold text-white flex items-center gap-1.5">
                  <mat-icon class="text-blue-500 !text-base">edit_note</mat-icon>
                  Observações do Relatório
                </h3>
                <span class="text-[10px] text-slate-500">Aparece no PDF exportado</span>
              </div>
              <textarea
                [value]="observacoes()"
                (input)="onObsInput($event)"
                rows="4"
                placeholder="Escreva orientações, evolução, recomendações ou qualquer observação para este aluno. Será incluída no PDF."
                class="w-full bg-[#0E0E11] border border-white/10 rounded-xl p-3 text-sm text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-blue-500/60 resize-y"
              ></textarea>
              <div class="flex items-center justify-end gap-3">
                @if (obsSaved()) {
                  <span class="text-[11px] text-emerald-400 font-semibold flex items-center gap-1">
                    <mat-icon class="!text-sm h-4">check_circle</mat-icon>
                    Observações salvas
                  </span>
                }
                <button
                  (click)="saveObservacoes()"
                  [disabled]="isSavingObs()"
                  class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-650 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-all"
                >
                  <mat-icon class="!text-sm">{{ isSavingObs() ? 'hourglass_bottom' : 'save' }}</mat-icon>
                  {{ isSavingObs() ? 'Salvando...' : 'Salvar Observações' }}
                </button>
              </div>
            </div>

            <!-- Back to profile link -->
            <div class="flex justify-start pt-2 no-print-section">
              <a [routerLink]="['/alunos', std.id]" class="text-xs text-blue-500 hover:text-blue-400 font-bold flex items-center gap-1">
                <mat-icon class="!text-sm h-4">arrow_back</mat-icon>
                Voltar para o Perfil do Aluno
              </a>
            </div>
          @}
        @}
      }
    </div>
  `
})
export class AssessmentReportComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(DialogService);

  student = signal<Student | null>(null);
  assessment = signal<Assessment | null>(null);
  previousAssessment = signal<Assessment | null>(null);
  isLoading = signal(true);
  isGeneratingPdf = signal(false);
  observacoes = signal('');
  isSavingObs = signal(false);
  obsSaved = signal(false);

  weightDelta = computed(() => {
    const cur = this.assessment();
    const prev = this.previousAssessment();
    if (!cur || !prev) return 0;
    return (cur.bioimpedancias?.weight_kg ?? 0) - (prev.bioimpedancias?.weight_kg ?? 0);
  });

  radarKeys = signal(['TÓRAX', 'CINTURA', 'ABDOMEN', 'QUADRIL', 'BRAÇO R.', 'COXA R.']);

  ngOnInit() {
    this.route.params.subscribe(p => {
      const studentId = p['id'];
      const assessmentId = p['id_aval'];
      if (studentId && assessmentId) {
        this.loadReportData(studentId, assessmentId);
      }
    });
  }

  loadReportData(studentId: string, assessmentId: string) {
    this.isLoading.set(true);
    this.dataService.getStudent(studentId).subscribe({
      next: (std) => {
        this.student.set(std);
        // avaliacoes are sorted DESC (newest first), so "previous" = index + 1
        const currentIndex = std.avaliacoes.findIndex(a => a.id === assessmentId);
        if (currentIndex !== -1) {
          const cur = std.avaliacoes[currentIndex];
          this.assessment.set(cur);
          this.observacoes.set(cur.observacoes ?? '');
          const older = std.avaliacoes[currentIndex + 1] ?? null;
          this.previousAssessment.set(older);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.isLoading.set(false);
      }
    });
  }

  cosCos(angle: number) {
    return Math.cos(angle);
  }

  sinSin(angle: number) {
    return Math.sin(angle);
  }

  // Calculate coordinates dynamic points for SVG Polygon
  getRadarPolygonPoints(aval: Assessment): string {
    const keys = this.radarKeys();
    const maxVal = 130; // Max perimeter scale context cm

    const c = aval.circunferencias;
    const values = [
      c?.chest_cm ?? 90,
      c?.waist_cm ?? 80,
      c?.abdomen_cm ?? 85,
      c?.hip_cm ?? 100,
      c?.right_arm_flexed_cm ?? 38,
      c?.right_thigh_proximal_cm ?? 55
    ];

    const points = values.map((val, idx) => {
      const angle = idx * (2 * Math.PI) / keys.length - Math.PI / 2;
      // Normalise to maxVal
      const percent = Math.min(val / maxVal, 1.0);
      const r = percent * 120; // max SVG radius inside circle 120
      const x = 150 + r * Math.cos(angle);
      const y = 150 + r * Math.sin(angle);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    return points.join(' ');
  }

  getVisceralClassification(level: number): string {
    if (level >= 15) return 'Muito Alto';
    if (level >= 10) return 'Alto';
    return 'Normal';
  }

  getVisceralBadgeColor(level: number): string {
    if (level >= 15) return 'bg-red-500/20 text-red-400 border border-red-500/40';
    if (level >= 10) return 'bg-amber-500/20 text-amber-400 border border-amber-500/40';
    return 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
  }

  getSimetriaValue(right: number | null | undefined, left: number | null | undefined): string {
    if (right == null || left == null) return '—';
    const diff = Math.abs(right - left);
    if (diff === 0) return 'Simétrico';
    return `${right > left ? 'Dir. +' : 'Esq. +'}${diff.toFixed(1)} cm`;
  }

  getSimetriaColor(right: number | null | undefined, left: number | null | undefined): string {
    if (right == null || left == null) return 'text-slate-500';
    const diff = Math.abs(right - left);
    if (diff <= 0.5) return 'text-emerald-450 font-semibold';
    if (diff <= 1.5) return 'text-slate-300';
    return 'text-amber-400 font-bold';
  }

  /** Cor da classificação Omron do % gordura (Baixo não é "excelente"). */
  fatClassColor(label: string | null | undefined): string {
    switch (fatClassificationTone(label)) {
      case 'good': return 'text-emerald-400';
      case 'warn': return 'text-amber-400';
      case 'bad': return 'text-red-400';
      default: return 'text-slate-300';
    }
  }

  sendWhatsApp(std: Student, cur: Assessment) {
    const phone = std.phone_number ? std.phone_number.replace(/\D/g, '') : '';
    const textMessage = `Olá ${std.name}, sua nova avaliação está pronta! Resumo: Peso: ${cur.bioimpedancias?.weight_kg ?? '—'}kg, Gordura: ${cur.body_fat_percentage}%. Veja mais detalhes na nossa plataforma.`;
    const encodedText = encodeURIComponent(textMessage);
    
    // Redirect via browser window
    const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodedText}`;
    if (typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener');
    }
  }

  onObsInput(event: Event) {
    this.observacoes.set((event.target as HTMLTextAreaElement).value);
    this.obsSaved.set(false);
  }

  saveObservacoes() {
    const aval = this.assessment();
    if (!aval) return;
    this.isSavingObs.set(true);
    this.dataService.updateObservacoes(aval.id, this.observacoes()).subscribe({
      next: (saved) => {
        // Reflete o valor salvo (normalizado pelo backend) no estado local
        const texto = saved?.observacoes ?? '';
        this.observacoes.set(texto);
        this.assessment.set({ ...aval, observacoes: texto });
        this.isSavingObs.set(false);
        this.obsSaved.set(true);
        this.cdr.detectChanges();
      },
      error: (err) => {
        console.error('[saveObservacoes]', err);
        this.isSavingObs.set(false);
        this.dialog.alert({ title: 'Erro ao salvar', message: err instanceof Error ? err.message : 'Tente novamente.', tone: 'error' });
      },
    });
  }

  async exportPDF(studentName: string) {
    const std = this.student();
    const aval = this.assessment();
    if (!std || !aval) {
      this.dialog.alert({ title: 'Aguarde', message: 'Aguarde o carregamento completo da avaliação e tente novamente.', tone: 'info' });
      return;
    }

    this.isGeneratingPdf.set(true);
    this.cdr.detectChanges();

    try {
      // Converte fotos para base64 para embutir no PDF
      const photos: PdfPhoto[] = [];
      for (const foto of std.fotos) {
        if (!foto.url) continue;
        try {
          const resp = await fetch(foto.url);
          const blob = await resp.blob();
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
          });
          photos.push({ category: foto.category, date: foto.date, dataUrl });
        } catch {
          // Foto inacessível — ignora e continua
        }
      }

      const doc = generateAssessmentPDF({
        student: std,
        assessment: aval,
        previous: this.previousAssessment(),
        trainerName: getTrainerName(),
        generatedAt: new Date(),
        photos,
        observacoes: this.observacoes(),
      });
      const safeName = studentName.replace(/\s+/g, '_').replace(/[^\w-]/g, '');
      doc.save(`Avaliacao_Fisica_${safeName}_${aval.date}.pdf`);
    } catch (err) {
      console.error('[exportPDF]', err);
      this.dialog.alert({ title: 'Erro ao gerar PDF', message: err instanceof Error ? err.message : 'Tente novamente.', tone: 'error' });
    } finally {
      this.isGeneratingPdf.set(false);
      this.cdr.detectChanges();
    }
  }
}


// ==========================================
// 8. STUDENT GALLERY COMPONENT (Fotos)
// ==========================================
@Component({
  selector: 'app-student-gallery',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6 animate-fade-in">
      @if (isLoading()) {
        <div class="py-12 text-center text-slate-400">
          <div class="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          Carregando galeria do aluno...
        </div>
      } @else {
        @if (student(); as std) {
          <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h1 class="text-2xl font-extrabold tracking-tight text-white font-sans flex items-center gap-1.5">
                <mat-icon class="text-blue-500">photo_library</mat-icon>
                Galeria de Evolução por Fotos
              </h1>
              <p class="text-xs text-slate-450 font-medium">
                Aluno: <span class="text-blue-400">{{ std.name }}</span> • {{ std.fotos.length }} Fotos salvas
              </p>
            </div>
            <a [routerLink]="['/alunos', std.id]" class="px-4 py-2 bg-[#141417] hover:bg-[#1C1C21] text-xs font-bold text-slate-300 rounded-xl flex items-center gap-1.5 border border-white/5 transition-all">
              <mat-icon class="!text-sm h-4">arrow_back</mat-icon>
              Voltar Perfil
            </a>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <!-- Upload Column -->
            <div class="bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-4 h-fit">
              <h3 class="text-sm font-bold text-white flex items-center gap-1 pb-2 border-b border-white/5">
                <mat-icon class="text-blue-500 !text-sm">add_photo_alternate</mat-icon>
                Enviar Nova Foto
              </h3>

              <div class="space-y-4">
                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Categoria de Ângulo</label>
                  <select 
                    [value]="uploadCategory"
                    (change)="onCategorySelected($any($event.target).value)"
                    class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                  >
                    <option value="FRENTE">Frente</option>
                    <option value="LADO_DIREITO">Lado Direito</option>
                    <option value="LADO_ESQUERDO">Lado Esquerdo</option>
                    <option value="COSTAS">Costas</option>
                  </select>
                </div>

                <div class="space-y-1">
                  <label class="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Data da Foto</label>
                  <input 
                    type="date" 
                    [value]="uploadDate"
                    (change)="uploadDate = $any($event.target).value"
                    class="w-full px-3 py-2 bg-[#1C1C21] border border-white/5 rounded-xl text-xs text-white"
                  />
                </div>

                <!-- Drag & Drop Zone -->
                <div 
                  class="border-2 border-dashed rounded-2xl p-6 text-center transition-all cursor-pointer flex flex-col items-center justify-center space-y-2"
                  [ngClass]="dragActive() ? 'border-blue-500 bg-blue-500/5' : 'border-white/10 hover:border-blue-500/40'"
                  (click)="fileInput.click()"
                  (dragover)="onDragOver($event)"
                  (dragleave)="onDragLeave()"
                  (drop)="onDrop($event)"
                >
                  <input 
                    type="file" 
                    #fileInput 
                    class="hidden" 
                    accept="image/*" 
                    (change)="onFileSelected($event)" 
                  />
                  <mat-icon class="text-slate-500 !text-3xl h-8 w-8">cloud_upload</mat-icon>
                  <p class="text-xs font-bold text-slate-300">Arraste a foto ou clique para escolher</p>
                  <p class="text-[9px] text-slate-500">JPG, PNG, WEBP, GIF, BMP ou AVIF</p>
                </div>

                @if (uploadError()) {
                  <div class="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-[11px] text-red-400">
                    {{ uploadError() }}
                  </div>
                }

                @if (previewBase64()) {
                  <div class="space-y-2 p-3 bg-[#1C1C21] rounded-xl border border-white/5">
                    <p class="text-[10px] uppercase font-bold text-slate-500">Previsualização</p>
                    <img [src]="previewBase64()" alt="Upload preview" class="rounded max-h-36 object-cover mx-auto" referrerpolicy="no-referrer" />
                    <div class="flex justify-end gap-2 pt-1 border-t border-white/5">
                      <button (click)="previewBase64.set(''); uploadError.set('')" class="text-[10px] text-red-400 font-bold">Remover</button>
                    </div>
                  </div>
                }

                @if (isSubmitting()) {
                  <div class="py-2 text-center text-xs text-blue-400">
                    Salvando arquivo de imagem...
                  </div>
                }

                <button 
                  (click)="onPerformUpload(std.id)"
                  [disabled]="!previewBase64() || isSubmitting()"
                  class="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 text-xs font-extrabold text-white rounded-xl transition-all"
                >
                  Salvar Imagem na Galeria
                </button>
              </div>
            </div>

            <!-- Grid Photo list Column -->
            <div class="lg:col-span-2 bg-[#141417] p-6 rounded-2xl border border-white/5 space-y-4">
              <h3 class="text-sm font-bold text-white border-b border-white/5 pb-2">Fotos Cadastradas</h3>
              
              @if (std.fotos.length === 0) {
                <div class="py-12 text-center text-slate-500 text-xs">
                  Nenhuma imagem carregada na galeria. Envie uma imagem de controle ao lado.
                </div>
              } @else {
                <div class="grid grid-cols-2 md:grid-cols-3 gap-4">
                  @for (ph of std.fotos; track ph.id) {
                    <div class="bg-[#1C1C21] rounded-xl overflow-hidden border border-white/5 relative group">
                      <img [src]="ph.url ?? ph.storage_path" alt="Evolução" class="w-full aspect-square object-cover" referrerpolicy="no-referrer" />
                      
                      <!-- Overlay info -->
                      <div class="p-2 bg-gradient-to-t from-black via-black/40 to-transparent absolute inset-0 flex flex-col justify-between opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <div class="flex justify-end">
                          <button (click)="onDeletePhoto(std.id, ph.id)" class="bg-black/60 hover:bg-red-500/80 rounded p-1 text-slate-300 hover:text-white transition-colors">
                            <mat-icon class="!text-xs">delete</mat-icon>
                          </button>
                        </div>

                        <div>
                          <span class="text-[8px] bg-blue-600 text-white font-black px-1.5 py-0.5 rounded uppercase">
                            {{ categoryLabel(ph.category) }}
                          </span>
                          <p class="text-[10px] text-white font-mono font-bold mt-1">{{ ph.date | date:'dd/MM/yyyy' }}</p>
                        </div>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          </div>
        @}
      }
    </div>
  `
})
export class StudentGalleryComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);

  student = signal<Student | null>(null);
  isLoading = signal(true);
  isSubmitting = signal(false);

  dragActive = signal(false);
  previewBase64 = signal('');
  uploadError = signal('');

  uploadCategory: PhotoCategory = 'FRENTE';
  uploadDate = new Date().toISOString().substring(0, 10);

  onCategorySelected(val: string) {
    const valid: PhotoCategory[] = ['FRENTE', 'LADO_DIREITO', 'LADO_ESQUERDO', 'COSTAS'];
    if (valid.includes(val as PhotoCategory)) {
      this.uploadCategory = val as PhotoCategory;
    }
  }

  categoryLabel = categoryLabel;

  ngOnInit() {
    this.route.params.subscribe(p => {
      if (p['id']) {
        this.loadGallery(p['id']);
      }
    });
  }

  loadGallery(id: string) {
    this.isLoading.set(true);
    this.dataService.getStudent(id).subscribe({
      next: (std) => {
        this.student.set(std);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.isLoading.set(false);
      }
    });
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) {
      this.convertToBase64(file);
    }
  }

  onDragOver(e: DragEvent) {
    e.preventDefault();
    this.dragActive.set(true);
  }

  onDragLeave() {
    this.dragActive.set(false);
  }

  onDrop(e: DragEvent) {
    e.preventDefault();
    this.dragActive.set(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      this.convertToBase64(file);
    }
  }

  // Normaliza QUALQUER imagem decodificável pelo navegador (JPG, PNG, WEBP, GIF,
  // BMP, AVIF...) para JPEG via canvas: garante exibição, corrige orientação e
  // reduz o tamanho. Formatos que o navegador não decodifica (HEIC/TIFF) caem no onerror.
  convertToBase64(file: File) {
    this.uploadError.set('');
    if (!file.type.startsWith('image/')) {
      this.uploadError.set('O arquivo selecionado não é uma imagem.');
      return;
    }
    if (typeof document === 'undefined') return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onload = () => {
        const MAX = 1600;
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;
        if (width > MAX || height > MAX) {
          const scale = Math.min(MAX / width, MAX / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { this.previewBase64.set(dataUrl); return; }
        ctx.fillStyle = '#ffffff';            // evita fundo preto ao achatar PNG transparente
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        this.previewBase64.set(canvas.toDataURL('image/jpeg', 0.9));
      };
      img.onerror = () => {
        this.uploadError.set('Este formato não é suportado pelo navegador (ex: HEIC/TIFF). Converta para JPG ou PNG.');
      };
      img.src = dataUrl;
    };
    reader.onerror = () => this.uploadError.set('Falha ao ler o arquivo.');
    reader.readAsDataURL(file);
  }

  onPerformUpload(studentId: string) {
    if (!this.previewBase64()) return;
    this.isSubmitting.set(true);

    const base64 = extractBase64FromDataUrl(this.previewBase64()!);
    const payload = {
      aluno_id: studentId,
      date: this.uploadDate,
      category: this.uploadCategory,
      image_base64: base64,
      mime_type: 'image/jpeg',
    };

    this.dataService.addPhoto(payload).subscribe({
      next: () => {
        this.previewBase64.set('');
        this.loadGallery(studentId);
        this.isSubmitting.set(false);
        this.toast.success('Foto adicionada à galeria!');
      },
      error: (err) => {
        console.error(err);
        this.dialog.alert({ title: 'Erro', message: 'Erro ao carregar a foto do aluno.', tone: 'error' });
        this.isSubmitting.set(false);
      }
    });
  }

  async onDeletePhoto(studentId: string, photoId: string) {
    const ok = await this.dialog.confirm({
      title: 'Remover foto',
      message: 'Deseja realmente remover esta foto de evolução?',
      confirmText: 'Remover',
    });
    if (ok) {
      this.dataService.deletePhoto(photoId).subscribe({
        next: () => this.loadGallery(studentId),
        error: () => this.dialog.alert({ title: 'Erro', message: 'Erro ao remover foto. Tente novamente.', tone: 'error' }),
      });
    }
  }
}
