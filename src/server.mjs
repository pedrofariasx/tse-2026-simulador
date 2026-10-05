import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { getOrUpdateAiAnalysis, runAiAnalysis, startHourlyAgent } from './ai_agent.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DASHBOARD_DIR = path.join(ROOT, 'dashboard');
const DATA_DIR = path.join(ROOT, 'data', 'processed');

const app = express();
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.use(cors());
app.use(express.json());

// Serve static dashboard files
app.use(express.static(DASHBOARD_DIR));

// Health check endpoint for Render
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime_seconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    service: 'tse-2026-dashboard',
    render_port: PORT
  });
});

// Get latest AI news analysis
app.get('/api/ai-analysis', async (req, res) => {
  try {
    const analysis = await getOrUpdateAiAnalysis();
    res.json(analysis);
  } catch (err) {
    console.error('Error fetching AI analysis:', err);
    res.status(500).json({ error: 'Failed to fetch AI analysis', details: err.message });
  }
});

// Trigger on-demand refresh of news & AI analysis
app.post('/api/ai-analysis/refresh', async (req, res) => {
  try {
    console.log('[API] On-demand AI refresh requested');
    const updated = await runAiAnalysis();
    res.json({
      success: true,
      message: 'AI news analysis refreshed successfully',
      data: updated
    });
  } catch (err) {
    console.error('Error refreshing AI analysis:', err);
    res.status(500).json({ error: 'Failed to refresh AI analysis', details: err.message });
  }
});

// Get full TSE election data
app.get('/api/data', (req, res) => {
  try {
    const dataJsPath = path.join(DASHBOARD_DIR, 'data.js');
    if (fs.existsSync(dataJsPath)) {
      const content = fs.readFileSync(dataJsPath, 'utf8');
      const jsonMatch = content.replace(/^window\.TSE_DATA\s*=\s*/, '').replace(/;\s*$/, '');
      return res.json(JSON.parse(jsonMatch));
    }
    res.status(404).json({ error: 'data.js not found' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read dataset', details: err.message });
  }
});

// Simulation endpoint (allows server-side exact calculation)
app.post('/api/simulate', (req, res) => {
  try {
    const {
      cury_to_lula_pct = 44,
      renan_to_lula_pct = 38,
      caiado_to_lula_pct = 11,
      zema_to_lula_pct = 8,
      flavio_defection_pct = 5.0,
      lula_retention_pct = 97.5,
      turnout_delta_ne = 0.0,
      turnout_delta_se = 0.0,
      turnout_delta_s = 0.0
    } = req.body;

    const weights = {
      lula: 53870724,
      flav: 56103033,
      cury: 3448466,
      renan: 2675840,
      caiado: 2605054,
      zema: 326485,
      esq: 203694,
      dc: 56905,
      branco: 2300706,
      nulo: 3668609
    };

    // Calculate votes
    const actLula = weights.lula * 0.965;
    const lFromLula = actLula * (lula_retention_pct / 100);
    const fFromLula = actLula * (1 - lula_retention_pct / 100);

    const actFlav = weights.flav * 0.958;
    const lFromFlav = actFlav * (flavio_defection_pct / 100);
    const fFromFlav = actFlav * (1 - flavio_defection_pct / 100);

    const actCury = weights.cury * 0.72;
    const lFromCury = actCury * (cury_to_lula_pct / 100);
    const fFromCury = actCury * (1 - cury_to_lula_pct / 100);

    const actRenan = weights.renan * 0.72;
    const lFromRenan = actRenan * (renan_to_lula_pct / 100);
    const fFromRenan = actRenan * (1 - renan_to_lula_pct / 100);

    const actCaiado = weights.caiado * 0.915;
    const lFromCaiado = actCaiado * (caiado_to_lula_pct / 100);
    const fFromCaiado = actCaiado * (1 - caiado_to_lula_pct / 100);

    const actZema = weights.zema * 0.90;
    const lFromZema = actZema * (zema_to_lula_pct / 100);
    const fFromZema = actZema * (1 - zema_to_lula_pct / 100);

    const actEsq = weights.esq * 0.935;
    const lFromEsq = actEsq * 0.94;
    const fFromEsq = actEsq * 0.06;

    const actDC = weights.dc * 0.86;
    const lFromDC = actDC * 0.488;
    const fFromDC = actDC * 0.512;

    const actBr = weights.branco * 0.28;
    const lFromBr = actBr * 0.31;
    const fFromBr = actBr * 0.69;

    const actNl = weights.nulo * 0.60;
    const lFromNl = actNl * 0.332;
    const fFromNl = actNl * 0.668;

    // Regional Turnout adjustments
    const deltaNE = turnout_delta_ne * 135937;
    const deltaSE = turnout_delta_se * (-73301);
    const deltaS = turnout_delta_s * (-63394);

    const totLula = lFromLula + lFromFlav + lFromCury + lFromRenan + lFromCaiado + lFromZema + lFromEsq + lFromDC + lFromBr + lFromNl + (deltaNE > 0 ? deltaNE * 0.64 : 0) + (deltaSE > 0 ? deltaSE * 0.40 : 0) + (deltaS > 0 ? deltaS * 0.31 : 0);
    const totFlav = fFromLula + fFromFlav + fFromCury + fFromRenan + fFromCaiado + fFromZema + fFromEsq + fFromDC + fFromBr + fFromNl + (deltaNE > 0 ? deltaNE * 0.36 : 0) + (deltaSE > 0 ? deltaSE * 0.60 : 0) + (deltaS > 0 ? deltaS * 0.69 : 0);

    const totValid = totLula + totFlav;
    const pctLula = (totLula / totValid) * 100;
    const pctFlav = (totFlav / totValid) * 100;
    const margin = totLula - totFlav;

    res.json({
      lula_votes: Math.round(totLula),
      flavio_votes: Math.round(totFlav),
      total_valid: Math.round(totValid),
      pct_lula: Number(pctLula.toFixed(2)),
      pct_flavio: Number(pctFlav.toFixed(2)),
      margin: Math.round(margin),
      winner: margin > 0 ? 'Lula' : 'Flávio Bolsonaro'
    });
  } catch (err) {
    res.status(500).json({ error: 'Simulation calculation error', details: err.message });
  }
});

// Fallback to index.html for SPA routing (Express 5 removed bare '*' pattern)
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(DASHBOARD_DIR, 'index.html'));
});

// Start listening
const server = app.listen(PORT, HOST, () => {
  console.log(`=======================================================`);
  console.log(`  Simulador Eleitoral 2026 — 2º Turno (TSE Oficial)`);
  console.log(`  Servidor ativo em http://${HOST}:${PORT}`);
  console.log(`  Ambiente: ${process.env.NODE_ENV || 'production'}`);
  console.log(`=======================================================`);

  // Start autonomous 1-hour agent
  const intervalHours = Number(process.env.UPDATE_INTERVAL_HOURS || 1);
  startHourlyAgent(intervalHours * 60 * 60 * 1000);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received. Closing HTTP server...');
  server.close(() => console.log('HTTP server closed'));
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received. Closing HTTP server...');
  server.close(() => console.log('HTTP server closed'));
});
