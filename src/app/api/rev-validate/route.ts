import { NextResponse } from 'next/server';
import { fetchHistoricalData } from '@/lib/alpha-vantage';
import { getScanUniverse } from '@/lib/scanner/universe-core';
import {
  REV_HYPOTHESIS as H,
  REV_HYPOTHESIS_VERSION,
  REV_GATES,
  EXPECTED_PROFILE_REVERSAL,
  evaluateRevGates,
  type GateResult,
} from '@/lib/rev/hypothesis';
import {
  runRevBacktest,
  type RevBacktestResult,
  type RevTrade,
} from '@/lib/rev/backtest';
import type { RevBar, RevFiling8k } from '@/lib/rev/signal';
import { fetchRecentFilings } from '@/lib/sec-edgar';

// ═══════════════════════════════════════════════════════════════════
// REV v1 VALIDATE — backtest IS/OOS/WF + falling-knife + verdikti
// ═══════════════════════════════════════════════════════════════════
// E VEÇANTË nga /api/ibkr-backtest (CTC validation-lab) — portat,
// profili i pritshëm dhe metrikat e REV evaluhen këtu veç e veç.
// Krahaso REV KUNDRË EXPECTED_PROFILE_REVERSAL (60-70% WR), JO kundrejt
// profilit të CTC (35-45% WR).
// GET /api/rev-validate?universe=200&years=3&force=1
// ═══════════════════════════════════════════════════════════════════

export const maxDuration = 300;

interface CacheEntry {
  at: number;
  payload: RevValidateResponse;
}
const g = globalThis as unknown as { __revValidateCache?: Map<string, CacheEntry> };
const cache = (g.__revValidateCache ??= new Map<string, CacheEntry>());
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface RevValidateResponse {
  validatedAt: string;
  durationSec: number;
  params: { universe: number; years: number };
  hypothesis: { version: number; name: string };
  expectedProfile: typeof EXPECTED_PROFILE_REVERSAL;
  backtest: {
    dataCoverage: { from: string; to: string };
    funnel: RevBacktestResult['funnel'];
    tradesSample: Array<
      Pick<
        RevTrade,
        | 'symbol'
        | 'sector'
        | 'signalDate'
        | 'entryDate'
        | 'exitDate'
        | 'entry'
        | 'stop'
        | 'target'
        | 'exitPrice'
        | 'exitReason'
        | 'rNet'
        | 'madeNewLowAfterEntry'
      >
    >;
  };
  is: RevBacktestResult['is'];
  oos: RevBacktestResult['oos'];
  walkForward: RevBacktestResult['wf'];
  knifeRate: number;
  symbolConcentrationPct: number;
  costSensitivity: Record<string, number>;
  gates: GateResult[];
  verdict: 'PASS' | 'REJECT';
  verdictNote: string;
  profileCheck: {
    winRateInRange: boolean;
    profitFactorInRange: boolean;
    suspiciouslyHighPf: boolean;
    note: string;
  };
  error?: string;
}

