// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION / execution-model.ts
// Simulim i ekzekutimit realist — si funksionon një bracket order
// në IBKR në kushte reale tregu:
//   • sinjali në MBYLLJE të ditës t → hyrja në qirinë PASUES (t+1)
//   • gap risk: open përtej stopit → ekzekutohet në open (jo në stop)
//   • nëse stop dhe target preken në të NJËJTIN qiri → supozim KONSERVATIV (stop i pari)
//   • urdhra që nuk mbushen: open(t+1) jashtë zonës së hyrjes → anulohet
//   • kufij pozicionesh dhe sektorësh
// ═══════════════════════════════════════════════════════════════
import { HistoricalDataPoint } from '@/lib/alpha-vantage';

export interface ExecutionConfig {
  /** Max pozicione të hapura njëkohësisht */
  maxOpenPositions: number;
  /** Max pozicione për sektor */
  maxPerSector: number;
  /** Ditët maksimale të mbajtjes (kohë-stop) */
  maxHoldDays: number;
  /** Rreziku si % e kapitalit për pozicion (live gate përfundimtar: 0.25%) */
  riskPctPerTrade: number;
  /** Kapitali fillestar i simulimit */
  accountEquity: number;
  /** Nëse open(t+1) > entry*(1+gapLimit) → mos e ndjek (urdhri nuk mbushet) */
  maxEntryGapPct: number;
}

export const DEFAULT_EXECUTION: ExecutionConfig = {
  maxOpenPositions: 5,
  maxPerSector: 2,
  maxHoldDays: 20,
  riskPctPerTrade: 1.0,
  accountEquity: 25000,
  maxEntryGapPct: 3.0,
};

export type ExitReason =
  | 'STOP'          // stop-loss i goditur brenda ditës
  | 'TARGET'        // take-profit i goditur brenda ditës
  | 'TIME_STOP'     // maxHoldDays — dalje në close
  | 'GAP_STOP'      // hapur NËN stop — ekzekutim në open (humbje më e madhe)
  | 'GAP_TARGET';   // hapur MBI target — ekzekutim në open (fitim më i madh)

export interface FillResult {
  filled: boolean;
  entryPrice: number;
  /** arsyeja pse nuk u mbush (për statistika të urdhërave të pamjaftueshëm) */
  rejectReason?: 'GAP_TOO_BIG' | 'OPENED_BEYOND_TARGET' | 'OPENED_BELOW_STOP' | 'NO_CASH' | 'POSITION_LIMIT' | 'SECTOR_LIMIT';
}

/**
 * Përcakton nëse urdhri i hyrjes mbushet në qirinë pasues dhe me ç'mim.
 * PULLBACK (limit @ entry): mbushet nëse low(t+1) <= entry; nëse open < entry,
 * ekzekutohet në open (çmim më i mirë). Nëse open > entry*(1+gapLimit) → refuzohet.
 * BREAKOUT (stop @ entry): mbushet nëse high(t+1) >= entry; nëse open > entry,
 * ekzekutohet në open (gap keq — paguan më shtrenjtë).
 */
export function checkEntryFill(params: {
  bar: HistoricalDataPoint;          // qiri pasues (t+1)
  orderPrice: number;                // niveli i hyrjes nga sinjali
  orderType: 'LIMIT' | 'STOP';       // PULLBACK=LIMIT, BREAKOUT=STOP
  maxEntryGapPct: number;
}): FillResult {
  const { bar, orderPrice, orderType, maxEntryGapPct } = params;
  if (orderPrice <= 0) return { filled: false, entryPrice: 0, rejectReason: 'GAP_TOO_BIG' };

  if (orderType === 'LIMIT') {
    // Pullback buy-limit: urdhri nën çmimin e tregut
    if (bar.open <= orderPrice) {
      // Hapje nën nivelin e limitit → mbushje në open (çmim më i mirë)
      return { filled: true, entryPrice: bar.open };
    }
    if (bar.low <= orderPrice) {
      // Ra gjatë ditës në nivelin tonë → mbushje në limit
      return { filled: true, entryPrice: orderPrice };
    }
    // Nuk ra kurrë → urdhri nuk u mbush
    return { filled: false, entryPrice: 0, rejectReason: 'GAP_TOO_BIG' };
  }

  // BREAKOUT buy-stop: urdhri mbi çmimin e tregut
  const gapPct = ((bar.open - orderPrice) / orderPrice) * 100;
  if (bar.open >= orderPrice) {
    // Hapje MBI nivelin e stop-it → gap. Nëse gap shumë i madh, mos e ndjek.
    if (gapPct > maxEntryGapPct) return { filled: false, entryPrice: 0, rejectReason: 'GAP_TOO_BIG' };
    return { filled: true, entryPrice: bar.open };
  }
  if (bar.high >= orderPrice) {
    // U ngjit gjatë ditës në nivelin tonë → mbushje në stop
    return { filled: true, entryPrice: orderPrice };
  }
  return { filled: false, entryPrice: 0, rejectReason: 'GAP_TOO_BIG' };
}

/**
 * Verifikon një pozicion të hapur kundër një qiri.
 * Supozimi konservativ: nëse low <= stop DHE high >= target në të njëjtin qiri → STOP.
 * Gap: open jashtë zonës → ekzekutim në open.
 */
export function checkPositionBar(params: {
  bar: HistoricalDataPoint;
  entry: number;
  stop: number;
  target: number;
  holdDaysSoFar: number;
  maxHoldDays: number;
}): { exitPrice: number; exitReason: ExitReason; exitDate: string } | null {
  const { bar, entry, stop, target, holdDaysSoFar, maxHoldDays } = params;

  // 1) Gap në hapje — jashtë kontrollit të bracket-it
  if (bar.open <= stop) {
    // Hapur nën stop: ekzekutohet në open (gjithmonë më keq se stop-i)
    return { exitPrice: bar.open, exitReason: 'GAP_STOP', exitDate: bar.date };
  }
  if (bar.open >= target) {
    // Hapur mbi target: fitim i plotë në open
    return { exitPrice: bar.open, exitReason: 'GAP_TARGET', exitDate: bar.date };
  }

  // 2) Të dyja nivelet brenda intervalit të ditës → KONSERVATIV: stop i pari
  if (bar.low <= stop && bar.high >= target) {
    return { exitPrice: stop, exitReason: 'STOP', exitDate: bar.date };
  }

  // 3) Vetëm stop-i u prek
  if (bar.low <= stop) {
    return { exitPrice: stop, exitReason: 'STOP', exitDate: bar.date };
  }

  // 4) Vetëm targeti u prek
  if (bar.high >= target) {
    return { exitPrice: target, exitReason: 'TARGET', exitDate: bar.date };
  }

  // 5) Kohë-stop
  if (holdDaysSoFar >= maxHoldDays) {
    return { exitPrice: bar.close, exitReason: 'TIME_STOP', exitDate: bar.date };
  }

  return null; // pozicioni vazhdon
}

/** Sasia e aksioneve nga buxheti i rrezikut — si calcPositionSize i scanner-it */
export function calcShares(params: {
  entry: number;
  stop: number;
  riskPct: number;
  equity: number;
}): { shares: number; positionValue: number; riskDollars: number } {
  const riskDollars = params.equity * (params.riskPct / 100);
  const perShare = params.entry - params.stop;
  if (perShare <= 0) return { shares: 0, positionValue: 0, riskDollars: 0 };
  const shares = Math.floor(riskDollars / perShare);
  return {
    shares,
    positionValue: shares * params.entry,
    riskDollars: shares * perShare,
  };
}
