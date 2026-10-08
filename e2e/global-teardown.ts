// Limpeza final — roda SEMPRE (inclusive com falhas). Idempotente.
// A UI/API só faz exclusão lógica de alunos (deleted_at); fotos e agenda são apagadas de vez.
// O que sobra na lixeira é listado em e2e/test-output/qa-leftovers.json para purga via SQL.
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Api } from './helpers/api';
import { LEFTOVERS_FILE } from './helpers/env';

loadEnv({ path: path.resolve(__dirname, '..', '.env.e2e') });

export default async function globalTeardown() {
  console.log('\n[cleanup] removendo dados QA...');
  try {
    const api = await Api.login();
    const res = await api.purgeQaData(line => console.log(`[cleanup] ${line}`));

    const report = {
      at: new Date().toISOString(),
      activeQaStudents: res.activeQa.map(s => ({ id: s.id, name: s.name })),
      trashedQaStudents_needSqlPurge: res.trashedQa.map(s => ({ id: s.id, name: s.name })),
      agendaLeft: res.agendaLeft.map(a => ({ id: a.id, date: a.date, time: a.time })),
    };
    mkdirSync(path.dirname(LEFTOVERS_FILE), { recursive: true });
    writeFileSync(LEFTOVERS_FILE, JSON.stringify(report, null, 2));

    console.log(`[cleanup] alunos QA ativos restantes: ${report.activeQaStudents.length}`);
    console.log(`[cleanup] alunos QA na lixeira (purgar via SQL: alunos.id in ...): ${report.trashedQaStudents_needSqlPurge.length}`);
    for (const s of report.trashedQaStudents_needSqlPurge) console.log(`[cleanup]   ${s.id}  ${s.name}`);
    if (report.agendaLeft.length) console.log(`[cleanup] agenda restante: ${report.agendaLeft.length}`);
    console.log(`[cleanup] relatório: ${LEFTOVERS_FILE}`);
  } catch (e) {
    console.error(`[cleanup] FALHOU: ${(e as Error).message}`);
  }
}
