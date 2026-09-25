'use client';

// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB LAB — modul i pavarur hulumtimi (V1, localStorage)
//
// Faqe e veçuar, jashtë tab-eve kryesore: nuk prek strategjitë
// ekzistuese (IBKR/CAMS/…) dhe nuk dërgon urdhra.
// V1: të dhënat vetëm në localStorage të shfletuesit; CSV origjinale
// mbeten arkiv. Mbrojtje anti-lookahead: në llogaritje hyjnë vetëm
// rreshtat me observed_at/available_at ≤ data e simulimit.
// ═══════════════════════════════════════════════════════════════

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/financial-brain/header';
import { FlaskConical, ArrowLeft, ExternalLink } from 'lucide-react';

type Row = {
  observed_at: string;
  available_at: string;
  trend: string;
  source: string;
  region: string;
  interest: number;
  ticker: string;
  product: string;
  company: string;
  materiality: number;
  promo_risk: number;
  event_risk: number;
  stock_price: number | null;
  index_price: number | null;
};
type Result = {
  key: string;
  trend: string;
  ticker: string;
  company: string;
  product: string;
  score: number;
  status: 'RESEARCH' | 'WATCH' | 'REJECT';
  reasons: string[];
  growingSources: number;
  validSources: number;
  priceVsIndex: number | null;
  stockReturn: number | null;
  indexReturn: number | null;
  observations: number;
  latest: string;
};

const STORAGE_KEY = 'ai-financial-brain:social-arb:v1';
const HEADER = 'observed_at,available_at,trend,source,region,interest,ticker,product,company,materiality,promo_risk,event_risk,stock_price,index_price';
const REQUIRED = HEADER.split(',').slice(0, 12);
const dateOK = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
const todayUTC = () => new Date().toISOString().slice(0, 10);
const median = (xs: number[]) => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length ? (sorted[Math.floor((sorted.length - 1) / 2)] + sorted[Math.floor(sorted.length / 2)]) / 2 : 0;
};
const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
const percent = (n: number | null) => n === null ? 'n/a' : `${n >= 0 ? '+' : ''}${(n * 100).toFixed(1)}%`;

// Handles quoted commas, escaped quotes and CRLF; import remains all-or-nothing.
function parseCSV(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, '');
  const records: string[][] = [];
  let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') { field += '"'; i++; }
      else if (!quoted && field !== '') throw new Error('Format CSV i pavlefshëm: thonjëza në mes të fushës.');
      else quoted = !quoted;
    } else if (c === ',' && !quoted) { row.push(field); field = ''; }
    else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(x => x.trim() !== '')) records.push(row);
      row = []; field = '';
    } else field += c;
  }
  if (quoted) throw new Error('Format CSV i pavlefshëm: thonjëza të pambyllura.');
  row.push(field);
  if (row.some(x => x.trim() !== '')) records.push(row);
  return records;
}

function readCSV(text: string): Row[] {
  const records = parseCSV(text);
  if (records.length < 2) throw new Error('CSV duhet të ketë header dhe të paktën një rresht.');
  const headers = records[0].map(x => x.trim().toLowerCase());
  if (new Set(headers).size !== headers.length || REQUIRED.some(h => !headers.includes(h)))
    throw new Error(`Kolonat e detyrueshme: ${REQUIRED.join(', ')}`);
  const column = (r: string[], name: string) => (r[headers.indexOf(name)] ?? '').trim();
  const numeric = (r: string[], name: string, min: number, max: number, optional = false): number | null => {
    const value = column(r, name);
    if (optional && !value) return null;
    const n = Number(value);
    if (!value || !Number.isFinite(n) || n < min || n > max) throw new Error(`${name}: pritët numër ${min}–${max}`);
    return n;
  };
  return records.slice(1).map((r, i) => {
    try {
      if (r.length !== headers.length) throw new Error(`pritën ${headers.length} kolona, u gjetën ${r.length}`);
      const observed_at = column(r, 'observed_at');
      const available_at = column(r, 'available_at');
      if (!dateOK(observed_at) || !dateOK(available_at) || available_at < observed_at)
        throw new Error('datë e pavlefshme ose available_at para observed_at');
      const trend = column(r, 'trend'), source = column(r, 'source');
      const ticker = column(r, 'ticker').toUpperCase();
      const product = column(r, 'product'), company = column(r, 'company');
      const region = column(r, 'region').toUpperCase();
      if (![trend, source, ticker, product, company, region].every(Boolean)) throw new Error('mungon trend/source/region/ticker/product/company');
      return {
        observed_at, available_at, trend, source, region, ticker, product, company,
        interest: numeric(r, 'interest', 0, Number.MAX_SAFE_INTEGER)!,
        materiality: numeric(r, 'materiality', 0, 1)!,
        promo_risk: numeric(r, 'promo_risk', 0, 1)!,
        event_risk: numeric(r, 'event_risk', 0, 1)!,
        stock_price: headers.includes('stock_price') ? numeric(r, 'stock_price', 0.000001, Number.MAX_SAFE_INTEGER, true) : null,
        index_price: headers.includes('index_price') ? numeric(r, 'index_price', 0.000001, Number.MAX_SAFE_INTEGER, true) : null,
      };
    } catch (e) { throw new Error(`Rreshti CSV ${i + 2}: ${(e as Error).message}`); }
  });
}

