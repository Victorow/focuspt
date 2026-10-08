import { Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, FormControl, Validators, AbstractControl, ValidatorFn } from '@angular/forms';
import { DataService, Student, Assessment } from '../data';
import { ToastService } from '../toast.service';
import {
  shouldConvertCmToMm, cmToMm, fieldRangeHint, toOptionalBoolean,
  parseDecimal, parsePositive, toInputText, formatNum, formatDelta, deltaClass, symmetry, implausibleWaterChange,
} from '../assessment-utils';
import { calcAge, calcBmi, classifyBmi, classifyBodyFat, calcSkinfoldsSum7, calcJacksonPollock7, calcRcq, classifyRcq } from '../assessment-calc';
import { todayYmd, daysBetween, formatBr } from '../date-utils';

type Group = 'bioimpedance' | 'circumferences' | 'skinfolds';

interface FieldDef {
  group: Group;
  ctrl: string;
  label: string;
  unit: string;
  dica: string;
  optional?: boolean;
  step: 1 | 2 | 3;
  prev: (a: Assessment) => number | null | undefined;
}

interface LimbRow {
  label: string;
  right: string;
  left: string;
  optional?: boolean;
  dica: string;
  prevRight: (a: Assessment) => number | null | undefined;
  prevLeft: (a: Assessment) => number | null | undefined;
}

interface MissingField { label: string; stepName: string; hint: string; control: AbstractControl; isDate: boolean }

const OMRON_FIELDS: FieldDef[] = [
  { group: 'bioimpedance', ctrl: 'weightKg', label: 'Peso', unit: 'kg', dica: 'Como aparece no visor da balança.', step: 1, prev: a => a.bioimpedancias?.weight_kg },
  { group: 'bioimpedance', ctrl: 'bodyFatPercentage', label: 'Gordura corporal', unit: '%', dica: 'Leitura de bioimpedância da Omron.', step: 1, prev: a => a.bioimpedancias?.body_fat_percentage },
  { group: 'bioimpedance', ctrl: 'skeletalMusclePercentage', label: 'Músculo esquelético', unit: '%', dica: 'Leitura de bioimpedância da Omron.', step: 1, prev: a => a.bioimpedancias?.skeletal_muscle_percentage },
  { group: 'bioimpedance', ctrl: 'restingMetabolismKcal', label: 'Metabolismo basal', unit: 'kcal', dica: 'Valor inteiro, em kcal.', step: 1, prev: a => a.bioimpedancias?.resting_metabolism_kcal },
  { group: 'bioimpedance', ctrl: 'bodyAge', label: 'Idade corporal', unit: 'anos', dica: 'Entre 10 e 100.', step: 1, prev: a => a.bioimpedancias?.body_age },
  { group: 'bioimpedance', ctrl: 'visceralFatLevel', label: 'Gordura visceral', unit: 'nível', dica: 'Escala Omron de 1 a 30.', step: 1, prev: a => a.bioimpedancias?.visceral_fat_level },
  { group: 'bioimpedance', ctrl: 'waterPercentage', label: 'Água corporal', unit: '%', dica: 'Se a balança mostrar. Pode deixar em branco.', optional: true, step: 1, prev: a => a.bioimpedancias?.water_percentage },
];

const TRUNK_FIELDS: FieldDef[] = [
  { group: 'circumferences', ctrl: 'neckCm', label: 'Pescoço', unit: 'cm', dica: 'Abaixo da cartilagem tireoide.', step: 2, prev: a => a.circunferencias?.neck_cm },
  { group: 'circumferences', ctrl: 'shoulderCm', label: 'Ombros', unit: 'cm', dica: 'Maior circunferência, braços relaxados.', step: 2, prev: a => a.circunferencias?.shoulder_cm },
  { group: 'circumferences', ctrl: 'chestCm', label: 'Tórax', unit: 'cm', dica: 'Linha dos mamilos, fim da expiração.', step: 2, prev: a => a.circunferencias?.chest_cm },
  { group: 'circumferences', ctrl: 'waistCm', label: 'Cintura', unit: 'cm', dica: 'Menor circunferência entre costela e crista ilíaca.', step: 2, prev: a => a.circunferencias?.waist_cm },
  { group: 'circumferences', ctrl: 'abdomenCm', label: 'Abdômen', unit: 'cm', dica: 'Na altura do umbigo.', step: 2, prev: a => a.circunferencias?.abdomen_cm },
  { group: 'circumferences', ctrl: 'hipCm', label: 'Quadril', unit: 'cm', dica: 'Maior protuberância dos glúteos.', step: 2, prev: a => a.circunferencias?.hip_cm },
  { group: 'circumferences', ctrl: 'bustCm', label: 'Busto', unit: 'cm', dica: 'Opcional.', optional: true, step: 2, prev: a => a.circunferencias?.bust_cm },
];

const LIMB_ROWS: LimbRow[] = [
  { label: 'Braço relaxado', right: 'rightArmRelaxedCm', left: 'leftArmRelaxedCm', dica: 'Ponto médio entre acrômio e olécrano, braço solto.', prevRight: a => a.circunferencias?.right_arm_relaxed_cm, prevLeft: a => a.circunferencias?.left_arm_relaxed_cm },
  { label: 'Braço contraído', right: 'rightArmFlexedCm', left: 'leftArmFlexedCm', dica: 'Maior circunferência com o bíceps contraído.', prevRight: a => a.circunferencias?.right_arm_flexed_cm, prevLeft: a => a.circunferencias?.left_arm_flexed_cm },
  { label: 'Antebraço', right: 'rightForearmCm', left: 'leftForearmCm', optional: true, dica: 'Maior circunferência, mão relaxada.', prevRight: a => a.circunferencias?.right_forearm_cm, prevLeft: a => a.circunferencias?.left_forearm_cm },
  { label: 'Coxa proximal', right: 'rightThighProximalCm', left: 'leftThighProximalCm', dica: 'Logo abaixo da prega glútea.', prevRight: a => a.circunferencias?.right_thigh_proximal_cm, prevLeft: a => a.circunferencias?.left_thigh_proximal_cm },
  { label: 'Coxa medial', right: 'rightThighMedialCm', left: 'leftThighMedialCm', optional: true, dica: 'Ponto médio entre prega glútea e patela.', prevRight: a => a.circunferencias?.right_thigh_medial_cm, prevLeft: a => a.circunferencias?.left_thigh_medial_cm },
  { label: 'Coxa distal', right: 'rightThighDistalCm', left: 'leftThighDistalCm', optional: true, dica: 'Logo acima da patela.', prevRight: a => a.circunferencias?.right_thigh_distal_cm, prevLeft: a => a.circunferencias?.left_thigh_distal_cm },
  { label: 'Panturrilha', right: 'rightCalfCm', left: 'leftCalfCm', dica: 'Maior circunferência, pé apoiado.', prevRight: a => a.circunferencias?.right_calf_cm, prevLeft: a => a.circunferencias?.left_calf_cm },
];

