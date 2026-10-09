import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { DataService, Student } from '../data';
import { ToastService } from '../toast.service';

@Component({
  selector: 'app-new-student',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <div class="crumbs">
      <a routerLink="/alunos" class="k">Alunos</a><span class="k">›</span>
      @if (isEditMode()) {
        <a [routerLink]="['/alunos', editStudentId()]" class="k">{{ studentName() || 'Aluno' }}</a><span class="k">›</span><span>Editar</span>
      } @else {
        <span>Novo aluno</span>
      }
    </div>

    <div class="pad narrow">
      <h1 class="big">{{ isEditMode() ? 'Editar aluno' : 'Novo aluno' }}</h1>

      <form [formGroup]="studentForm" (ngSubmit)="onSubmit()" novalidate class="stack">
        <section class="panel">
          <div class="ph"><span>Dados pessoais</span><span class="k">sexo, idade e altura entram nos cálculos · <span class="req"></span> obrigatório</span></div>
          <div class="body grid2">
            <div class="full">
              <label class="lb req" for="nome">Nome completo</label>
              <input id="nome" class="f" type="text" formControlName="name" autocomplete="name" aria-required="true" />
              @if (invalid('name')) {
                <div class="k up">Informe o nome completo (mínimo 2 letras).</div>
              }
            </div>
            <div>
              <label class="lb req" for="nasc">Data de nascimento</label>
              <input id="nasc" class="f" type="date" formControlName="birthDate" aria-required="true" />
              @if (invalid('birthDate')) {
                <div class="k up">Informe a data de nascimento.</div>
              }
            </div>
            <div>
              <span class="lb req" id="sx">Sexo biológico</span>
              <div class="seg" role="radiogroup" aria-labelledby="sx">
                <label><input class="sr" type="radio" formControlName="gender" value="FEMALE" />Feminino</label>
                <label><input class="sr" type="radio" formControlName="gender" value="MALE" />Masculino</label>
              </div>
            </div>
            <div>
              <label class="lb req" for="alt">Altura (cm)</label>
              <input id="alt" class="f" type="number" inputmode="decimal" formControlName="heightCm" min="50" max="250" aria-required="true" />
              @if (invalid('heightCm')) {
                <div class="k up">Altura entre 50 e 250 cm.</div>
              }
            </div>
            <div>
              <label class="lb" for="obj">Objetivo <span class="k">opcional</span></label>
              <input id="obj" class="f" type="text" formControlName="goal" placeholder="Ex.: hipertrofia, redução de gordura" />
            </div>
            <div>
              <label class="lb" for="tel">WhatsApp <span class="k">opcional</span></label>
              <input id="tel" class="f" type="tel" formControlName="phoneNumber" autocomplete="tel" inputmode="tel" placeholder="DDD + número" />
            </div>
          </div>
        </section>

        <section class="panel" formGroupName="anamnesis">
          <div class="ph"><span>Anamnese · PAR-Q</span><span class="k">opcional · respostas "sim" ganham destaque no perfil e no relatório</span></div>
          <div class="tw">
            <table>
              <tbody>
                <tr>
                  <td id="q1">Tem algum problema cardíaco diagnosticado?</td>
                  <td class="n">
                    <div class="seg" role="radiogroup" aria-labelledby="q1">
                      <label><input class="sr" type="radio" formControlName="cardiacCondition" [value]="true" />Sim</label>
                      <label><input class="sr" type="radio" formControlName="cardiacCondition" [value]="false" />Não</label>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td id="q2">Sente dores nas articulações ou ossos?</td>
                  <td class="n">
                    <div class="seg" role="radiogroup" aria-labelledby="q2">
                      <label><input class="sr" type="radio" formControlName="jointPain" [value]="true" />Sim</label>
                      <label><input class="sr" type="radio" formControlName="jointPain" [value]="false" />Não</label>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td id="q3">Sente dor no peito durante exercício?</td>
                  <td class="n">
                    <div class="seg" role="radiogroup" aria-labelledby="q3">
                      <label><input class="sr" type="radio" formControlName="chestPainDuringExercise" [value]="true" />Sim</label>
                      <label><input class="sr" type="radio" formControlName="chestPainDuringExercise" [value]="false" />Não</label>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="body grid2 top">
            <div>
              <label class="lb" for="cir">Cirurgias recentes</label>
              <input id="cir" class="f" type="text" formControlName="recentSurgeryDescription" placeholder="Ex.: artroscopia no joelho esquerdo, 2025" />
            </div>
            <div>
              <label class="lb" for="med">Medicamentos contínuos</label>
              <input id="med" class="f" type="text" formControlName="activeMedications" placeholder="Nome e dose, se houver" />
            </div>
            <div class="full">
              <label class="lb" for="obs">Observações</label>
              <textarea id="obs" class="f" formControlName="notes" rows="3" placeholder="Rotina, disponibilidade, preferências"></textarea>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="ph">
            <span>Consentimento LGPD</span>
            @if (lgpdSigned()) {
              <span class="tag tagOk">Assinado</span>
            } @else {
              <span class="tag tagW">Pendente</span>
            }
          </div>
          <div class="body k">
            @if (lgpdSigned()) {
              O aluno já assinou o termo. A assinatura fica em Documentos, no perfil.
            } @else {
              O aceite só é registrado pela assinatura do próprio aluno, feita no perfil depois de salvar.
            }
          </div>
        </section>

        @if (errorMessage()) {
          <div class="tag tagW err" role="alert">{{ errorMessage() }}</div>
        }

        <div class="foot">
          <a class="btn" [routerLink]="isEditMode() ? ['/alunos', editStudentId()] : '/alunos'">Cancelar</a>
          <button type="submit" class="btn btnP" [disabled]="studentForm.invalid || isSubmitting()">
            @if (isSubmitting()) {
              Salvando…
            } @else {
              {{ isEditMode() ? 'Salvar alterações' : 'Salvar aluno' }}
            }
          </button>
        </div>
      </form>
    </div>
  `,
  styles: [`
    .crumbs a.k { color: var(--tx2); }
    .pad.narrow { max-width: 1000px; }
    h1 { margin: 0; }
    .stack { display: flex; flex-direction: column; gap: 16px; }
    .body { padding: 14px; }
    .grid2 { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .top { border-top: 1px solid var(--bd); }
    .full { grid-column: 1 / -1; }
    .tw { overflow-x: auto; }
    .k.up { margin-top: 4px; }
    .err { padding: 8px 10px; white-space: normal; }
    .foot { display: flex; justify-content: flex-end; gap: 8px; }
    /* .seg com rádios reais: o <label> faz o papel do botão do artboard. */
    .seg label { display: inline-flex; align-items: center; min-height: 40px; padding: 0 12px; background: var(--sf); font-weight: 500; color: var(--tx2); cursor: pointer; position: relative; }
    .seg label + label { border-left: 1px solid var(--bd2); }
    .seg label:hover { color: var(--tx); }
    .seg label:has(input:checked) { background: var(--sf2); color: var(--tx); }
    .seg label:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: -2px; }
    @media (max-width: 720px) {
      .grid2 { grid-template-columns: 1fr; }
      .foot { flex-direction: column-reverse; }
      .foot .btn { width: 100%; }
    }
  `],
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
  studentName = signal('');
  lgpdSigned = signal(false);

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
      notes: [''],
    }),
  });

  invalid(name: string): boolean {
    const c = this.studentForm.get(name);
    return !!c && c.touched && c.invalid;
  }

  ngOnInit() {
    this.route.params.subscribe(p => {
      const editId = p['id'] ?? null;
      if (editId && this.router.url.includes('/editar')) {
        this.isEditMode.set(true);
        this.editStudentId.set(editId);
        this.dataService.getStudent(editId).subscribe({
          next: (std) => this.prefillForEdit(std),
          error: () => this.errorMessage.set('Não deu para carregar os dados do aluno. Pode ser a internet ou a sessão que expirou.'),
        });
      }
    });
  }

  private prefillForEdit(std: Student) {
    const ana = std.anamneses;
    this.studentName.set(std.name);
    this.lgpdSigned.set(std.lgpd_consent_status === 'ACCEPTED');
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
    if (this.studentForm.invalid) {
      this.studentForm.markAllAsTouched();
      return;
    }
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
        this.toast.success(editId ? 'Cadastro atualizado.' : 'Aluno cadastrado.');
        this.router.navigate(['/alunos', std.id]);
      },
      error: (err) => {
        console.error(err);
        this.errorMessage.set(editId ? 'Não foi possível salvar as alterações. Verifique a conexão.' : 'Não foi possível cadastrar o aluno. Verifique a conexão.');
        this.isSubmitting.set(false);
      },
    });
  }
}
