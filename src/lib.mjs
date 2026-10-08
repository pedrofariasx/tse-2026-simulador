import fs from 'node:fs';
import path from 'node:path';

export const HOST = 'https://resultados.tse.jus.br/oficial';
export const CICLO = 'ele2026';
// Configurável via env para suportar o 2º turno (novo ID de eleição).
export const ELEICAO = process.env.TSE_ELEICAO || '6257';
export const E6 = 'e' + String(ELEICAO).padStart(6, '0');
export const TURNO = process.env.TSE_TURNO || '1';
export const CARGO = process.env.TSE_CARGO || '1';

export const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
export const DATA = path.join(ROOT, 'data');
export const RAW = path.join(DATA, 'raw');
export const OUT = path.join(DATA, 'processed');

export function decodeJws(text) {
  const parts = text.split('.');
  if (parts.length < 2) throw new Error('not a JWS: ' + text.slice(0, 60));
  return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
}

const pad = (v, n) => String(v).padStart(n, '0');

/** URL for the unified vote file. geo = {uf, mun?, zona?} */
export function voteUrl({ uf, mun, zona, cargo = CARGO }) {
  let stem = uf;
  if (mun) stem += pad(mun, 5);
  if (zona) stem += `-z${pad(zona, 4)}`;
  return `${HOST}/${CICLO}/${ELEICAO}/dados/${uf}/${stem}-c${pad(cargo, 4)}-${E6}-u.jws`;
}

export function abUrl(uf) {
  return `${HOST}/${CICLO}/${ELEICAO}/dados/${uf}/${uf}-${E6}-ab.jws`;
}

export function munConfigUrl() {
  return `${HOST}/${CICLO}/${ELEICAO}/config/mun-${E6}-cm.jws`;
}

/**
 * Descobre o ID da eleição de um dado turno sondando a API do TSE.
 * O 1º turno é 6257; o 2º turno recebe um novo ID que o TSE publica
 * perto da data da eleição. Retorna o primeiro ID cujo arquivo
 * presidencial (c0001) tenha o turno procurado, ou null.
 */
export async function discoverElectionId(turno, startId = 6258, endId = 6400) {
  const ids = [];
  for (let id = startId; id <= endId; id++) ids.push(id);
  const found = [];
  await pool(ids, 24, async (id) => {
    const e6 = 'e' + String(id).padStart(6, '0');
    const url = `${HOST}/${CICLO}/${id}/dados/br/br-c0001-${e6}-u.jws`;
    try {
      const txt = await getText(url, 1, 12000);
      if (!txt) return;
      const json = decodeJws(txt);
      if (String(json.t) === String(turno)) found.push(id);
    } catch {
      /* 404 ou erro: eleição ainda não existe */
    }
  }, { label: 'discover', every: 200 });
  return found.length ? Math.min(...found) : null;
}

export async function getText(url, tries = 4, timeout = 45000) {
  let last;
  for (let a = 0; a < tries; a++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), timeout);
    try {
      const sep = url.includes('?') ? '&' : '?';
      const res = await fetch(url + sep + 'nocache=' + Date.now().toString(36) + a, {
        signal: ac.signal,
        headers: { 'accept': '*/*', 'user-agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36' },
      });
      clearTimeout(t);
      if (res.status === 404) return null;
      if (!res.ok) { last = new Error('HTTP ' + res.status); await sleep(400 * (a + 1)); continue; }
      return await res.text();
    } catch (e) {
      clearTimeout(t);
      last = e;
      await sleep(500 * (a + 1) + Math.random() * 300);
    }
  }
  throw last || new Error('failed ' + url);
}

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/** Bounded-concurrency map with progress reporting. */
export async function pool(items, limit, worker, { label = '', every = 250 } = {}) {
  let i = 0, done = 0, failed = 0;
  const errors = [];
  const t0 = Date.now();
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const idx = i++;
      if (idx >= items.length) return;
      try {
        await worker(items[idx], idx);
      } catch (e) {
        failed++;
        if (errors.length < 40) errors.push({ item: items[idx], err: String(e && e.message || e) });
      }
      done++;
      if (done % every === 0 || done === items.length) {
        const rate = done / ((Date.now() - t0) / 1000);
        const eta = (items.length - done) / Math.max(rate, 0.001);
        process.stderr.write(`\r${label} ${done}/${items.length} (${(100 * done / items.length).toFixed(1)}%) fail=${failed} ${rate.toFixed(1)}/s eta=${eta.toFixed(0)}s   `);
      }
    }
  });
  await Promise.all(runners);
  process.stderr.write('\n');
  return { done, failed, errors };
}

/** Extract normalized candidate votes from a decoded TSE payload. */
export function extractRows(json, ctx) {
  const base = {
    ele: json.ele, turno: json.t, dv: json.dv, cdabr: json.cdabr,
    atualizado: `${json.dt} ${json.ht}`, andamento: json.and,
  };
  const g = (v) => (v === undefined || v === null ? '' : v);
  const rows = [];
  const tot = {
    ...base, ...ctx,
    secoes_total: g(json.s?.ts), secoes_totalizadas: g(json.s?.st),
    pct_secoes: g(json.s?.pst),
    aptos_total: g(json.e?.te), aptos_totalizados: g(json.e?.est),
    comparecimento: g(json.e?.c), pct_comparecimento: g(json.e?.pc),
    aptencao: g(json.e?.a), pct_aptencao: g(json.e?.pa),
    votos_totais: g(json.v?.tv), votos_validos: g(json.v?.vvc ?? json.v?.vv),
    votos_branco: g(json.v?.vb), votos_nulo: g(json.v?.vn),
    votos_anulado: g(json.v?.van), pct_nominal: g(json.v?.pvvc),
  };
  rows.push({ ...tot, __tot: true });

  const cargos = json.carg || [];
  for (const cg of cargos) {
    for (const ag of cg.agr || []) {
      for (const par of ag.par || []) {
        for (const cd of par.cand || []) {
          const vs = (cd.vs || []).filter(v => String(v.tp || '').toUpperCase() === 'V')
            .map(v => `${v.nmu || v.nm} (${v.sgp})`).join('; ');
          rows.push({
            ...base, ...ctx,
            partido_sigla: par.sg, partido_numero: par.n, partido_nome: par.nm,
            fed_nome: par.nfed || '', fed_sigla: ag.com || par.sg,
            candidatura: cd.n, sqcand: cd.sqcand, nome: cd.nmu || cd.nm, nome_completo: cd.nm,
            chapa: `${cd.nmu || cd.nm}${vs ? ' / ' + vs : ''}`,
            votos: g(cd.vap), pct: g(cd.pvap), pct_n: g(cd.pvapn),
            votos_anulados: g(cd.tvan), eleitos: cd.e || '',
            __tot: false,
          });
        }
      }
    }
  }
  return rows;
}

export function ensureDirs() {
  for (const d of [RAW, OUT, path.join(RAW, CICLO)]) fs.mkdirSync(d, { recursive: true });
}