const SKINFOLD_FIELDS: FieldDef[] = [
  { group: 'skinfolds', ctrl: 'tricepsMm', label: '1 · Tríceps', unit: 'mm', dica: 'Vertical, ponto médio posterior do braço.', step: 3, prev: a => a.dobras_cutaneas?.triceps_mm },
  { group: 'skinfolds', ctrl: 'subscapularMm', label: '2 · Subescapular', unit: 'mm', dica: 'Diagonal, abaixo do ângulo inferior da escápula.', step: 3, prev: a => a.dobras_cutaneas?.subscapular_mm },
  { group: 'skinfolds', ctrl: 'chestMm', label: '3 · Peitoral', unit: 'mm', dica: 'Diagonal, entre axila e mamilo.', step: 3, prev: a => a.dobras_cutaneas?.chest_mm },
  { group: 'skinfolds', ctrl: 'midaxillaryMm', label: '4 · Axilar média', unit: 'mm', dica: 'Vertical, linha axilar média na altura do xifoide.', step: 3, prev: a => a.dobras_cutaneas?.midaxillary_mm },
  { group: 'skinfolds', ctrl: 'suprailiacMm', label: '5 · Supra-ilíaca', unit: 'mm', dica: 'Diagonal, acima da crista ilíaca.', step: 3, prev: a => a.dobras_cutaneas?.suprailiac_mm },
  { group: 'skinfolds', ctrl: 'abdominalMm', label: '6 · Abdominal', unit: 'mm', dica: 'Vertical, 2 cm ao lado do umbigo.', step: 3, prev: a => a.dobras_cutaneas?.abdominal_mm },
  { group: 'skinfolds', ctrl: 'midThighMm', label: '7 · Coxa', unit: 'mm', dica: 'Vertical, ponto médio anterior da coxa.', step: 3, prev: a => a.dobras_cutaneas?.mid_thigh_mm },
];

const EXTRA_SKINFOLDS: FieldDef[] = [
  { group: 'skinfolds', ctrl: 'bicepsMm', label: 'Bíceps', unit: 'mm', dica: 'Fora do cálculo. Vertical, ponto médio anterior do braço.', optional: true, step: 3, prev: a => a.dobras_cutaneas?.biceps_mm },
  { group: 'skinfolds', ctrl: 'calfMm', label: 'Panturrilha', unit: 'mm', dica: 'Fora do cálculo. Vertical, maior circunferência.', optional: true, step: 3, prev: a => a.dobras_cutaneas?.calf_mm },
];

const STEP_LABELS: Record<number, string> = { 1: 'Balança Omron', 2: 'Perímetros', 3: 'Dobras', 4: 'Revisão' };

/** Validador de campo decimal (vírgula ou ponto). */
function decimal(opts: { required?: boolean; min?: number; max?: number }): ValidatorFn {
  return (c) => {
    const raw = c.value;
    const empty = raw === null || raw === undefined || `${raw}`.trim() === '';
    if (empty) return opts.required ? { required: true } : null;
    const n = parseDecimal(raw);
    if (n === null) return { decimal: true };
    if (opts.min !== undefined && n < opts.min) return { min: true };
    if (opts.max !== undefined && n > opts.max) return { max: true };
    return null;
  };
}