function uniqueKey(r: Row) {
  return [r.trend.toLowerCase(), r.ticker, r.region, r.source.toLowerCase(), r.observed_at].join('|');
}
function scoreGroup(rows: Row[], asOf: string): Result {
  const ordered = [...rows].sort((a, b) => a.observed_at.localeCompare(b.observed_at) || a.available_at.localeCompare(b.available_at));
  const last = ordered[ordered.length - 1];
  const asOfMs = day(asOf);
  const recentFrom = asOfMs - 7 * 86400000;
  const baselineFrom = asOfMs - 35 * 86400000;
  const sources = [...new Set(rows.map(r => r.source.toLowerCase()))];
  let validSources = 0, growingSources = 0, trendStrength = 0;
  for (const source of sources) {
    const selected = rows.filter(r => r.source.toLowerCase() === source);
    const recent = selected.filter(r => day(r.observed_at) > recentFrom && day(r.observed_at) <= asOfMs).map(r => r.interest);
    const baseline = selected.filter(r => day(r.observed_at) > baselineFrom && day(r.observed_at) <= recentFrom).map(r => r.interest);
    if (recent.length < 2 || baseline.length < 3 || median(baseline) <= 0) continue;
    validSources++;
    const growth = median(recent) / median(baseline) - 1;
    trendStrength = Math.max(trendStrength, clamp(growth));
    if (growth >= 0.25) growingSources++;
  }
  const pairs = ordered.filter(r => r.stock_price !== null && r.index_price !== null);
  const first = pairs[0], end = pairs[pairs.length - 1];
  const enoughPrice = !!first && !!end && first.observed_at < end.observed_at;
  const stockReturn = enoughPrice ? end.stock_price! / first.stock_price! - 1 : null;
  const indexReturn = enoughPrice ? end.index_price! / first.index_price! - 1 : null;
  const priceVsIndex = stockReturn === null || indexReturn === null ? null : stockReturn - indexReturn;
  // Subjective analyst inputs are visible in CSV, not inferred by an LLM.
  const materiality = last.materiality, promoRisk = last.promo_risk, eventRisk = last.event_risk;
  const demandScore = 25 * trendStrength;
  const confirmationScore = growingSources >= 2 ? 20 : growingSources === 1 ? 8 : 0;
  const priceScore = priceVsIndex === null ? 0 : priceVsIndex <= 0.03 ? 15 : priceVsIndex <= 0.10 ? 8 : 0;
  const qualityScore = 10 * (1 - promoRisk) * (validSources >= 2 ? 1 : 0.5);
  const score = Math.round(demandScore + confirmationScore + 20 * materiality + priceScore + qualityScore + 10 * (1 - eventRisk));
  const reasons: string[] = [];
  if (validSources < 2) reasons.push('Mungojnë 2 burime me histori të mjaftueshme (2 pika në 7 ditë, 3 në 28 ditët para tyre).');
  if (growingSources < 2) reasons.push('Rritja ≥25% nuk konfirmohet nga dy burime.');
  if (priceVsIndex === null) reasons.push('Mungojnë dy çmime krahasuese të aksionit dhe indeksit.');
  if (priceVsIndex !== null && priceVsIndex > 0.10) reasons.push('Aksioni ka tejkaluar indeksin >10% në dritaren e çmimeve; kontrollo nëse lajmi është reflektuar.');
  if (promoRisk >= 0.7) reasons.push('Rrezik i lartë promovimi artificial.');
  if (eventRisk >= 0.8) reasons.push('Rrezik i lartë eventesh.');
  const status: Result['status'] = promoRisk >= 0.7 || eventRisk >= 0.8 ? 'REJECT' :
    score >= 75 && growingSources >= 2 && validSources >= 2 && priceVsIndex !== null ? 'RESEARCH' :
    score >= 50 || growingSources > 0 ? 'WATCH' : 'REJECT';
  if (!reasons.length) reasons.push('Kandidat për verifikim manual; nuk është rekomandim tregtimi.');
  return { key: `${last.trend.toLowerCase()}|${last.ticker}|${last.region}`, trend: last.trend, ticker: last.ticker,
    product: last.product, company: last.company, score, status, reasons, growingSources, validSources,
    priceVsIndex, stockReturn, indexReturn, observations: rows.length, latest: last.observed_at };
}

