// ═══════════════════════════════════════════════════════════════
// Task 27 — IBKR VALIDATION / universe-history.ts
// Universe pa (sa e mundshme) SURVIVORSHIP BIAS:
//   • as-of lists: kush ishte i tregtueshëm në datën e sinjalit
//   • DELISTED map: emra që u zhduken (blerje/falimentim/delistim)
//     dhe duhet të mbeten jashtë pas datës së zhdukjes
//   • survivorship report: sa e universit tonë janë "fituesit e sotëm"
// ═══════════════════════════════════════════════════════════════

/**
 * Emra realë të zhdukur nga tregu (blerje/të delistuar) që në të kaluarën
 * ishin emra të mëdhenj likuidë. Pas datës së fundit, backtest-i nuk
 * mund të hapë pozicione mbi ta — ashtu si një sistem live.
 * (Kjo zvogëlon bias-in, por pa burim CRSP/një depo delistimesh të plotë,
 *  mbetet një listë e njohur — shiko survivorshipReport().)
 */
export const DELISTED: Record<string, { lastTradingDate: string; reason: string }> = {
  ATVI:  { lastTradingDate: '2023-10-12', reason: 'Blerë nga Microsoft (Activision Blizzard)' },
  XLNX:  { lastTradingDate: '2022-02-11', reason: 'Blerë nga AMD (Xilinx)' },
  PXD:   { lastTradingDate: '2024-05-02', reason: 'Blerë nga ExxonMobil (Pioneer Natural Resources)' },
  FLIR:  { lastTradingDate: '2021-05-13', reason: 'Blerë nga Teledyne (FLIR Systems)' },
  PKI:   { lastTradingDate: '2022-05-13', reason: 'Blerë nga Agilent (PerkinElmer)' },
  NLOK:  { lastTradingDate: '2022-11-01', reason: 'Blerë nga Avast/NortonLifeEngine (Gen Digital)' },
  SPLK:  { lastTradingDate: '2023-03-20', reason: 'Blerë nga Cisco (Splunk)' },
  SHLS:  { lastTradingDate: '2025-04-30', reason: 'Delistuar (SolarEdge i lidhur)' },
  SIVB:  { lastTradingDate: '2023-03-09', reason: 'Kolaps — Silicon Valley Bank (kontroll regulator)' },
  FRC:   { lastTradingDate: '2023-05-01', reason: 'Kolaps — First Republic (shitet te JPM)' },
  CS:    { lastTradingDate: '2023-03-17', reason: 'Kolaps — Credit Suisse (shetje me UBS)' },
};

/** Datë e sigurt për krahasim (YYYY-MM-DD) */
function dateKey(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getTime();
}

/** A ishte emri i tregtueshëm në datën e sinjalit? */
export function tradableAsOf(symbol: string, signalDate: string): boolean {
  const d = DELISTED[symbol];
  if (!d) return true;
  return dateKey(signalDate) <= dateKey(d.lastTradingDate);
}

/**
 * Filtron universe-in sipas periudhës së backtest-it:
 *  • heq të delistuar para fillimit të periudhës (as-of start)
 *  • heq emrat pa asnjë bar brenda periudhës (të pashfrytëzueshëm)
 *  • IPO-t e vona NUK hiqen këtu — motori i backtest-it i përjashton
 *    natyrshëm derisa të kenë ≥ 210 bare historiku (idx >= 210).
 */
export function filterUniverseAsOf(
  universe: string[],
  periodStart: string,
  periodEnd: string,
  firstBarDate: Record<string, string>,
): { kept: string[]; removedDelisted: string[]; removedNoHistory: string[] } {
  const startT = dateKey(periodStart);
  const endT = dateKey(periodEnd);
  const kept: string[] = [];
  const removedDelisted: string[] = [];
  const removedNoHistory: string[] = [];

  for (const s of universe) {
    if (!tradableAsOf(s, periodStart)) {
      removedDelisted.push(s);
      continue;
    }
    const start = firstBarDate[s];
    if (!start || dateKey(start) > endT) {
      // Emri s'ka asnjë bar brenda periudhës
      removedNoHistory.push(s);
      continue;
    }
    void startT;
    kept.push(s);
  }
  return { kept, removedDelisted, removedNoHistory };
}

export interface SurvivorshipReport {
  universeSize: number;
  knownDelistedExcluded: number;
  /** % e universit që ekziston ende sot — mbijetuesit */
  survivorPct: number;
  /** Ulje e besueshmërisë: heq ~X% nga performanca e raportuar */
  recommendedHaircutPct: number;
  note: string;
}

/**
 * Universe-i ynë vjen nga lista e sotme — kjo do të thotë se në backtest
 * testimi bëhet kryesisht mbi MBIJETUESIT (dhe disa të delistuar të njohur
 * që i përjashtojmë në datën e duhur). Rekomandojmë një "haircut" mbi
 * rezultatet si korrekt konservativ.
 */
export function survivorshipReport(universeSize: number, excludedCount: number): SurvivorshipReport {
  const survivorPct = universeSize > 0 ? ((universeSize - excludedCount) / universeSize) * 100 : 100;
  // Heuristic: ~çdo 1% mbijetese shtesë fryn resultatin; haircut = 15-25% të fitimit
  const haircut = survivorPct > 95 ? 20 : survivorPct > 85 ? 15 : 10;
  return {
    universeSize,
    knownDelistedExcluded: excludedCount,
    survivorPct: Math.round(survivorPct * 10) / 10,
    recommendedHaircutPct: haircut,
    note:
      'Universe-i vjen nga lista e sotme e 400 emrave më likuidë — pjesa më e madhe janë mbijetues. ' +
      `Janë përjashtuar ${excludedCount} emra të delistuar të njohur sipas datës së zhdukjes. ` +
      'Pa depo të dhënash delistimesh të plotë (CRSP), rezultatet duhen lexuar me haircut-in e rekomanduar.',
  };
}
