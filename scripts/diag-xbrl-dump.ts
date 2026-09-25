// Debug: strukturat XBRL të një simboli (konceptet, numrat e fakteve, durimet)
// Ekzekuto: npx tsx scripts/diag-xbrl-dump.ts XOM
import { resolveCIK, fetchCompanyFacts } from '../src/lib/fundamentals/point-in-time';

async function main() {
  const ticker = (process.argv[2] || 'XOM').toUpperCase();
  const cik = await resolveCIK(ticker);
  console.log(`${ticker} → CIK ${cik}`);
  if (!cik) return;
  const raw = await fetchCompanyFacts(cik, { noCache: true });
  if (!raw) { console.log('Pa companyfacts'); return; }
  const gaap = raw.facts?.['us-gaap'] || {};
  console.log(`Koncepte us-gaap: ${Object.keys(gaap).length}\n`);
  const interesting = [
    'Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax',
    'NetIncomeLoss', 'EarningsPerShareDiluted',
    'StockholdersEquity', 'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
    'LongTermDebt', 'LongTermDebtNoncurrent',
    'NetCashProvidedByUsedInOperatingActivities', 'NetCashProvidedByUsedInOperatingActivitiesContinuingOperations',
    'PaymentsToAcquirePropertyPlantAndEquipment', 'PaymentsToAcquireProductiveAssets',
  ];
  for (const c of interesting) {
    const node = gaap[c];
    if (!node) { console.log(`✗ ${c}: ABSENT`); continue; }
    const units = node.units || {};
    const counts: string[] = [];
    for (const [unit, arr] of Object.entries(units)) {
      if (!Array.isArray(arr)) continue;
      const withStart = arr.filter((u: any) => u.start !== undefined).length;
      const inst = arr.length - withStart;
      // mostra e durimeve të 5 fakteve të fundit
      const dates = (arr as any[]).slice(-6).map((u: any) => {
        if (!u.start || !u.end) return 'instant';
        const d = Math.round(Math.abs(new Date(u.end).getTime() - new Date(u.start).getTime()) / 86400000);
        return d + 'd';
      });
      const filedMax = (arr as any[]).reduce((m: string, u: any) => (String(u.filed || '0') > m ? String(u.filed || '0') : m), '0');
      const endMax = (arr as any[]).reduce((m: string, u: any) => (String(u.end || '0') > m ? String(u.end || '0') : m), '0');
      counts.push(`${unit}: ${arr.length} fakte (${withStart} me start / ${inst} instant) · durimet e fundit: ${dates.join(',')} · filed max: ${filedMax} · end max: ${endMax}`);
    }
    console.log(`✓ ${c}:`);
    for (const cline of counts) console.log(`    ${cline}`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
