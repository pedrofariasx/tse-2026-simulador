import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { discoverElectionId, OUT } from './lib.mjs';

const START = Number(process.env.TSE_DISCOVER_START || 6258);
const END = Number(process.env.TSE_DISCOVER_END || 6400);
// --atualiza: reforça a coleta (apaga o marcador de retomada), útil
// durante a apuração de 25/out, quando os dados mudam a cada minuto.
const ATUALIZA = process.argv.includes('--atualiza');
// --completo: coleta também o nível zona (para a matriz de voto cruzado);
// por padrão coleta só br/uf/mun/ab, que é o suficiente para o gráfico
// e o mapa e bem mais rápido.
const COMPLETO = process.argv.includes('--completo');

console.log('=== 2º Turno: descoberta + coleta + geração ===');

// 1. Descobre o ID da eleição do 2º turno sondando a API do TSE.
console.log(`procurando a eleição do 2º turno no TSE (IDs ${START}–${END})…`);
const id = await discoverElectionId(2, START, END);
if (!id) {
  console.error('');
  console.error('2º turno ainda não publicado pelo TSE.');
  console.error('Ele costuma aparecer perto de 25/out. Tente novamente depois,');
  console.error('ou ajuste o intervalo com TSE_DISCOVER_START/TSE_DISCOVER_END.');
  process.exit(1);
}
console.log(`2º turno encontrado: eleição ${id}`);

// 2. Raspa os dados com o ID descoberto.
const env = {
  ...process.env,
  TSE_ELEICAO: String(id),
  TSE_TURNO: '2',
  TSE_CARGO: '1',
};

// Apaga o marcador de retomada quando for atualização, para re-coletar
// os arquivos que mudaram com o avanço da apuração.
const donePath = path.join(OUT, `tse_${id}_t2.done`);
if (ATUALIZA && fs.existsSync(donePath)) {
  fs.unlinkSync(donePath);
  console.log('marcador de retomada removido (coleta forçada)');
}

const levels = COMPLETO ? ['all'] : ['mun', 'ab'];
console.log(`coletando dados do 2º turno (níveis: ${levels.join(', ')})…`);
const scrape = spawnSync('node', ['src/scrape.mjs', ...levels, '--conc=16'], { env, stdio: 'inherit' });
if (scrape.status !== 0) {
  console.error('falha na coleta do 2º turno');
  process.exit(1);
}

// 3. Gera os arquivos do dashboard (gráfico + mapa).
console.log('gerando série temporal do 2º turno…');
const evo = spawnSync('node', ['src/evolution.mjs', '--turno=2'], { env, stdio: 'inherit' });
console.log('gerando dados do mapa do 2º turno…');
const mapa = spawnSync('node', ['src/mapa.mjs', '--turno=2'], { env, stdio: 'inherit' });
if (evo.status !== 0 || mapa.status !== 0) {
  console.error('falha na geração dos dados do 2º turno');
  process.exit(1);
}

console.log('');
console.log('2º turno pronto! Escolha "2º Turno" no gráfico e no mapa do dashboard.');
console.log('Para atualizar durante a apuração de 25/out:');
console.log('  npm run segundo-turno -- --atualiza');
