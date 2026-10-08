import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { discoverElectionId, OUT, HOST, CICLO, ROOT } from './lib.mjs';

// Intervalo entre verificações (padrão: 15 min). Ajuste com
// TSE_2T_CHECK_MIN. A coleta em si leva alguns minutos, então
// o dado fica no máximo ~intervalo + coleta atrasado.
const CHECK_MS = Number(process.env.TSE_2T_CHECK_MIN || 15) * 60 * 1000;
const CACHE_PATH = path.join(OUT, 'segundo-turno-id.json');

const state = {
  eleicaoId: null,   // ID da eleição do 2º turno (descoberto)
  coletando: false,  // trava: evita coletas simultâneas
  finalizado: false, // apuração do 2º turno encerrada?
  ultimaVerificacao: null,
  ultimoErro: null,
};

function carregarCache() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const c = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      if (c.eleicaoId) {
        state.eleicaoId = c.eleicaoId;
        console.log('[2º Turno] eleição do cache:', state.eleicaoId);
      }
    }
  } catch {
    /* cache inválido: redescobre */
  }
}

function salvarCache() {
  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify({ eleicaoId: state.eleicaoId }));
  } catch {
    /* ignora falha de escrita */
  }
}

function isStale(filePath, maxAgeMs) {
  if (!fs.existsSync(filePath)) return true;
  return Date.now() - fs.statSync(filePath).mtimeMs > maxAgeMs;
}

function spawnNode(args, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, args, {
      cwd: ROOT,
      env,
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    p.on('close', (code) => resolve(code ?? 1));
    p.on('error', () => resolve(1));
  });
}

async function coletar() {
  const id = state.eleicaoId;
  const env = {
    ...process.env,
    TSE_ELEICAO: String(id),
    TSE_TURNO: '2',
    TSE_CARGO: '1',
  };

  // Remove o marcador de retomada para re-coletar o que mudou
  // com o avanço da apuração.
  const donePath = path.join(OUT, `tse_${id}_t2.done`);
  if (fs.existsSync(donePath)) fs.unlinkSync(donePath);

  console.log('[2º Turno] coletando dados (br/uf/mun/ab)...');
  const scrape = await spawnNode(['src/scrape.mjs', 'mun', 'ab', '--conc=16'], env);
  if (scrape !== 0) {
    state.ultimoErro = 'falha na coleta (código ' + scrape + ')';
    console.error('[2º Turno]', state.ultimoErro);
    return false;
  }

  const evo = await spawnNode(['src/evolution.mjs', '--turno=2'], env);
  const mapa = await spawnNode(['src/mapa.mjs', '--turno=2'], env);
  if (evo !== 0 || mapa !== 0) {
    state.ultimoErro = 'falha na geração dos dados';
    console.error('[2º Turno]', state.ultimoErro);
    return false;
  }

  state.ultimoErro = null;
  state.ultimaVerificacao = new Date().toISOString();
  console.log('[2º Turno] dados atualizados');
  return true;
}

// Lê o campo "andamento" do nível br para saber se a apuração
// do 2º turno já encerrou (andamento === 'f').
async function verificarFinalizado() {
  const id = state.eleicaoId;
  const e6 = 'e' + String(id).padStart(6, '0');
  const url = `${HOST}/${CICLO}/${id}/dados/br/br-c0001-${e6}-u.jws`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!res.ok) return false;
    const txt = await res.text();
    const json = JSON.parse(Buffer.from(txt.split('.')[1], 'base64url').toString('utf8'));
    return String(json.and) === 'f';
  } catch {
    return false;
  }
}

export function getSegundoTurnoStatus() {
  return {
    eleicaoId: state.eleicaoId,
    coletando: state.coletando,
    finalizado: state.finalizado,
    ultimaVerificacao: state.ultimaVerificacao,
    ultimoErro: state.ultimoErro,
    intervaloMin: CHECK_MS / 60000,
  };
}

// Força uma coleta imediata (usado pelo endpoint manual).
export async function forceSegundoTurnoCollection() {
  if (state.coletando) {
    return { ok: false, erro: 'coleta já em andamento' };
  }
  if (state.finalizado) {
    return { ok: false, erro: 'apuração do 2º turno já finalizada' };
  }

  if (!state.eleicaoId) {
    const id = await discoverElectionId(2);
    if (!id) {
      return { ok: false, erro: '2º turno ainda não publicado pelo TSE' };
    }
    state.eleicaoId = id;
    salvarCache();
    console.log('[2º Turno] eleição descoberta:', id);
  }

  state.coletando = true;
  try {
    const ok = await coletar();
    if (ok) {
      state.finalizado = await verificarFinalizado();
    }
    return {
      ok,
      erro: ok ? null : (state.ultimoErro || 'falha na coleta'),
      finalizado: state.finalizado,
      eleicaoId: state.eleicaoId,
    };
  } finally {
    state.coletando = false;
  }
}

let agentStarted = false;

export function startSegundoTurnoAgent() {
  if (agentStarted) {
    console.log('[2º Turno] agente já está em execução');
    return;
  }
  agentStarted = true;
  carregarCache();
  console.log(`[2º Turno] agente automático iniciado (verifica a cada ${CHECK_MS / 60000}min)`);

  let rodando = false;
  const tick = async () => {
    if (rodando || state.coletando || state.finalizado) return;
    rodando = true;
    const t0 = Date.now();
    try {
      // 1. Descobre o ID da eleição do 2º turno (uma única vez).
      if (!state.eleicaoId) {
        console.log(`[2º Turno] ${new Date().toISOString()} sondando o TSE...`);
        const id = await discoverElectionId(2);
        if (!id) return; // ainda não publicado pelo TSE
        state.eleicaoId = id;
        salvarCache();
        console.log('[2º Turno] eleição descoberta:', id);
      }

      // 2. Só coleta se os dados estiverem ausentes ou desatualizados.
      const evoPath = path.join(OUT, 'evolution-t2.json');
      if (!isStale(evoPath, CHECK_MS)) return;

      // 3. Coleta e gera.
      state.coletando = true;
      try {
        const ok = await coletar();
        if (ok) {
          state.finalizado = await verificarFinalizado();
          if (state.finalizado) {
            console.log('[2º Turno] apuração finalizada. Coleta automática encerrada.');
          }
        }
      } finally {
        state.coletando = false;
      }
    } catch (e) {
      console.warn('[2º Turno] erro no agente:', e);
    } finally {
      rodando = false;
      console.log(`[2º Turno] verificação levou ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    }
  };

  // Primeira verificação pouco depois da inicialização,
  // depois periodicamente.
  setTimeout(tick, 8000);
  setInterval(tick, CHECK_MS);
}
