import { NextResponse } from 'next/server';
import { fetchHistoricalData } from '@/lib/alpha-vantage';
import { getScanUniverse } from '@/lib/scanner/universe-400';
import { getCompanyName } from '@/lib/scanner/ticker-names';
import { fetchRecentFilings } from '@/lib/sec-edgar';
import {
  REV_HYPOTHESIS as H,
  REV_HYPOTHESIS_VERSION,
} from '@/lib/rev/hypothesis';
import {
  revRsi,
  revAtr,
  revDollarVol20,
  revLiquidityZoneAt,
  revSectorOf,
  revSignalCheck,
  revConfirmationCheck,
  revHasRecentMaterial8k,
  revPositionSize,
  type RevBar,
  type RevScanStatus,
} from '@/lib/rev/signal';

// ═══════════════════════════════════════════════════════════════════
// REV v1 SCAN — "Confirmed Short-Term Reversal" (skanim live)
// ═══════════════════════════════════════════════════════════════════
// E VEÇANTË nga /api/ibkr-scan (CTC v2) — logjikë, gates dhe output i
// ndarë. Mos e përziej me CTC (spec Seksioni 0 & 9).
// GET /api/rev-scan
// ═══════════════════════════════════════════════════════════════════

export const maxDuration = 300;

const UNIVERSE = [...new Set(getScanUniverse(400))];

export interface RevScanCandidate {
  symbol: string;
  companyName: string;
  sector: string;
  status: RevScanStatus;
  price: number;
  ret3Pct: number;
  rsi2: number;
  spyRet3Pct: number;
  idioSpreadPct: number; // ret3(stock) − ret3(SPY)
  dollarVol20: number;
  liquidityPctile: number;
  atr: number;
  atrPct: number;
  stop: number;
  target: number;
  riskPerShare: number;
  position: { shares: number; riskDollars: number; notional: number };
  signalDate: string;
  confirmation?: {
    greenCandle: boolean;
    higherLow: boolean;
    volumeDeclining: boolean;
    newLow: boolean;
    confirmed: boolean;
  };
  gate8k?: { blocked: boolean; lastFilingDate?: string; items?: string };
  slot: 'OPEN_OK' | 'SEKTOR_PLOT' | 'MAX_POZICIONE' | 'VETEM_WATCH';
  reasons: string[];
  warnings: string[];
}

export interface RevScanResponse {
  scannedAt: string;
  durationSec: number;
  hypothesis: {
    version: number;
    name: string;
    frozen: {
      liquidityZone: string;
      minDollarVolume: string;
      minPrice: number;
      dropOrRsi2: string;
      idiosyncraticVsSpy: boolean;
      block8kWithinDays: number;
      spyCrashBelowPct: number;
      confirmation: string;
      stopTarget: string;
      timeStopDays: number;
      maxHoldingDays: number;
      riskPerTradePct: number;
      maxOpenPositions: number;
      maxPerSector: number;
      cooldownDays: number;
    };
    noteSeparation: string;
  };
  regime: {
    spyLastMovePct: number;
    spyCrash: boolean;
    spyRet3Pct: number;
    note: string;
  };
  universe: { total: number; withData: number; inZone: number };
  counts: {
    hyrjeTani: number;
    pritKonfirmim: number;
    bllokuar8k: number;
    bllokuarSpyCrash: number;
    invaliduarLowIRi: number;
    konfirmimPlotfullyem: number;
    paSinjal: number;
  };
  hyrjeTani: RevScanCandidate[];
  pritKonfirmim: RevScanCandidate[];
  bllokuar: RevScanCandidate[];
  error?: string;
}

