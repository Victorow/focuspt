import { Component, computed, ElementRef, inject, OnInit, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { DataService, StudentSummary } from './data';
import { AgendaItem, AgendaPayload, groupByDay, weekLabel, weekStart, weekdayShort } from './agenda-utils';
import { addDays, formatBr, parseYmd, todayYmd } from './date-utils';
import { nowHm } from './dashboard-utils';
import { DialogService } from './dialog.service';
import { ToastService } from './toast.service';

// ==========================================
// AGENDA — artboard Agenda.dc.html: semana (segunda a domingo) + "Novo atendimento" inline
// ==========================================
@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [RouterLink, ReactiveFormsModule],
  template: `
    <div class="crumbs">
      <span>Agenda</span>
      <div class="acts"><button type="button" class="btn btnP" (click)="openCreate()">Agendar</button></div>
    </div>

    <div class="pad">
      <div class="title">
        <h1 class="big">Agenda</h1>
        <span class="k">{{ weekTitle() }}</span>
        <div class="seg nav" role="group" aria-label="Semana">
          <button type="button" (click)="shiftWeek(-1)">‹ Anterior</button>
          <button type="button" [class.on]="isCurrentWeek()" (click)="goToday()">Hoje</button>
          <button type="button" (click)="shiftWeek(1)">Próxima ›</button>
        </div>
      </div>

      @if (loadError()) {
        <div class="panel err">
          <span class="errT">Não deu para carregar a agenda</span>
          <span class="nt">Pode ser a internet ou a sessão que expirou. Nada foi perdido.</span>
          <button type="button" class="btn btnP" (click)="loadWeek()">Tentar de novo</button>
        </div>
      } @else if (isLoading()) {
        <div class="week" aria-busy="true">
          @for (d of days(); track d.date) {
            <div class="panel day skp"><div class="sk" style="width:50%;height:18px"></div><div class="sk" style="width:80%"></div><div class="sk" style="width:60%"></div></div>
          }
        </div>
      } @else {
        <div class="week">
          @for (day of days(); track day.date) {
            <div class="panel day" [class.today]="day.date === today">
              <div class="dh">
                <span>{{ dayName(day.date) }}</span>
                @if (day.date === today) {
                  <span class="tag">{{ dayNum(day.date) }}</span>
                } @else {
                  <span class="k">{{ dayNum(day.date) }}</span>
                }
              </div>
              @if (day.items.length === 0) {
                <div class="k free">Livre</div>
              } @else {
                @for (item of day.items; track item.id) {
                  <div class="row ev" [class.past]="isPast(item)">
                    <span class="hm">{{ item.time }}</span>
                    @if (item.aluno_id) {
                      <a class="nm" [routerLink]="['/alunos', item.aluno_id]">{{ item.studentName }}</a>
                    } @else {
                      <span class="nm">{{ item.studentName }}</span>
                    }
                    @if (item.focus) { <span class="k">{{ item.focus }}</span> }
                    <span class="ops">
                      <button type="button" class="lnk" (click)="openEdit(item)">Editar</button>
                      <button type="button" class="lnk up" (click)="onDelete(item)">Excluir</button>
                    </span>
                  </div>
                }
              }
            </div>
          }
        </div>
      }

      <section class="panel form" #formPanel>
        <div class="ph">
          <span>{{ editingId() ? 'Editar atendimento' : 'Novo atendimento' }}</span>
          @if (editingId()) {
            <button type="button" class="lnk" (click)="closeForm()">Cancelar</button>
          } @else {
            <span class="k">{{ students().length ? students().length + ' alunos' : 'Nenhum aluno cadastrado' }}</span>
          }
        </div>
        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="fg" novalidate>
          <div>
            <label class="lb req" for="al">Aluno</label>
            <select id="al" class="f" formControlName="aluno_id" aria-required="true" #alunoSel>
              <option value="" disabled>{{ students().length ? 'Selecione' : 'Nenhum aluno cadastrado' }}</option>
              @for (st of students(); track st.id) {
                <option [value]="st.id">{{ st.name }}</option>
              }
            </select>
            @if (form.get('aluno_id')?.touched && form.get('aluno_id')?.invalid) {
              <div class="k up">Selecione um aluno.</div>
            }
          </div>
          <div>
            <label class="lb req" for="dt">Data</label>
            <input id="dt" class="f" type="date" formControlName="date" aria-required="true" />
            @if (form.get('date')?.touched && form.get('date')?.invalid) {
              <div class="k up">Informe a data.</div>
            }
          </div>
          <div>
            <label class="lb req" for="hr">Hora</label>
            <input id="hr" class="f" type="time" formControlName="time" aria-required="true" />
            @if (form.get('time')?.touched && form.get('time')?.invalid) {
              <div class="k up">Informe a hora.</div>
            }
          </div>
          <div>
            <label class="lb" for="fc">Foco <span class="k">opcional</span></label>
            <input id="fc" class="f" type="text" formControlName="focus" maxlength="500" />
          </div>
          <button type="submit" class="btn btnP" [disabled]="form.invalid || isSaving()">
            {{ isSaving() ? 'Salvando...' : (editingId() ? 'Salvar' : 'Agendar') }}
          </button>
        </form>
      </section>
    </div>
  `,
  styles: [`
    .acts { margin-left: auto; display: flex; gap: 6px; }
    .title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .title h1 { margin: 0; }
    .nav { margin-left: auto; }
    .week { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; }
    .day { min-width: 0; }
    .day.today { border-color: var(--tx2); }
    .dh { padding: 8px 10px; border-bottom: 1px solid var(--bd); font-weight: 500; display: flex; justify-content: space-between; align-items: center; }
    .free { padding: 10px; }
    .ev { padding: 6px 10px; flex-direction: column; align-items: flex-start; gap: 0; }
    .ev.past { color: var(--tx2); }
    .ev.past .nm { color: var(--tx2); }
    .hm { font-size: 12px; }
    .nm { font-weight: 500; color: var(--tx); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 100%; }
    .ops { display: flex; gap: 10px; }
    .lnk { border: 0; background: transparent; padding: 0; font: inherit; font-size: 12px; color: var(--ln); cursor: pointer; min-height: 28px; }
    .lnk:hover { text-decoration: underline; }
    .lnk.up { color: var(--bad); }
    .form { max-width: 720px; }
    .fg { padding: 14px; display: grid; grid-template-columns: 2fr 1fr 1fr 2fr auto; gap: 12px; align-items: start; }
    .fg .btn { margin-top: 20px; }
    .err { padding: 20px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .errT { font-weight: 600; }
    .sk { height: 12px; background: var(--ph); border-radius: 3px; }
    .skp { padding: 10px; display: flex; flex-direction: column; gap: 10px; }
    @media (max-width: 900px) {
      .week { grid-template-columns: 1fr; }
      .fg { grid-template-columns: 1fr 1fr; }
      .fg > div:first-child, .fg > div:nth-child(4) { grid-column: 1 / -1; }
      .fg .btn { grid-column: 1 / -1; margin-top: 0; }
    }
    @media (max-width: 720px) {
      .nav { margin-left: 0; }
      .fg { grid-template-columns: 1fr; }
    }
  `],
})
export class AgendaComponent implements OnInit {
  private dataService = inject(DataService);
  private dialog = inject(DialogService);
  private toast = inject(ToastService);
  private fb = inject(FormBuilder);

