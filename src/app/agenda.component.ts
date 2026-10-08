import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { DataService, StudentSummary } from './data';
import { AgendaItem, AgendaPayload, groupByDay, weekLabel, weekStart, weekdayLong } from './agenda-utils';
import { addDays, formatBr, todayYmd } from './date-utils';
import { DialogService } from './dialog.service';
import { ToastService } from './toast.service';

// ==========================================
// AGENDA — visão semanal (segunda a domingo) com criar/editar/excluir
// ==========================================
@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, MatIconModule],
  template: `
    <div class="space-y-6">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 class="text-2xl font-extrabold tracking-tight text-white flex items-center gap-2">
            <mat-icon class="text-blue-500">calendar_month</mat-icon>
            Agenda
          </h1>
          <p class="text-xs text-slate-400 mt-1">Atendimentos da semana • {{ weekTitle() }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center bg-[#141417] border border-white/5 rounded-xl overflow-hidden">
            <button type="button" (click)="shiftWeek(-1)" class="p-2 text-slate-400 hover:text-white hover:bg-[#25252B] transition-colors" title="Semana anterior">
              <mat-icon class="!text-base flex items-center justify-center">chevron_left</mat-icon>
            </button>
            <button type="button" (click)="goToday()"
              [disabled]="isCurrentWeek()"
              class="px-3 py-2 text-xs font-bold text-slate-300 hover:text-white hover:bg-[#25252B] disabled:text-slate-500 disabled:hover:bg-transparent transition-colors border-x border-white/5">
              Hoje
            </button>
            <button type="button" (click)="shiftWeek(1)" class="p-2 text-slate-400 hover:text-white hover:bg-[#25252B] transition-colors" title="Próxima semana">
              <mat-icon class="!text-base flex items-center justify-center">chevron_right</mat-icon>
            </button>
          </div>
          <button type="button" (click)="openCreate()" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-all shadow-md shadow-blue-600/10">
            <mat-icon class="!text-xs">add</mat-icon>
            Novo Atendimento
          </button>
        </div>
      </div>

      <!-- Formulário criar / editar -->
      @if (formOpen()) {
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="bg-[#141417] p-6 rounded-2xl border border-blue-500/20 space-y-4">
          <div class="flex items-center justify-between border-b border-white/5 pb-3">
            <h3 class="text-sm font-bold text-white flex items-center gap-2">
              <mat-icon class="text-blue-500 !text-base">{{ editingId() ? 'edit_calendar' : 'event' }}</mat-icon>
              {{ editingId() ? 'Editar Atendimento' : 'Novo Atendimento' }}
            </h3>
            <button type="button" (click)="closeForm()" class="text-slate-500 hover:text-white" title="Fechar">
              <mat-icon class="!text-base">close</mat-icon>
            </button>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div class="space-y-1 md:col-span-2">
              <label class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Aluno</label>
              <select formControlName="aluno_id"
                class="w-full px-3 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-sm text-white focus:outline-none">
                <option value="" disabled>{{ students().length ? 'Selecione o aluno' : 'Nenhum aluno cadastrado' }}</option>
                @for (st of students(); track st.id) {
                  <option [value]="st.id">{{ st.name }}</option>
                }
              </select>
              @if (form.get('aluno_id')?.touched && form.get('aluno_id')?.invalid) {
                <p class="text-xs text-red-400">Selecione um aluno.</p>
              }
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Data</label>
              <input type="date" formControlName="date"
                class="w-full px-3 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-sm text-white focus:outline-none [color-scheme:dark]" />
              @if (form.get('date')?.touched && form.get('date')?.invalid) {
                <p class="text-xs text-red-400">Informe a data.</p>
              }
            </div>
            <div class="space-y-1">
              <label class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Horário</label>
              <input type="time" formControlName="time"
                class="w-full px-3 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-sm text-white focus:outline-none [color-scheme:dark]" />
              @if (form.get('time')?.touched && form.get('time')?.invalid) {
                <p class="text-xs text-red-400">Informe o horário.</p>
              }
            </div>
            <div class="space-y-1 md:col-span-4">
              <label class="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Foco / Observação (opcional)</label>
              <input type="text" formControlName="focus" maxlength="500" placeholder="Ex.: Treino de pernas, reavaliação, mobilidade..."
                class="w-full px-3 py-2.5 bg-[#1C1C21] border border-white/5 rounded-xl text-sm text-white placeholder-slate-500 focus:outline-none" />
            </div>
          </div>

          <div class="flex justify-end gap-2 pt-2 border-t border-white/5">
            <button type="button" (click)="closeForm()" class="px-4 py-2 bg-[#1C1C21] hover:bg-[#25252B] rounded-xl text-xs font-bold text-slate-300 transition-colors">
              Cancelar
            </button>
            <button type="submit" [disabled]="form.invalid || isSaving()"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-600/50 disabled:cursor-not-allowed rounded-xl text-xs font-bold text-white flex items-center gap-2 transition-all">
              @if (isSaving()) {
                <div class="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                Salvando...
              } @else {
                <mat-icon class="!text-xs">check</mat-icon>
                {{ editingId() ? 'Salvar Alterações' : 'Agendar' }}
              }
            </button>
          </div>
        </form>
      }

      <!-- Semana -->
      @if (loadError()) {
        <div class="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 flex items-center justify-between gap-2">
          {{ loadError() }}
          <button type="button" (click)="loadWeek()" class="text-red-300 hover:text-white font-bold uppercase text-[10px]">Tentar de novo</button>
        </div>
      }

      @if (isLoading()) {
        <div class="py-12 text-center text-slate-400">
          <div class="w-8 h-8 border-2 border-white/20 border-t-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
          Carregando agenda...
        </div>
      } @else {
        <div class="bg-[#141417] rounded-2xl border border-white/5 divide-y divide-white/5">
          @for (day of days(); track day.date) {
            <div class="p-4 md:p-5" [ngClass]="day.date === today ? 'bg-blue-600/5' : ''">
              <div class="flex items-center justify-between mb-2">
                <div class="flex items-center gap-2">
                  <p class="text-xs font-bold uppercase tracking-wider" [ngClass]="day.date === today ? 'text-blue-400' : 'text-slate-400'">
                    {{ dayName(day.date) }} · {{ fmt(day.date) }}
                  </p>
                  @if (day.date === today) {
                    <span class="text-[9px] bg-blue-600/10 border border-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded-full font-bold uppercase">Hoje</span>
                  }
                  @if (day.items.length) {
                    <span class="text-[10px] text-slate-500 font-mono">{{ day.items.length }}</span>
                  }
                </div>
                <button type="button" (click)="openCreate(day.date)" class="text-slate-500 hover:text-blue-400 transition-colors" title="Agendar neste dia">
                  <mat-icon class="!text-base">add_circle_outline</mat-icon>
                </button>
              </div>

              @if (day.items.length === 0) {
                <p class="text-xs text-slate-600 px-2">Sem atendimentos.</p>
              } @else {
                <div class="space-y-1">
                  @for (item of day.items; track item.id) {
                    <div class="py-2 flex items-center justify-between gap-3 hover:bg-white/[0.02] px-2 rounded-lg transition-colors">
                      <div class="flex items-center gap-4 min-w-0">
                        <span class="text-xs font-mono font-bold bg-[#1C1C21] text-slate-300 px-2 py-1 rounded shrink-0">{{ item.time }}</span>
                        <div class="min-w-0">
                          @if (item.aluno_id) {
                            <a [routerLink]="['/alunos', item.aluno_id]" class="text-sm font-semibold text-white hover:text-blue-400 truncate block">{{ item.studentName }}</a>
                          } @else {
                            <p class="text-sm font-semibold text-slate-300 truncate">{{ item.studentName }}</p>
                          }
                          @if (item.focus) {
                            <p class="text-xs text-slate-400 truncate">{{ item.focus }}</p>
                          }
                        </div>
                      </div>
                      <div class="flex items-center gap-1 shrink-0">
                        <button type="button" (click)="openEdit(item)" class="p-1.5 text-slate-500 hover:text-white rounded-lg hover:bg-[#25252B] transition-colors" title="Editar">
                          <mat-icon class="!text-base">edit</mat-icon>
                        </button>
                        <button type="button" (click)="onDelete(item)" class="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors" title="Excluir">
                          <mat-icon class="!text-base">delete_outline</mat-icon>
                        </button>
                      </div>
                    </div>
                  }
                </div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class AgendaComponent implements OnInit {
  private dataService = inject(DataService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  readonly today = todayYmd();

  start = signal(weekStart(this.today));
  items = signal<AgendaItem[]>([]);
  students = signal<StudentSummary[]>([]);
  isLoading = signal(true);
  loadError = signal('');
  isSaving = signal(false);
  formOpen = signal(false);
  editingId = signal<string | null>(null);

  days = computed(() => groupByDay(this.items(), this.start()));
  weekTitle = computed(() => weekLabel(this.start()));
  isCurrentWeek = computed(() => this.start() === weekStart(this.today));

  form = this.fb.nonNullable.group({
    aluno_id: ['', Validators.required],
    date: [this.today, Validators.required],
    time: ['', Validators.required],
    focus: [''],
  });

  dayName = weekdayLong;
  fmt = (d: string) => formatBr(d);

  ngOnInit() {
    this.dataService.getStudents().subscribe({
      next: (res) => this.students.set(res ?? []),
      error: () => this.toast.error('Erro ao carregar a lista de alunos.'),
    });
    this.loadWeek();
  }

  loadWeek() {
    const from = this.start();
    const to = addDays(from, 6);
    this.isLoading.set(true);
    this.loadError.set('');
    this.dataService.getAgenda(from, to).subscribe({
      next: (res) => {
        // Ignora respostas de uma semana que já não está na tela (navegação rápida).
        if (this.start() !== from) return;
        this.items.set(res);
        this.isLoading.set(false);
      },
      error: () => {
        if (this.start() !== from) return;
        this.items.set([]);
        this.loadError.set('Falha ao carregar a agenda. Verifique sua conexão e tente de novo.');
        this.isLoading.set(false);
      },
    });
  }

  shiftWeek(delta: number) {
    this.start.set(addDays(this.start(), delta * 7));
    this.loadWeek();
  }

  goToday() {
    this.start.set(weekStart(this.today));
    this.loadWeek();
  }

  openCreate(date?: string) {
    this.editingId.set(null);
    this.form.reset({ aluno_id: '', date: date ?? this.today, time: '', focus: '' });
    this.formOpen.set(true);
  }

  openEdit(item: AgendaItem) {
    this.editingId.set(item.id);
    this.form.reset({ aluno_id: item.aluno_id ?? '', date: item.date, time: item.time, focus: item.focus });
    this.formOpen.set(true);
  }

  closeForm() {
    this.formOpen.set(false);
    this.editingId.set(null);
  }

  onSubmit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    const v = this.form.getRawValue();
    const payload: AgendaPayload = {
      aluno_id: v.aluno_id,
      date: v.date,
      time: v.time.slice(0, 5),
      focus: v.focus.trim(),
    };
    const id = this.editingId();
    this.isSaving.set(true);
    const req = id ? this.dataService.updateAgendaItem(id, payload) : this.dataService.createAgendaItem(payload);
    req.subscribe({
      next: () => {
        this.isSaving.set(false);
        this.toast.success(id ? 'Atendimento atualizado!' : 'Atendimento agendado!');
        this.closeForm();
        // Leva a semana até a data salva, se for outra.
        const target = weekStart(payload.date);
        if (target !== this.start()) this.start.set(target);
        this.loadWeek();
      },
      error: (err: unknown) => {
        this.isSaving.set(false);
        const msg = err instanceof Error && err.message ? err.message : '';
        this.toast.error(msg ? `Erro ao salvar atendimento: ${msg}` : 'Erro ao salvar atendimento.');
      },
    });
  }

  async onDelete(item: AgendaItem) {
    const ok = await this.dialog.confirm({
      title: 'Excluir atendimento',
      message: `Remover o atendimento de ${item.studentName} em ${formatBr(item.date, true)} às ${item.time}?`,
      confirmText: 'Excluir',
    });
    if (!ok) return;
    this.dataService.deleteAgendaItem(item.id).subscribe({
      next: () => {
        this.toast.success('Atendimento excluído.');
        if (this.editingId() === item.id) this.closeForm();
        this.loadWeek();
      },
      error: () => this.dialog.alert({ title: 'Erro', message: 'Erro ao excluir atendimento. Tente novamente.', tone: 'error' }),
    });
  }
}
