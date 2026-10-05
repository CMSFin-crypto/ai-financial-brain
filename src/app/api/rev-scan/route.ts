import { NextResponse } from 'next/server';
import { fetchHistoricalData } from '@/lib/alpha-vantage';
import { getScanUniverse } from '@/lib/scanner/universe-core';
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
  revEdgarEligibilityCheck,
  revUniverseComposition,
  EDGAR_ELIGIBILITY_FORMS,
  REV_MIDCAP_TIER,
  revPositionSize,
  type RevBar,
  type RevFiling8k,
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

const UNIVERSE = [...new Set([...getScanUniverse(400), ...REV_MIDCAP_TIER])]; // pool i dedikuar REV (amendimi 1.1)

export interface RevScanCandidate {
  symbol: string;
  companyName: string;
  sector: string;
  status: RevScanStatus;
  price: number;
  ret3Pct: number;
  rsi2: number;
  spyRet3Pct: number;
  sectorRet3Pct?: number; // mesatarja e sektorit 3d (amendimi 1.1) — undefined nëse peers të pamjaftueshëm
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
  edgarGate?: { eligible: boolean; reason?: string; detail: string }; // amendimi 1.1
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
  universe: { total: number; withData: number; inZone: number; midcapSharePct?: number };
  counts: {
    hyrjeTani: number;
    pritKonfirmim: number;
    bllokuar8k: number;
    bllokuarSektor: number; // amendimi 1.1
    exkluduarEdgar: number; // amendimi 1.1
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
    liquidityZone: `${Math.round(H.liquidityPercentileLow * 100)}-${Math.round(H.liquidityPercentileHigh * 100)} percentile mbi pool-in dedikuar REV (baza + shtresa mid-cap)`,
    midcapLayer: H.requireMidcapLayer
      ? `shtresa mid-cap $${(H.midcapMktCapMin / 1e9).toFixed(0)}-${(H.midcapMktCapMax / 1e9).toFixed(0)}B; zona 20-80p duhet ≥${H.revPoolMidcapMinSharePct}% mid-cap`
      : 'jo-aktive',
    minDollarVolume: `$${(H.minDollarVolumeFloor / 1e6).toFixed(0)}M/ditë`,
    minPrice: H.minPrice,
    dropOrRsi2: `ret3d ≤ ${H.min3DayCumReturnPct}% OSE RSI(2) < ${H.rsi2Oversold}`,
    idiosyncraticVsSpy: H.idiosyncraticVsSpyRequired,
    sectorRelative: H.sectorRelativeRequired
      ? `dukshëm negative edhe vs sektorin (≥${H.minSectorPeers} peers; nënperformim > ${H.sectorRelativeUnderperformancePct}pp)`
      : false,
    edgarGate: H.excludeIncompleteEdgarCoverage
      ? `FAIL-CLOSED: vetëm US-domestic filers; pa timeline EDGAR ${H.edgarCoverageProbeDays}d → EKSKLUZOHET (kusht sigurie)`
      : 'pasiv',
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

    // Përbërja e zonës (amendimi 1.1) — sa % e zonës është mid-cap
    const zoneComposition = revUniverseComposition([...inZone].map((s) => ({ symbol: s })));

    // ── Mesatarja sektoriale 3-ditore (amendimi 1.1) ──
    // Equal-weight ret3 i sektorit PA veten, mbi simbolet me të dhëna.
    // Pa ≥minSectorPeers peers → null → fail-closed për atë emër.
    const ret3OnDate = (bars: RevBar[], idx: number): number =>
      idx >= 3 ? (bars[idx].close / bars[idx - 3].close - 1) * 100 : NaN;
    const sectorRet3Memo = new Map<string, number | null>();
    const sectorRet3At = (date: string, sector: string, excludeSymbol: string): number | null => {
      const key = `${date}|${sector}|${excludeSymbol}`;
      const memo = sectorRet3Memo.get(key);
      if (memo !== undefined) return memo;
      let sum = 0;
      let cnt = 0;
      for (const [sym, peerBars] of seriesMap) {
        if (sym === excludeSymbol || revSectorOf(sym) !== sector) continue;
        const pi = peerBars.findIndex((b) => b.date === date);
        if (pi < 3) continue;
        const r3 = ret3OnDate(peerBars, pi);
        if (Number.isFinite(r3)) {
          sum += r3;
          cnt++;
        }
      }
      const val = cnt >= H.minSectorPeers ? sum / cnt : null;
      sectorRet3Memo.set(key, val);
      return val;
    };

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
          // Kontrolli sektorik i DJE-së bëhet më poshtë (BLLOKUAR_SEKTOR me
          // secRet3Y) — NaN këtu = neutrale për revSignalCheck (si rruga e sotme).
          sectorRet3Pct: NaN,
          spyDailyMovePct: NaN, // circuit breaker i vlerësuar më poshtë nga regjimi global
        });
        const dropYesterday = sigY.dropTriggered && ret3Y < spyRet3Y;
        if (dropYesterday) {
          // ── EDGAR fail-closed (amendimi 1.1 — kusht SIGURIE) ──
          // Pa timeline EDGAR të verifikueshme → EKSKLUZOHET, jo "event-neutral":
          // gate-i 8-K do të dështonte në heshtje pikërisht kur nevojitet më shumë.
          const filings = await fetchRevEdgarFilings(sym);
          const elig = revEdgarEligibilityCheck(filings, bars[sigI].date);
          if (!elig.eligible) {
            const cand = mkCandidate(
              'EXKLUDUAR_EDGAR',
              sigI,
              i,
              [`Sinjal reversal më ${bars[sigI].date} (ret3 ${ret3Y.toFixed(1)}%)`],
              [],
            );
            cand.edgarGate = { eligible: false, reason: elig.reason, detail: elig.detail };
            cand.warnings.push(elig.detail);
            candidates.push(cand);
            continue;
          }

          // ── Dobësi sektoriale (amendimi 1.1) ──
          // Rënia duhet dukshëm negative edhe kundrejt sektorit — shock-i i
          // gjithë grupit s'kapërcehet si "idiosinkratik" vetëm se SPY qëndron.
          const secRet3Y = sectorRet3At(bars[sigI].date, revSectorOf(sym), sym);
          const sectorOk =
            secRet3Y !== null &&
            ret3Y - secRet3Y < -Math.abs(H.sectorRelativeUnderperformancePct);
          if (!sectorOk) {
            const cand = mkCandidate(
              'BLLOKUAR_SEKTOR',
              sigI,
              i,
              [`Sinjal reversal më ${bars[sigI].date} (ret3 ${ret3Y.toFixed(1)}%)`],
              [
                secRet3Y === null
                  ? `Pa ≥${H.minSectorPeers} peers sektorikë për verifikim — fail-closed`
                  : `Rënia ndjek sektorin (${revSectorOf(sym)}: ${secRet3Y.toFixed(1)}%) — shock grupi, jo dobësi specifike`,
              ],
            );
            if (secRet3Y !== null) cand.sectorRet3Pct = Math.round(secRet3Y * 100) / 100;
            candidates.push(cand);
            continue;
          }

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
      const secRet3T = sectorRet3At(bars[i].date, revSectorOf(sym), sym);
      const sigT = revSignalCheck({
        ret3Pct: ret3T,
        rsi2: rsi2Arr[i],
        spyRet3Pct: spyRet3Here,
        sectorRet3Pct: secRet3T === null ? NaN : secRet3T,
        spyDailyMovePct: spyLastMove,
      });
      if (sigT.dropTriggered && sigT.idiosyncratic) {
        if (sigT.spyCrash) {
          candidates.push(
            mkCandidate('BLLOKUAR_SPY_CRASH', i, null, [`Rënie 3-ditore ${ret3T.toFixed(1)}% sot`], [
              'SPY sot ≤ -3% — circuit breaker',
            ]),
          );
        } else if (!sigT.sectorRelative) {
          const cand = mkCandidate('BLLOKUAR_SEKTOR', i, null, [`Rënie 3-ditore ${ret3T.toFixed(1)}% sot`], [
            secRet3T === null
              ? `Pa ≥${H.minSectorPeers} peers sektorikë për verifikim — fail-closed`
              : `Rënia ndjek sektorin (${revSectorOf(sym)}: ${secRet3T.toFixed(1)}%) — shock grupi, jo dobësi specifike`,
          ]);
          if (secRet3T !== null) cand.sectorRet3Pct = Math.round(secRet3T * 100) / 100;
          candidates.push(cand);
        } else {
          // EDGAR fail-closed (amendimi 1.1) — para se ta shpallësh kandidatin
          const filings = await fetchRevEdgarFilings(sym);
          const elig = revEdgarEligibilityCheck(filings, bars[i].date);
          if (!elig.eligible) {
            const cand = mkCandidate('EXKLUDUAR_EDGAR', i, null, [`Rënie 3-ditore ${ret3T.toFixed(1)}% sot`], []);
            cand.edgarGate = { eligible: false, reason: elig.reason, detail: elig.detail };
            cand.warnings.push(elig.detail);
            candidates.push(cand);
          } else {
            const gate = revHasRecentMaterial8k(filings, today);
            if (gate.blocked) {
              candidates.push(
                mkCandidate('BLLOKUAR_8K', i, null, [`Rënie 3-ditore ${ret3T.toFixed(1)}% sot`], [
                  `8-K material brenda ${H.blockIfReal8kWithinDays} ditëve`,
                ], { blocked: true, lastFilingDate: gate.lastFiling?.filingDate, items: gate.lastFiling?.items.join(', ') }),
              );
            } else {
              const trig = ret3T <= H.min3DayCumReturnPct ? `ret3d ${ret3T.toFixed(1)}%` : `RSI(2) ${(rsi2Arr[i] ?? 0).toFixed(0)}`;
              const cand = mkCandidate('PRIT_KONFIRMIM', i, null, [
                `Rënie e konsiderueshme sot: ${trig}`,
                `Idiosinkratike: ${ret3T.toFixed(1)}% vs SPY ${spyRet3Here.toFixed(1)}% DHE vs sektor ${secRet3T!.toFixed(1)}%`,
              ], ['PRIT konfirmimin nesër: green candle / higher low + volum në rënie']);
              cand.sectorRet3Pct = Math.round(secRet3T! * 100) / 100;
              candidates.push(cand);
            }
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
      bllokuarSektor: candidates.filter((c) => c.status === 'BLLOKUAR_SEKTOR').length,
      exkluduarEdgar: candidates.filter((c) => c.status === 'EXKLUDUAR_EDGAR').length,
      bllokuarSpyCrash: candidates.filter((c) => c.status === 'BLLOKUAR_SPY_CRASH').length,
      invaliduarLowIRi: candidates.filter((c) => c.status === 'INVALIDUAR_LOW_I_RI').length,
      konfirmimPlotfullyem: candidates.filter((c) => c.status === 'KONFIRMIM_PLOTFULLYEM').length,
      paSinjal: UNIVERSE.length - inZone.size + (inZone.size - candidates.length),
    };

    // ── DITARI I SINJALEVE (Gjurmuesi) — JOB A (REV) piggyback ──
    // Regjistro çdo sinjal të konfirmuar (HYRJE_TANI): hyrja reale = close
    // e ditës së konfirmimit. Flag-u pa_slot vjen nga slot-et e llogaritura
    // më sipër (max 3 pozicione, 1/sektor). Non-blocking; idempotent.
    try {
      const { ingestSignalJournalREV, currentEtSessionDate } = await import('@/lib/signal-journal');
      const sj = await ingestSignalJournalREV({
        candidates: hyrje.map((c) => ({
          symbol: c.symbol,
          sector: c.sector,
          status: c.status,
          signalDate: c.signalDate,
          price: c.price,
          stop: c.stop,
          target: c.target,
          slot: c.slot,
          warnings: c.warnings,
        })),
        sessionDate: currentEtSessionDate(),
        spyBars: (spyBars ?? []).map((b) => ({ date: b.date, close: b.close })),
      });
      console.log(
        `[REV] Ditari Sinjaleve (REV): ${sj.saved} të reja, ${sj.updated} rifreskime${sj.error ? ` — ERR: ${sj.error}` : ''}`
      );
    } catch (e: any) {
      console.error('[REV] Ditari Sinjaleve (REV) failed (non-blocking):', e?.message || e);
    }

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
      universe: {
        total: UNIVERSE.length,
        withData: seriesMap.size,
        inZone: inZone.size,
        midcapSharePct: zoneComposition.midcapSharePct,
      },
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

// ── EDGAR (amendimi 1.1) — formularë të gjerë për eligjibilitet + gate 8-K ──
// Vetëm për kandidatët me sinjal — jo për gjithë universin (kursim API).
// FAIL-CLOSED: nëse EDGAR s'përgjigjet, lista bosh → EXKLUDUAR_EDGAR.
async function fetchRevEdgarFilings(sym: string): Promise<RevFiling8k[]> {
  try {
    const res = await fetchRecentFilings(sym, EDGAR_ELIGIBILITY_FORMS, 120);
    if (!res) return [];
    return res.filings.map((f) => ({
      filingDate: f.filingDate,
      items: (f.items ?? '').split(',').map((x) => x.trim()).filter(Boolean),
      form: f.form,
    }));
  } catch {
    return []; // fail-closed: pa të dhëna → jo-eligible
  }
}
