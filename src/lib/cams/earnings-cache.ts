// ═══════════════════════════════════════════════════════════════
// EARNINGS CACHE — Task 22
// Raportet tremujore (EPS) ruhen në Postgres që skanimet e
// përsëritura CAMS të mos harxhojnë kuotën ditore të Alpha
// Vantage (free tier: 25 kërkesa/ditë).
//
// Logjika e freskisë (të dhënat janë tremujore):
//   1. Gjithçka e marrë < 7 ditë më parë → ripërdor direkt.
//   2. Nëse raportimi i fundit i njohur është < 55 ditë i vjetër
//      → tremujori i ri s'pritet ende → ripërdor.
//   3. Përndryshe → 1 kërkesë e vetme në Alpha Vantage dhe
//      rifreskohet cache-i për javët në vijim.
// Efektivisht: ~1 kërkesë/simbol deri sa të dalë tremujori i ri.
//
// Ndezja pa DATABASE_URL ose me gabim DB → bie pa dëmtim te
// fetchEarnings (sjellja e vjetër, cache 4h në memorie).
// ═══════════════════════════════════════════════════════════════

import { prisma, isDbAvailable } from '@/lib/prisma';
import { fetchEarnings, type EarningsReport } from '@/lib/pead-engine';

const DAY_MS = 86_400_000;
const FRESH_DAYS_AFTER_FETCH = 7;    // ripërdor gjithçka të marrë <7 ditë më parë
const FRESH_DAYS_AFTER_REPORT = 55;  // tremujori i ri s'pritet para ~90 ditësh nga i funditi

export interface CachedEarnings {
  reports: EarningsReport[];
  fromCache: boolean;
}

/** Cache-i është i freskët? Shih rregullat 1-2 më lart. (i eksportuar për teste) */
export function isFresh(reports: EarningsReport[], fetchedAt: Date): boolean {
  const now = Date.now();
  if (now - fetchedAt.getTime() < FRESH_DAYS_AFTER_FETCH * DAY_MS) return true;
  const dates = reports
    .map((r) => (r.reportedDate ? Date.parse(r.reportedDate) : 0))
    .filter((t) => !isNaN(t) && t > 0);
  if (dates.length === 0) return false;
  const latest = Math.max(...dates);
  return now - latest < FRESH_DAYS_AFTER_REPORT * DAY_MS;
}

/**
 * fetchEarnings me cache në DB. Ndryshimi i vetëm nga fetchEarnings:
 * kërkesat e përsëritura shërbehen nga Postgres (0 kuotë AV).
 */
export async function fetchEarningsCached(symbol: string): Promise<CachedEarnings> {
  const sym = symbol.toUpperCase();

  // 1) Provo cache-in në DB
  if (isDbAvailable()) {
    try {
      const row = await prisma.earningsCache.findUnique({ where: { symbol: sym } });
      if (row) {
        const reports = (row.reports as unknown as EarningsReport[]) ?? [];
        if (reports.length > 0 && isFresh(reports, row.fetchedAt)) {
          return { reports, fromCache: true };
        }
      }
    } catch {
      /* tolerant — vazhdo te Alpha Vantage */
    }
  }

  // 2) Miss / i vjetër → Alpha Vantage (ka edhe cache 4h në memorie brenda instancës)
  const reports = await fetchEarnings(sym);

  // 3) Ruaj vetëm rezultate reale (zbrazëtirat s'fshihen — mund të jetë rate-limit,
  //    kështu skanimi tjetër provon përsëri pa u bllokuar me të dhëna të vjetra)
  if (reports.length > 0 && isDbAvailable()) {
    const payload = reports.slice(0, 8);
    try {
      await prisma.earningsCache.upsert({
        where: { symbol: sym },
        create: { symbol: sym, reports: payload as any },
        update: { reports: payload as any, fetchedAt: new Date() },
      });
    } catch {
      /* tolerant */
    }
  }

  return { reports, fromCache: false };
}
