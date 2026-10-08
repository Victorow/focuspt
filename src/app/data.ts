import { inject, Injectable } from '@angular/core';
import { from, Observable } from 'rxjs';
import { SupabaseService } from './supabase.service';
import { AGENDA_API, AgendaItem, AgendaPayload, normalizeAgendaItem } from './agenda-utils';

export type { AgendaItem, AgendaPayload } from './agenda-utils';

// =============================================
// INTERFACES
// =============================================

export interface StudentSummary {
  id: string;
  name: string;
  birth_date: string;
  gender: 'MALE' | 'FEMALE';
  height_cm: number;
  goal: string;
  phone_number?: string;
  lgpd_consent_status: 'PENDING' | 'ACCEPTED';
  age: number;
  last_assessment_date: string | null;
  last_weight: number | null;
  last_fat_percentage: number | null;
  last_visceral_level: number | null;
}

export interface TrashedStudent {
  id: string;
  name: string;
  goal: string | null;
  gender: 'MALE' | 'FEMALE';
  deleted_at: string;
}

export interface Anamnesis {
  cardiac_condition: boolean;
  joint_pain: boolean;
  chest_pain_during_exercise: boolean;
  recent_surgery_description: string;
  active_medications: string;
  notes: string;
}

export interface Circumferences {
  neck_cm: number;
  shoulder_cm: number;
  chest_cm: number;
  waist_cm: number;
  abdomen_cm: number;
  hip_cm: number;
  bust_cm?: number;
  // Membros bilaterais opcionais: o personal pode medir só o lado predominante.
  right_arm_relaxed_cm?: number;
  left_arm_relaxed_cm?: number;
  right_arm_flexed_cm?: number;
  left_arm_flexed_cm?: number;
  right_forearm_cm?: number;
  left_forearm_cm?: number;
  right_thigh_proximal_cm?: number;
  left_thigh_proximal_cm?: number;
  right_thigh_medial_cm?: number;
  left_thigh_medial_cm?: number;
  right_thigh_distal_cm?: number;
  left_thigh_distal_cm?: number;
  right_calf_cm?: number;
  left_calf_cm?: number;
  rcq?: number;
}

export interface Skinfolds {
  protocol?: string;
  triceps_mm: number;
  biceps_mm?: number | null;     // opcional — não entra no JP7
  subscapular_mm: number;
  chest_mm: number;
  midaxillary_mm: number;
  suprailiac_mm: number;
  abdominal_mm: number;
  mid_thigh_mm: number;
  calf_mm?: number | null;       // opcional — não entra no JP7
  sum_mm?: number;                // somatório das 7 dobras do JP7
  fat_percentage?: number;
}

export interface Bioimpedance {
  perfil_bioimpedancia?: number;
  is_athlete?: boolean;
  weight_kg: number;
  bmi?: number;
  body_fat_percentage: number;
  skeletal_muscle_percentage: number;
  resting_metabolism_kcal: number;
  body_age: number;
  visceral_fat_level: number;
  water_percentage?: number;
  fat_mass_kg?: number;
  lean_mass_kg?: number;
}

export interface Assessment {
  id: string;
  date: string;
  bmi: number;
  bmi_classification: string;
  body_fat_percentage: number;
  fat_mass_kg: number;
  lean_mass_kg: number;
  body_fat_classification: string;
  visceral_risk: 'NORMAL' | 'HIGH' | 'VERY_HIGH';
  skinfolds_fat_percentage: number;
  skinfolds_sum_mm: number;
  rcq: number;
  last_menstruation_date?: string | null;
  menstrual_cycle_regular?: boolean | null;
  bioimpedancias: Bioimpedance;
  dobras_cutaneas: Skinfolds;
  circunferencias: Circumferences;
  observacoes?: string | null;
  deleted_at?: string | null;
}

export type PhotoCategory = 'FRENTE' | 'LADO_DIREITO' | 'LADO_ESQUERDO' | 'COSTAS' | 'PERFIL';

export interface Photo {
  id: string;
  date: string;
  category: PhotoCategory;
  storage_path: string;
  created_at?: string;
  url?: string;
}

export interface Student {
  id: string;
  name: string;
  birth_date: string;
  gender: 'MALE' | 'FEMALE';
  height_cm: number;
  goal: string;
  phone_number?: string;
  lgpd_consent_status: 'PENDING' | 'ACCEPTED';
  created_at: string;
  anamneses: Anamnesis | null;
  avaliacoes: Assessment[];
  avaliacoes_trash?: Assessment[];
  fotos: Photo[];
}

export interface DashboardStats {
  activeStudents: number;
  totalAssessments: number;
  visceralAlerts: number;
  todayAgenda: {
    id: string;
    time: string;
    studentName: string;
    focus: string;
  }[];
}

export interface CreateStudentPayload {
  name: string;
  birth_date: string;
  gender: 'MALE' | 'FEMALE';
  height_cm: number;
  goal?: string;
  phone_number?: string;
  anamnesis?: Partial<Anamnesis>;
}

