import fs from 'node:fs';
import path from 'node:path';
import https from 'node:https';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const AI_FILE = path.join(ROOT, 'data', 'processed', 'ai_news_analysis.json');
const DASH_AI_FILE = path.join(ROOT, 'dashboard', 'ai-analysis.json');

const GATEWAY_URL = process.env.KILO_GATEWAY_URL || 'https://api.kilo.ai/api/gateway/v1/chat/completions';
const MODEL_NAME = process.env.KILO_MODEL || 'stepfun/step-3.7-flash:free';

/**
 * Fetch news from Google News RSS in Portuguese.
 */
export async function fetchNewsFeed(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=pt-BR&gl=BR&ceid=BR:pt-419`;
  return new Promise((resolve) => {
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const items = [];
          const itemRegex = /<item>([\s\S]*?)<\/item>/g;
          let match;
          while ((match = itemRegex.exec(data)) !== null && items.length < 15) {
            const block = match[1];
            const titleMatch = block.match(/<title>([\s\S]*?)<\/title>/);
            const linkMatch = block.match(/<link>([\s\S]*?)<\/link>/);
            const pubDateMatch = block.match(/<pubDate>([\s\S]*?)<\/pubDate>/);
            const sourceMatch = block.match(/<source[^>]*>([\s\S]*?)<\/source>/);

            if (titleMatch) {
              const cleanTitle = titleMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim();
              const link = linkMatch ? linkMatch[1].trim() : '';
              const pubDate = pubDateMatch ? pubDateMatch[1].trim() : '';
              const source = sourceMatch ? sourceMatch[1].replace(/<!\[CDATA\[(.*?)\]\]>/g, '$1').trim() : 'Mídia';
              items.push({ title: cleanTitle, link, pubDate, source });
            }
          }
          resolve(items);
        } catch {
          resolve([]);
        }
      });
    }).on('error', () => resolve([]));
  });
}

/**
 * Gather and deduplicate recent election news across multiple angles.
 */
export async function gatherElectionNews() {
  const queries = [
    'eleições 2026 segundo turno lula flavio bolsonaro',
    'flavio bolsonaro lula pesquisas segundo turno 2026',
    'augusto cury renan santos caiado apoios segundo turno 2026'
  ];

  const results = await Promise.all(queries.map(q => fetchNewsFeed(q)));
  const seen = new Set();
  const allNews = [];

  for (const list of results) {
    for (const item of list) {
      const norm = item.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
      if (!seen.has(norm)) {
        seen.add(norm);
        allNews.push(item);
      }
    }
  }

  return allNews.slice(0, 18);
}

/**
 * Call Kilo API Gateway using StepFun 3.7 Flash to analyze news and suggest adjustments.
 */
export async function runAiAnalysis(providedNews = null) {
  const news = providedNews || await gatherElectionNews();
  const timestamp = new Date().toISOString();

  const newsSummary = news.map((n, i) => `${i + 1}. [${n.source}] ${n.title} (${n.pubDate})`).join('\n');

  const systemPrompt = `Você é um cientista de dados e analista político sênior do TSE (Tribunal Superior Eleitoral).
Sua missão é analisar notícias recentes sobre a disputa do 2º turno das Eleições Presidenciais de 2026 entre Flávio Bolsonaro (PL) e Lula da Silva (PT) e calibrar parâmetros de transferência de votos.

Regras de Negócio:
1. Responda ESTRITAMENTE com um objeto JSON válido, sem rodeios ou markdown extra fora do JSON.
2. Seja analítico, neutro, baseado em dados e fatos reportados.
3. Os parâmetros devem ser coerentes com o clima político reportado nas notícias.

Parâmetros esperados no JSON:
- analise_clima_politico: texto claro e acessível (para leigos) sobre o momento eleitoral.
- destaques_noticias: lista de 3 a 5 manchetes/pontos-chave mais relevantes.
- parametros_recomendados:
    cury_to_lula_pct: número entre 20 e 80 (fatia do eleitorado de Augusto Cury que vai para Lula, centro=44)
    renan_to_lula_pct: número entre 20 e 80 (fatia de Renan Santos p/ Lula, centro=38)
    caiado_to_lula_pct: número entre 5 e 40 (fatia de Ronaldo Caiado p/ Lula, centro=11)
    zema_to_lula_pct: número entre 2 e 25 (fatia de Romeu Zema p/ Lula, centro=8)
    flavio_defection_pct: número entre 1.0 e 12.0 (% de desvio da base de Flávio p/ Lula, centro=5.0)
    lula_retention_pct: número entre 93.0 e 99.5 (% de retenção da base de Lula, centro=97.5)
    turnout_delta_ne: número entre -3.0 e 3.0 (variação de comparecimento no Nordeste em p.p.)
    turnout_delta_se: número entre -3.0 e 3.0 (variação de comparecimento no Sudeste em p.p.)
    turnout_delta_s: número entre -3.0 e 3.0 (variação de comparecimento no Sul em p.p.)
- justificativa_parametros: explicação simples e didática de cada ajuste realizado.
- projecao_resumo: resumo da vantagem atual e o que cada candidato precisa fazer.`;

  const userPrompt = `Data da Análise: ${timestamp}
Notícias monitoradas nas últimas horas sobre o 2º Turno 2026:
${newsSummary || 'Nenhuma notícia nova coletada; use dados gerais do fechamento do 1º turno.'}

Contexto do 1º Turno Oficial (TSE 99,99%):
- Flávio Bolsonaro (PL · 22): 56.103.033 votos (47,03%)
- Lula (PT · 13): 53.870.724 votos (45,16%)
- Augusto Cury (Avante): 3.448.466 votos (2,89%)
- Renan Santos (Missão): 2.675.840 votos (2,24%)
- Ronaldo Caiado (PSD): 2.605.054 votos (2,18%)
- Romeu Zema (Novo): 326.485 votos (0,27%)
- Brancos: 2.300.706 | Nulos: 3.668.609

Gere o JSON de calibração agora.`;

  const apiKey = process.env.KILO_API_KEY || process.env.OPENAI_API_KEY || '';

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }

  const response = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      model: MODEL_NAME,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.3
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Kilo Gateway error (HTTP ${response.status}): ${errorText}`);
  }

  const result = await response.json();
  const rawContent = result.choices?.[0]?.message?.content || '{}';

  // Extract JSON if model wrapped in markdown code fence
  let parsedJson;
  try {
    const cleanJsonStr = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    parsedJson = JSON.parse(cleanJsonStr);
  } catch (err) {
    console.error('Failed to parse AI JSON, using fallback structure:', err.message);
    parsedJson = {
      analise_clima_politico: "Cenário de disputa acirrada no 2º turno, com Flávio Bolsonaro liderando ligeiramente após o 1º turno e Lula buscando mobilização máxima no Nordeste e atração de eleitores moderados.",
      destaques_noticias: news.slice(0, 3).map(n => n.title),
      parametros_recomendados: {
        cury_to_lula_pct: 44,
        renan_to_lula_pct: 38,
        caiado_to_lula_pct: 11,
        zema_to_lula_pct: 8,
        flavio_defection_pct: 5.0,
        lula_retention_pct: 97.5,
        turnout_delta_ne: 0.0,
        turnout_delta_se: 0.0,
        turnout_delta_s: 0.0
      },
      justificativa_parametros: "Manutenção dos parâmetros de equilíbrio calibrados com base na retenção histórica e apuração oficial de 99,99%.",
      projecao_resumo: "Flávio mantém vantagem matemática inicial; Lula depende da atração do voto urbano de protesto."
    };
  }

  const outputData = {
    updated_at: timestamp,
    model: MODEL_NAME,
    gateway: GATEWAY_URL,
    news_items: news,
    analysis: parsedJson
  };

  // Save to disk
  fs.mkdirSync(path.dirname(AI_FILE), { recursive: true });
  fs.writeFileSync(AI_FILE, JSON.stringify(outputData, null, 2), 'utf8');

  fs.mkdirSync(path.dirname(DASH_AI_FILE), { recursive: true });
  fs.writeFileSync(DASH_AI_FILE, JSON.stringify(outputData, null, 2), 'utf8');

  return outputData;
}