export default function SocialArbPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [asOf, setAsOf] = useState(todayUTC);
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        if (Array.isArray(parsed)) setRows(parsed as Row[]);
      }
    } catch { setError('Të dhënat lokale nuk u lexuan. Importoji përsëri nga CSV.'); }
    setLoaded(true);
  }, []);
  useEffect(() => {
    if (!loaded) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rows)); }
    catch { setError('Hapësira lokale është plot. Mbaji CSV-të origjinale si arkiv.'); }
  }, [rows, loaded]);
  const visible = useMemo(() => rows.filter(r => r.available_at <= asOf && r.observed_at <= asOf), [rows, asOf]);
  const results = useMemo(() => {
    const groups = new Map<string, Row[]>();
    for (const r of visible) {
      const key = `${r.trend.toLowerCase()}|${r.ticker}|${r.region}`;
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.values()].map(group => scoreGroup(group, asOf))
      .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker)).slice(0, 10);
  }, [visible, asOf]);
  const current = results.find(r => r.key === selected) ?? results[0];

  async function importFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(''); setInfo('');
    try {
      if (file.size > 3_000_000) throw new Error('CSV shumë i madh për localStorage. Përdor një arkiv më të vogël ose DB.');
      const incoming = readCSV(await file.text());
      const merged = new Map(rows.map(r => [uniqueKey(r), r]));
      for (const r of incoming) merged.set(uniqueKey(r), r);
      setRows([...merged.values()]);
      setInfo(`U lexuan ${incoming.length} rreshta. Snapshot-et me të njëjtin trend/ticker/rajon/burim/datë u përditësuan.`);
    } catch (err) { setError((err as Error).message); }
    e.target.value = '';
  }
  function template() {
    const blob = new Blob([HEADER + '\n'], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'social-arb-template.csv'; a.click();
    URL.revokeObjectURL(url);
  }
  function clear() {
    if (!window.confirm('Të fshihen të gjitha snapshot-et Social Arb të ruajtura në këtë shfletues?')) return;
    setRows([]); setSelected(null); setInfo('Snapshot-et lokale u fshinë. CSV-të origjinale nuk preken.');
  }

  const statusTone: Record<Result['status'], string> = {
    RESEARCH: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
    WATCH: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
    REJECT: 'bg-red-500/15 border-red-500/40 text-red-400',
  };

  return (
    <div className="min-h-screen flex flex-col bg-background" suppressHydrationWarning>
      <Header />
      <main className="flex-1 max-w-5xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
        {/* Kokë — identiteti i modulit të veçantë */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-rose-500/15 rounded-lg p-2.5 text-rose-400 flex-shrink-0">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Social Arb Lab</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                Modul i pavarur hulumtimi për AI Financial Brain. Nuk ndryshon sinjalet ekzistuese dhe nuk dërgon urdhra IBKR.
              </p>
            </div>
          </div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-600 bg-slate-800/60 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700/60 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Paneli Kryesor
          </Link>
        </div>

        <section style={box}>
          <h2>1. Importo snapshot-et</h2>
          <p>Një rresht për burim dhe datë. Datat YYYY-MM-DD; interest është vlera e burimit (jo domosdoshmërisht numër kërkimesh). materiality, promo_risk dhe event_risk janë vlerësime manuale 0–1. Mos përziej rajone ose shkallë të ndryshme nën të njëjtin emër burimi.</p>
          <p><button onClick={template} style={button}>Shkarko CSV bosh</button>{' '}<input type="file" accept=".csv,text/csv" onChange={importFile} aria-label="Importo CSV" /></p>
          <small>Kolonat: {HEADER}. stock_price dhe index_price janë opsionale, por duhen dy data me të dy çmimet për vlerësimin e reagimit të tregut. available_at = data kur informacioni u bë realisht i përdorshëm.</small>
          <p>{rows.length} snapshot-e lokale. <button onClick={clear} style={button}>Fshi të dhënat lokale</button></p>
          {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
          {info && <p role="status" style={{ color: '#86efac' }}>{info}</p>}
        </section>
        <section style={box}>
          <h2>2. Kandidatët (deri në 10)</h2>
          <label>Data e simulimit (UTC): <input type="date" value={asOf} max={todayUTC()} onChange={e => { if (dateOK(e.target.value)) setAsOf(e.target.value); }} style={input} /></label>
          <p><small>Vetëm rreshtat me observed_at dhe available_at deri në këtë datë hyjnë në llogaritje. Një import i bërë sot nuk provon se një snapshot historik ishte i disponueshëm atëherë: verifiko available_at nga burimi origjinal.</small></p>
          {!results.length ? <p>Nuk ka ende kandidatë. Importo një CSV me snapshot-e reale.</p> : (
            <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
              <thead><tr><th style={cell}>Trend / ticker</th><th style={cell}>Score</th><th style={cell}>Status</th><th style={cell}>Burime në rritje</th><th style={cell}>Aksion − indeks</th><th style={cell}>Snapshot-e</th></tr></thead>
              <tbody>{results.map(r => <tr key={r.key} onClick={() => setSelected(r.key)} style={{ cursor: 'pointer', background: current?.key === r.key ? '#1e293b' : undefined }}>
                <td style={cell}>{r.trend} / {r.ticker}</td><td style={cell}>{r.score}/100</td>
                <td style={cell}><span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone[r.status]}`}>{r.status}</span></td>
                <td style={cell}>{r.growingSources}/{r.validSources}</td><td style={cell}>{percent(r.priceVsIndex)}</td><td style={cell}>{r.observations}</td>
              </tr>)}</tbody>
            </table></div>
          )}
        </section>
        {current && <section style={box}>
          <h2>3. Pse {current.ticker}?</h2>
          <p>{current.company} · {current.product} · trend: {current.trend} · snapshot-i i fundit: {current.latest}</p>
          <p>Kthimi i aksionit në dritaren e çmimeve: {percent(current.stockReturn)}; indeksi: {percent(current.indexReturn)}. Këto janë lëvizje retrospektive, jo fitim i strategjisë.</p>
          <ul>{current.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
          <small>Score: rritja 25, konfirmimi 20, rëndësia ekonomike 20, reagimi relativ i çmimit 15, cilësia/rreziku i promocionit 10, risku i eventit 10. Pragje eksperimentale: RESEARCH ≥75 me dy burime në rritje dhe çmime; WATCH ≥50 ose një burim në rritje; përndryshe REJECT. Promo risk ≥0.7 ose event risk ≥0.8 e bllokon kandidatin.</small>
        </section>}
        <p><small><ExternalLink className="inline w-3 h-3" /> V1 ruhet vetëm në localStorage të shfletuesit. Ruaj CSV-të origjinale për backtest serioz; kjo faqe nuk përmban feed live, autentikim, sinkronizim mes pajisjeve ose ekzekutim tregtie.</small></p>
      </main>
    </div>
  );
}

const box: React.CSSProperties = { background: '#111c2e', border: '1px solid #334155', borderRadius: 12, padding: 20, margin: '20px 0' };
const button: React.CSSProperties = { background: '#2563eb', color: 'white', border: 0, borderRadius: 6, padding: '8px 12px', cursor: 'pointer' };
const input: React.CSSProperties = { background: '#1e293b', color: 'white', border: '1px solid #64748b', padding: 6, marginLeft: 8 };
const cell: React.CSSProperties = { borderBottom: '1px solid #334155', padding: 10 };