  readonly today = todayYmd();
  private readonly now = nowHm(new Date());

  private formPanel = viewChild<ElementRef<HTMLElement>>('formPanel');
  private alunoSel = viewChild<ElementRef<HTMLSelectElement>>('alunoSel');

  start = signal(weekStart(this.today));
  items = signal<AgendaItem[]>([]);
  students = signal<StudentSummary[]>([]);
  isLoading = signal(true);
  loadError = signal('');
  isSaving = signal(false);
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

  dayName = weekdayShort;
  dayNum = (d: string) => String(parseYmd(d)?.d ?? '').padStart(2, '0');

  /** Já aconteceu: dia anterior a hoje, ou hoje com horário passado. */
  isPast(item: AgendaItem): boolean {
    return item.date < this.today || (item.date === this.today && item.time < this.now);
  }

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
    this.focusForm();
  }

  openEdit(item: AgendaItem) {
    this.editingId.set(item.id);
    this.form.reset({ aluno_id: item.aluno_id ?? '', date: item.date, time: item.time, focus: item.focus });
    this.focusForm();
  }

  closeForm() {
    this.editingId.set(null);
    this.form.reset({ aluno_id: '', date: this.today, time: '', focus: '' });
  }

  private focusForm() {
    this.formPanel()?.nativeElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    this.alunoSel()?.nativeElement.focus();
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
        this.toast.success(id ? 'Atendimento atualizado.' : 'Atendimento agendado.');
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
