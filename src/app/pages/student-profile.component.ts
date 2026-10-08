import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService, Student, Assessment, Photo, AgendaItem, Bioimpedance } from '../data';
import { DialogService } from '../dialog.service';
import { categoryLabel, groupPhotoSessions, nearestDate } from '../media-utils';
import { formatNum, formatDelta, deltaClass } from '../assessment-utils';
import { diff, METRIC_IMPROVE, refBar, omronLabel, ageAt, anamnesisTags, RefBar, RefMetric, MetricKey } from '../profile-utils';
import { formatBr, todayYmd, addDays } from '../date-utils';
import { weekdayShort } from '../agenda-utils';
import { LGPD_TERM_VERSION } from '../lgpd-utils';

type Tab = 'resumo' | 'aval' | 'fotos' | 'agenda' | 'docs';
type Cls = 'up' | 'dn' | 'nt';

interface Kpi { label: string; value: string; unit: string; sub: string; cls: Cls; }

/** Linha da tabela comparativa; `group` preenchido = linha de grupo. */
interface CmpRow {
  group?: string;
  label?: string;
  cur?: string;
  prev?: string;
  delta?: string;
  cls?: Cls;
  ref?: RefBar | null;
}

@Component({
  selector: 'app-student-profile',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="crumbs">
      <a routerLink="/alunos" class="k">Alunos</a><span class="k">›</span>
      <span>{{ student()?.name ?? 'Aluno' }}</span>
      @if (student(); as std) {
        <div class="acts">
          <a class="btn" [routerLink]="['/alunos', std.id, 'editar']">Editar</a>
          @if (latest(); as a) {
            <a class="btn" [routerLink]="['/alunos', std.id, 'avaliacoes', a.id]">Relatório</a>
          }
          <a class="btn btnP" [routerLink]="['/alunos', std.id, 'avaliacoes', 'nova']">Nova avaliação</a>
        </div>
      }
    </div>

    <div class="pad">
      @if (isLoading()) {
        <section class="panel skel" aria-busy="true" aria-label="Carregando">
          <div class="sk" style="height:18px;width:40%"></div>
          <div class="sk" style="width:70%"></div>
          <div class="sk" style="width:55%"></div>
        </section>
      } @else if (!student()) {
        <section class="panel empty">
          <span class="strong">Não deu para carregar os dados</span>
          <span class="nt">Pode ser a internet ou a sessão que expirou. Nada foi perdido.</span>
          <div class="btns">
            <button type="button" class="btn btnP" (click)="reload()">Tentar de novo</button>
            <a class="btn" routerLink="/alunos">Voltar aos alunos</a>
          </div>
        </section>
      } @else if (student(); as std) {
        <section class="head">
          <div class="headLine">
            <h1 class="big">{{ std.name }}</h1>
            <span class="k">{{ meta() }}</span>
            @if (std.lgpd_consent_status === 'ACCEPTED') {
              <span class="tag tagOk right">LGPD assinado</span>
            } @else {
              <a class="tag tagW right" [routerLink]="['/alunos', std.id, 'lgpd']">LGPD pendente · assinar</a>
            }
            @for (t of flags(); track t) {
              <span class="tag tagW">{{ t }}</span>
            }
          </div>
          <div role="tablist" class="tabs">
            @for (t of tabs(); track t.id) {
              <button type="button" role="tab" class="tab" [class.tabOn]="tab() === t.id"
                      [attr.aria-selected]="tab() === t.id" (click)="tab.set(t.id)">{{ t.label }}</button>
            }
          </div>
        </section>

        <!-- ===================== RESUMO ===================== -->
        @if (tab() === 'resumo') {
          <div class="stack">
            @if (latest(); as a) {
              <section class="kpi kpi5">
                @for (c of kpis(); track c.label) {
                  <div>
                    <div class="k">{{ c.label }}</div>
                    <div class="big">{{ c.value }} @if (c.unit) {<span class="k">{{ c.unit }}</span>}</div>
                    <div class="sub" [class]="c.cls">{{ c.sub }}</div>
                  </div>
                }
              </section>
            }

            <div class="grid2">
              @if (latest(); as a) {
                <section class="panel">
                  <div class="ph">
                    <span>{{ formatBr(a.date, true) }}@if (previous(); as p) { vs {{ formatBr(p.date, true) }}}</span>
                    <a [routerLink]="['/alunos', std.id, 'avaliacoes', a.id]">Relatório completo</a>
                  </div>
                  <div class="tw">
                    <table>
                      <thead><tr><th style="width:34%">Parâmetro</th><th class="n">Atual</th><th class="n">Anterior</th><th class="n">Δ</th><th>Faixa Omron</th></tr></thead>
                      <tbody>
                        @for (r of rows(); track $index) {
                          @if (r.group) {
                            <tr class="grp"><td colspan="5">{{ r.group }}</td></tr>
                          } @else {
                            <tr>
                              <td>{{ r.label }}</td>
                              <td class="n">{{ r.cur }}</td>
                              <td class="n nt">{{ r.prev }}</td>
                              <td class="n" [class]="r.cls">{{ r.delta }}</td>
                              <td>
                                @if (r.ref; as ref) {
                                  <div class="ref" role="img" aria-label="Faixa de referência Omron"><div class="refOk" [style.left.%]="ref.left" [style.width.%]="ref.width"></div><div class="refMk" [style.left.%]="ref.mark"></div></div>
                                }
                              </td>
                            </tr>
                          }
                        }
                      </tbody>
                    </table>
                  </div>
                </section>
              } @else {
                <section class="panel empty">
                  <span class="strong">Nenhuma medida ainda</span>
                  <span class="nt">A primeira avaliação vira a linha de base da evolução.</span>
                  <a class="btn btnP" [routerLink]="['/alunos', std.id, 'avaliacoes', 'nova']">Registrar primeira avaliação</a>
                </section>
              }

              <div class="stack">
                <section class="panel">
                  <div class="ph"><span>Avaliações</span><a [routerLink]="['/alunos', std.id, 'avaliacoes', 'nova']">Nova</a></div>
                  @if (sorted().length) {
                    <table><tbody>
                      @for (a of sorted().slice(0, 5); track a.id) {
                        <tr>
                          <td><a [routerLink]="['/alunos', std.id, 'avaliacoes', a.id]">{{ formatBr(a.date, true) }}</a></td>
                          <td class="n">{{ formatNum(bio(a).weight_kg) }} kg</td>
                          <td class="n">{{ formatNum(fatOf(a)) }} %</td>
                        </tr>
                      }
                    </tbody></table>
                  } @else {
                    <div class="body k">Nenhuma avaliação.</div>
                  }
                </section>

                <section class="panel">
                  <div class="ph">
                    <span>Fotos@if (lastSession(); as s) { · {{ formatBr(s.date) }}}</span>
                    <a [routerLink]="['/alunos', std.id, 'galeria']">{{ lastSession() ? 'Comparar' : 'Enviar' }}</a>
                  </div>
                  @if (lastSession(); as s) {
                    <div class="body thumbs4">
                      @for (ph of s.photos.slice(0, 4); track ph.id) {
                        <img class="ph2 thumb" [src]="ph.url ?? ph.storage_path" [alt]="categoryLabel(ph.category)" [title]="categoryLabel(ph.category)" referrerpolicy="no-referrer" />
                      }
                    </div>
                  } @else {
                    <div class="body k">Nenhuma foto ainda.</div>
                  }
                </section>

                <section class="panel">
                  <div class="ph"><span>Anamnese</span><a [routerLink]="['/alunos', std.id, 'editar']">Editar</a></div>
                  <table><tbody>
                    <tr><td>Problema cardíaco</td><td class="n" [class]="std.anamneses?.cardiac_condition ? 'up' : 'nt'">{{ std.anamneses?.cardiac_condition ? 'Sim' : 'Não' }}</td></tr>
                    <tr><td>Dor articular</td><td class="n" [class]="std.anamneses?.joint_pain ? 'up' : 'nt'">{{ std.anamneses?.joint_pain ? 'Sim' : 'Não' }}</td></tr>
                    <tr><td>Dor no peito ao esforço</td><td class="n" [class]="std.anamneses?.chest_pain_during_exercise ? 'up' : 'nt'">{{ std.anamneses?.chest_pain_during_exercise ? 'Sim' : 'Não' }}</td></tr>
                    <tr><td>Medicamentos</td><td class="n nt wrap">{{ std.anamneses?.active_medications || 'Nenhum' }}</td></tr>
                    @if (std.anamneses?.recent_surgery_description) {
                      <tr><td>Cirurgias recentes</td><td class="n nt wrap">{{ std.anamneses?.recent_surgery_description }}</td></tr>
                    }
                    @if (std.anamneses?.notes) {
                      <tr><td>Observações</td><td class="n nt wrap">{{ std.anamneses?.notes }}</td></tr>
                    }
                  </tbody></table>
                </section>

                @if (upcoming().length) {
                  <section class="panel">
                    <div class="ph"><span>Próximos atendimentos</span><a routerLink="/agenda">Agenda</a></div>
                    <table><tbody>
                      @for (i of upcoming().slice(0, 3); track i.id) {
                        <tr><td>{{ agendaLabel(i) }}</td><td class="nt">{{ i.focus }}</td></tr>
                      }
                    </tbody></table>
                  </section>
                }
              </div>
            </div>
          </div>
        }

        <!-- ===================== AVALIAÇÕES ===================== -->
        @if (tab() === 'aval') {
          <section class="panel">
            @if (sorted().length) {
              <div class="tw">
                <table>
                  <thead><tr><th>Data</th><th class="n">Peso</th><th class="n">IMC</th><th class="n">Gordura</th><th class="n">Músculo</th><th class="n">Visceral</th><th class="n">Dobras</th><th><span class="sr">Ações</span></th></tr></thead>
                  <tbody>
                    @for (a of sorted(); track a.id) {
                      <tr>
                        <td>{{ formatBr(a.date, true) }}</td>
                        <td class="n">{{ formatNum(bio(a).weight_kg) }}</td>
                        <td class="n">{{ formatNum(bmiOf(a)) }}</td>
                        <td class="n">{{ formatNum(fatOf(a)) }} %</td>
                        <td class="n">{{ formatNum(bio(a).skeletal_muscle_percentage) }} %</td>
                        <td class="n">{{ formatNum(bio(a).visceral_fat_level, 0) }}</td>
                        <td class="n">{{ formatNum(skinfoldSumOf(a), 0) }}</td>
                        <td class="n">
                          <a [routerLink]="['/alunos', std.id, 'avaliacoes', a.id]">Relatório</a> ·
                          <a [routerLink]="['/alunos', std.id, 'avaliacoes', a.id, 'editar']">Editar</a> ·
                          <button type="button" class="lnk" (click)="onDeleteAssessment(std.id, a.id)">Excluir</button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <div class="empty">
                <span class="strong">Nenhuma medida ainda</span>
                <span class="nt">A primeira avaliação vira a linha de base da evolução.</span>
                <a class="btn btnP" [routerLink]="['/alunos', std.id, 'avaliacoes', 'nova']">Registrar primeira avaliação</a>
              </div>
            }
            <div class="trash">
              @if (std.avaliacoes_trash?.length) {
                <button type="button" class="lnk" (click)="showTrash.set(!showTrash())" [attr.aria-expanded]="showTrash()">
                  Lixeira ({{ std.avaliacoes_trash?.length }}) · {{ showTrash() ? 'ocultar' : 'mostrar' }}
                </button>
                @if (showTrash()) {
                  <table class="trashTable"><tbody>
                    @for (a of std.avaliacoes_trash; track a.id) {
                      <tr>
                        <td class="nt">{{ formatBr(a.date, true) }}</td>
                        <td class="n nt">{{ formatNum(bio(a).weight_kg) }} kg</td>
                        <td class="n nt">{{ formatNum(fatOf(a)) }} % gordura</td>
                        <td class="n"><button type="button" class="lnk" (click)="onRestoreAssessment(std.id, a.id)">Restaurar</button></td>
                      </tr>
                    }
                  </tbody></table>
                }
              } @else {
                <span class="k">Lixeira: nenhuma avaliação excluída.</span>
              }
            </div>
          </section>
        }

        <!-- ===================== FOTOS ===================== -->
        @if (tab() === 'fotos') {
          <section class="panel">
            <div class="ph">
              <span>{{ photoCount() }}</span>
              <a [routerLink]="['/alunos', std.id, 'galeria']">Abrir galeria</a>
            </div>
            @if (sessions().length) {
              <div class="body stack">
                @for (s of sessions(); track s.date) {
                  <div class="session">
                    <div class="k">{{ formatBr(s.date, true) }} · {{ s.photos.length }} {{ s.photos.length === 1 ? 'foto' : 'fotos' }}@if (nearestAssessment(s.date); as d) { · avaliação {{ formatBr(d) }}}</div>
                    <div class="thumbs8">
                      @for (ph of s.photos; track ph.id) {
                        <img class="ph2 thumb" [src]="ph.url ?? ph.storage_path" [alt]="categoryLabel(ph.category)" [title]="categoryLabel(ph.category)" referrerpolicy="no-referrer" />
                      }
                    </div>
                  </div>
                }
              </div>
            } @else {
              <div class="empty">
                <span class="strong">Nenhuma foto ainda</span>
                <span class="nt">As fotos ficam ligadas à avaliação mais próxima e aparecem no relatório.</span>
                <a class="btn btnP" [routerLink]="['/alunos', std.id, 'galeria']">Enviar foto</a>
              </div>
            }
          </section>
        }

        <!-- ===================== AGENDA ===================== -->
        @if (tab() === 'agenda') {
          <section class="panel">
            @if (upcoming().length) {
              <table><tbody>
                @for (i of upcoming(); track i.id) {
                  <tr><td>{{ agendaLabel(i) }}</td><td class="nt">{{ i.focus }}</td><td class="n"><a routerLink="/agenda">Editar</a></td></tr>
                }
              </tbody></table>
            } @else {
              <div class="empty">
                <span class="strong">Nenhum atendimento marcado</span>
                <span class="nt">Os próximos 60 dias aparecem aqui.</span>
                <a class="btn" routerLink="/agenda">Abrir agenda</a>
              </div>
            }
          </section>
        }

        <!-- ===================== DOCUMENTOS ===================== -->
        @if (tab() === 'docs') {
          <section class="panel">
            <table><tbody>
              <tr>
                <td>Termo de consentimento LGPD · v{{ termVersion }}</td>
                <td class="nt">{{ std.lgpd_consent_status === 'ACCEPTED' ? 'assinado pelo aluno' : 'pendente de assinatura' }}</td>
                <td class="n"><a [routerLink]="['/alunos', std.id, 'lgpd']">{{ std.lgpd_consent_status === 'ACCEPTED' ? 'Ver assinatura' : 'Assinar' }}</a></td>
              </tr>
            </tbody></table>
          </section>
        }
      }
    </div>
  `,
  styles: [`
    .crumbs a.k { color: var(--tx2); }
    .acts { margin-left: auto; display: flex; gap: 6px; flex-wrap: wrap; }
    .head { display: flex; flex-direction: column; gap: 10px; }
    .headLine { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .headLine h1 { margin: 0; }
    .right { margin-left: auto; }
    .tabs { display: flex; border-bottom: 1px solid var(--bd); overflow-x: auto; }
    .stack { display: flex; flex-direction: column; gap: 16px; }
    .kpi5 { grid-template-columns: repeat(5, 1fr); }
    .sub { font-size: 12px; min-height: 16px; }
    .grid2 { display: grid; grid-template-columns: minmax(0, 2fr) minmax(260px, 1fr); gap: 16px; align-items: start; }
    .tw { overflow-x: auto; }
    .body { padding: 12px 14px; }
    .wrap { white-space: normal; }
    .thumbs4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; }
    .thumbs8 { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; }
    .thumb { width: 100%; object-fit: cover; display: block; }
    .session { display: flex; flex-direction: column; gap: 6px; }
    .lnk { border: 0; background: none; padding: 0; font: inherit; color: var(--ln); cursor: pointer; }
    .lnk:hover { text-decoration: underline; }
    .trash { padding: 8px 12px; border-top: 1px solid var(--bd); display: flex; flex-direction: column; gap: 6px; }
    .trashTable td { padding: 5px 0; }
    .empty { padding: 20px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .strong { font-weight: 600; }
    .btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .skel { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .sk { height: 12px; background: var(--ph); border-radius: 3px; }
    @media (max-width: 720px) {
      .grid2 { grid-template-columns: 1fr; }
      .kpi5 { grid-template-columns: 1fr 1fr; }
      .thumbs8 { grid-template-columns: repeat(3, 1fr); }
      .acts { margin-left: 0; width: 100%; }
      .right { margin-left: 0; }
    }
  `],
})
export class StudentProfileComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  private dialog = inject(DialogService);

  student = signal<Student | null>(null);
  isLoading = signal(true);
  showTrash = signal(false);
  tab = signal<Tab>('resumo');
  agenda = signal<AgendaItem[]>([]);

  termVersion = LGPD_TERM_VERSION;
  formatBr = formatBr;
  formatNum = formatNum;
  categoryLabel = categoryLabel;

  private currentId = '';

  /** Avaliações ativas, da mais recente para a mais antiga. */
  readonly sorted = computed<Assessment[]>(() =>
    [...(this.student()?.avaliacoes ?? [])].filter(a => !a.deleted_at).sort((a, b) => b.date.localeCompare(a.date)));
  readonly latest = computed(() => this.sorted()[0] ?? null);
  readonly previous = computed(() => this.sorted()[1] ?? null);

  readonly sessions = computed(() => groupPhotoSessions<Photo>(this.student()?.fotos ?? []));
  readonly lastSession = computed(() => this.sessions()[0] ?? null);
  readonly photoCount = computed(() => {
    const n = this.student()?.fotos.length ?? 0;
    const s = this.sessions().length;
    return `${n} ${n === 1 ? 'foto' : 'fotos'} em ${s} ${s === 1 ? 'sessão' : 'sessões'}`;
  });

  readonly upcoming = computed(() => {
    const id = this.student()?.id;
    const today = todayYmd();
    return this.agenda()
      .filter(i => i.aluno_id === id && i.date >= today)
      .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
  });

  readonly flags = computed(() => anamnesisTags(this.student()?.anamneses));

  readonly meta = computed(() => {
    const s = this.student();
    if (!s) return '';
    const age = ageAt(s.birth_date, todayYmd());
    return [
      s.gender === 'MALE' ? 'Masculino' : 'Feminino',
      age !== null ? `${age} anos` : null,
      s.height_cm ? `${s.height_cm} cm` : null,
      s.goal || null,
      s.phone_number || null,
    ].filter(Boolean).join(' · ');
  });

  readonly tabs = computed<{ id: Tab; label: string }[]>(() => {
    const n = this.sorted().length;
    const f = this.student()?.fotos.length ?? 0;
    return [
      { id: 'resumo', label: 'Resumo' },
      { id: 'aval', label: n ? `Avaliações ${n}` : 'Avaliações' },
      { id: 'fotos', label: f ? `Fotos ${f}` : 'Fotos' },
      { id: 'agenda', label: 'Agenda' },
      { id: 'docs', label: 'Documentos' },
    ];
  });

  readonly kpis = computed<Kpi[]>(() => {
    const s = this.student();
    const a = this.latest();
    if (!s || !a) return [];
    const p = this.previous();
    const age = ageAt(s.birth_date, a.date) ?? 30;
    const b = a.bioimpedancias;
    const pb = p?.bioimpedancias;
    const cell = (label: string, unit: string, digits: number, key: MetricKey,
                  cur: number | null | undefined, prev: number | null | undefined, extra = ''): Kpi => {
      const d = diff(cur, prev, digits);
      const parts: string[] = [];
      if (d !== null) parts.push(formatDelta(d, digits) + (key === 'weight' && p ? ` vs ${formatBr(p.date)}` : ''));
      if (extra) parts.push(extra);
      return { label, value: formatNum(cur, digits), unit, sub: parts.join(' · '), cls: deltaClass(d, METRIC_IMPROVE[key]) };
    };
    const fat = this.fatOf(a);
    const muscle = b?.skeletal_muscle_percentage;
    const visc = b?.visceral_fat_level;
    return [
      cell('Peso', 'kg', 1, 'weight', b?.weight_kg, pb?.weight_kg),
      cell('Gordura (bioimp.)', '%', 1, 'fat', fat, p ? this.fatOf(p) : null, omronLabel('fat', s.gender, age, fat)),
      cell('Músculo esquelético', '%', 1, 'muscle', muscle, pb?.skeletal_muscle_percentage, omronLabel('muscle', s.gender, age, muscle)),
      cell('Massa magra', 'kg', 1, 'leanMass', a.lean_mass_kg ?? b?.lean_mass_kg, p?.lean_mass_kg ?? pb?.lean_mass_kg),
      cell('Gordura visceral', '', 0, 'visceral', visc, pb?.visceral_fat_level, omronLabel('visceral', s.gender, age, visc)),
    ];
  });

  readonly rows = computed<CmpRow[]>(() => {
    const s = this.student();
    const a = this.latest();
    if (!s || !a) return [];
    const p = this.previous();
    const age = ageAt(s.birth_date, a.date) ?? 30;
    const b = a.bioimpedancias, pb = p?.bioimpedancias;
    const c = a.circunferencias, pc = p?.circunferencias;
    const d = a.dobras_cutaneas, pd = p?.dobras_cutaneas;
    const r = (label: string, key: MetricKey, cur: number | null | undefined, prev: number | null | undefined,
               digits = 1, unit = '', ref: RefMetric | null = null): CmpRow => {
      const dd = diff(cur, prev, digits);
      return {
        label,
        cur: cur === null || cur === undefined ? '—' : formatNum(cur, digits) + (unit ? ` ${unit}` : ''),
        prev: formatNum(prev, digits),
        delta: formatDelta(dd, digits),
        cls: deltaClass(dd, METRIC_IMPROVE[key]),
        ref: ref ? refBar(ref, s.gender, age, cur) : null,
      };
    };
    const rows: CmpRow[] = [
      { group: 'Bioimpedância Omron HBF-514C' },
      r('Peso', 'weight', b?.weight_kg, pb?.weight_kg, 1, 'kg'),
      r('IMC', 'bmi', a.bmi ?? b?.bmi, p?.bmi ?? pb?.bmi, 1, '', 'bmi'),
      r('Gordura corporal', 'fat', this.fatOf(a), p ? this.fatOf(p) : null, 1, '%', 'fat'),
      r('Músculo esquelético', 'muscle', b?.skeletal_muscle_percentage, pb?.skeletal_muscle_percentage, 1, '%', 'muscle'),
      r('Gordura visceral', 'visceral', b?.visceral_fat_level, pb?.visceral_fat_level, 0, '', 'visceral'),
      r('Massa magra', 'leanMass', a.lean_mass_kg ?? b?.lean_mass_kg, p?.lean_mass_kg ?? pb?.lean_mass_kg, 1, 'kg'),
      r('Massa gorda', 'fatMass', a.fat_mass_kg ?? b?.fat_mass_kg, p?.fat_mass_kg ?? pb?.fat_mass_kg, 1, 'kg'),
      { group: 'Perímetros · cm' },
      r('Pescoço', 'neck', c?.neck_cm, pc?.neck_cm),
      r('Ombros', 'shoulder', c?.shoulder_cm, pc?.shoulder_cm),
      r('Tórax', 'chest', c?.chest_cm, pc?.chest_cm),
      r('Cintura', 'waist', c?.waist_cm, pc?.waist_cm),
      r('Abdômen', 'abdomen', c?.abdomen_cm, pc?.abdomen_cm),
      r('Quadril', 'hip', c?.hip_cm, pc?.hip_cm),
    ];
    if (c?.bust_cm || pc?.bust_cm) rows.push(r('Busto', 'bust', c?.bust_cm, pc?.bust_cm));
    rows.push(r('RCQ', 'rcq', a.rcq ?? c?.rcq, p?.rcq ?? pc?.rcq, 2, '', 'rcq'));
    rows.push({ group: 'Dobras cutâneas · mm' });
    rows.push(r('Somatório 7 dobras', 'skinfoldSum', a.skinfolds_sum_mm ?? d?.sum_mm, p?.skinfolds_sum_mm ?? pd?.sum_mm));
    rows.push(r('% gordura por dobras', 'skinfoldFat', a.skinfolds_fat_percentage ?? d?.fat_percentage, p?.skinfolds_fat_percentage ?? pd?.fat_percentage, 1, '%'));
    return rows;
  });

  ngOnInit() {
    this.route.params.subscribe(p => {
      if (p['id']) {
        this.currentId = p['id'];
        this.loadStudent(p['id']);
      }
    });
  }

  reload() {
    if (this.currentId) this.loadStudent(this.currentId);
  }

  loadStudent(id: string) {
    this.isLoading.set(true);
    this.dataService.getStudent(id).subscribe({
      next: (res) => {
        this.student.set(res);
        this.isLoading.set(false);
        this.loadAgenda();
      },
      error: (err) => {
        console.error(err);
        this.student.set(null);
        this.isLoading.set(false);
      },
    });
  }

  /** Próximos 60 dias; falha não bloqueia o perfil (o painel simplesmente não aparece). */
  private loadAgenda() {
    const today = todayYmd();
    this.dataService.getAgenda(today, addDays(today, 60)).subscribe({
      next: items => this.agenda.set(items),
      error: () => this.agenda.set([]),
    });
  }

  /** Bloco Omron da avaliação; a API pode devolver null em avaliações antigas. */
  bio(a: Assessment): Partial<Bioimpedance> {
    return a.bioimpedancias ?? {};
  }

  /** % de gordura da bioimpedância (campo da avaliação, com fallback no bloco Omron). */
  fatOf(a: Assessment): number | null | undefined {
    return a.body_fat_percentage ?? this.bio(a).body_fat_percentage;
  }

  bmiOf(a: Assessment): number | null | undefined {
    return a.bmi ?? this.bio(a).bmi;
  }

  skinfoldSumOf(a: Assessment): number | null | undefined {
    return a.skinfolds_sum_mm ?? a.dobras_cutaneas?.sum_mm;
  }

  nearestAssessment(date: string): string | null {
    return nearestDate(this.sorted().map(a => a.date), date);
  }

  agendaLabel(i: AgendaItem): string {
    return `${weekdayShort(i.date)} ${formatBr(i.date)} · ${i.time}`;
  }

  async onDeleteAssessment(studentId: string, assessmentId: string) {
    const ok = await this.dialog.confirm({
      title: 'Mover avaliação para a lixeira?',
      message: 'Ela sai do histórico e dos relatórios. Dá para restaurar depois.',
      confirmText: 'Mover para a lixeira',
      tone: 'danger',
    });
    if (ok) {
      this.dataService.deleteAssessment(assessmentId).subscribe({
        next: () => this.loadStudent(studentId),
        error: () => this.dialog.alert({ title: 'Erro', message: 'Não foi possível excluir a avaliação. Tente de novo.', tone: 'error' }),
      });
    }
  }

  onRestoreAssessment(studentId: string, assessmentId: string) {
    this.dataService.restoreAssessment(assessmentId).subscribe({
      next: () => this.loadStudent(studentId),
      error: () => this.dialog.alert({ title: 'Erro', message: 'Não foi possível restaurar a avaliação. Tente de novo.', tone: 'error' }),
    });
  }
}