function frozenInfo() {
  return {
    liquidityZone: `${Math.round(H.liquidityPercentileLow * 100)}-${Math.round(H.liquidityPercentileHigh * 100)} percentile (zona e mesme, JO top-kuintil si CTC)`,
    minDollarVolume: `$${(H.minDollarVolumeFloor / 1e6).toFixed(0)}M/ditë`,
    minPrice: H.minPrice,
    dropOrRsi2: `ret3d ≤ ${H.min3DayCumReturnPct}% OSE RSI(2) < ${H.rsi2Oversold}`,
    idiosyncraticVsSpy: H.idiosyncraticVsSpyRequired,
    block8kWithinDays: H.blockIfReal8kWithinDays,
    spyCrashBelowPct: H.blockIfSpyDailyMovePctBelow,
    confirmation: 'Green candle OSE higher low + volum në rënie; low i ri → invalide',
    stopTarget: `Stop ${H.stopAtrMultiple}×ATR(14), Target ${H.targetRMultiple}R`,
    timeStopDays: H.timeStopDays,
    maxHoldingDays: H.maxHoldingDays,
    riskPerTradePct: H.riskPerTradePct,
    maxOpenPositions: H.maxOpenPositions,
    maxPerSector: H.maxPositionsPerSector,
    cooldownDays: H.symbolCooldownDays,
  };
}

