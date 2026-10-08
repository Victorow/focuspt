import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService, StudentSummary, TrashedStudent } from '../data';
import { DialogService } from '../dialog.service';
import { todayYmd } from '../date-utils';
import {
  STUDENT_FILTERS, StudentFilter, countByFilter, filterStudents, fmtNum, isVisceralHigh, lastAssessmentLabel, sexAge,
} from '../students-filter';

// ==========================================
// ALUNOS — artboard Alunos.dc.html
// ==========================================
@Component({
  selector: 'app-students-list',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="crumbs">
      <span>Alunos</span>
      <div class="acts"><a class="btn btnP" routerLink="/alunos/novo">Novo aluno</a></div>
    </div>

    <div class="pad">
      <div class="title">
        <h1 class="big">Alunos</h1>
        <div class="search">
          <label for="q" class="sr">Buscar</label>
          <input id="q" class="f" type="search" placeholder="Buscar por nome ou objetivo"
                 [value]="searchValue()" (input)="onSearch($any($event.target).value)" />
        </div>
        <div class="seg" role="group" aria-label="Filtro">
          @for (fi of filters; track fi.id) {
            <button type="button" [class.on]="filter() === fi.id" [attr.aria-pressed]="filter() === fi.id" (click)="filter.set(fi.id)">
              {{ fi.label }} · {{ counts()[fi.id] }}
            </button>
          }
        </div>
        <button type="button" class="lnk k trash" (click)="toggleTrash()" [attr.aria-expanded]="showTrash()">
          Lixeira ({{ trashedStudents().length }})
        </button>
      </div>

      @if (loadError()) {
        <div class="panel err">
          <span class="errT">Não deu para carregar os alunos</span>
          <span class="nt">Pode ser a internet ou a sessão que expirou. Nada foi perdido.</span>
          <button type="button" class="btn btnP" (click)="loadStudents()">Tentar de novo</button>
        </div>
      } @else if (isLoading()) {
        <section class="panel skp" aria-busy="true">
          <div class="sk" style="width:40%;height:18px"></div>
          <div class="sk" style="width:70%"></div>
          <div class="sk" style="width:55%"></div>
          <div class="sk" style="width:65%"></div>
        </section>
      } @else {
        <section class="panel scroll">
          <table class="tbl">
            <thead>
              <tr>
                <th>Aluno</th><th>Objetivo</th><th>Última avaliação</th>
                <th class="n">Peso</th><th class="n">Gordura</th><th class="n">Visceral</th><th>LGPD</th><th><span class="sr">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              @for (s of filteredStudents(); track s.id) {
                <tr>
                  <td>
                    <a [routerLink]="['/alunos', s.id]" class="nm">{{ s.name }}</a>
                    <span class="k">{{ sexAge(s.gender, s.age) }}</span>
                  </td>
                  <td class="nt">{{ s.goal || '—' }}</td>
                  <td>
                    @if (last(s); as l) {
                      {{ l.date }} <span class="ago" [class.up]="l.overdue" [class.nt]="!l.overdue">{{ l.ago }}</span>
                    }
                  </td>
                  <td class="n">{{ fmtNum(s.last_weight) }}</td>
                  <td class="n">{{ fmtNum(s.last_fat_percentage) }}</td>
                  <td class="n"><span [class.up]="isVisceralHigh(s)">{{ fmtNum(s.last_visceral_level, 0) }}</span></td>
                  <td>
                    @if (s.lgpd_consent_status === 'ACCEPTED') {
                      <span class="tag tagOk">Assinado</span>
                    } @else {
                      <span class="tag tagW">Pendente</span>
                    }
                  </td>
                  <td class="n">
                    <a [routerLink]="['/alunos', s.id]">Abrir</a>
                    <button type="button" class="lnk up del" (click)="onDeleteStudent(s.id, s.name)">Excluir</button>
                  </td>
                </tr>
              }
            </tbody>
          </table>
          @if (filteredStudents().length === 0) {
            <div class="empty k">
              @if (students().length === 0) {
                Nenhum aluno cadastrado. <a routerLink="/alunos/novo">Cadastrar o primeiro</a>
              } @else {
                Nenhum aluno com esse filtro.
              }
            </div>
          }
        </section>
      }

      @if (showTrash()) {
        <section class="panel">
          <div class="ph"><span>Lixeira</span><span class="k">{{ trashedStudents().length }}</span></div>
          @if (trashedStudents().length === 0) {
            <div class="empty k">Nenhum aluno na lixeira.</div>
          } @else {
            <div class="scroll">
              <table>
                <tbody>
                  @for (t of trashedStudents(); track t.id) {
                    <tr>
                      <td><span class="nm">{{ t.name }}</span> <span class="k">{{ sexAge(t.gender, null) }}</span></td>
                      <td class="nt">{{ t.goal || '—' }}</td>
                      <td class="n"><button type="button" class="lnk" (click)="onRestoreStudent(t.id)">Restaurar</button></td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .acts { margin-left: auto; display: flex; gap: 6px; }
    .title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .title h1 { margin: 0; }
    .search { position: relative; flex: 1 1 260px; max-width: 360px; }
    .trash { margin-left: auto; }
    .scroll { overflow-x: auto; }
    .tbl { min-width: 900px; }
    .nm { color: var(--tx); font-weight: 500; }
    .ago { font-size: 12px; }
    .lnk { border: 0; background: transparent; padding: 0; font: inherit; color: var(--ln); cursor: pointer; min-height: 32px; }
    .lnk:hover { text-decoration: underline; }
    .del { margin-left: 12px; }
    .empty { padding: 32px; text-align: center; }
    .err { padding: 20px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .errT { font-weight: 600; }
    .sk { height: 12px; background: var(--ph); border-radius: 3px; }
    .skp { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    @media (max-width: 720px) {
      .search { max-width: none; flex-basis: 100%; }
      .seg { display: flex; flex-wrap: wrap; }
      .seg button { flex: 1 1 auto; }
      .seg button + button { border-left: 0; }
      .trash { margin-left: 0; }
    }
  `],
})
export class StudentsListComponent implements OnInit {
  private dataService = inject(DataService);
  private dialog = inject(DialogService);

  readonly today = todayYmd();
  readonly filters = STUDENT_FILTERS;

  students = signal<StudentSummary[]>([]);
  trashedStudents = signal<TrashedStudent[]>([]);
  showTrash = signal(false);
  searchValue = signal('');
  filter = signal<StudentFilter>('all');
  isLoading = signal(true);
  loadError = signal('');

  filteredStudents = computed(() =>
    filterStudents(this.students(), { query: this.searchValue(), filter: this.filter() }, this.today));
  counts = computed(() => countByFilter(this.students(), this.today));

  fmtNum = fmtNum;
  sexAge = sexAge;
  isVisceralHigh = isVisceralHigh;
  last = (s: StudentSummary) => lastAssessmentLabel(s.last_assessment_date, this.today);

  ngOnInit() {
    this.loadStudents();
    this.loadTrash();
  }

  loadStudents() {
    this.isLoading.set(true);
    this.loadError.set('');
    this.dataService.getStudents().subscribe({
      next: (res) => {
        this.students.set(res ?? []);
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error(err);
        this.loadError.set('Falha ao carregar a lista de alunos.');
        this.isLoading.set(false);
      },
    });
  }

  loadTrash() {
    this.dataService.getTrashedStudents().subscribe({
      next: (res) => this.trashedStudents.set(res ?? []),
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
      title: `Mover ${name} para a lixeira?`,
      message: 'Avaliações e fotos vão junto. Dá para restaurar depois.',
      confirmText: 'Mover para a lixeira',
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