@Component({
  selector: 'app-new-assessment',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, NgTemplateOutlet],
  template: `
    @if (loadError()) {
      <div class="pad">
        <div class="panel state">
          <span class="strong">Não deu para carregar os dados</span>
          <span class="nt">Pode ser a internet ou a sessão que expirou. Nada foi perdido.</span>
          <div class="acts"><button type="button" class="btn btnP" (click)="reload()">Tentar de novo</button><a class="btn" routerLink="/login">Entrar de novo</a></div>
        </div>
      </div>
    } @else if (!student()) {
      <div class="pad">
        <div class="panel skel" aria-busy="true"><div class="sk w40"></div><div class="sk s w70"></div><div class="sk s w55"></div></div>
      </div>
    } @else if (student(); as std) {
      <form [formGroup]="assessmentForm" (ngSubmit)="onSubmit()" novalidate>

        <!-- ================= CELULAR: modo Medir ================= -->
        @if (isPhone()) {
          <div class="mob">
            <div class="mobTop">
              <a class="btn btnQ" [routerLink]="['/alunos', std.id]">Fechar</a>
              <span class="strong">{{ firstName(std.name) }} · {{ stepLabel(activeStep()) }}</span>
              <span class="k">{{ activeStep() === 4 ? '' : (fieldIndex() + 1) + '/' + fields.length }}</span>
            </div>

            @if (activeStep() < 4 && currentField(); as f) {
              <div class="passos" aria-hidden="true">
                @for (p of stepFields(); track p.ctrl) {
                  <span class="passo" [class.ok]="isDone(p)" [class.at]="p === f"></span>
                }
              </div>
              <div>
                <label for="mob-v" class="mobLb">{{ f.label }} @if (f.optional) { <span class="k">opcional</span> }</label>
                <div class="k">{{ f.dica }}</div>
              </div>
              <div class="mobIn">
                <input id="mob-v" class="valor" type="text" inputmode="decimal" autocomplete="off"
                       [formControl]="ctrl(f.group, f.ctrl)" (blur)="f.group === 'skinfolds' ? maybeConvertSkinfold(f.ctrl) : null" />
                <span class="k unit">{{ f.unit }}</span>
              </div>
              <div class="panel prevBox">
                <span class="nt">{{ previous() ? 'Anterior em ' + formatBr(previous()!.date) : 'Sem avaliação anterior' }}</span>
                <span>{{ prevOf(f) }} <span [class]="fieldDeltaCls(f)">{{ fieldDelta(f) }}</span></span>
              </div>
              <div class="mobFoot">
                <span class="k center">Teclado numérico abre sozinho. Vírgula ou ponto, tanto faz.</span>
                <div class="mobBtns">
                  <button type="button" class="btn" (click)="prevField()">Voltar</button>
                  <button type="button" class="btn btnP" (click)="nextField()">{{ nextLabel() }}</button>
                </div>
              </div>
            } @else {
              <div class="stack">
                <div>
                  <label class="lb" for="data-m">Data da medição</label>
                  <input id="data-m" class="f" type="date" formControlName="date" />
                </div>
                <ng-container *ngTemplateOutlet="reviewTpl"></ng-container>
                <div class="panel" formGroupName="bioimpedance">
                  <div class="ph"><span>Balança</span></div>
                  <div class="body"><label class="chk"><input type="checkbox" formControlName="isAthlete" />Modo atleta ligado na balança</label></div>
                </div>
                @if (std.gender === 'FEMALE') {
                  <ng-container *ngTemplateOutlet="femTpl"></ng-container>
                }
              </div>
              <div class="mobFoot">
                <div class="mobBtns">
                  <button type="button" class="btn" (click)="backFromReview()">Voltar</button>
                  <button type="submit" class="btn btnP" [disabled]="isSubmitting()">{{ isSubmitting() ? 'Salvando…' : 'Salvar avaliação' }}</button>
                </div>
              </div>
            }
          </div>
        } @else {

        <!-- ================= DESKTOP ================= -->
        <div class="crumbs">
          <a routerLink="/alunos" class="k">Alunos</a><span class="k">›</span>
          <a [routerLink]="['/alunos', std.id]" class="k">{{ std.name }}</a><span class="k">›</span>
          <span>{{ isEditMode() ? 'Editar avaliação' : 'Nova avaliação' }}</span>
        </div>
        <div class="pad">
          <nav class="steps" aria-label="Etapas">
            @for (s of steps; track s.n) {
              <button type="button" class="navItem step" [class.navOn]="activeStep() === s.n" (click)="goStep(s.n)"
                      [attr.aria-current]="activeStep() === s.n ? 'step' : null">
                <span class="nt">{{ stepDone(s.n) ? '✓' : s.n }}</span><span>{{ s.label }}</span><span class="k">{{ stepSub(s.n) }}</span>
              </button>
            }
          </nav>

          <div class="titleRow">
            <h1 class="big">{{ isEditMode() ? 'Editar avaliação' : 'Nova avaliação' }} · {{ std.name }}</h1>
            <span class="k">{{ std.gender === 'FEMALE' ? 'Feminino' : 'Masculino' }} · {{ ageAtDate() }} anos na data · {{ std.height_cm }} cm</span>
            <div class="dateBox">
              <label for="data" class="k">Data da medição</label>
              <input id="data" class="f" type="date" formControlName="date" [class.bad]="assessmentForm.get('date')?.invalid && assessmentForm.get('date')?.touched" />
            </div>
          </div>

          <!-- Etapa 1 -->
          @if (activeStep() === 1) {
            <section class="panel" formGroupName="bioimpedance">
              <div class="ph"><span>Balança Omron HBF-514C</span><span class="k">transcreva o visor</span></div>
              <div class="grid3">
                @for (f of omronFields; track f.ctrl) {
                  <ng-container *ngTemplateOutlet="numTpl; context: { f: f }"></ng-container>
                }
              </div>
              <div class="body pt0"><label class="chk"><input type="checkbox" formControlName="isAthlete" />Modo atleta ligado na balança</label></div>
            </section>
            @if (std.gender === 'FEMALE') {
              <ng-container *ngTemplateOutlet="femTpl"></ng-container>
            }
          }

          <!-- Etapa 2 -->
          @if (activeStep() === 2) {
            <section class="panel" formGroupName="circumferences">
              <div class="ph"><span>Tronco · cm</span><span class="k">fita na pele, sem comprimir</span></div>
              <div class="grid3">
                @for (f of trunkFields; track f.ctrl) {
                  <ng-container *ngTemplateOutlet="numTpl; context: { f: f }"></ng-container>
                }
              </div>
            </section>
            <section class="panel" formGroupName="circumferences">
              <div class="ph"><span>Membros · cm</span><span class="k">preencha ao menos um lado completo</span></div>
              <div class="tw">
              <table>
                <thead><tr><th>Medida</th><th>Direito</th><th>Esquerdo</th><th>Simetria</th></tr></thead>
                <tbody>
                  @for (r of limbRows; track r.right) {
                    <tr>
                      <td>{{ r.label }} @if (r.optional) { <span class="k">opcional</span> }</td>
                      <td><input class="f side" type="text" inputmode="decimal" [formControlName]="r.right" [attr.aria-label]="r.label + ' direito'" [class.bad]="isBad('circumferences', r.right)" /></td>
                      <td><input class="f side" type="text" inputmode="decimal" [formControlName]="r.left" [attr.aria-label]="r.label + ' esquerdo'" [class.bad]="isBad('circumferences', r.left)" /></td>
                      <td [class]="limbSym(r).cls">{{ limbSym(r).text }}</td>
                    </tr>
                  }
                </tbody>
              </table>
              </div>
            </section>
          }

          <!-- Etapa 3 -->
          @if (activeStep() === 3) {
            <section class="panel" formGroupName="skinfolds">
              <div class="ph"><span>Dobras · Jackson &amp; Pollock 7 · mm</span><span class="k">lado direito · valores abaixo de 6 viram mm</span></div>
              <div class="grid3">
                @for (f of skinfoldFields; track f.ctrl) {
                  <ng-container *ngTemplateOutlet="numTpl; context: { f: f }"></ng-container>
                }
              </div>
            </section>
            <section class="panel" formGroupName="skinfolds">
              <div class="ph"><span>Fora do cálculo</span><span class="k">opcionais</span></div>
              <div class="grid3">
                @for (f of extraSkinfolds; track f.ctrl) {
                  <ng-container *ngTemplateOutlet="numTpl; context: { f: f }"></ng-container>
                }
              </div>
            </section>
          }

          <!-- Etapa 4 -->
          @if (activeStep() === 4) {
            <ng-container *ngTemplateOutlet="reviewTpl"></ng-container>
          }

          <div class="foot">
            <button type="button" class="btn" (click)="goStep(activeStep() - 1)" [disabled]="activeStep() === 1">Voltar</button>
            <div class="footR">
              <a class="btn" [routerLink]="['/alunos', std.id]">Cancelar</a>
              @if (activeStep() < 4) {
                <button type="button" class="btn btnP" (click)="goStep(activeStep() + 1)">{{ activeStep() === 3 ? 'Revisar' : 'Próximo' }}</button>
              } @else {
                <button type="submit" class="btn btnP" [disabled]="isSubmitting()">{{ isSubmitting() ? 'Salvando…' : 'Salvar avaliação' }}</button>
              }
            </div>
          </div>
        </div>
        }

        <!-- Campo numérico com "Anterior" -->
        <ng-template #numTpl let-f="f">
          <div>
            <label class="lb" [for]="'f-' + f.ctrl">{{ f.label }} ({{ f.unit }}) @if (f.optional) { <span class="k">opcional</span> }</label>
            <input [id]="'f-' + f.ctrl" class="f" type="text" inputmode="decimal" autocomplete="off" [formControl]="ctrl(f.group, f.ctrl)"
                   [class.bad]="isBad(f.group, f.ctrl)" (blur)="f.group === 'skinfolds' ? maybeConvertSkinfold(f.ctrl) : null" />
            <div class="k prev">Anterior: {{ prevOf(f) }}</div>
          </div>
        </ng-template>

        <!-- Saúde feminina -->
        <ng-template #femTpl>
          <section class="panel">
            <div class="ph"><span>Saúde feminina</span><span class="k">opcional, desta avaliação</span></div>
            <div class="grid3">
              <div><label class="lb" for="dum">Última menstruação</label><input id="dum" class="f" type="date" formControlName="lastMenstruationDate" /></div>
              <div><label class="lb" for="ciclo">Ciclo</label>
                <select id="ciclo" class="f" formControlName="menstrualCycleRegular">
                  <option value="">Não informado</option><option value="true">Regular</option><option value="false">Irregular</option>
                </select>
              </div>
            </div>
          </section>
        </ng-template>

        <!-- Revisão -->
        <ng-template #reviewTpl>
          @if (preview(); as p) {
            <section class="kpi kpi4">
              <div><div class="k">IMC</div><div class="big">{{ formatNum(p.bmi, 1) }}</div><div class="k">{{ p.bmiLabel }}</div></div>
              <div><div class="k">Gordura (bioimp.)</div><div class="big">{{ formatNum(p.fat, 1) }} <span class="k">%</span></div><div class="sm" [class]="p.fatDeltaCls">{{ p.fatLabel }}{{ p.fatDelta !== null ? ' · ' + formatDelta(p.fatDelta, 1) : '' }}</div></div>
              <div><div class="k">Somatório 7 dobras</div><div class="big">{{ formatNum(p.sum7, 0) }} <span class="k">mm</span></div><div class="k">{{ p.jp7 !== null ? formatNum(p.jp7, 1) + ' % por dobras' : 'faltam dobras' }}</div></div>
              <div><div class="k">RCQ</div><div class="big">{{ formatNum(p.rcq, 2) }}</div><div class="k">{{ p.rcqDetail }}</div></div>
            </section>
            @for (w of p.warnings; track w.title) {
              <section class="panel warn"><div class="body"><span class="up strong">{{ w.title }}</span> <span class="nt">{{ w.detail }}</span></div></section>
            }
            @if (p.warnings.length === 0) {
              <section class="panel"><div class="body nt">Nenhum aviso. Confira os números e salve.</div></section>
            }
          }
        </ng-template>
      </form>

      <!-- Modal: campos que precisam de atenção -->
      @if (showValidationModal()) {
        <div class="scrim" (click)="closeValidationModal()">
          <div class="panel modal" role="dialog" aria-modal="true" aria-labelledby="val-title" (click)="$event.stopPropagation()">
            <div class="ph"><span id="val-title">{{ missingFields().length }} {{ missingFields().length === 1 ? 'campo precisa' : 'campos precisam' }} de atenção</span></div>
            <div class="modalBody">
              <table>
                <tbody>
                  @for (m of missingFields(); track $index) {
                    <tr>
                      <td>{{ m.label }} <span class="k">{{ m.stepName }} · {{ m.hint }}</span></td>
                      <td class="n">
                        @if (m.isDate) {
                          <input class="f side" type="date" [formControl]="asFormControl(m.control)" [attr.aria-label]="m.label" [class.bad]="m.control.invalid" />
                        } @else {
                          <input class="f side" type="text" inputmode="decimal" [formControl]="asFormControl(m.control)" [attr.aria-label]="m.label" [class.bad]="m.control.invalid" />
                        }
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
            <div class="modalFoot">
              <button type="button" class="btn" (click)="closeValidationModal()">Voltar ao formulário</button>
              <button type="button" class="btn btnP" (click)="onSubmit()">Salvar avaliação</button>
            </div>
          </div>
        </div>
      }
    }
  `,
  styles: [`
    :host { display: block; }
    .strong { font-weight: 600; }
    .sm { font-size: 12px; }
    .center { text-align: center; }
    .stack { display: flex; flex-direction: column; gap: 16px; }
    .crumbs a { color: var(--tx2); }
    .big { margin: 0; }

    .steps { display: flex; gap: 4px; border-bottom: 1px solid var(--bd); padding-bottom: 12px; align-items: center; flex-wrap: wrap; }
    .step { gap: 8px; min-height: 40px; }
    .titleRow { display: flex; align-items: center; gap: 16px; flex-wrap: wrap; }
    .dateBox { margin-left: auto; display: flex; align-items: center; gap: 8px; }
    .dateBox .f { width: 150px; }

    .grid3 { padding: 14px; display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
    .body { padding: 12px 14px; }
    .pt0 { padding-top: 0; }
    .prev { margin-top: 4px; }
    .side { width: 110px; }
    .tw { overflow-x: auto; }
    .bad { border-color: var(--bad); }
    .kpi4 { grid-template-columns: repeat(4, 1fr); }
    .warn { border-color: var(--bad); }

    .foot { display: flex; justify-content: space-between; gap: 8px; padding-top: 8px; border-top: 1px solid var(--bd); flex-wrap: wrap; }
    .footR { display: flex; gap: 8px; }

    .scrim { position: fixed; inset: 0; z-index: 9998; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(0, 0, 0, .45); }
    .modal { width: 100%; max-width: 640px; max-height: 85vh; display: flex; flex-direction: column; box-shadow: 0 12px 32px rgba(0, 0, 0, .25); }
    .modalBody { overflow-y: auto; }
    .modalBody .side { width: 120px; margin-left: auto; }
    .modalFoot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 14px; border-top: 1px solid var(--bd); flex-wrap: wrap; }

    .state { padding: 20px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .acts { display: flex; gap: 8px; }
    .skel { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .sk { height: 18px; background: var(--ph); border-radius: 3px; }
    .sk.s { height: 12px; }
    .w40 { width: 40%; } .w55 { width: 55%; } .w70 { width: 70%; }

    /* Celular: modo Medir */
    .mob { min-height: calc(100vh - 52px); display: flex; flex-direction: column; padding: 12px 16px 24px; gap: 20px; }
    .mobTop { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
    .mobTop .btnQ { padding: 0 8px; }
    .passos { display: flex; gap: 4px; }
    .passo { flex: 1; height: 4px; border-radius: 2px; background: var(--bd); }
    .passo.ok { background: var(--tx2); }
    .passo.at { background: var(--tx); }
    .mobLb { font-size: 18px; font-weight: 600; }
    .mobIn { display: flex; align-items: flex-end; gap: 8px; }
    .valor { width: 100%; min-width: 0; border: 0; border-bottom: 2px solid var(--bd2); background: transparent; font: inherit; font-size: 56px; line-height: 1.1; font-weight: 500; padding: 0 0 6px; color: var(--tx); }
    .valor:focus { outline: none; border-bottom-color: var(--tx); }
    .unit { padding-bottom: 12px; font-size: 16px; }
    .prevBox { padding: 10px 14px; display: flex; justify-content: space-between; gap: 8px; }
    .mobFoot { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
    .mobBtns { display: flex; gap: 8px; }
    .mobBtns .btn { flex: 1; min-height: 48px; }
    .mobBtns .btnP { flex: 2; }

    @media (max-width: 960px) { .grid3 { grid-template-columns: repeat(2, 1fr); } .kpi4 { grid-template-columns: repeat(2, 1fr); } }
    @media (max-width: 720px) { .grid3 { grid-template-columns: 1fr; } .footR { flex: 1; justify-content: flex-end; } }
  `],
})
export class NewAssessmentComponent implements OnInit {
  private fb = inject(FormBuilder);
  private dataService = inject(DataService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private toast = inject(ToastService);
  private destroyRef = inject(DestroyRef);

  readonly steps = [{ n: 1, label: 'Balança Omron' }, { n: 2, label: 'Perímetros' }, { n: 3, label: 'Dobras' }, { n: 4, label: 'Revisão' }];
  readonly omronFields = OMRON_FIELDS;
  readonly trunkFields = TRUNK_FIELDS;
  readonly limbRows = LIMB_ROWS;
  readonly skinfoldFields = SKINFOLD_FIELDS;
  readonly extraSkinfolds = EXTRA_SKINFOLDS;
  /** Lista plana para o modo Medir (um campo por vez). */
  readonly fields: FieldDef[] = [
    ...OMRON_FIELDS,
    ...TRUNK_FIELDS,
    ...LIMB_ROWS.flatMap<FieldDef>(r => [
      { group: 'circumferences', ctrl: r.right, label: `${r.label} direito`, unit: 'cm', dica: r.dica, optional: r.optional, step: 2, prev: r.prevRight },
      { group: 'circumferences', ctrl: r.left, label: `${r.label} esquerdo`, unit: 'cm', dica: r.dica, optional: r.optional, step: 2, prev: r.prevLeft },
    ]),
    ...SKINFOLD_FIELDS,
    ...EXTRA_SKINFOLDS,
  ];

  readonly formatNum = formatNum;
  readonly formatDelta = formatDelta;
  readonly formatBr = (d: string) => formatBr(d);

  student = signal<Student | null>(null);
  previous = signal<Assessment | null>(null);
  loadError = signal(false);
  activeStep = signal(1);
  fieldIndex = signal(0);
  isPhone = signal(false);
  isSubmitting = signal(false);
  isEditMode = signal(false);
  editAssessmentId = signal<string | null>(null);
  showValidationModal = signal(false);
  missingFields = signal<MissingField[]>([]);

  assessmentForm: FormGroup = this.fb.group({
    date: [todayYmd(), [Validators.required]],
    lastMenstruationDate: [''],
    menstrualCycleRegular: [''],
    bioimpedance: this.fb.group({
      isAthlete: [false],
      weightKg: ['', decimal({ required: true, min: 1 })],
      bodyFatPercentage: ['', decimal({ required: true, min: 0.1, max: 80 })],
      skeletalMusclePercentage: ['', decimal({ required: true, min: 0.1, max: 80 })],
      restingMetabolismKcal: ['', decimal({ required: true, min: 1 })],
      bodyAge: ['', decimal({ required: true, min: 10, max: 100 })],
      visceralFatLevel: ['', decimal({ required: true, min: 1, max: 30 })],
      waterPercentage: ['', decimal({ min: 0, max: 100 })],
    }),
    circumferences: this.fb.group({
      neckCm: ['', decimal({ required: true, min: 0.1 })],
      shoulderCm: ['', decimal({ required: true, min: 0.1 })],
      chestCm: ['', decimal({ required: true, min: 0.1 })],
      waistCm: ['', decimal({ required: true, min: 0.1 })],
      abdomenCm: ['', decimal({ required: true, min: 0.1 })],
      hipCm: ['', decimal({ required: true, min: 0.1 })],
      bustCm: ['', decimal({ min: 0.1 })],
      // Membros: obrigatoriedade por lado é dinâmica (updateSymmetryValidators).
      rightArmRelaxedCm: ['', decimal({ min: 0.1 })], leftArmRelaxedCm: ['', decimal({ min: 0.1 })],
      rightArmFlexedCm: ['', decimal({ min: 0.1 })], leftArmFlexedCm: ['', decimal({ min: 0.1 })],
      rightForearmCm: ['', decimal({ min: 0.1 })], leftForearmCm: ['', decimal({ min: 0.1 })],
      rightThighProximalCm: ['', decimal({ min: 0.1 })], leftThighProximalCm: ['', decimal({ min: 0.1 })],
      rightThighMedialCm: ['', decimal({ min: 0.1 })], leftThighMedialCm: ['', decimal({ min: 0.1 })],
      rightThighDistalCm: ['', decimal({ min: 0.1 })], leftThighDistalCm: ['', decimal({ min: 0.1 })],
      rightCalfCm: ['', decimal({ min: 0.1 })], leftCalfCm: ['', decimal({ min: 0.1 })],
    }),
    skinfolds: this.fb.group({
      protocol: ['7_dobras'],
      tricepsMm: ['', decimal({ required: true, min: 0.1 })],
      bicepsMm: ['', decimal({ min: 0.1 })],
      subscapularMm: ['', decimal({ required: true, min: 0.1 })],
      chestMm: ['', decimal({ required: true, min: 0.1 })],
      midaxillaryMm: ['', decimal({ required: true, min: 0.1 })],
      suprailiacMm: ['', decimal({ required: true, min: 0.1 })],
      abdominalMm: ['', decimal({ required: true, min: 0.1 })],
      midThighMm: ['', decimal({ required: true, min: 0.1 })],
      calfMm: ['', decimal({ min: 0.1 })],
    }),
  });

  /** Espelho reativo do formulário para os computed (prévia, simetria, etapas). */
  private fv = signal<any>(this.assessmentForm.getRawValue());
  private statusTick = signal(0);

  // Metadados do modal de validação
  private readonly fieldGroupsMeta: { key: string; stepName: string; fields: Record<string, string> }[] = [
    { key: '', stepName: 'geral', fields: { date: 'Data da medição' } },
    { key: 'bioimpedance', stepName: 'balança', fields: {
      weightKg: 'Peso', bodyFatPercentage: 'Gordura corporal', skeletalMusclePercentage: 'Músculo esquelético',
      restingMetabolismKcal: 'Metabolismo basal', bodyAge: 'Idade corporal', visceralFatLevel: 'Gordura visceral', waterPercentage: 'Água corporal',
    } },
    { key: 'circumferences', stepName: 'perímetros', fields: {
      neckCm: 'Pescoço', shoulderCm: 'Ombros', chestCm: 'Tórax', waistCm: 'Cintura', abdomenCm: 'Abdômen', hipCm: 'Quadril', bustCm: 'Busto',
      rightArmRelaxedCm: 'Braço relaxado direito', leftArmRelaxedCm: 'Braço relaxado esquerdo',
      rightArmFlexedCm: 'Braço contraído direito', leftArmFlexedCm: 'Braço contraído esquerdo',
      rightForearmCm: 'Antebraço direito', leftForearmCm: 'Antebraço esquerdo',
      rightThighProximalCm: 'Coxa proximal direita', leftThighProximalCm: 'Coxa proximal esquerda',
      rightThighMedialCm: 'Coxa medial direita', leftThighMedialCm: 'Coxa medial esquerda',
      rightThighDistalCm: 'Coxa distal direita', leftThighDistalCm: 'Coxa distal esquerda',
      rightCalfCm: 'Panturrilha direita', leftCalfCm: 'Panturrilha esquerda',
    } },
    { key: 'skinfolds', stepName: 'dobras', fields: {
      tricepsMm: 'Tríceps', bicepsMm: 'Bíceps', subscapularMm: 'Subescapular', chestMm: 'Peitoral',
      midaxillaryMm: 'Axilar média', suprailiacMm: 'Supra-ilíaca', abdominalMm: 'Abdominal', midThighMm: 'Coxa', calfMm: 'Panturrilha',
    } },
  ];

  private readonly rightSideFields = ['rightArmRelaxedCm', 'rightArmFlexedCm', 'rightThighProximalCm', 'rightCalfCm'];
  private readonly leftSideFields = ['leftArmRelaxedCm', 'leftArmFlexedCm', 'leftThighProximalCm', 'leftCalfCm'];

  // ---------- derivados ----------

  ageAtDate = computed(() => {
    const std = this.student();
    if (!std) return 0;
    return calcAge(std.birth_date, this.fv().date || todayYmd());
  });

  currentField = computed<FieldDef | null>(() => this.fields[this.fieldIndex()] ?? null);

  /** Campos da etapa do campo atual (segmentos da barra de progresso no celular). */
  stepFields = computed(() => {
    const f = this.currentField();
    return f ? this.fields.filter(x => x.step === f.step) : [];
  });

  nextLabel = computed(() => {
    const i = this.fieldIndex();
    const f = this.fields[i];
    const nx = this.fields[i + 1];
    if (!f) return 'Próxima';
    if (!nx) return 'Revisar';
    if (nx.step !== f.step) return STEP_LABELS[nx.step];
    return 'Próxima';
  });

  preview = computed(() => {
    const std = this.student();
    const v = this.fv();
    if (!std) return null;
    const age = calcAge(std.birth_date, v.date || todayYmd());
    const b = v.bioimpedance, c = v.circumferences, s = v.skinfolds;
    const prev = this.previous();

    const weight = parseDecimal(b.weightKg);
    const bmi = weight && std.height_cm ? calcBmi(weight, std.height_cm) : null;
    const fat = parseDecimal(b.bodyFatPercentage);
    const prevFat = prev?.bioimpedancias?.body_fat_percentage ?? null;
    const fatDelta = fat !== null && prevFat !== null ? Math.round((fat - prevFat) * 10) / 10 : null;

    const folds = [s.chestMm, s.midaxillaryMm, s.tricepsMm, s.subscapularMm, s.abdominalMm, s.suprailiacMm, s.midThighMm].map(parseDecimal);
    const allFolds = folds.every(x => x !== null && x > 0);
    const f7 = folds as number[];
    const sum7 = allFolds ? calcSkinfoldsSum7(f7[0], f7[1], f7[2], f7[3], f7[4], f7[5], f7[6]) : null;
    const jp7 = allFolds ? calcJacksonPollock7(std.gender, age, f7[0], f7[1], f7[2], f7[3], f7[4], f7[5], f7[6]) : null;

    const waist = parseDecimal(c.waistCm), hip = parseDecimal(c.hipCm);
    const rcq = waist && hip ? calcRcq(waist, hip) : null;

    const warnings: { title: string; detail: string }[] = [];
    const water = parseDecimal(b.waterPercentage);
    const prevWater = prev?.bioimpedancias?.water_percentage ?? null;
    if (implausibleWaterChange(water, prevWater)) {
      const days = prev ? daysBetween(prev.date, v.date || todayYmd()) : null;
      const verb = (water as number) < (prevWater as number) ? 'caiu' : 'subiu';
      warnings.push({
        title: `Água corporal ${verb} de ${formatNum(prevWater)} % para ${formatNum(water)} %.`,
        detail: `Variação improvável${days !== null ? ` em ${days} dias` : ''}. Confira o visor antes de salvar.`,
      });
    }
    for (const r of LIMB_ROWS) {
      const sym = symmetry(parseDecimal(c[r.right]), parseDecimal(c[r.left]));
      if (sym.cls === 'up') {
        warnings.push({ title: `${r.label}: ${sym.text.replace(' · confira', '')} cm entre os lados.`, detail: 'Diferença acima de 1,5 cm. Confira a fita nos dois lados.' });
      }
    }

    return {
      bmi, bmiLabel: bmi !== null ? classifyBmi(bmi) : '—',
      fat, fatLabel: fat !== null ? classifyBodyFat(std.gender, age, fat) : '—',
      fatDelta, fatDeltaCls: deltaClass(fatDelta, 'down'),
      sum7, jp7,
      rcq, rcqDetail: rcq !== null ? `${formatNum(waist)} ÷ ${formatNum(hip)} · ${classifyRcq(std.gender, rcq)}` : '—',
      warnings,
    };
  });

  constructor() {
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(max-width: 719px)');
      this.isPhone.set(mq.matches);
      const onChange = (e: MediaQueryListEvent) => this.isPhone.set(e.matches);
      mq.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => mq.removeEventListener('change', onChange));
    }
  }

  ngOnInit() {
    const sub = this.assessmentForm.valueChanges.subscribe(() => {
      this.updateSymmetryValidators();
      this.fv.set(this.assessmentForm.getRawValue());
    });
    const sub2 = this.assessmentForm.statusChanges.subscribe(() => this.statusTick.update(n => n + 1));
    this.destroyRef.onDestroy(() => { sub.unsubscribe(); sub2.unsubscribe(); });
    this.updateSymmetryValidators();

    this.route.params.subscribe(p => {
      const editId = p['id_aval'] ?? null;
      this.editAssessmentId.set(editId);
      this.isEditMode.set(!!editId);
      if (p['id']) this.load(p['id'], editId);
    });
  }

  private load(studentId: string, editId: string | null) {
    this.loadError.set(false);
    this.dataService.getStudent(studentId).subscribe({
      next: (res) => {
        this.student.set(res);
        const list = res.avaliacoes ?? [];   // ordenadas DESC (mais recente primeiro)
        if (editId) {
          const idx = list.findIndex(a => a.id === editId);
          this.previous.set(idx >= 0 ? list[idx + 1] ?? null : null);
          this.prefillForEdit(res, editId);
        } else {
          this.previous.set(list[0] ?? null);
        }
      },
      error: (err) => { console.error('Erro ao carregar aluno:', err); this.loadError.set(true); },
    });
  }

  reload() {
    const id = this.route.snapshot.params['id'];
    if (id) this.load(id, this.editAssessmentId());
  }

  // ---------- helpers de template ----------

  firstName(name: string): string { return (name ?? '').trim().split(/\s+/)[0] ?? ''; }
  stepLabel(n: number): string { return STEP_LABELS[n] ?? ''; }

  ctrl(group: Group, name: string): FormControl {
    return (this.assessmentForm.get(group) as FormGroup).get(name) as FormControl;
  }

  asFormControl(c: AbstractControl): FormControl { return c as FormControl; }

  isBad(group: Group, name: string): boolean {
    this.statusTick();
    const c = this.ctrl(group, name);
    return !!c && c.invalid && (c.touched || c.dirty);
  }

  prevOf(f: FieldDef): string {
    const prev = this.previous();
    const v = prev ? f.prev(prev) : null;
    return formatNum(v ?? null, f.unit === 'kcal' || f.unit === 'anos' || f.unit === 'nível' ? 0 : 1);
  }

  fieldDelta(f: FieldDef): string {
    const prev = this.previous();
    const pv = prev ? f.prev(prev) : null;
    const cur = parseDecimal(this.fv()[f.group]?.[f.ctrl]);
    if (pv === null || pv === undefined || cur === null) return '';
    return formatDelta(cur - pv, f.unit === 'kcal' || f.unit === 'anos' || f.unit === 'nível' ? 0 : 1);
  }

  fieldDeltaCls(f: FieldDef): string {
    const prev = this.previous();
    const pv = prev ? f.prev(prev) : null;
    const cur = parseDecimal(this.fv()[f.group]?.[f.ctrl]);
    if (pv === null || pv === undefined || cur === null) return 'nt';
    const good = f.ctrl === 'bodyFatPercentage' || f.ctrl === 'visceralFatLevel' || f.ctrl === 'bodyAge' || f.ctrl === 'waistCm' || f.ctrl === 'abdomenCm' || f.group === 'skinfolds'
      ? 'down' : f.ctrl === 'skeletalMusclePercentage' ? 'up' : 'neutral';
    return deltaClass(cur - pv, good);
  }

  limbSym(r: LimbRow) {
    const c = this.fv().circumferences;
    return symmetry(parseDecimal(c[r.right]), parseDecimal(c[r.left]));
  }

  isDone(f: FieldDef): boolean {
    this.statusTick();
    const c = this.ctrl(f.group, f.ctrl);
    return parseDecimal(c.value) !== null && c.valid;
  }

  stepDone(n: number): boolean {
    this.statusTick();
    this.fv();
    switch (n) {
      case 1: return !!this.assessmentForm.get('bioimpedance')?.valid && !!this.assessmentForm.get('date')?.valid;
      case 2: return !!this.assessmentForm.get('circumferences')?.valid;
      case 3: return !!this.assessmentForm.get('skinfolds')?.valid;
      default: return false;
    }
  }

  stepSub(n: number): string {
    switch (n) {
      case 1: return '7 campos';
      case 2: return '13 campos';
      case 3: return '7 + 2 opcionais';
      default: { const w = this.preview()?.warnings.length ?? 0; return w === 1 ? '1 aviso' : `${w} avisos`; }
    }
  }

  goStep(n: number) {
    const s = Math.min(4, Math.max(1, n));
    this.activeStep.set(s);
    if (s < 4) {
      const idx = this.fields.findIndex(f => f.step === s);
      if (idx >= 0) this.fieldIndex.set(idx);
    }
  }

  // ---------- modo Medir (celular) ----------

  nextField() {
    const i = this.fieldIndex();
    if (i >= this.fields.length - 1) { this.activeStep.set(4); return; }
    this.fieldIndex.set(i + 1);
    this.activeStep.set(this.fields[i + 1].step);
    this.focusValue();
  }

  prevField() {
    const i = this.fieldIndex();
    if (i <= 0) return;
    this.fieldIndex.set(i - 1);
    this.activeStep.set(this.fields[i - 1].step);
    this.focusValue();
  }

  backFromReview() {
    this.fieldIndex.set(this.fields.length - 1);
    this.activeStep.set(3);
  }

  private focusValue() {
    if (typeof document === 'undefined') return;
    setTimeout(() => (document.getElementById('mob-v') as HTMLInputElement | null)?.focus(), 0);
  }

  // ---------- validação ----------

  private get circumferencesGroup(): FormGroup {
    return this.assessmentForm.get('circumferences') as FormGroup;
  }

  /**
   * Lado predominante: se um lado tem qualquer dado, os 4 campos desse lado ficam obrigatórios;
   * se nenhum tem, exige o direito por padrão (garante ao menos um lado completo).
   */
  private updateSymmetryValidators() {
    const grp = this.circumferencesGroup;
    if (!grp) return;
    const hasValue = (name: string) => `${grp.get(name)?.value ?? ''}`.trim() !== '';
    const rightFilled = this.rightSideFields.some(hasValue);
    const leftFilled = this.leftSideFields.some(hasValue);
    let requireRight = rightFilled, requireLeft = leftFilled;
    if (!requireRight && !requireLeft) requireRight = true;
    const apply = (names: string[], required: boolean) => {
      for (const name of names) {
        const ctrl = grp.get(name);
        if (!ctrl) continue;
        ctrl.setValidators(decimal({ required, min: 0.1 }));
        ctrl.updateValueAndValidity({ emitEvent: false });
      }
    };
    apply(this.rightSideFields, requireRight);
    apply(this.leftSideFields, requireLeft);
    grp.updateValueAndValidity({ emitEvent: false, onlySelf: false });
  }

  private collectMissingFields(): MissingField[] {
    const missing: MissingField[] = [];
    for (const grp of this.fieldGroupsMeta) {
      const container = grp.key ? (this.assessmentForm.get(grp.key) as FormGroup) : this.assessmentForm;
      if (!container) continue;
      for (const [ctrlName, label] of Object.entries(grp.fields)) {
        const control = container.get(ctrlName);
        if (control && control.invalid) {
          missing.push({ label, stepName: grp.stepName, hint: fieldRangeHint(ctrlName).toLowerCase(), control, isDate: ctrlName === 'date' });
        }
      }
    }
    this.missingFields.set(missing);
    return missing;
  }

  closeValidationModal() { this.showValidationModal.set(false); }

  private prefillForEdit(std: Student, assessmentId: string) {
    const aval = std.avaliacoes.find(a => a.id === assessmentId);
    if (!aval) { this.toast.error('Avaliação não encontrada para edição.'); return; }
    const b = aval.bioimpedancias, c = aval.circunferencias, s = aval.dobras_cutaneas;
    const t = toInputText;
    this.assessmentForm.patchValue({
      date: aval.date,
      lastMenstruationDate: aval.last_menstruation_date ?? '',
      menstrualCycleRegular: aval.menstrual_cycle_regular === true ? 'true' : aval.menstrual_cycle_regular === false ? 'false' : '',
      bioimpedance: {
        isAthlete: b?.is_athlete ?? false,
        weightKg: t(b?.weight_kg), bodyFatPercentage: t(b?.body_fat_percentage), skeletalMusclePercentage: t(b?.skeletal_muscle_percentage),
        restingMetabolismKcal: t(b?.resting_metabolism_kcal), bodyAge: t(b?.body_age), visceralFatLevel: t(b?.visceral_fat_level),
        waterPercentage: t(b?.water_percentage),
      },
      circumferences: {
        neckCm: t(c?.neck_cm), shoulderCm: t(c?.shoulder_cm), chestCm: t(c?.chest_cm), waistCm: t(c?.waist_cm), abdomenCm: t(c?.abdomen_cm), hipCm: t(c?.hip_cm), bustCm: t(c?.bust_cm),
        rightArmRelaxedCm: t(c?.right_arm_relaxed_cm), leftArmRelaxedCm: t(c?.left_arm_relaxed_cm),
        rightArmFlexedCm: t(c?.right_arm_flexed_cm), leftArmFlexedCm: t(c?.left_arm_flexed_cm),
        rightForearmCm: t(c?.right_forearm_cm), leftForearmCm: t(c?.left_forearm_cm),
        rightThighProximalCm: t(c?.right_thigh_proximal_cm), leftThighProximalCm: t(c?.left_thigh_proximal_cm),
        rightThighMedialCm: t(c?.right_thigh_medial_cm), leftThighMedialCm: t(c?.left_thigh_medial_cm),
        rightThighDistalCm: t(c?.right_thigh_distal_cm), leftThighDistalCm: t(c?.left_thigh_distal_cm),
        rightCalfCm: t(c?.right_calf_cm), leftCalfCm: t(c?.left_calf_cm),
      },
      skinfolds: {
        protocol: s?.protocol ?? '7_dobras',
        tricepsMm: t(s?.triceps_mm), bicepsMm: t(s?.biceps_mm), subscapularMm: t(s?.subscapular_mm), chestMm: t(s?.chest_mm),
        midaxillaryMm: t(s?.midaxillary_mm), suprailiacMm: t(s?.suprailiac_mm), abdominalMm: t(s?.abdominal_mm), midThighMm: t(s?.mid_thigh_mm), calfMm: t(s?.calf_mm),
      },
    });
    this.updateSymmetryValidators();
  }

  onSubmit() {
    this.updateSymmetryValidators();
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
    const v = this.assessmentForm.getRawValue();
    const num = (x: unknown) => parseDecimal(x as string) ?? 0;
    const opt = (x: unknown) => parsePositive(x as string);
    const lastMenstruationDate = v.lastMenstruationDate || null;
    const menstrualCycleRegular = toOptionalBoolean(v.menstrualCycleRegular) ?? null;
    const b = v.bioimpedance, c = v.circumferences, s = v.skinfolds;
    const bioimpedance = {
      weight_kg: num(b.weightKg), body_fat_percentage: num(b.bodyFatPercentage), skeletal_muscle_percentage: num(b.skeletalMusclePercentage),
      resting_metabolism_kcal: num(b.restingMetabolismKcal), body_age: num(b.bodyAge), visceral_fat_level: num(b.visceralFatLevel),
      water_percentage: opt(b.waterPercentage), is_athlete: !!b.isAthlete,
    };
    const circumferences = {
      neck_cm: num(c.neckCm), shoulder_cm: num(c.shoulderCm), chest_cm: num(c.chestCm), waist_cm: num(c.waistCm), abdomen_cm: num(c.abdomenCm), hip_cm: num(c.hipCm),
      bust_cm: opt(c.bustCm),
      // Lado não medido vai como undefined (NULL no banco), nunca 0.
      right_arm_relaxed_cm: opt(c.rightArmRelaxedCm), left_arm_relaxed_cm: opt(c.leftArmRelaxedCm),
      right_arm_flexed_cm: opt(c.rightArmFlexedCm), left_arm_flexed_cm: opt(c.leftArmFlexedCm),
      right_forearm_cm: opt(c.rightForearmCm), left_forearm_cm: opt(c.leftForearmCm),
      right_thigh_proximal_cm: opt(c.rightThighProximalCm), left_thigh_proximal_cm: opt(c.leftThighProximalCm),
      right_thigh_medial_cm: opt(c.rightThighMedialCm), left_thigh_medial_cm: opt(c.leftThighMedialCm),
      right_thigh_distal_cm: opt(c.rightThighDistalCm), left_thigh_distal_cm: opt(c.leftThighDistalCm),
      right_calf_cm: opt(c.rightCalfCm), left_calf_cm: opt(c.leftCalfCm),
    };
    const skinfolds = {
      protocol: s.protocol ?? '7_dobras',
      triceps_mm: num(s.tricepsMm), biceps_mm: opt(s.bicepsMm), subscapular_mm: num(s.subscapularMm), chest_mm: num(s.chestMm),
      midaxillary_mm: num(s.midaxillaryMm), suprailiac_mm: num(s.suprailiacMm), abdominal_mm: num(s.abdominalMm), mid_thigh_mm: num(s.midThighMm),
      calf_mm: opt(s.calfMm),
    };

    const editId = this.editAssessmentId();
    const base = { date: v.date, last_menstruation_date: lastMenstruationDate, menstrual_cycle_regular: menstrualCycleRegular, bioimpedance, circumferences, skinfolds };
    const request$ = editId
      ? this.dataService.updateAssessment({ avaliacao_id: editId, ...base })
      : this.dataService.addAssessment({ aluno_id: std.id, ...base });

    request$.subscribe({
      next: (saved) => {
        this.isSubmitting.set(false);
        this.toast.success(editId ? 'Avaliação atualizada.' : 'Avaliação salva.');
        const targetId = saved?.id ?? editId;
        if (targetId) this.router.navigate(['/alunos', std.id, 'avaliacoes', targetId]);
        else this.router.navigate(['/alunos', std.id]);
      },
      error: (err) => {
        console.error(err);
        this.isSubmitting.set(false);
        this.toast.error(err?.message ?? 'Não foi possível salvar. Verifique a conexão.');
      },
    });
  }

  /** Dobras: valores abaixo de 6 quase sempre foram digitados em cm → vira mm. */
  maybeConvertSkinfold(controlName: string) {
    const ctrl = this.ctrl('skinfolds', controlName);
    if (!ctrl) return;
    const n = parseDecimal(ctrl.value);
    if (n !== null && shouldConvertCmToMm(n)) {
      const mm = cmToMm(n);
      ctrl.setValue(toInputText(mm));
      const label = this.fields.find(f => f.group === 'skinfolds' && f.ctrl === controlName)?.label.replace(/^\d · /, '') ?? 'Dobra';
      this.toast.info(`${label} ${toInputText(n)} virou ${toInputText(mm)} mm (parecia estar em cm).`);
    }
  }
}
