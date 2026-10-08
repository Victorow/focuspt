import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { QA_PREFIX, STATE_FILE } from './env';

export interface E2EState {
  /** Nome único da rodada (a lixeira só faz exclusão lógica; evita homônimos de rodadas anteriores). */
  qaName?: string;
  studentId?: string;
  assessment1Id?: string;
  assessment2Id?: string;
  agendaId?: string;
}

export function readState(): E2EState {
  try {
    return existsSync(STATE_FILE) ? (JSON.parse(readFileSync(STATE_FILE, 'utf8')) as E2EState) : {};
  } catch {
    return {};
  }
}

export function writeState(patch: Partial<E2EState>): E2EState {
  const next = { ...readState(), ...patch };
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  return next;
}

export function clearState(): void {
  mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  writeFileSync(STATE_FILE, '{}');
}

/** Nome do aluno QA desta rodada: "QA Teste E2E" + sufixo de hora (sempre começa com QA_PREFIX). */
export function qaName(): string {
  const s = readState();
  if (s.qaName) return s.qaName;
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const name = `${QA_PREFIX} ${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
  writeState({ qaName: name });
  return name;
}
