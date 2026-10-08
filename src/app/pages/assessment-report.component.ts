import { Component, OnInit, signal, computed, inject, ChangeDetectorRef } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService, Student, Assessment } from '../data';
import { generateAssessmentPDF, PdfPhoto } from '../pdf-report';
import { DialogService } from '../dialog.service';
import { formatNum, formatDelta, deltaClass, Direction, implausibleWaterChange } from '../assessment-utils';
import { calcAge } from '../assessment-calc';
import { omronBand, omronAgeBandLabel, BandMetric, OmronBand } from '../omron-bands';
import { getTrainerName } from '../auth-utils';
import { formatBr, daysBetween } from '../date-utils';

/** Linha da tabela comparativa (padrão cmp_table do sistema visual). */
interface Row {
  label: string;
  note?: string;
  cur: string;
  prev: string;
  delta: string;
  cls: 'up' | 'dn' | 'nt';
  band?: OmronBand | null;
  tag?: string;
}

type Num = number | null | undefined;

@Component({
  selector: 'app-assessment-report',
  standalone: true,
  imports: [RouterLink, NgTemplateOutlet],
  template: `
    @if (isLoading()) {
      <div class="pad">
        <div class="panel skel" aria-busy="true"><div class="sk w40"></div><div class="sk s w70"></div><div class="sk s w55"></div></div>
      </div>
    } @else if (loadError() || !student() || !assessment()) {
      <div class="pad">
        <div class="panel state">
          <span class="strong">Não deu para carregar os dados</span>
          <span class="nt">Pode ser a internet ou a sessão que expirou. Nada foi perdido.</span>
          <div class="acts"><button type="button" class="btn btnP" (click)="reload()">Tentar de novo</button><a class="btn" routerLink="/login">Entrar de novo</a></div>
        </div>
      </div>
    } @else if (student(); as std) {
      @if (assessment(); as cur) {
        <div class="crumbs">
          <a routerLink="/alunos" class="k">Alunos</a><span class="k">›</span>
          <a [routerLink]="['/alunos', std.id]" class="k">{{ std.name }}</a><span class="k">›</span>
          <span>{{ formatBr(cur.date, true) }}</span>
          <div class="acts right">
            <button type="button" class="btn" (click)="sendWhatsApp(std, cur)">WhatsApp</button>
            <a class="btn" [routerLink]="['/alunos', std.id, 'avaliacoes', cur.id, 'editar']">Editar</a>
            <button type="button" class="btn btnP" (click)="exportPDF(std.name)" [disabled]="isGeneratingPdf()">{{ isGeneratingPdf() ? 'Gerando…' : 'Exportar PDF' }}</button>
          </div>
        </div>
        <div class="pad">
          <div class="titleRow">
            <h1 class="big">Avaliação de {{ formatBr(cur.date, true) }}</h1>
            <span class="k">{{ compareLabel() }}idade na data: {{ ageAtDate() }}</span>
          </div>

          <section class="kpi kpi5">
            @for (c of kpis(); track c.label) {
              <div>
                <div class="k">{{ c.label }}</div>
                <div class="big">{{ c.value }} @if (c.unit) { <span class="k">{{ c.unit }}</span> }</div>
                <div class="sm" [class]="c.cls">{{ c.sub }}</div>
              </div>
            }
          </section>

          <section class="panel">
            <div class="ph"><span>Bioimpedância</span><span class="k">faixas Omron para {{ bandLabel() }}</span></div>
            <div class="tw"><ng-container *ngTemplateOutlet="tbl; context: { rows: bioRows() }"></ng-container></div>
          </section>

          <section class="panel">
            <div class="ph"><span>Perímetros</span><span class="k">cm · D / E quando medidos dos dois lados</span></div>
            <div class="tw"><ng-container *ngTemplateOutlet="tbl; context: { rows: perimRows() }"></ng-container></div>
          </section>

          <section class="panel">
            <div class="ph"><span>Dobras cutâneas</span><span class="k">Jackson &amp; Pollock 7 · mm · bíceps e panturrilha fora do cálculo</span></div>
            <div class="tw"><ng-container *ngTemplateOutlet="tbl; context: { rows: foldRows() }"></ng-container></div>
          </section>

          <div class="two" [class.one]="!hasFemale()">
            @if (hasFemale()) {
              <section class="panel">
                <div class="ph"><span>Saúde feminina</span></div>
                <table><tbody>
                  <tr><td>Última menstruação</td><td class="n">{{ cur.last_menstruation_date ? formatBr(cur.last_menstruation_date, true) : '—' }}</td></tr>
                  <tr><td>Ciclo</td><td class="n">{{ cur.menstrual_cycle_regular === true ? 'Regular' : cur.menstrual_cycle_regular === false ? 'Irregular' : 'Não informado' }}</td></tr>
                </tbody></table>
              </section>
            }
            <section class="panel">
              <div class="ph"><span>Observações</span><span class="k">saem no PDF</span></div>
              <div class="obs">
                <label class="sr" for="obs">Observações</label>
                <textarea id="obs" class="f" [value]="observacoes()" (input)="onObsInput($event)" placeholder="Orientações, evolução, recomendações."></textarea>
                <div class="obsRow">
                  <button type="button" class="btn btnP" (click)="saveObservacoes()" [disabled]="isSavingObs()">{{ isSavingObs() ? 'Salvando…' : 'Salvar observações' }}</button>
                  @if (obsSavedAt()) { <span class="k dn">Salvo às {{ obsSavedAt() }}</span> }
                </div>
              </div>
            </section>
          </div>
        </div>
      }
    }

    <ng-template #tbl let-rows="rows">
      <table>
        <thead><tr><th class="w34">Parâmetro</th><th class="n">Atual</th><th class="n">Anterior</th><th class="n">Δ</th><th>Faixa Omron</th></tr></thead>
        <tbody>
          @for (r of rows; track r.label) {
            <tr>
              <td>{{ r.label }} @if (r.note) { <span class="k">{{ r.note }}</span> }</td>
              <td class="n">{{ r.cur }}</td>
              <td class="n nt">{{ r.prev }}</td>
              <td class="n" [class]="r.cls">{{ r.delta }}</td>
              <td>
                @if (r.band) {
                  <div class="ref" role="img" [attr.title]="r.band.label" [attr.aria-label]="'Faixa Omron: ' + r.band.label">
                    <div class="refOk" [style.left.%]="r.band.left" [style.width.%]="r.band.width"></div>
                    <div class="refMk" [style.left.%]="r.band.marker"></div>
                  </div>
                } @else if (r.tag) {
                  <span class="tag tagW">{{ r.tag }}</span>
                }
              </td>
            </tr>
          }
        </tbody>
      </table>
    </ng-template>
  `,
  styles: [`
    :host { display: block; }
    .strong { font-weight: 600; }
    .sm { font-size: 12px; }
    .big { margin: 0; }
    .crumbs a { color: var(--tx2); }
    .acts { display: flex; gap: 6px; flex-wrap: wrap; }
    .right { margin-left: auto; }
    .titleRow { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .kpi5 { grid-template-columns: repeat(5, 1fr); }
    .tw { overflow-x: auto; }
    .w34 { width: 34%; }
    .two { display: grid; grid-template-columns: 1fr 2fr; gap: 16px; align-items: start; }
    .two.one { grid-template-columns: 1fr; }
    .obs { padding: 14px; display: flex; flex-direction: column; gap: 8px; }
    .obsRow { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
    .state { padding: 20px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .skel { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .sk { height: 18px; background: var(--ph); border-radius: 3px; }
    .sk.s { height: 12px; }
    .w40 { width: 40%; } .w55 { width: 55%; } .w70 { width: 70%; }
    @media (max-width: 960px) { .kpi5 { grid-template-columns: repeat(3, 1fr); } .two { grid-template-columns: 1fr; } }
    @media (max-width: 720px) { .kpi5 { grid-template-columns: repeat(2, 1fr); } .right { margin-left: 0; width: 100%; } .right .btn { flex: 1; } }
  `],
})
export class AssessmentReportComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);
  private cdr = inject(ChangeDetectorRef);
  private dialog = inject(DialogService);

  readonly formatBr = formatBr;

  student = signal<Student | null>(null);
  assessment = signal<Assessment | null>(null);
  previousAssessment = signal<Assessment | null>(null);
  isLoading = signal(true);
  loadError = signal(false);
  isGeneratingPdf = signal(false);
  observacoes = signal('');
  isSavingObs = signal(false);
  obsSavedAt = signal<string | null>(null);

  ageAtDate = computed(() => {
    const std = this.student(), cur = this.assessment();
    return std && cur ? calcAge(std.birth_date, cur.date) : 0;
  });

  bandLabel = computed(() => {
    const std = this.student();
    return std ? omronAgeBandLabel(std.gender, this.ageAtDate()) : '';
  });

  compareLabel = computed(() => {
    const cur = this.assessment(), prev = this.previousAssessment();
    if (!cur || !prev) return 'primeira avaliação · ';
    const days = daysBetween(prev.date, cur.date);
    return `comparada com ${formatBr(prev.date, true)}${days !== null ? ` · ${days} dias` : ''} · `;
  });

  hasFemale = computed(() => {
    const std = this.student(), cur = this.assessment();
    return !!std && std.gender === 'FEMALE' && (cur?.last_menstruation_date != null || cur?.menstrual_cycle_regular != null);
  });

  kpis = computed(() => {
    const cur = this.assessment(), prev = this.previousAssessment();
    if (!cur) return [];
    const vs = prev ? ` vs ${formatBr(prev.date)}` : '';
    const d = (a: Num, b: Num) => a != null && b != null ? a - b : null;
    const fat = d(cur.body_fat_percentage, prev?.body_fat_percentage);
    const muscle = d(cur.bioimpedancias?.skeletal_muscle_percentage, prev?.bioimpedancias?.skeletal_muscle_percentage);
    const lean = d(cur.lean_mass_kg, prev?.lean_mass_kg);
    const visc = d(cur.bioimpedancias?.visceral_fat_level, prev?.bioimpedancias?.visceral_fat_level);
    const weight = d(cur.bioimpedancias?.weight_kg, prev?.bioimpedancias?.weight_kg);
    const sub = (delta: number | null, digits: number, extra?: string) =>
      (delta === null ? 'sem comparação' : formatDelta(delta, digits) + vs) + (extra ? ` · ${extra}` : '');
    const muscleBand = this.band('skeletalMuscle', cur.bioimpedancias?.skeletal_muscle_percentage);
    const viscBand = this.band('visceral', cur.bioimpedancias?.visceral_fat_level);
    return [
      { label: 'Peso', value: formatNum(cur.bioimpedancias?.weight_kg), unit: 'kg', sub: sub(weight, 1), cls: 'nt' },
      { label: 'Gordura (bioimp.)', value: formatNum(cur.body_fat_percentage), unit: '%', sub: sub(fat, 1, (cur.body_fat_classification ?? '').toLowerCase()), cls: deltaClass(fat, 'down') },
      { label: 'Músculo esquelético', value: formatNum(cur.bioimpedancias?.skeletal_muscle_percentage), unit: '%', sub: sub(muscle, 1, muscleBand?.label.toLowerCase()), cls: deltaClass(muscle, 'up') },
      { label: 'Massa magra', value: formatNum(cur.lean_mass_kg), unit: 'kg', sub: sub(lean, 1), cls: deltaClass(lean, 'up') },
      { label: 'Gordura visceral', value: formatNum(cur.bioimpedancias?.visceral_fat_level, 0), unit: '', sub: sub(visc, 0, viscBand?.label.toLowerCase()), cls: deltaClass(visc, 'down') },
    ];
  });

  bioRows = computed<Row[]>(() => {
    const cur = this.assessment(), prev = this.previousAssessment();
    if (!cur) return [];
    const b = cur.bioimpedancias, pb = prev?.bioimpedancias;
    const water = b?.water_percentage, pWater = pb?.water_percentage;
    const waterRow = this.row('Água corporal', water, pWater, 1, 'neutral', '%');
    if (implausibleWaterChange(water, pWater)) { waterRow.cls = 'up'; waterRow.tag = 'conferir leitura'; }
    return [
      this.row('Peso', b?.weight_kg, pb?.weight_kg, 1, 'neutral', 'kg'),
      { ...this.row('IMC', cur.bmi, prev?.bmi, 1, 'neutral'), band: this.band('bmi', cur.bmi) },
      { ...this.row('Gordura corporal', cur.body_fat_percentage, prev?.body_fat_percentage, 1, 'down', '%'), band: this.band('bodyFat', cur.body_fat_percentage) },
      { ...this.row('Músculo esquelético', b?.skeletal_muscle_percentage, pb?.skeletal_muscle_percentage, 1, 'up', '%'), band: this.band('skeletalMuscle', b?.skeletal_muscle_percentage) },
      { ...this.row('Gordura visceral', b?.visceral_fat_level, pb?.visceral_fat_level, 0, 'down'), band: this.band('visceral', b?.visceral_fat_level) },
      this.row('Massa magra', cur.lean_mass_kg, prev?.lean_mass_kg, 1, 'up', 'kg'),
      this.row('Massa gorda', cur.fat_mass_kg, prev?.fat_mass_kg, 1, 'down', 'kg'),
      this.row('Metabolismo basal', b?.resting_metabolism_kcal, pb?.resting_metabolism_kcal, 0, 'neutral', 'kcal'),
      this.row('Idade corporal', b?.body_age, pb?.body_age, 0, 'down', 'anos'),
      waterRow,
    ];
  });

  perimRows = computed<Row[]>(() => {
    const cur = this.assessment(), prev = this.previousAssessment();
    if (!cur) return [];
    const c = cur.circunferencias, pc = prev?.circunferencias;
    const rows: Row[] = [
      this.row('Pescoço', c?.neck_cm, pc?.neck_cm, 1, 'neutral'),
      this.row('Ombros', c?.shoulder_cm, pc?.shoulder_cm, 1, 'neutral'),
      this.row('Tórax', c?.chest_cm, pc?.chest_cm, 1, 'neutral'),
      this.row('Cintura', c?.waist_cm, pc?.waist_cm, 1, 'down'),
      this.row('Abdômen', c?.abdomen_cm, pc?.abdomen_cm, 1, 'down'),
      this.row('Quadril', c?.hip_cm, pc?.hip_cm, 1, 'neutral'),
    ];
    if (c?.bust_cm != null || pc?.bust_cm != null) rows.push(this.row('Busto', c?.bust_cm, pc?.bust_cm, 1, 'neutral'));
    rows.push({ ...this.row('RCQ', cur.rcq, prev?.rcq, 2, 'down'), band: this.band('rcq', cur.rcq) });
    const pairs: [string, Num, Num, Num, Num][] = [
      ['Braço relaxado', c?.right_arm_relaxed_cm, c?.left_arm_relaxed_cm, pc?.right_arm_relaxed_cm, pc?.left_arm_relaxed_cm],
      ['Braço contraído', c?.right_arm_flexed_cm, c?.left_arm_flexed_cm, pc?.right_arm_flexed_cm, pc?.left_arm_flexed_cm],
      ['Antebraço', c?.right_forearm_cm, c?.left_forearm_cm, pc?.right_forearm_cm, pc?.left_forearm_cm],
      ['Coxa proximal', c?.right_thigh_proximal_cm, c?.left_thigh_proximal_cm, pc?.right_thigh_proximal_cm, pc?.left_thigh_proximal_cm],
      ['Coxa medial', c?.right_thigh_medial_cm, c?.left_thigh_medial_cm, pc?.right_thigh_medial_cm, pc?.left_thigh_medial_cm],
      ['Coxa distal', c?.right_thigh_distal_cm, c?.left_thigh_distal_cm, pc?.right_thigh_distal_cm, pc?.left_thigh_distal_cm],
      ['Panturrilha', c?.right_calf_cm, c?.left_calf_cm, pc?.right_calf_cm, pc?.left_calf_cm],
    ];
    for (const [label, r, l, pr, pl] of pairs) {
      if (r == null && l == null) continue;
      rows.push(this.pairRow(label, r, l, pr, pl));
    }
    return rows;
  });

  foldRows = computed<Row[]>(() => {
    const cur = this.assessment(), prev = this.previousAssessment();
    if (!cur) return [];
    const s = cur.dobras_cutaneas, ps = prev?.dobras_cutaneas;
    const rows: Row[] = [
      this.row('Tríceps', s?.triceps_mm, ps?.triceps_mm, 1, 'down'),
      this.row('Subescapular', s?.subscapular_mm, ps?.subscapular_mm, 1, 'down'),
      this.row('Peitoral', s?.chest_mm, ps?.chest_mm, 1, 'down'),
      this.row('Axilar média', s?.midaxillary_mm, ps?.midaxillary_mm, 1, 'down'),
      this.row('Supra-ilíaca', s?.suprailiac_mm, ps?.suprailiac_mm, 1, 'down'),
      this.row('Abdominal', s?.abdominal_mm, ps?.abdominal_mm, 1, 'down'),
      this.row('Coxa', s?.mid_thigh_mm, ps?.mid_thigh_mm, 1, 'down'),
      this.row('Somatório 7 dobras', cur.skinfolds_sum_mm, prev?.skinfolds_sum_mm, 1, 'down'),
      this.row('% gordura por dobras', cur.skinfolds_fat_percentage, prev?.skinfolds_fat_percentage, 1, 'down', '%'),
    ];
    if (s?.biceps_mm != null || ps?.biceps_mm != null) rows.push({ ...this.row('Bíceps', s?.biceps_mm, ps?.biceps_mm, 1, 'neutral'), note: 'fora do cálculo' });
    if (s?.calf_mm != null || ps?.calf_mm != null) rows.push({ ...this.row('Panturrilha', s?.calf_mm, ps?.calf_mm, 1, 'neutral'), note: 'fora do cálculo' });
    return rows;
  });

  ngOnInit() {
    this.route.params.subscribe(p => {
      const studentId = p['id'], assessmentId = p['id_aval'];
      if (studentId && assessmentId) this.loadReportData(studentId, assessmentId);
    });
  }

  reload() {
    const p = this.route.snapshot.params;
    if (p['id'] && p['id_aval']) this.loadReportData(p['id'], p['id_aval']);
  }

  loadReportData(studentId: string, assessmentId: string) {
    this.isLoading.set(true);
    this.loadError.set(false);
    this.dataService.getStudent(studentId).subscribe({
      next: (std) => {
        this.student.set(std);
        // avaliacoes vêm em ordem DESC (mais recente primeiro): "anterior" = índice + 1
        const idx = std.avaliacoes.findIndex(a => a.id === assessmentId);
        if (idx !== -1) {
          const cur = std.avaliacoes[idx];
          this.assessment.set(cur);
          this.observacoes.set(cur.observacoes ?? '');
          this.previousAssessment.set(std.avaliacoes[idx + 1] ?? null);
        }
        this.isLoading.set(false);
      },
      error: (err) => { console.error(err); this.loadError.set(true); this.isLoading.set(false); },
    });
  }

  // ---------- montagem das linhas ----------

  private band(metric: BandMetric, value: Num): OmronBand | null {
    const std = this.student();
    return std ? omronBand(metric, std.gender, this.ageAtDate(), value) : null;
  }

  private row(label: string, cur: Num, prev: Num, digits: number, good: Direction, unit = ''): Row {
    const delta = cur != null && prev != null ? cur - prev : null;
    return {
      label,
      cur: cur != null ? formatNum(cur, digits) + (unit ? ` ${unit}` : '') : '—',
      prev: formatNum(prev ?? null, digits),
      delta: formatDelta(delta, digits),
      cls: deltaClass(delta, good),
    };
  }

  private pairRow(label: string, r: Num, l: Num, pr: Num, pl: Num): Row {
    const both = (a: Num, b: Num, f: (x: number) => string) => (a == null && b == null) ? '—' : `${a != null ? f(a) : '—'} / ${b != null ? f(b) : '—'}`;
    const dr = r != null && pr != null ? r - pr : null;
    const dl = l != null && pl != null ? l - pl : null;
    return {
      label: `${label} D / E`,
      cur: both(r, l, x => formatNum(x)),
      prev: both(pr, pl, x => formatNum(x)),
      delta: dr == null && dl == null ? '—' : `${formatDelta(dr)} / ${formatDelta(dl)}`,
      cls: 'nt',
    };
  }

  // ---------- ações ----------

  sendWhatsApp(std: Student, cur: Assessment) {
    const phone = std.phone_number ? std.phone_number.replace(/\D/g, '') : '';
    const textMessage = `Olá ${std.name}, sua nova avaliação está pronta! Resumo: Peso: ${cur.bioimpedancias?.weight_kg ?? '—'}kg, Gordura: ${cur.body_fat_percentage}%. Veja mais detalhes na nossa plataforma.`;
    const url = `https://api.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(textMessage)}`;
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener');
  }

  onObsInput(event: Event) {
    this.observacoes.set((event.target as HTMLTextAreaElement).value);
    this.obsSavedAt.set(null);
  }

  saveObservacoes() {
    const aval = this.assessment();
    if (!aval) return;
    this.isSavingObs.set(true);
    this.dataService.updateObservacoes(aval.id, this.observacoes()).subscribe({
      next: (saved) => {
        const texto = saved?.observacoes ?? '';
        this.observacoes.set(texto);
        this.assessment.set({ ...aval, observacoes: texto });
        this.isSavingObs.set(false);
        const now = new Date();
        this.obsSavedAt.set(`${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
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
        student: std, assessment: aval, previous: this.previousAssessment(),
        trainerName: getTrainerName(), generatedAt: new Date(), photos, observacoes: this.observacoes(),
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