export async function GET(request: Request) {
  const t0 = Date.now();
  try {
    const { searchParams } = new URL(request.url);
    const universeSize = clampInt(searchParams.get('universe'), 50, 400, 200);
    const years = clampInt(searchParams.get('years'), 1, 5, 3);
    const force = searchParams.get('force') === '1';

    const cacheKey = `${universeSize}:${years}`;
    const cached = cache.get(cacheKey);
    if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS) {
      return NextResponse.json(cached.payload, { headers: { 'Cache-Control': 'no-store' } });
    }

    // ── 1. SPY ditare për periudhën ──
    const range = `${years}y`;
    const spyBars = (await fetchHistoricalData('SPY', range, { interval: '1d' })) as RevBar[] | null;
    if (!spyBars || spyBars.length < 60) {
      return NextResponse.json(
        { error: 'SPY ditare s’u gjet' } satisfies Partial<RevValidateResponse>,
        { status: 502 },
      );
    }

    // ── 2. Universi — ditare ditor në pako me buxhet kohe ──
    const universe = [...new Set(getScanUniverse(universeSize))];
    const series: { symbol: string; bars: RevBar[] }[] = [];
    const BATCH = 10;
    const deadline = Date.now() + 200_000; // lëre kohë për backtest-un + kthim brenda maxDuration
    for (let i = 0; i < universe.length; i += BATCH) {
      if (Date.now() > deadline) break;
      const batch = universe.slice(i, i + BATCH);
      const res = await Promise.allSettled(
        batch.map(async (s) => ({
          symbol: s,
          bars: (await fetchHistoricalData(s, range, { interval: '1d' })) as RevBar[] | null,
        })),
      );
      for (const r of res) {
        if (r.status === 'fulfilled' && r.value.bars && r.value.bars.length >= 120) {
          series.push({ symbol: r.value.symbol, bars: r.value.bars });
        }
      }
      if (i + BATCH < universe.length) await new Promise((r) => setTimeout(r, 150));
    }

    if (!series.length) {
      return NextResponse.json(
        { error: 'Asnjë të dhënë e mjaftueshme për universin e kërkuar' } satisfies Partial<RevValidateResponse>,
        { status: 502 },
      );
    }

    // ── 3. 8-K reale (EDGAR recent) për simbolet — event-gate historik ──
    // Submissions API kthen filing-et e fundit (~1000) — mbulojnë periudhën
    // e shkurtër të backtest-it (1-3v) për shumicën e emrave.
    const filings8k: Record<string, RevFiling8k[]> = {};
    const edgarDeadline = Date.now() + 40_000;
    for (const s of series) {
      if (Date.now() > edgarDeadline) break;
      try {
        const res = await fetchRecentFilings(s.symbol, ['8-K'], 60);
        if (res && res.filings.length) {
          filings8k[s.symbol] = res.filings.map((f) => ({
            filingDate: f.filingDate,
            items: (f.items ?? '').split(',').map((x) => x.trim()).filter(Boolean),
          }));
        }
      } catch {
        // EDGAR jo kritik — gate-i mbetet pasiv për këtë simbol
      }
    }

    // ── 4. Backtest-i REV ──
    const bt = runRevBacktest({ series, spyBars, filings8k, isSplitPct: 0.7, wfWindowCount: 5 });

    // ── 5. Portat + verdikti ──
    const { allPassed, results } = evaluateRevGates({
      isMetrics: bt.is,
      oosMetrics: bt.oos,
      wfResults: bt.wf,
      symbolProfitConcentrationPct: bt.symbolConcentrationPct,
      costSensitivityResults: bt.costSensitivity,
      knifeRate: bt.knifeRate,
    });

    // Kontrolli i profilit të pritshëm (60-70% WR) — JO profili i CTC
    const wr = bt.oos.trades >= 10 ? bt.oos.winRate : bt.is.winRate;
    const pf = bt.oos.trades >= 10 ? bt.oos.profitFactor : bt.is.profitFactor;
    const winRateInRange = wr >= EXPECTED_PROFILE_REVERSAL.winRateRange[0] && wr <= EXPECTED_PROFILE_REVERSAL.winRateRange[1];
    const profitFactorInRange = pf >= EXPECTED_PROFILE_REVERSAL.profitFactorRange[0] && pf <= EXPECTED_PROFILE_REVERSAL.profitFactorRange[1];
    const suspiciouslyHighPf = pf > EXPECTED_PROFILE_REVERSAL.profitFactorSuspiciousAbove;

    const verdict: 'PASS' | 'REJECT' = allPassed ? 'PASS' : 'REJECT';
    const knifeGateFailed = !results.find((r) => r.gateName.startsWith('Falling-knife'))!.passed;
    const verdictNote = allPassed
      ? 'PASS — hipoteza plotëson të gjitha portat e ngrira. Vazhdo me paper-trading para çdo kapitali real.'
      : knifeGateFailed
        ? 'REJECT — problema SPECIFIKE është konfirmimi (Sec. 3 i spec-it): >40% e tregtive bënë low të ri pas hyrjes. Rishiko logjikën e konfirmimit (ndoshta 2-ditor), JO target/stop.'
        : 'REJECT — mos vendos kapital real. MOS i shtrëngo pragjet derisa PASS (i njëjti gabim si me v1 e CTC).';

    const payload: RevValidateResponse = {
      validatedAt: new Date().toISOString(),
      durationSec: Math.round((Date.now() - t0) / 100) / 10,
      params: { universe: universeSize, years },
      hypothesis: { version: REV_HYPOTHESIS_VERSION, name: H.name },
      expectedProfile: EXPECTED_PROFILE_REVERSAL,
      backtest: {
        dataCoverage: bt.dataCoverage,
        funnel: bt.funnel,
        tradesSample: bt.trades
          .slice()
          .sort((a, b) => (a.entryDate < b.entryDate ? 1 : -1))
          .slice(0, 40)
          .map((t) => ({
            symbol: t.symbol,
            sector: t.sector,
            signalDate: t.signalDate,
            entryDate: t.entryDate,
            exitDate: t.exitDate,
            entry: t.entry,
            stop: t.stop,
            target: t.target,
            exitPrice: t.exitPrice,
            exitReason: t.exitReason,
            rNet: Math.round(t.rNet * 1000) / 1000,
            madeNewLowAfterEntry: t.madeNewLowAfterEntry,
          })),
      },
      is: bt.is,
      oos: bt.oos,
      walkForward: bt.wf,
      knifeRate: Math.round(bt.knifeRate * 1000) / 1000,
      symbolConcentrationPct: Math.round(bt.symbolConcentrationPct * 10) / 10,
      costSensitivity: bt.costSensitivity,
      gates: results,
      verdict,
      verdictNote,
      profileCheck: {
        winRateInRange,
        profitFactorInRange,
        suspiciouslyHighPf,
        note: suspiciouslyHighPf
          ? 'PF mbi 2.0 = dyshim bias/bug (njësoj si CTC) — kontrollo para çdo konkluzioni'
          : `Krahasuar kundrejt profilit REV (WR ${EXPECTED_PROFILE_REVERSAL.winRateRange[0] * 100}-${EXPECTED_PROFILE_REVERSAL.winRateRange[1] * 100}%), JO kundrejt CTC`,
      },
    };

    cache.set(cacheKey, { at: Date.now(), payload });
    return NextResponse.json(payload, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gabim i panjohur';
    console.error('[REV-VALIDATE] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function clampInt(v: string | null, min: number, max: number, dflt: number): number {
  const n = parseInt(v ?? '', 10);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(min, Math.min(max, n));
}
