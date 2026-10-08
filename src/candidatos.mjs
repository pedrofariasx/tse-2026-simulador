import fs from 'node:fs';
import readline from 'node:readline';

const RE_FLAVIO = /flavio|bolsonaro/i;
const RE_LULA = /lula|luiz inácio|lula da silva/i;

/**
 * Descobre os sqcand de Flávio e Lula no arquivo unificado do TSE,
 * procurando no nível "br" (que vem no início do arquivo).
 * Retorna { flavio, lula, nomes } com os sqcand e nomes completos.
 */
export async function discoverCandidates(votosPath) {
  const result = { flavio: null, lula: null, nomes: {} };
  if (!fs.existsSync(votosPath)) return result;
  const rl = readline.createInterface({
    input: fs.createReadStream(votosPath),
    crlfDelay: Infinity,
  });
  for await (const ln of rl) {
    if (!ln) continue;
    let r;
    try { r = JSON.parse(ln); } catch { continue; }
    if (r.__tot || r.nivel !== 'br') continue;
    const nome = r.nome_completo || r.nome || '';
    if (!result.flavio && RE_FLAVIO.test(nome)) {
      result.flavio = r.sqcand;
      result.nomes.flavio = nome;
    } else if (!result.lula && RE_LULA.test(nome)) {
      result.lula = r.sqcand;
      result.nomes.lula = nome;
    }
    if (result.flavio && result.lula) break;
  }
  rl.close();
  return result;
}
