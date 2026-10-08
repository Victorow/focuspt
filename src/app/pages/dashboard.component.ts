import { Component, inject, OnInit, signal, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService, StudentSummary, DashboardStats, AgendaItem } from '../data';
import { buildAttentionGroups, countRecentlyAssessed, AttentionGroups, AttentionItem } from '../attention-utils';
import { daysBetween, todayYmd } from '../date-utils';
import { agendaRows, countsLine, dayTitle, nextLabel, nowHm } from '../dashboard-utils';

interface AttentionSection {
  key: string;
  title: string;
  action: string;
  items: AttentionItem[];
}

// ==========================================
// INÍCIO ("Hoje") — artboard Hoje.dc.html
// ==========================================
@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="crumbs">
      <span>Início</span>
      <div class="acts">
        <a class="btn" routerLink="/agenda">Agendar</a>
        <a class="btn btnP" routerLink="/alunos/novo">Novo aluno</a>
      </div>
    </div>

    <div class="pad">
      <div class="title">
        <h1 class="big">{{ title }}</h1>
        @if (students(); as list) {
          <span class="k">{{ counts() }}</span>
        }
      </div>

      @if (loadError()) {
        <div class="panel err">
          <span class="errT">Não deu para carregar os dados</span>
          <span class="nt">Pode ser a internet ou a sessão que expirou. Nada foi perdido.</span>
          <div class="errA">
            <button type="button" class="btn btnP" (click)="reload()">Tentar de novo</button>
          </div>
        </div>
      } @else if (!students()) {
        <section class="kpi kpi4" aria-busy="true">
          @for (i of [1, 2, 3, 4]; track i) {
            <div><div class="sk sk1"></div><div class="sk sk2"></div><div class="sk sk1"></div></div>
          }
        </section>
        <div class="cols">
          <section class="panel skp" aria-busy="true"><div class="sk sk2"></div><div class="sk sk1"></div><div class="sk sk3"></div></section>
          <section class="panel skp" aria-busy="true"><div class="sk sk2"></div><div class="sk sk1"></div><div class="sk sk3"></div></section>
        </div>
      } @else {
        <section class="kpi kpi4">
          <div>
            <div class="k">Alunos ativos</div>
            <div class="big">{{ activeStudents() }}</div>
            <div class="k">{{ recentlyAssessed() }} avaliados nos últimos 90 dias</div>
          </div>
          <div>
            <div class="k">Avaliações registradas</div>
            <div class="big">{{ stats()?.totalAssessments ?? '—' }}</div>
            <div class="k">{{ assessedThisWeek() }} esta semana</div>
          </div>
          <div>
            <div class="k">Gordura visceral alta</div>
            <div class="big" [class.up]="visceralHigh() > 0">{{ visceralHigh() }}</div>
            <div class="k">nível Omron 10 ou mais</div>
          </div>
          <div>
            <div class="k">Termo LGPD pendente</div>
            <div class="big" [class.up]="lgpdPending() > 0">{{ lgpdPending() }}</div>
            <div class="k">assinatura ainda não colhida</div>
          </div>
        </section>

        <div class="cols">
          <!-- Agenda de hoje -->
          <section class="panel">
            <div class="ph"><span>Agenda de hoje</span><a routerLink="/agenda">Semana</a></div>
            @if (agendaError()) {
              <div class="empty"><span class="up">{{ agendaError() }}</span> <a href="#" (click)="loadAgenda(); $event.preventDefault()">Tentar de novo</a></div>
            } @else if (agenda().length === 0) {
              <div class="empty k">Nenhum atendimento hoje.</div>
            } @else {
              <div class="scroll">
                <table>
                  <tbody>
                    @for (r of agenda(); track r.item.id) {
                      <tr [class.done]="r.status === 'done'">
                        <td class="time" [class.now]="r.status === 'next'">{{ r.item.time }}</td>
                        <td>
                          @if (r.item.aluno_id && r.status !== 'done') {
                            <a [routerLink]="['/alunos', r.item.aluno_id]">{{ r.item.studentName }}</a>
                          } @else {
                            {{ r.item.studentName }}
                          }
                          @if (r.status !== 'done' && visceralTag(r.item.aluno_id); as v) {
                            <span class="tag tagW">visceral {{ v }}</span>
                          }
                        </td>
                        <td>{{ r.item.focus }}</td>
                        <td class="n">
                          @if (r.status === 'done') { concluído }
                          @else if (r.status === 'next') { <span class="tag">{{ nextLabel(r.minutesUntil) }}</span> }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>

          <!-- Pedem atenção -->
          <section class="panel">
            <div class="ph"><span>Pedem atenção</span><span class="k">{{ attention()?.studentsCount ?? 0 }}</span></div>
            @if (attention(); as a) {
              @if (a.studentsCount === 0) {
                <div class="empty k">Nada pendente hoje.</div>
              } @else {
                <div class="scroll">
                  <table>
                    <tbody>
                      @for (g of sections(); track g.key) {
                        @if (g.items.length > 0) {
                          <tr class="grp"><td colspan="3">{{ g.title }}</td></tr>
                          @for (it of (expanded()[g.key] ? g.items : g.items.slice(0, 5)); track it.studentId) {
                            <tr>
                              <td><a [routerLink]="['/alunos', it.studentId]">{{ it.name }}</a></td>
                              <td class="nt">{{ it.reason }}</td>
                              <td class="n"><a [routerLink]="it.link">{{ g.action }}</a></td>
                            </tr>
                          }
                          @if (g.items.length > 5) {
                            <tr class="more"><td colspan="3">
                              <button type="button" class="lnk" (click)="toggleExpanded(g.key)">
                                {{ expanded()[g.key] ? 'Mostrar menos' : 'Ver todos (' + g.items.length + ')' }}
                              </button>
                            </td></tr>
                          }
                        }
                      }
                    </tbody>
                  </table>
                </div>
              }
            }
          </section>
        </div>
      }
    </div>
  `,
  styles: [`
    .acts { margin-left: auto; display: flex; gap: 6px; }
    .title { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .title h1 { margin: 0; }
    .kpi4 { grid-template-columns: repeat(4, 1fr); }
    .cols { display: grid; grid-template-columns: minmax(0, 3fr) minmax(300px, 2fr); gap: 16px; align-items: start; }
    .scroll { overflow-x: auto; }
    .time { width: 64px; white-space: nowrap; }
    .now { font-weight: 500; }
    tr.done { color: var(--tx2); }
    .empty { padding: 20px 14px; }
    .more td { padding-top: 4px; }
    .more:hover td { background: transparent; }
    .lnk { border: 0; background: transparent; padding: 0; font: inherit; color: var(--ln); cursor: pointer; min-height: 32px; }
    .lnk:hover { text-decoration: underline; }
    .err { padding: 20px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .errT { font-weight: 600; }
    .errA { display: flex; gap: 8px; }
    .sk { background: var(--ph); border-radius: 3px; }
    .sk1 { height: 12px; width: 55%; margin: 4px 0; }
    .sk2 { height: 18px; width: 40%; margin: 6px 0; }
    .sk3 { height: 12px; width: 70%; margin: 4px 0; }
    .skp { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    @media (max-width: 900px) {
      .cols { grid-template-columns: 1fr; }
      .kpi4 { grid-template-columns: repeat(2, 1fr); }
    }
  `],
})
export class DashboardComponent implements OnInit {
  private dataService = inject(DataService);

  readonly today = todayYmd();
  readonly title = dayTitle(new Date());
  private now = signal(nowHm(new Date()));

  stats = signal<DashboardStats | null>(null);
  students = signal<StudentSummary[] | null>(null);
  agendaItems = signal<AgendaItem[]>([]);
  loadError = signal('');
  agendaError = signal('');
  expanded = signal<Record<string, boolean>>({});

  attention = computed<AttentionGroups | null>(() => {
    const list = this.students();
    return list ? buildAttentionGroups(list, this.today) : null;
  });
  recentlyAssessed = computed(() => countRecentlyAssessed(this.students() ?? [], this.today));
  assessedThisWeek = computed(() => (this.students() ?? []).filter(s => {
    const d = s.last_assessment_date ? daysBetween(s.last_assessment_date, this.today) : null;
    return d !== null && d >= 0 && d < 7;
  }).length);
  activeStudents = computed(() => this.stats()?.activeStudents ?? this.students()?.length ?? 0);
  visceralHigh = computed(() => this.attention()?.visceralHigh.length ?? this.stats()?.visceralAlerts ?? 0);
  lgpdPending = computed(() => this.attention()?.lgpdPending.length ?? 0);
  agenda = computed(() => agendaRows(this.agendaItems(), this.now()));
  counts = computed(() => countsLine(this.agendaItems().length, this.attention()?.studentsCount ?? 0));

  sections = computed<AttentionSection[]>(() => {
    const a = this.attention();
    if (!a) return [];
    return [
      { key: 'overdue', title: 'Reavaliação vencida · mais de 90 dias', action: 'Avaliar', items: a.overdue },
      { key: 'lgpd', title: 'Termo LGPD pendente', action: 'Assinar', items: a.lgpdPending },
      { key: 'visceral', title: 'Gordura visceral alta', action: 'Abrir', items: a.visceralHigh },
    ];
  });

  nextLabel = nextLabel;

  /** Nível visceral alto do aluno (para a etiqueta na agenda), ou null. */
  visceralTag(alunoId: string | null): number | null {
    if (!alunoId) return null;
    const s = (this.students() ?? []).find(x => x.id === alunoId);
    const n = Number(s?.last_visceral_level);
    return s && s.last_visceral_level !== null && Number.isFinite(n) && n >= 10 ? n : null;
  }

  toggleExpanded(key: string) {
    this.expanded.update(e => ({ ...e, [key]: !e[key] }));
  }

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.loadError.set('');
    this.students.set(null);
    this.dataService.getStudents().subscribe({
      next: (res) => this.students.set(res ?? []),
      error: () => this.loadError.set('Falha ao carregar a lista de alunos.'),
    });
    this.dataService.getStats().subscribe({
      next: (res) => this.stats.set(res),
      error: () => { /* os números principais vêm da lista de alunos; o total de avaliações fica "—" */ },
    });
    this.loadAgenda();
  }

  loadAgenda() {
    this.agendaError.set('');
    this.now.set(nowHm(new Date()));
    this.dataService.getAgenda(this.today, this.today).subscribe({
      next: (res) => this.agendaItems.set(res ?? []),
      error: () => this.agendaError.set('Não deu para carregar a agenda.'),
    });
  }
}
