// Acesso direto às Edge Functions (mesmo contrato que src/app/data.ts) para:
//  - garantir pré-condições (aluno QA existe) quando um spec roda isolado;
//  - descobrir ids (avaliação, fotos, agenda) sem depender do markup;
//  - limpeza idempotente no teardown.
// Nunca imprime a senha.
import { environment } from '../../src/environments/environment';
import { QA_PREFIX, QA_STUDENT, credentials, daysAgo, ymd } from './env';
import { qaName, readState, writeState } from './state';

export interface StudentRow { id: string; name: string; lgpd_consent_status?: string; deleted_at?: string | null }
export interface StudentDetail {
  id: string; name: string; height_cm: number; lgpd_consent_status: string;
  avaliacoes: { id: string; date: string }[];
  avaliacoes_trash?: { id: string; date: string }[];
  fotos: { id: string; date: string; category: string }[];
}
export interface AgendaRow { id: string; aluno_id: string | null; student_name?: string | null; date: string; time: string; focus?: string }

const { supabaseUrl, supabaseAnonKey, functionsUrl } = environment;

export class Api {
  private constructor(private readonly token: string) {}

  /** Login direto no GoTrue (sem UI). */
  static async login(): Promise<Api> {
    const { email, password } = credentials();
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: supabaseAnonKey },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`Login da conta QA falhou (HTTP ${res.status}).`);
    const json = (await res.json()) as { access_token?: string };
    if (!json.access_token) throw new Error('Login da conta QA não retornou access_token.');
    return new Api(json.access_token);
  }

  async get<T>(name: string, params?: Record<string, string>): Promise<T> {
    const url = new URL(`${functionsUrl}/${name}`);
    Object.entries(params ?? {}).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url, { headers: this.headers() });
    return this.parse<T>(res, `GET ${name}`);
  }

  async call<T>(name: string, body?: unknown, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'POST'): Promise<T> {
    const res = await fetch(`${functionsUrl}/${name}`, {
      method,
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return this.parse<T>(res, `${method} ${name}`);
  }

  private headers() {
    return { Authorization: `Bearer ${this.token}`, apikey: supabaseAnonKey };
  }

  private async parse<T>(res: Response, what: string): Promise<T> {
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* corpo não-JSON */ }
    if (!res.ok) {
      const msg = (json as { error?: string } | null)?.error ?? text.slice(0, 200);
      throw new Error(`${what} → HTTP ${res.status}: ${msg}`);
    }
    return json as T;
  }

  // ---------- atalhos ----------
  listStudents(): Promise<StudentRow[]> { return this.get<StudentRow[]>('alunos'); }
  listTrash(): Promise<StudentRow[]> { return this.get<StudentRow[]>('alunos', { trash: '1' }); }
  getStudent(id: string): Promise<StudentDetail> { return this.get<StudentDetail>(`aluno-detail/${id}`); }
  createStudent(payload = { ...QA_STUDENT, name: qaName() }): Promise<StudentRow> { return this.call<StudentRow>('alunos', payload, 'POST'); }
  deleteStudent(id: string) { return this.call<{ success: boolean }>(`aluno-detail/${id}`, undefined, 'DELETE'); }
  restoreStudent(id: string) { return this.call<{ success: boolean }>(`aluno-detail/${id}`, undefined, 'PATCH'); }
  deletePhoto(id: string) { return this.call<{ success: boolean }>(`fotos/${id}`, undefined, 'DELETE'); }
  getAgenda(from: string, to: string): Promise<AgendaRow[]> { return this.get<AgendaRow[]>('agenda', { from, to }); }
  deleteAgenda(id: string) { return this.call<{ success: boolean }>(`agenda/${encodeURIComponent(id)}`, { id }, 'DELETE'); }

  isQa(name: string | null | undefined): boolean {
    return (name ?? '').startsWith(QA_PREFIX);
  }

  /** Aluno QA ativo (ou cria um com os dados conhecidos). */
  async ensureQaStudent(): Promise<StudentRow> {
    const name = qaName();
    const found = (await this.listStudents()).find(s => s.name === name);
    if (found) return this.syncState(found);
    const trashed = (await this.listTrash()).find(s => s.name === name);
    if (trashed) { await this.restoreStudent(trashed.id); return this.syncState(trashed); }
    return this.syncState(await this.createStudent());
  }

  /** Mantém state.json coerente: se o aluno mudou, os ids de avaliação antigos não valem mais. */
  private syncState(s: StudentRow): StudentRow {
    const st = readState();
    if (st.studentId !== s.id) writeState({ studentId: s.id, assessment1Id: undefined, assessment2Id: undefined, agendaId: undefined });
    return s;
  }

  /** Remove alunos QA ativos (soft), fotos e agenda — ponto de partida limpo e idempotente. */
  async purgeQaData(log: (line: string) => void = () => {}): Promise<{ trashedQa: StudentRow[]; activeQa: StudentRow[]; agendaLeft: AgendaRow[] }> {
    // a função agenda aceita no máximo 92 dias por consulta
    const from = daysAgo(45);
    const to = ymd(new Date(Date.now() + 45 * 86_400_000));

    // agenda: por aluno QA ou por nome
    let agenda: AgendaRow[] = [];
    try { agenda = await this.getAgenda(from, to); } catch (e) { log(`agenda: ${(e as Error).message}`); }

    const active = await this.listStudents();
    const qaActive = active.filter(s => this.isQa(s.name));
    const qaIds = new Set(qaActive.map(s => s.id));

    for (const a of agenda) {
      if ((a.aluno_id && qaIds.has(a.aluno_id)) || this.isQa(a.student_name)) {
        try { await this.deleteAgenda(a.id); log(`agenda ${a.id} removida`); }
        catch (e) { log(`agenda ${a.id}: ${(e as Error).message}`); }
      }
    }

    for (const s of qaActive) {
      try {
        const d = await this.getStudent(s.id);
        for (const f of d.fotos ?? []) {
          try { await this.deletePhoto(f.id); log(`foto ${f.id} removida`); }
          catch (e) { log(`foto ${f.id}: ${(e as Error).message}`); }
        }
      } catch (e) { log(`detalhe ${s.id}: ${(e as Error).message}`); }
      try { await this.deleteStudent(s.id); log(`aluno ${s.id} (${s.name}) movido para a lixeira`); }
      catch (e) { log(`aluno ${s.id}: ${(e as Error).message}`); }
    }

    const activeQa = (await this.listStudents()).filter(s => this.isQa(s.name));
    const trashedQa = (await this.listTrash()).filter(s => this.isQa(s.name));
    let agendaLeft: AgendaRow[] = [];
    try {
      agendaLeft = (await this.getAgenda(from, to)).filter(a => this.isQa(a.student_name) || (a.aluno_id && qaIds.has(a.aluno_id)));
    } catch { /* já logado acima */ }
    return { trashedQa, activeQa, agendaLeft };
  }
}