export async function GET() {
  const t0 = Date.now();
  try {
    // ── 1. SPY — regjimi sistemik ──
    const spyBars = (await fetchHistoricalData('SPY', '6mo')) as RevBar[] | null;
    if (!spyBars || spyBars.length < 10) {
      return NextResponse.json({ error: 'SPY data s’u gjet' } satisfies Partial<RevScanResponse>, { status: 502 });
    }
    const spyClose = spyBars.map((b) => b.close);
    const spyLastMove = (spyClose[spyClose.length - 1] / spyClose[spyClose.length - 2] - 1) * 100;
    const spyRet3 = (spyClose[spyClose.length - 1] / spyClose[spyClose.length - 4] - 1) * 100;
    const spyCrash = spyLastMove <= H.blockIfSpyDailyMovePctBelow;

    // ── 2. Universi — ditare ditor 6mo në pako ──
    const seriesMap = new Map<string, RevBar[]>();
    const BATCH = 10;
    const deadline = Date.now() + 240_000; // buxhet i sigurt brenda maxDuration
    for (let i = 0; i < UNIVERSE.length; i += BATCH) {
      if (Date.now() > deadline) break;
      const batch = UNIVERSE.slice(i, i + BATCH);
      const res = await Promise.allSettled(
        batch.map(async (s) => ({ s, d: await fetchHistoricalData(s, '6mo') })),
      );
      for (const r of res) {
        if (r.status === 'fulfilled' && r.value.d && r.value.d.length >= 30) {
          seriesMap.set(r.value.s, r.value.d as RevBar[]);
        }
      }
      if (i + BATCH < UNIVERSE.length) await new Promise((r) => setTimeout(r, 200));
    }

    // ── 3. Zona e likuiditetit 20-80pct (point-in-time në barin e fundit) ──
    const snapshot: { symbol: string; dollarVol20: number; price: number }[] = [];
    for (const [sym, bars] of seriesMap) {
      const i = bars.length - 1;
      snapshot.push({ symbol: sym, dollarVol20: revDollarVol20(bars, i), price: bars[i].close });
    }
    const { inZone, pctBySymbol } = revLiquidityZoneAt(snapshot);

    // ── 4. Vlerësimi i sinjalit + konfirmimit për çdo emër në zonë ──
    const candidates: RevScanCandidate[] = [];
    const today = spyBars[spyBars.length - 1].date;

    for (const [sym, bars] of seriesMap) {
      if (!inZone.has(sym)) continue;
      const i = bars.length - 1;
      if (i < 25) continue;
      const closes = bars.map((b) => b.close);
      const rsi2Arr = revRsi(closes, 2);
      const atrArr = revAtr(bars, 14);

      // SPY ret3 i sinjronizuar me datën e bar-it
      const spyIdxOnDate = spyBars.findIndex((b) => b.date === bars[i].date);
      const spyRet3Here =
        spyIdxOnDate >= 3
          ? (spyClose[spyIdxOnDate] / spyClose[spyIdxOnDate - 3] - 1) * 100
          : spyRet3;

      const mkCandidate = (
        status: RevScanStatus,
        sigI: number,
        confIdx: number | null,
        reasons: string[],
        warnings: string[],
        gate8k?: RevScanCandidate['gate8k'],
      ): RevScanCandidate => {
        const bar = bars[sigI];
        const entry = bars[i].close;
        const atr = atrArr[i] || 0;
        const stop = entry - H.stopAtrMultiple * atr;
        const riskPerShare = Math.max(0.01, entry - stop);
        const target = entry + H.targetRMultiple * riskPerShare;
        const ret3 = (bar.close / bars[sigI - 3].close - 1) * 100;
        const conf =
          confIdx !== null && confIdx !== undefined
            ? revConfirmationCheck({
                signalBar: bar,
                confirmBar: bars[confIdx],
                confirmVolume: bars[confIdx].volume,
              })
            : null;
        const confirmation = conf
          ? {
              greenCandle: conf.greenCandle,
              higherLow: conf.higherLow,
              volumeDeclining: conf.volumeDeclining,
              newLow: conf.newLow,
              confirmed: conf.confirmed,
            }
          : undefined;
        return {
          symbol: sym,
          companyName: getCompanyName(sym) ?? sym,
          sector: revSectorOf(sym),
          status,
          price: entry,
          ret3Pct: Math.round(ret3 * 100) / 100,
          rsi2: Math.round((rsi2Arr[sigI] ?? 50) * 10) / 10,
          spyRet3Pct: Math.round(spyRet3Here * 100) / 100,
          idioSpreadPct: Math.round((ret3 - spyRet3Here) * 100) / 100,
          dollarVol20: Math.round((revDollarVol20(bars, i) || 0) / 1e6 * 10) / 10,
          liquidityPctile: Math.round((pctBySymbol[sym] ?? 0) * 100),
          atr: Math.round(atr * 100) / 100,
          atrPct: Math.round((atr / entry) * 1000) / 10,
          stop: Math.round(stop * 100) / 100,
          target: Math.round(target * 100) / 100,
          riskPerShare: Math.round(riskPerShare * 100) / 100,
          position: revPositionSize(entry, stop),
          signalDate: bar.date,
          confirmation,
          gate8k,
          slot: 'VETEM_WATCH',
          reasons,
          warnings,
        };
      };

      // (a) Sinjal DJE + konfirmim SOT → HYRJE_TANI ose bllokim
      if (i >= 29) {
        const sigI = i - 1;
        const ret3Y = (bars[sigI].close / bars[sigI - 3].close - 1) * 100;
        const spyIdxY = spyBars.findIndex((b) => b.date === bars[sigI].date);
        const spyRet3Y =
          spyIdxY >= 3 ? (spyClose[spyIdxY] / spyClose[spyIdxY - 3] - 1) * 100 : spyRet3;
        const sigY = revSignalCheck({
          ret3Pct: ret3Y,
          rsi2: rsi2Arr[sigI],
          spyRet3Pct: spyRet3Y,
          spyDailyMovePct: NaN, // circuit breaker i vlerësuar më poshtë nga regjimi global
        });
        const dropYesterday = sigY.dropTriggered && ret3Y < spyRet3Y;
        if (dropYesterday) {
          const filings = await fetch8kSafe(sym);
          const gate = revHasRecentMaterial8k(filings, bars[sigI].date);
          const crashYesterday =
            spyBars[spyIdxY] && spyIdxY >= 1
              ? (spyClose[spyIdxY] / spyClose[spyIdxY - 1] - 1) * 100 <=
                H.blockIfSpyDailyMovePctBelow
              : false;
          if (gate.blocked) {
            candidates.push(
              mkCandidate(
                'BLLOKUAR_8K',
                sigI,
                i,
                [`Sinjal reversal më ${bars[sigI].date} (ret3 ${ret3Y.toFixed(1)}%)`],
                [`8-K material brenda ${H.blockIfReal8kWithinDays} ditëve — lajmi real, jo overreaction`],
                { blocked: true, lastFilingDate: gate.lastFiling?.filingDate, items: gate.lastFiling?.items.join(', ') },
              ),
            );
          } else if (crashYesterday || spyCrash) {
            candidates.push(
              mkCandidate(
                'BLLOKUAR_SPY_CRASH',
                sigI,
                i,
                [`Sinjal reversal më ${bars[sigI].date}`],
                ['SPY në rënie sistemike (≤ -3%) — korrelacionet → 1, reversal i pasigurt'],
              ),
            );
          } else {
            const conf = revConfirmationCheck({
              signalBar: bars[sigI],
              confirmBar: bars[i],
              confirmVolume: bars[i].volume,
            });
            if (conf.newLow) {
              candidates.push(
                mkCandidate('INVALIDUAR_LOW_I_RI', sigI, i, [
                  `Sinjal më ${bars[sigI].date}, por low i ri sot`,
                ], ['Thesis-i i overreaction u invalidua vetë — MOS HYR']),
              );
            } else if (conf.confirmed) {
              const r: string[] = [
                `Sinjal më ${bars[sigI].date} (ret3 ${ret3Y.toFixed(1)}%, RSI2 ${(rsi2Arr[sigI] ?? 0).toFixed(0)})`,
                'Konfirmim sot: ' + (conf.greenCandle ? 'green candle' : 'higher low') + ' + volum në rënie',
              ];
              candidates.push(mkCandidate('HYRJE_TANI', sigI, i, r, []));
            } else {
              candidates.push(
                mkCandidate('KONFIRMIM_PLOTFULLYEM', sigI, i, [
                  `Sinjal më ${bars[sigI].date}, konfirmimi dështoi sot`,
                ], [
                  !conf.stabilizing
                    ? 'Pa candle stabilizimi (pa green, pa higher low)'
                    : 'Volumi nuk po bie — presioni i shitjes vazhdon',
                ]),
              );
            }
          }
          continue; // ky simbol u vlerësua — mos kontrollo sinjalin e sotëm për të
        }
      }

      // (b) Sinjal SOT → PRIT_KONFIRMIM (nesër vlerësohet konfirmimi)
      const ret3T = (bars[i].close / bars[i - 3].close - 1) * 100;
      const sigT = revSignalCheck({
        ret3Pct: ret3T,
        rsi2: rsi2Arr[i],
        spyRet3Pct: spyRet3Here,
        spyDailyMovePct: spyLastMove,
      });
      if (sigT.dropTriggered && sigT.idiosyncratic) {
        if (sigT.spyCrash) {
          candidates.push(
            mkCandidate('BLLOKUAR_SPY_CRASH', i, null, [`Rënie 3-ditore ${ret3T.toFixed(1)}% sot`], [
              'SPY sot ≤ -3% — circuit breaker',
            ]),
          );
        } else {
          const filings = await fetch8kSafe(sym);
          const gate = revHasRecentMaterial8k(filings, today);
          if (gate.blocked) {
            candidates.push(
              mkCandidate('BLLOKUAR_8K', i, null, [`Rënie 3-ditore ${ret3T.toFixed(1)}% sot`], [
                `8-K material brenda ${H.blockIfReal8kWithinDays} ditëve`,
              ], { blocked: true, lastFilingDate: gate.lastFiling?.filingDate, items: gate.lastFiling?.items.join(', ') }),
            );
          } else {
            const trig = ret3T <= H.min3DayCumReturnPct ? `ret3d ${ret3T.toFixed(1)}%` : `RSI(2) ${(rsi2Arr[i] ?? 0).toFixed(0)}`;
            candidates.push(
              mkCandidate('PRIT_KONFIRMIM', i, null, [
                `Rënie e konsiderueshme sot: ${trig}`,
                `Idiosinkratike: ${ret3T.toFixed(1)}% vs SPY ${spyRet3Here.toFixed(1)}%`,
              ], ['PRIT konfirmimin nesër: green candle / higher low + volum në rënie']),
            );
          }
        }
      }
    }

    // ── 5. Renditja, slot-et (max 3 pozicione, 1/sektor) ──
    const rank = (a: RevScanCandidate, b: RevScanCandidate) =>
      a.idioSpreadPct - b.idioSpreadPct; // rënia më e thellë se tregu e pari
    const hyrje = candidates.filter((c) => c.status === 'HYRJE_TANI').sort(rank);
    const usedSectors = new Set<string>();
    let openSlots = H.maxOpenPositions;
    for (const c of hyrje) {
      if (openSlots <= 0) {
        c.slot = 'MAX_POZICIONE';
        c.warnings.push(`Mbi limitin e ${H.maxOpenPositions} pozicioneve — anashkalo (rregulli i spec Seks. 5)`);
        continue;
      }
      if (usedSectors.has(c.sector)) {
        c.slot = 'SEKTOR_PLOT';
        c.warnings.push(`Sektori ${c.sector} i zënë (max 1/sektor)`);
        continue;
      }
      usedSectors.add(c.sector);
      c.slot = 'OPEN_OK';
      openSlots--;
    }

    const bllokuar = candidates
      .filter((c) => c.status !== 'HYRJE_TANI' && c.status !== 'PRIT_KONFIRMIM')
      .sort(rank);
    const prit = candidates.filter((c) => c.status === 'PRIT_KONFIRMIM').sort(rank);

    const counts = {
      hyrjeTani: hyrje.length,
      pritKonfirmim: prit.length,
      bllokuar8k: candidates.filter((c) => c.status === 'BLLOKUAR_8K').length,
      bllokuarSpyCrash: candidates.filter((c) => c.status === 'BLLOKUAR_SPY_CRASH').length,
      invaliduarLowIRi: candidates.filter((c) => c.status === 'INVALIDUAR_LOW_I_RI').length,
      konfirmimPlotfullyem: candidates.filter((c) => c.status === 'KONFIRMIM_PLOTFULLYEM').length,
      paSinjal: UNIVERSE.length - inZone.size + (inZone.size - candidates.length),
    };

    const response: RevScanResponse = {
      scannedAt: new Date().toISOString(),
      durationSec: Math.round((Date.now() - t0) / 100) / 10,
      hypothesis: {
        version: REV_HYPOTHESIS_VERSION,
        name: H.name,
        frozen: frozenInfo(),
        noteSeparation:
          'REV v1 është familje e veçantë nga CTC v2 (tab-i IBKR). S’e prek funnel-in e saj; metrikat nuk përzihen (spec Seksioni 9).',
      },
      regime: {
        spyLastMovePct: Math.round(spyLastMove * 100) / 100,
        spyCrash,
        spyRet3Pct: Math.round(spyRet3 * 100) / 100,
        note: spyCrash
          ? 'CIRCUIT BREAKER aktiv — SPY ka rënë >3% ditën e fundit; pa hyrje REV (korrelacionet shkojnë drejt 1)'
          : 'Regjimi i lejuar — SPY pa crash sistemik',
      },
      universe: { total: UNIVERSE.length, withData: seriesMap.size, inZone: inZone.size },
      counts,
      hyrjeTani: hyrje,
      pritKonfirmim: prit,
      bllokuar,
    };

    return NextResponse.json(response, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Gabim i panjohur';
    console.error('[REV-SCAN] Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ── 8-K real nga EDGAR (vetëm për kandidatët me sinjal — jo për universin) ──
async function fetch8kSafe(sym: string) {
  try {
    const res = await fetchRecentFilings(sym, ['8-K'], 30);
    if (!res) return [];
    return res.filings.map((f) => ({
      filingDate: f.filingDate,
      items: (f.items ?? '').split(',').map((x) => x.trim()).filter(Boolean),
    }));
  } catch {
    return [];
  }
}