/**
 * Get current cached AI analysis or execute if missing or older than maxAgeMs.
 */
export async function getOrUpdateAiAnalysis(maxAgeMs = 60 * 60 * 1000) {
  try {
    if (fs.existsSync(AI_FILE)) {
      const cached = JSON.parse(fs.readFileSync(AI_FILE, 'utf8'));
      const age = Date.now() - new Date(cached.updated_at).getTime();
      if (age < maxAgeMs) {
        return cached;
      }
    }
  } catch (err) {
    console.warn('Error reading cached AI analysis:', err.message);
  }

  console.log('[AI Agent] Executing scheduled analysis via Kilo Gateway...');
  return await runAiAnalysis();
}

/**
 * Start the hourly autonomous updater service.
 */
export function startHourlyAgent(intervalMs = 60 * 60 * 1000) {
  console.log(`[AI Agent] Autonomous 1-hour updater initialized (interval: ${intervalMs / 1000 / 60} min).`);

  // Initial check on boot
  getOrUpdateAiAnalysis().catch(err => {
    console.error('[AI Agent] Initial analysis error:', err.message);
  });

  // Schedule recurring execution every 1 hour
  return setInterval(() => {
    console.log('[AI Agent] 1-hour interval triggered. Searching news and running StepFun 3.7 Flash analysis...');
    runAiAnalysis().catch(err => {
      console.error('[AI Agent] Scheduled update error:', err.message);
    });
  }, intervalMs);
}