export interface CreateAssessmentPayload {
  aluno_id: string;
  date: string;
  last_menstruation_date?: string | null;
  menstrual_cycle_regular?: boolean | null;
  bioimpedance: Omit<Bioimpedance, 'bmi' | 'fat_mass_kg' | 'lean_mass_kg'>;
  circumferences: Omit<Circumferences, 'rcq'>;
  skinfolds: Omit<Skinfolds, 'sum_mm' | 'fat_percentage'>;
}

export interface UpdateAssessmentPayload {
  avaliacao_id: string;
  date?: string;
  last_menstruation_date?: string | null;
  menstrual_cycle_regular?: boolean | null;
  bioimpedance: Omit<Bioimpedance, 'bmi' | 'fat_mass_kg' | 'lean_mass_kg'>;
  circumferences: Omit<Circumferences, 'rcq'>;
  skinfolds: Omit<Skinfolds, 'sum_mm' | 'fat_percentage'>;
}

// =============================================
// SERVICE
// =============================================

@Injectable({ providedIn: 'root' })
export class DataService {
  private supa = inject(SupabaseService);

  getStats(): Observable<DashboardStats> {
    return from(this.supa.callFunctionGet<DashboardStats>('dashboard'));
  }

  getStudents(search?: string): Observable<StudentSummary[]> {
    const params = search ? { search } : undefined;
    return from(this.supa.callFunctionGet<StudentSummary[]>('alunos', params));
  }

  getStudent(id: string): Observable<Student> {
    return from(this.supa.callFunctionGet<Student>(`aluno-detail/${id}`));
  }

  createStudent(payload: CreateStudentPayload): Observable<StudentSummary> {
    return from(this.supa.callFunction<StudentSummary>('alunos', payload, 'POST'));
  }

  updateStudent(id: string, payload: Partial<CreateStudentPayload>): Observable<StudentSummary> {
    return from(this.supa.callFunction<StudentSummary>(`aluno-detail/${id}`, payload, 'PUT'));
  }

  deleteStudent(id: string): Observable<{ success: boolean }> {
    return from(this.supa.callFunction<{ success: boolean }>(`aluno-detail/${id}`, undefined, 'DELETE'));
  }

  restoreStudent(id: string): Observable<{ success: boolean }> {
    return from(this.supa.callFunction<{ success: boolean }>(`aluno-detail/${id}`, undefined, 'PATCH'));
  }

  getTrashedStudents(): Observable<TrashedStudent[]> {
    return from(this.supa.callFunctionGet<TrashedStudent[]>('alunos', { trash: '1' }));
  }

  addAssessment(payload: CreateAssessmentPayload): Observable<Assessment> {
    return from(this.supa.callFunction<Assessment>('avaliacoes', payload, 'POST'));
  }

  updateAssessment(payload: UpdateAssessmentPayload): Observable<Assessment> {
    return from(this.supa.callFunction<Assessment>('avaliacoes', payload, 'PUT'));
  }

  updateObservacoes(avaliacaoId: string, observacoes: string): Observable<Assessment> {
    return from(this.supa.callFunction<Assessment>('avaliacoes', { avaliacao_id: avaliacaoId, observacoes }, 'PATCH'));
  }

  deleteAssessment(avaliacaoId: string): Observable<{ success: boolean }> {
    return from(this.supa.callFunction<{ success: boolean }>(`avaliacao-detail/${avaliacaoId}`, undefined, 'DELETE'));
  }

  restoreAssessment(avaliacaoId: string): Observable<{ success: boolean }> {
    return from(this.supa.callFunction<{ success: boolean }>(`avaliacao-detail/${avaliacaoId}`, undefined, 'PATCH'));
  }

  addPhoto(payload: {
    aluno_id: string;
    date: string;
    category: PhotoCategory;
    image_base64: string;
    mime_type?: string;
  }): Observable<Photo> {
    return from(this.supa.callFunction<Photo>('fotos', payload, 'POST'));
  }

  deletePhoto(fotoId: string): Observable<{ success: boolean }> {
    return from(this.supa.callFunction<{ success: boolean }>(`fotos/${fotoId}`, undefined, 'DELETE'));
  }

  // ---------- Agenda (contrato isolado em agenda-utils.ts → AGENDA_API) ----------

  getAgenda(from_: string, to: string): Observable<AgendaItem[]> {
    return from(
      this.supa.callFunctionGet<unknown[]>(AGENDA_API.fn, AGENDA_API.listParams(from_, to))
        .then(rows => (Array.isArray(rows) ? rows : []).map(normalizeAgendaItem)),
    );
  }

  createAgendaItem(payload: AgendaPayload): Observable<AgendaItem> {
    return from(this.supa.callFunction<unknown>(AGENDA_API.fn, payload, 'POST').then(normalizeAgendaItem));
  }

  updateAgendaItem(id: string, payload: Partial<AgendaPayload>): Observable<AgendaItem> {
    return from(this.supa.callFunction<unknown>(AGENDA_API.itemPath(id), { id, ...payload }, 'PUT').then(normalizeAgendaItem));
  }

  deleteAgendaItem(id: string): Observable<{ success: boolean }> {
    return from(this.supa.callFunction<{ success: boolean }>(AGENDA_API.itemPath(id), { id }, 'DELETE'));
  }
}
