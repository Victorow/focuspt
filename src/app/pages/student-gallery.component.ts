import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService, Student, PhotoCategory, Photo, Assessment } from '../data';
import { extractBase64FromDataUrl } from '../lgpd-utils';
import { ToastService } from '../toast.service';
import { DialogService } from '../dialog.service';
import { categoryLabel, groupPhotoSessions, nearestDate, selectComparePair } from '../media-utils';
import { formatNum } from '../assessment-utils';
import { formatBr, todayYmd } from '../date-utils';

const ANGLES: PhotoCategory[] = ['FRENTE', 'LADO_DIREITO', 'LADO_ESQUERDO', 'COSTAS', 'PERFIL'];

@Component({
  selector: 'app-student-gallery',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="crumbs">
      <a routerLink="/alunos" class="k">Alunos</a><span class="k">›</span>
      @if (student(); as std) {
        <a [routerLink]="['/alunos', std.id]" class="k">{{ std.name }}</a><span class="k">›</span>
      }
      <span>Fotos</span>
    </div>

    <div class="pad">
      @if (isLoading()) {
        <section class="panel skel" aria-busy="true" aria-label="Carregando">
          <div class="sk" style="height:18px;width:40%"></div>
          <div class="sk" style="width:70%"></div>
        </section>
      } @else if (!student()) {
        <section class="panel empty">
          <span class="strong">Não deu para carregar as fotos</span>
          <span class="nt">Pode ser a internet ou a sessão que expirou. Nada foi perdido.</span>
          <button type="button" class="btn btnP" (click)="reload()">Tentar de novo</button>
        </section>
      } @else if (student(); as std) {
        <div class="headLine">
          <h1 class="big">Fotos de evolução</h1>
          <span class="k">{{ countLabel() }} · cada sessão fica ligada à avaliação mais próxima</span>
        </div>

        <div class="grid2">
          <!-- ===================== COMPARAR ===================== -->
          <section class="panel">
            <div class="ph">
              <span>{{ compareTitle() }}</span>
              @if (angles().length > 1) {
                <div class="seg" role="radiogroup" aria-label="Ângulo">
                  @for (a of angles(); track a) {
                    <button type="button" role="radio" [class.on]="a === activeAngle()" [attr.aria-checked]="a === activeAngle()"
                            (click)="angle.set(a)">{{ categoryLabel(a) }}</button>
                  }
                </div>
              }
            </div>
            <div class="body stack">
              @if (pair().recente; as rec) {
                <div class="cmp">
                  @if (pair().inicio; as ini) {
                    <img class="cmpImg" [src]="ini.url ?? ini.storage_path" alt="Foto do início" referrerpolicy="no-referrer" />
                  }
                  <img class="cmpImg" [src]="rec.url ?? rec.storage_path" alt="Foto recente" referrerpolicy="no-referrer"
                       [style.clip-path]="pair().inicio ? clip() : null" />
                  @if (pair().inicio; as ini) {
                    <div class="cmpBar" [style.left.%]="pos()"></div>
                    <span class="tag cmpTag l">{{ formatBr(ini.date) }} · início</span>
                    <span class="tag cmpTag r">{{ formatBr(rec.date) }} · recente</span>
                  } @else {
                    <span class="tag cmpTag r">{{ formatBr(rec.date) }}</span>
                  }
                </div>
                @if (pair().inicio) {
                  <label for="comp" class="sr">Arraste para comparar</label>
                  <input id="comp" class="range" type="range" min="0" max="100" [value]="pos()"
                         (input)="pos.set(+$any($event.target).value)" />
                } @else {
                  <div class="k center">Só uma foto deste ângulo. A próxima sessão libera a comparação.</div>
                }
                @if (caption(); as c) {
                  <div class="k center">{{ c }}</div>
                }
              } @else {
                <div class="empty noPad">
                  <span class="strong">Nenhuma foto ainda</span>
                  <span class="nt">Envie a primeira foto ao lado. Ela vira o ponto de partida da comparação.</span>
                </div>
              }
            </div>
          </section>

          <div class="stack">
            <!-- ===================== ENVIAR ===================== -->
            <section class="panel">
              <div class="ph"><span>Enviar foto</span></div>
              <div class="body stack12">
                <div>
                  <label class="lb" for="ang">Ângulo</label>
                  <select id="ang" class="f" [value]="uploadCategory()" (change)="onCategorySelected($any($event.target).value)">
                    <option value="FRENTE">Frente</option>
                    <option value="LADO_DIREITO">Lado direito</option>
                    <option value="LADO_ESQUERDO">Lado esquerdo</option>
                    <option value="COSTAS">Costas</option>
                  </select>
                </div>
                <div>
                  <label class="lb" for="dt">Data da foto</label>
                  <input id="dt" class="f" type="date" [value]="uploadDate" (change)="uploadDate = $any($event.target).value" />
                </div>
                <label for="arq" class="drop k" [class.dropOn]="dragActive()"
                       (dragover)="onDragOver($event)" (dragleave)="onDragLeave()" (drop)="onDrop($event)">
                  Arraste a foto ou clique para escolher · JPG, PNG, WEBP
                  <input id="arq" type="file" class="sr" accept="image/*" (change)="onFileSelected($event)" />
                </label>

                @if (uploadError()) {
                  <div class="k up" role="alert">{{ uploadError() }}</div>
                }

                @if (previewBase64()) {
                  <div class="prev">
                    <img [src]="previewBase64()" alt="Pré-visualização da foto" referrerpolicy="no-referrer" />
                    <div class="prevMeta">
                      <span class="k">{{ categoryLabel(uploadCategory()) }} · {{ formatBr(uploadDate, true) }}</span>
                      <button type="button" class="lnk" (click)="previewBase64.set(''); uploadError.set('')">Remover</button>
                    </div>
                  </div>
                }

                <button type="button" class="btn btnP" (click)="onPerformUpload(std.id)" [disabled]="!previewBase64() || isSubmitting()">
                  {{ isSubmitting() ? 'Salvando…' : 'Salvar na galeria' }}
                </button>
              </div>
            </section>

            <!-- ===================== SESSÕES ===================== -->
            <section class="panel">
              <div class="ph"><span>Sessões</span></div>
              @if (sessions().length) {
                <table><tbody>
                  @for (s of sessions(); track s.date) {
                    <tr>
                      <td>{{ formatBr(s.date, true) }}</td>
                      <td class="nt">{{ s.photos.length }} {{ s.photos.length === 1 ? 'foto' : 'fotos' }}@if (nearestAssessment(s.date); as d) { · avaliação {{ formatBr(d) }}}</td>
                      <td class="n"><button type="button" class="lnk" (click)="toggleSession(s.date)" [attr.aria-expanded]="openSession() === s.date">{{ openSession() === s.date ? 'Fechar' : 'Ver' }}</button></td>
                    </tr>
                    @if (openSession() === s.date) {
                      <tr class="open">
                        <td colspan="3">
                          <div class="thumbs">
                            @for (ph of s.photos; track ph.id) {
                              <div class="thumbCell">
                                <img class="ph2 thumb" [src]="ph.url ?? ph.storage_path" [alt]="categoryLabel(ph.category)" referrerpolicy="no-referrer" />
                                <div class="thumbMeta">
                                  <span class="k">{{ categoryLabel(ph.category) }}</span>
                                  <button type="button" class="lnk up" (click)="onDeletePhoto(std.id, ph.id)">Remover</button>
                                </div>
                              </div>
                            }
                          </div>
                        </td>
                      </tr>
                    }
                  }
                </tbody></table>
              } @else {
                <div class="body k">Nenhuma sessão ainda.</div>
              }
            </section>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .crumbs a.k { color: var(--tx2); }
    .headLine { display: flex; align-items: baseline; gap: 12px; flex-wrap: wrap; }
    .headLine h1 { margin: 0; }
    .grid2 { display: grid; grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr); gap: 16px; align-items: start; }
    .stack { display: flex; flex-direction: column; gap: 16px; }
    .stack12 { display: flex; flex-direction: column; gap: 12px; }
    .body { padding: 14px; }
    .body.stack { gap: 10px; }
    .center { text-align: center; }
    .cmp { position: relative; width: 100%; max-width: 480px; aspect-ratio: 3 / 4; margin: 0 auto; background: var(--ph); border-radius: 4px; overflow: hidden; }
    .cmpImg { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; display: block; }
    .cmpBar { position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px; background: var(--tx); pointer-events: none; }
    .cmpTag { position: absolute; top: 10px; background: var(--sf); }
    .cmpTag.l { left: 10px; }
    .cmpTag.r { right: 10px; }
    .range { width: 100%; max-width: 480px; margin: 0 auto; display: block; accent-color: var(--pb); min-height: 44px; }
    .drop { display: flex; align-items: center; justify-content: center; text-align: center; min-height: 96px; padding: 12px; border: 1px dashed var(--bd2); border-radius: 5px; cursor: pointer; }
    .drop:hover, .dropOn { border-color: var(--focus); background: var(--hov); }
    .drop:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: -1px; }
    .prev { display: flex; gap: 12px; align-items: flex-start; }
    .prev img { width: 96px; aspect-ratio: 3 / 4; object-fit: cover; border-radius: 3px; background: var(--ph); }
    .prevMeta { display: flex; flex-direction: column; gap: 6px; }
    .lnk { border: 0; background: none; padding: 0; font: inherit; color: var(--ln); cursor: pointer; }
    .lnk:hover { text-decoration: underline; }
    .lnk.up { color: var(--bad); }
    tr.open:hover td { background: transparent; }
    .thumbs { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; padding: 4px 0; }
    .thumbCell { display: flex; flex-direction: column; gap: 4px; }
    .thumb { width: 100%; object-fit: cover; display: block; }
    .thumbMeta { display: flex; justify-content: space-between; gap: 6px; align-items: center; }
    .empty { padding: 20px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
    .empty.noPad { padding: 20px 0; }
    .strong { font-weight: 600; }
    .skel { padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .sk { height: 12px; background: var(--ph); border-radius: 3px; }
    @media (max-width: 720px) {
      .grid2 { grid-template-columns: 1fr; }
      .thumbs { grid-template-columns: repeat(2, 1fr); }
      .ph { flex-wrap: wrap; }
    }
  `],
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
  uploadCategory = signal<PhotoCategory>('FRENTE');
  uploadDate = todayYmd();

  /** Ângulo escolhido na comparação (null = primeiro com foto). */
  angle = signal<PhotoCategory | null>(null);
  /** Posição do divisor, em % (0 = só início, 100 = só recente). */
  pos = signal(50);
  openSession = signal<string | null>(null);

  categoryLabel = categoryLabel;
  formatBr = formatBr;

  private currentId = '';

  readonly photos = computed<Photo[]>(() => this.student()?.fotos ?? []);
  readonly sessions = computed(() => groupPhotoSessions(this.photos()));
  readonly assessments = computed<Assessment[]>(() =>
    [...(this.student()?.avaliacoes ?? [])].filter(a => !a.deleted_at).sort((a, b) => b.date.localeCompare(a.date)));
  readonly assessmentDates = computed(() => this.assessments().map(a => a.date));
  readonly refDate = computed(() => this.assessments()[0]?.date ?? todayYmd());

  readonly angles = computed<PhotoCategory[]>(() => {
    const present = new Set(this.photos().map(p => p.category));
    return ANGLES.filter(a => present.has(a));
  });
  readonly activeAngle = computed<PhotoCategory | null>(() => {
    const chosen = this.angle();
    const list = this.angles();
    return chosen && list.includes(chosen) ? chosen : (list[0] ?? null);
  });
  readonly pair = computed(() => {
    const a = this.activeAngle();
    return a ? selectComparePair(this.photos(), this.assessmentDates(), a, this.refDate()) : {};
  });
  readonly clip = computed(() => `inset(0 0 0 ${this.pos()}%)`);

  readonly compareTitle = computed(() => {
    const { inicio, recente } = this.pair();
    if (inicio && recente) return `Comparar ${formatBr(inicio.date)} e ${formatBr(recente.date)}`;
    if (recente) return `Foto de ${formatBr(recente.date)}`;
    return 'Comparar';
  });

  readonly countLabel = computed(() => {
    const n = this.photos().length;
    const s = this.sessions().length;
    return `${n} ${n === 1 ? 'foto' : 'fotos'} em ${s} ${s === 1 ? 'sessão' : 'sessões'}`;
  });

  /** "Peso 49,3 → 49,2 kg · Gordura 27,1 → 23,7 %" entre as avaliações mais próximas de cada foto. */
  readonly caption = computed(() => {
    const { inicio, recente } = this.pair();
    if (!inicio || !recente) return '';
    const a0 = this.assessmentAt(inicio.date);
    const a1 = this.assessmentAt(recente.date);
    if (!a0 || !a1 || a0.id === a1.id) return '';
    const parts: string[] = [];
    const w0 = a0.bioimpedancias?.weight_kg, w1 = a1.bioimpedancias?.weight_kg;
    if (w0 != null && w1 != null) parts.push(`Peso ${formatNum(w0)} → ${formatNum(w1)} kg`);
    const f0 = a0.body_fat_percentage ?? a0.bioimpedancias?.body_fat_percentage;
    const f1 = a1.body_fat_percentage ?? a1.bioimpedancias?.body_fat_percentage;
    if (f0 != null && f1 != null) parts.push(`Gordura ${formatNum(f0)} → ${formatNum(f1)} %`);
    return parts.join(' · ');
  });

  private assessmentAt(date: string): Assessment | null {
    const d = nearestDate(this.assessmentDates(), date);
    return d ? (this.assessments().find(a => a.date === d) ?? null) : null;
  }

  nearestAssessment(date: string): string | null {
    return nearestDate(this.assessmentDates(), date);
  }

  toggleSession(date: string) {
    this.openSession.set(this.openSession() === date ? null : date);
  }

  onCategorySelected(val: string) {
    if (ANGLES.includes(val as PhotoCategory)) {
      this.uploadCategory.set(val as PhotoCategory);
    }
  }

  ngOnInit() {
    this.route.params.subscribe(p => {
      if (p['id']) {
        this.currentId = p['id'];
        this.loadGallery(p['id']);
      }
    });
  }

  reload() {
    if (this.currentId) this.loadGallery(this.currentId);
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
        this.student.set(null);
        this.isLoading.set(false);
      },
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      this.convertToBase64(file);
    }
    input.value = '';
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
        this.uploadError.set('Este formato não é suportado pelo navegador (ex.: HEIC/TIFF). Converta para JPG ou PNG.');
      };
      img.src = dataUrl;
    };
    reader.onerror = () => this.uploadError.set('Falha ao ler o arquivo.');
    reader.readAsDataURL(file);
  }

  onPerformUpload(studentId: string) {
    if (!this.previewBase64()) return;
    this.isSubmitting.set(true);

    const base64 = extractBase64FromDataUrl(this.previewBase64());
    const payload = {
      aluno_id: studentId,
      date: this.uploadDate,
      category: this.uploadCategory(),
      image_base64: base64,
      mime_type: 'image/jpeg',
    };

    this.dataService.addPhoto(payload).subscribe({
      next: () => {
        this.previewBase64.set('');
        this.loadGallery(studentId);
        this.isSubmitting.set(false);
        this.toast.success('Foto salva na galeria.');
      },
      error: (err) => {
        console.error(err);
        this.dialog.alert({ title: 'Erro', message: 'Não foi possível salvar a foto. Verifique a conexão.', tone: 'error' });
        this.isSubmitting.set(false);
      },
    });
  }

  async onDeletePhoto(studentId: string, photoId: string) {
    const ok = await this.dialog.confirm({
      title: 'Remover esta foto?',
      message: 'Ela sai da galeria e dos relatórios. Não dá para desfazer.',
      confirmText: 'Remover',
      tone: 'danger',
    });
    if (ok) {
      this.dataService.deletePhoto(photoId).subscribe({
        next: () => this.loadGallery(studentId),
        error: () => this.dialog.alert({ title: 'Erro', message: 'Não foi possível remover a foto. Tente de novo.', tone: 'error' }),
      });
    }
  }
}
