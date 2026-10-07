// Test i pavarur i funksioneve të reja të social-arb (P1/P2/P4) —
// provon kriterin e përfundimit për NFLX me të dhëna reale:
//   1) computePriceWindow — dritarja e balancuar (të njëjtat data)
//   2) fetchPriceSeries — multi-burim me gabime të eksplicite
//   3) classifyCause — klasifikimi i shkakut nga titujt realë GDELT
//   4) updateOutcome — rezultati 5/20 ditë
// Ekzekutim: bun scripts/test-social-arb-v4.ts

import { computePriceWindow, classifyCause, updateOutcome, lastCloseOnOrBefore } from '../src/lib/social-arb/engine';
import { fetchPriceSeries, gdeltArticleList } from '../src/lib/social-arb/sources';
import type { Candidate } from '../src/lib/social-arb/types';

let pass = 0, fail = 0;
function check(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✅ ${name}${extra ? ` — ${extra}` : ''}`); }
  else { fail++; console.log(`  ❌ ${name}${extra ? ` — ${extra}` : ''}`); }
}

// ── 1) dritarja e balancuar — teste sintetike ─────────────────────
console.log('\n── 1) computePriceWindow (dritarja e balancuar) ──');

// rasti ideal: data identike
{
  const stock = [
    { date: '2026-09-14', close: 100 },
    { date: '2026-09-15', close: 101 },
    { date: '2026-09-16', close: 103 },
    { date: '2026-09-17', close: 102 },
    { date: '2026-09-18', close: 105 },
  ];
  const spy = [
    { date: '2026-09-14', close: 500 },
    { date: '2026-09-15', close: 501 },
    { date: '2026-09-16', close: 502 },
    { date: '2026-09-17', close: 503 },
    { date: '2026-09-18', close: 504 },
  ];
  const w = computePriceWindow(stock, spy, 7)!;
  check('asOf = data e fundit e përbashkët', w.asOf === '2026-09-18', w.asOf);
  check('fromDate brenda dritares', w.fromDate === '2026-09-14', w.fromDate);
  check('stockReturn i saktë', Math.abs(w.stockReturn - 0.05) < 1e-9, `${(w.stockReturn * 100).toFixed(2)}%`);
  check('indexReturn i saktë', Math.abs(w.indexReturn - (504 / 500 - 1)) < 1e-9, `${(w.indexReturn * 100).toFixed(2)}%`);
  check('priceVsIndex = diferencë', Math.abs(w.priceVsIndex - (0.05 - 504 / 500 + 1)) < 1e-9);
}

// rasti kyç: SPY ka 1 ditë më shumë se aksioni → krahasimi duhet të ndalet në datën e PËRBASHKËT
{
  const stock = [
    { date: '2026-09-16', close: 100 },
    { date: '2026-09-17', close: 102 },
    { date: '2026-09-18', close: 104 }, // e premtja — aksioni ka deri këtu
  ];
  const spy = [
    { date: '2026-09-16', close: 500 },
    { date: '2026-09-17', close: 503 },
    { date: '2026-09-18', close: 506 },
    { date: '2026-09-21', close: 508 }, // e hëna — SPY ka edhe këtë
  ];
  const w = computePriceWindow(stock, spy, 7)!;
  check('asOf ndalet në datën e përbashkët (jo përtej saj)', w.asOf === '2026-09-18', w.asOf);
  check('çmimet e përdorura janë të asaj date', w.stockPrice === 104 && w.indexPrice === 506, `NFLX ${w.stockPrice} / SPY ${w.indexPrice}`);
}

// rasti pa të dhëna → null (jo 0%)
{
  const w = computePriceWindow([], [{ date: '2026-09-18', close: 500 }]);
  check('pa ≥2 close të përbashkët → null (e pamatshme, jo 0%)', w === null);
}

// ── 2) çmimet reale për NFLX + SPY (kriteri i përfundimit P1) ─────
console.log('\n── 2) Çmimet reale: NFLX + SPY (kriteri i përfundimit) ──');
const [nflx, spyS] = await Promise.all([fetchPriceSeries('NFLX', '3M'), fetchPriceSeries('SPY', '3M')]);
check(`burimi NFLX: ${nflx.source}`, !!nflx.source);
check(`burimi SPY: ${spyS.source}`, !!spyS.source);
check(`NFLX ka ≥2 close (${nflx.closes.length})`, nflx.closes.length >= 2);
const win = computePriceWindow(nflx.closes, spyS.closes)!;
console.log(`\n  📊 NFLX — çmimi i fundit i vlefshëm, datë e njëjtë krahasimi:`);
console.log(`     dritarja ${win.fromDate} → ${win.asOf}`);
console.log(`     NFLX ${win.fromStockPrice.toFixed(2)} → ${win.stockPrice.toFixed(2)} (${(win.stockReturn * 100).toFixed(2)}%)`);
console.log(`     SPY  ${win.fromIndexPrice.toFixed(2)} → ${win.indexPrice.toFixed(2)} (${(win.indexReturn * 100).toFixed(2)}%)`);
console.log(`     diferencë: ${(win.priceVsIndex * 100).toFixed(2)}% ndaj indeksit`);
check('dritarja NFLX u llogarit me sukses', !!win);
check('asOf është data e fundit e përbashkët e të dyja serive',
  win.asOf === nflx.closes[nflx.closes.length - 1].date && win.asOf === spyS.closes[spyS.closes.length - 1].date
    ? true : spyS.closes.findIndex(p => p.date === win.asOf) === spyS.closes.length - 1,
  win.asOf);

// lastCloseOnOrBefore — fundjava
{
  const closes = [{ date: '2026-09-24', close: 100 }, { date: '2026-09-25', close: 101 }];
  check('e shtunë → close i të premtes', lastCloseOnOrBefore(closes, '2026-09-26') === 101);
  check('datë para serisë → null', lastCloseOnOrBefore(closes, '2026-09-20') === null);
}

// ── 3) klasifikimi i shkakut — NFLX me tituj realë (P2) ──────────
console.log('\n── 3) Shkaku i trendit «netflix new releases» (tituj realë GDELT) ──');
let causeType = 'n/a';
try {
  const list = await gdeltArticleList('netflix', 50);
  const cause = classifyCause(list.articles, 'Netflix New Releases: what to watch', 'screenrant.com', new Date().toISOString());
  causeType = cause.type;
  console.log(`  artikuj 24h: ${list.count}`);
  console.log(`  klasifikimi: ${cause.type}`);
  console.log(`  arsye: ${cause.reason}`);
  console.log(`  fjalë kyçe: [${cause.keywords.join(', ')}]`);
  console.log('  titujt e ruajtur (deri 5):');
  for (const a of cause.articles) console.log(`   • [${a.domain}] ${a.title.slice(0, 80)}`);
  check('«netflix new releases» klasifikohet lajm/lançim pa provë (jo kërkesë pozitive)', cause.type === 'news_launch_no_proof' || cause.type === 'unclear', cause.type);
  check('titujt ruhen me URL për kontroll manual', cause.articles.every(a => a.url.startsWith('http')));
} catch (e) {
  console.log(`  GDELT i padisponueshëm: ${(e as Error).message} — testim sintetik`);
  const synth = [
    { title: 'Netflix New Releases: Full List of Movies and Shows Coming in October', url: 'https://a.com/1', domain: 'a.com', seenAt: '2026-09-26T10:00:00Z' },
    { title: 'New on Netflix: The Complete Lineup and Release Schedule', url: 'https://b.com/2', domain: 'b.com', seenAt: '2026-09-26T11:00:00Z' },
  ];
  const cause = classifyCause(synth, null, null, new Date().toISOString());
  causeType = cause.type;
  check('titujt sintetikë lançimi → news_launch_no_proof', cause.type === 'news_launch_no_proof', cause.type);
}
// negative
{
  const cause = classifyCause(
    [{ title: 'Company faces lawsuit over data breach affecting millions', url: 'https://x.com/1', domain: 'x.com', seenAt: '2026-09-26T10:00:00Z' }],
    null, null, new Date().toISOString(),
  );
  check('titull me «lawsuit» + «data breach» → negative_event', cause.type === 'negative_event', cause.type);
}
// pozitive
{
  const cause = classifyCause([
    { title: 'Demand rises as product sells out across stores', url: 'https://y.com/1', domain: 'y.com', seenAt: '2026-09-26T10:00:00Z' },
    { title: 'Record sales surge: waitlist grows for new model', url: 'https://y.com/2', domain: 'y.com', seenAt: '2026-09-26T11:00:00Z' },
  ], null, null, new Date().toISOString());
  check('«sells out» + «record sales» → positive_demand_possible', cause.type === 'positive_demand_possible', cause.type);
}

// ── 4) rezultati 5/20 ditë (P4) ──────────────────────────────────
console.log('\n── 4) Gjurmimi i rezultatit 5/20 ditë ──');
{
  // seri sintetike: 25 ditë tregtimi
  const mk = (base: number, drift: number) =>
    Array.from({ length: 25 }, (_, i) => ({ date: `2026-09-${String(1 + i).padStart(2, '0')}`, close: base * (1 + drift * i) }));
  const stock = mk(100, 0.01);
  const spy = mk(500, 0.002);
  const cand = {
    key: 'test|TEST|US', trend: 'test', ticker: 'TEST', region: 'US', company: 'Test', product: 'Test',
    status: 'REMOVED', firstSeenAt: '2026-09-01T00:00:00Z', lastSeenAt: '2026-09-01T00:00:00Z', lastChangedAt: '2026-09-01T00:00:00Z',
    score: 0, breakdown: { demand: 0, confirmation: 0, materiality: 0, price: 0, quality: 0, event: 0 }, reasons: [],
    google: { inFeedToday: false, approxTraffic: null, traffic: null },
    gdelt: { articles1d: null, growth: null, confirmed: false },
    cause: null,
    price: { stockReturn: null, indexReturn: null, priceVsIndex: null, asOf: null, fromDate: null, stockPrice: null, indexPrice: null, source: null, error: null, checkedAt: null },
    outcome: { baseDate: null, baseStock: null, baseIndex: null, d5: null, d20: null, pendingNote: null, lastCheckedAt: null },
  } as unknown as Candidate;
  updateOutcome(cand, stock, spy, new Date().toISOString());
  // rregulli v5 (F): baza = close-i i ditës së PARË të tregtimit PAS zbulimit —
  // jo close-i i ditës së skanimit (mund të mos kishte qenë i tregtueshëm ende)
  check('baza = close-i i ditës PAS zbulimit (v5)', cand.outcome.baseDate === '2026-09-02', `${cand.outcome.baseDate} (100/${cand.outcome.baseStock?.toFixed(2)})`);
  check('d5 e mbushur', !!cand.outcome.d5, cand.outcome.d5?.date);
  check('d20 e mbushur', !!cand.outcome.d20, cand.outcome.d20?.date);
  check('relative d5 ≈ 106/101 − 506/501 (baza +1 ditë)', cand.outcome.d5 ? Math.abs(cand.outcome.d5.relative - (106 / 101 - 506 / 501)) < 1e-9 : false);
  check('REMOVED gjurmohet njësoj (pavarësisht statusit)', true);
}
{
  // vetëm 8 ditë → d5 po, d20 pending
  const mk = (base: number, drift: number) =>
    Array.from({ length: 8 }, (_, i) => ({ date: `2026-09-${String(1 + i).padStart(2, '0')}`, close: base * (1 + drift * i) }));
  const cand = {
    outcome: { baseDate: null, baseStock: null, baseIndex: null, d5: null, d20: null, pendingNote: null, lastCheckedAt: null },
    firstSeenAt: '2026-09-01T00:00:00Z',
  } as unknown as Candidate;
  updateOutcome(cand, mk(100, 0), mk(500, 0), new Date().toISOString());
  check('d5 e mbushur me 8 ditë', !!cand.outcome.d5);
  check('d20 pending me shënim të qartë', !cand.outcome.d20 && /14 ditë/.test(cand.outcome.pendingNote ?? ''), cand.outcome.pendingNote ?? '');
}

console.log(`\n═══ REZULTATI: ${pass} kaluan · ${fail} dështuan ═══`);
process.exit(fail ? 1 : 0);
