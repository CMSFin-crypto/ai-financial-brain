'use client';

// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB LAB — dashboard monitorimi (V2)
//
// Lista me 10 kompani konsumeri shfaqet MENJËHERË, edhe pa CSV.
// Klikimi te një kompani hap dosjen e saj: çfarë trendi të kërkosh,
// çfarë e konfirmon tezën, çfarë e rrëzon dhe rreziku i interpretimit.
// Score-i dhe verdicti hapen VETËM kur importohen snapshot-e CSV
// reale; pa të dhëna kompania shënohet «PA TË DHËNA» — faqja nuk
// shpik sinjale. V1: vetëm localStorage; pa feed live; pa urdhra.
// Mbrojtja anti-lookahead: në llogaritje hyjnë vetëm rreshtat me
// observed_at/available_at ≤ data e simulimit.
// ═══════════════════════════════════════════════════════════════

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Header } from '@/components/financial-brain/header';
import { FlaskConical, ArrowLeft, ExternalLink, Search, CheckCircle2, XCircle, AlertTriangle, Database } from 'lucide-react';

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
type Breakdown = {
  demand: number;
  confirmation: number;
  materiality: number;
  price: number;
  quality: number;
  event: number;
};
type Result = {
  key: string;
  trend: string;
  ticker: string;
  region: string;
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
  breakdown: Breakdown;
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
  const breakdown: Breakdown = {
    demand: demandScore, confirmation: confirmationScore, materiality: 20 * materiality,
    price: priceScore, quality: qualityScore, event: 10 * (1 - eventRisk),
  };
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
  return { key: `${last.trend.toLowerCase()}|${last.ticker}|${last.region}`, trend: last.trend, ticker: last.ticker, region: last.region,
    product: last.product, company: last.company, score, status, reasons, growingSources, validSources,
    priceVsIndex, stockReturn, indexReturn, observations: rows.length, latest: last.observed_at, breakdown };
}

// ── LISTA FIKE E MONITORIMIT — 10 kompani konsumeri ──────────────
// Këto janë kompani për monitorim, JO pretendim se kanë trend aktiv
// sot. Lidhjet markë–ticker mbështeten nga materialet e kompanive.
type WatchCompany = {
  ticker: string;
  company: string;
  sector: string;
  search: string[];
  confirm: string;
  kill: string;
  risk: string;
  basis: string;
};
const WATCHLIST: WatchCompany[] = [
  {
    ticker: 'CELH', company: 'Celsius Holdings', sector: 'Pije energjike',
    search: ['celsius energy drink', 'celsius vibe'],
    confirm: 'Interesi për CELSIUS rritet me të paktën 25% në dy burime (p.sh. Google Trends + TikTok) ndërsa aksioni nuk ka reaguar më shumë se +3% ndaj indeksit — divergjenca interes-vs-çmim është thelbi i Social Arb.',
    kill: 'Interesi rritet por shitjet dhe zgjerimi i shpërndarjes nuk e ndjekin, ose rritja vjen kryesisht nga një fushatë e paguar me kode promovimi.',
    risk: 'Pijet energjike promovohen fort nga influencer-t: një spik i sponsorizuar mund të duket si kërkesë organike. Verifiko përmbajtjen për kode zbritjesh para se ta lexosh si sinjal.',
    basis: 'CELSIUS është marka kryesore e CELH (materialet e kompanisë).',
  },
  {
    ticker: 'ELF', company: 'e.l.f. Beauty', sector: 'Kozmetikë',
    search: ['elf cosmetics', 'elf dupe'],
    confirm: 'Përmbajtja «dupe» (alternativa e lirë e produkteve të shtrenjta) rritet njëkohësisht në TikTok dhe Google, ndërsa aksioni mbetet pa reagim të madh.',
    kill: 'Rritja shfaqet vetëm në periudha festash ose vjen nga një video e vetme virale pa ndikim në shitje.',
    risk: 'Ciklet e bujës në kozmetikë janë të shkurtra: ajo që duket si momentum mund të jetë thjesht rotacion i përmbajtjes së influencer-ve.',
    basis: 'e.l.f. është marka kryesore e ELF.',
  },
  {
    ticker: 'CROX', company: 'Crocs', sector: 'Këpucë',
    search: ['crocs', 'hey dude shoes'],
    confirm: 'Të dyja markat (Crocs dhe HEYDUDE) tregojnë rritje interesi njëkohësisht, ndërsa çmimi i aksionit nuk ka reaguar ende.',
    kill: 'Interesi sezonal i verës që bie sërish në vjeshtë, ose HEYDUDE në rënie ndërsa vetëm Crocs rritet.',
    risk: 'Crocs ka kaluar cikle të plota mode: rritja pas majës së modës shpesh është rikthim mesatar, jo moment i ri.',
    basis: 'Crocs zotëron HEYDUDE (materialet e kompanisë).',
  },
  {
    ticker: 'DECK', company: 'Deckers Outdoor', sector: 'Këpucë (UGG, HOKA)',
    search: ['hoka shoes', 'ugg'],
    confirm: 'Rritje interesi për HOKA në të paktën dy burime, e shoqëruar me zgjerim të shitjes me pakicë, ndërsa çmimi nuk ka reaguar.',
    kill: 'Zgjimi i UGG në vjeshtë është sezonikalitet normal, jo sinjal; rritja e vetme sezonale e UGG pa mbështetje nga HOKA.',
    risk: 'Dy marka me sezonikalitet të kundërt (HOKA — vera, UGG — dimri): mos i matësh të dyja si një trend të vetëm.',
    basis: 'UGG dhe HOKA janë markat kryesore të DECK.',
  },
  {
    ticker: 'ONON', company: 'On Holding', sector: 'Këpucë vrapimi',
    search: ['on cloud shoes', 'on running'],
    confirm: 'Rritje interesi që përputhet me hapje dyqanesh të reja dhe rritje shitjesh me pakicë, me çmim aksioni ende pa reaguar.',
    kill: 'Rritja vjen kryesisht nga sportistët e sponsorizuar dhe eventet e markës — ekspozim i paguar, jo kërkesë organike.',
    risk: 'Markë në modë: kërkimet mund të reflektojnë kuriozitet, jo qëllim blerjeje.',
    basis: 'On është marka kryesore e ONON.',
  },
  {
    ticker: 'DUOL', company: 'Duolingo', sector: 'Aplikacion gjuhësh',
    search: ['duolingo', 'duolingo streak'],
    confirm: 'Rritje e qëndrueshme e interesit për dy javë e më shumë (jo një spike i vetëm meme), e shoqëruar me rritje shkarkimesh të aplikacionit.',
    kill: 'Një moment viral i maskotës që bie brenda dy javësh pa lënë gjurmë në përdorim.',
    risk: 'Duolingo prodhon vetë marketing viral: ekspozimi i prodhuar nga kompania mund të ngatërrohet me kërkesë organike — promo_risk i lartë si parazgjedhje.',
    basis: 'Duolingo është produkti kryesor i DUOL.',
  },
  {
    ticker: 'CAVA', company: 'Cava Group', sector: 'Restorante',
    search: ['cava bowl', 'cava sauce'],
    confirm: 'Përmbajtja ushqimore në TikTok rritet dhe konfirmohet nga të dhëna trafikut ose shitjeve të restoranteve.',
    kill: 'Një video e vetme ushqimore e virale — virale në rrjet, bosh në dyqane.',
    risk: 'Trendet ushqimore në TikTok kanë gjysmë-jetë javësh: dritarja e Social Arb mbyllet shpejt.',
    basis: 'CAVA është zinxhiri kryesor i grupit.',
  },
  {
    ticker: 'LULU', company: 'Lululemon', sector: 'Athleisure',
    search: ['lululemon', 'define jacket'],
    confirm: 'Rritje interesi për një produkt specifik (jo vetëm markën), me çmim aksioni pa reaguar dhe pa probleme furnizimi.',
    kill: 'Rritja vjen pas një mungese furnizimi (scarcity) ose fryhet nga tregu resale — kërkesë e shtirur.',
    risk: 'Komunitetet resale rrisin kërkimet pa shtuar shitje me çmim të plotë.',
    basis: 'Lululemon është marka kryesore e LULU.',
  },
  {
    ticker: 'BIRK', company: 'Birkenstock', sector: 'Sandale',
    search: ['birkenstocks', 'birkenstock boston'],
    confirm: 'Rritje interesi në pranverë, para sezonit të sandaleve, e verifikuar me krahasim vit-më-viti e jo javë-më-javë.',
    kill: 'Spike-t e mëdha qershor–korrik janë sezonikalitet i pritshëm, jo sinjal.',
    risk: 'Sezonikaliteti i fortë: pa normalizim sezonal, çdo verë duket si trend.',
    basis: 'Birkenstock është marka kryesore e BIRK.',
  },
  {
    ticker: 'RBLX', company: 'Roblox', sector: 'Platformë lojërash',
    search: ['roblox', 'new roblox game'],
    confirm: 'Rritje interesi e shoqëruar me përvoja (experiences) të reja virale brenda platformës që mbajnë përdoruesit, ndërsa çmimi nuk ka reaguar.',
    kill: 'Lojërat virale janë të paqëndrueshme: spike-i bie brenda javësh pa efekt në të ardhura.',
    risk: 'Audienca kryesore është nën 18 vjeç: interesi i matshëm nuk përkthehet drejtpërdrejt në fuqi blerjeje.',
    basis: 'Roblox është platforma kryesore e RBLX.',
  },
];

// ── Shembull demo (ngarkohet VETËM me buton, kurrë automatikisht) ──
type DemoPoint = [offsetDays: number, interest: number, stockPrice?: number, indexPrice?: number];
type DemoStock = {
  ticker: string; company: string; product: string; trend: string; region: string;
  materiality: number; promoRisk: number; eventRisk: number;
  sources: { source: string; points: DemoPoint[] }[];
};
const DEMO: DemoStock[] = [
  {
    ticker: 'NVDA', company: 'Nvidia Corp', product: 'Blackwell GPU', trend: 'nvda ai demand', region: 'US',
    materiality: 0.8, promoRisk: 0.2, eventRisk: 0.2,
    sources: [
      { source: 'google_trends', points: [[-28, 8, 100, 4000], [-24, 8], [-20, 10], [-5, 16], [-3, 20], [-1, 24, 103, 4010]] },
      { source: 'tiktok', points: [[-27, 6], [-23, 7], [-19, 5], [-6, 10], [-4, 12], [-2, 11]] },
    ],
  },
  {
    ticker: 'AMD', company: 'Advanced Micro Devices', product: 'MI300X', trend: 'amd mi300x demand', region: 'US',
    materiality: 0.7, promoRisk: 0.3, eventRisk: 0.3,
    sources: [
      { source: 'google_trends', points: [[-30, 10, 120, 4000], [-26, 11], [-21, 9], [-5, 12], [-2, 14, 122, 4015]] },
      { source: 'reddit', points: [[-29, 5], [-25, 5], [-22, 6], [-4, 5], [-1, 6]] },
    ],
  },
  {
    ticker: 'GME', company: 'GameStop Corp', product: 'Meme Stock', trend: 'gme short squeeze', region: 'US',
    materiality: 0.5, promoRisk: 0.9, eventRisk: 0.3,
    sources: [
      { source: 'reddit', points: [[-28, 40, 25, 4000], [-24, 45], [-20, 50], [-6, 80], [-3, 90], [-1, 100, 28, 4020]] },
    ],
  },
  {
    ticker: 'TSLA', company: 'Tesla Inc', product: 'Robotaxi', trend: 'tsla robotaxi hype', region: 'US',
    materiality: 0.4, promoRisk: 0.5, eventRisk: 0.6,
    sources: [
      { source: 'x_twitter', points: [[-30, 30], [-27, 32], [-24, 31], [-5, 28], [-2, 30]] },
    ],
  },
];
function demoRows(): Row[] {
  const d = (offset: number) => new Date(Date.now() + offset * 86400000).toISOString().slice(0, 10);
  const lines: string[] = [];
  for (const stock of DEMO) {
    for (const src of stock.sources) {
      for (const [offset, interest, stockPrice, indexPrice] of src.points) {
        lines.push([
          d(offset), d(offset), stock.trend, src.source, stock.region, interest,
          stock.ticker, stock.product, stock.company, stock.materiality, stock.promoRisk, stock.eventRisk,
          stockPrice ?? '', indexPrice ?? '',
        ].join(','));
      }
    }
  }
  return readCSV(`${HEADER}\n${lines.join('\n')}\n`);
}

// ── UI ──────────────────────────────────────────────────────────
type FilterKind = 'ALL' | 'NODATA' | Result['status'];
const FILTERS: { key: FilterKind; label: string }[] = [
  { key: 'ALL', label: 'Të gjitha' },
  { key: 'NODATA', label: 'Pa të dhëna' },
  { key: 'RESEARCH', label: 'Research' },
  { key: 'WATCH', label: 'Watch' },
  { key: 'REJECT', label: 'Reject' },
];
const BREAKDOWN_ROWS: { key: keyof Breakdown; label: string; max: number }[] = [
  { key: 'demand', label: 'Rritja e kërkesës (25)', max: 25 },
  { key: 'confirmation', label: 'Konfirmimi shumë-burim (20)', max: 20 },
  { key: 'materiality', label: 'Rëndësia ekonomike (20)', max: 20 },
  { key: 'price', label: 'Reagimi relativ i çmimit (15)', max: 15 },
  { key: 'quality', label: 'Cilësia / risku i promocionit (10)', max: 10 },
  { key: 'event', label: 'Risku i eventit (10)', max: 10 },
];
type WatchEntry = { company: WatchCompany; lead: Result | null; others: Result[] };

export default function SocialArbPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [asOf, setAsOf] = useState(todayUTC);
  const [selectedTicker, setSelectedTicker] = useState(WATCHLIST[0].ticker);
  const [filter, setFilter] = useState<FilterKind>('ALL');
  const [sort, setSort] = useState<'fixed' | 'score' | 'name'>('fixed');
  const dossierRef = useRef<HTMLDivElement>(null);
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
      .sort((a, b) => b.score - a.score || a.ticker.localeCompare(b.ticker));
  }, [visible, asOf]);
  const byTicker = useMemo(() => {
    const map = new Map<string, Result[]>();
    for (const r of results) map.set(r.ticker, [...(map.get(r.ticker) ?? []), r]);
    for (const [k, list] of map) map.set(k, [...list].sort((a, b) => b.score - a.score));
    return map;
  }, [results]);
  const watch = useMemo<WatchEntry[]>(
    () => WATCHLIST.map(company => {
      const list = byTicker.get(company.ticker) ?? [];
      return { company, lead: list[0] ?? null, others: list.slice(1) };
    }),
    [byTicker],
  );
  const outside = useMemo(() => {
    const tickers = new Set(WATCHLIST.map(w => w.ticker));
    const map = new Map<string, Result[]>();
    for (const r of results) {
      if (tickers.has(r.ticker)) continue;
      map.set(r.ticker, [...(map.get(r.ticker) ?? []), r]);
    }
    return [...map.values()]
      .map(list => [...list].sort((a, b) => b.score - a.score))
      .sort((a, b) => b[0].score - a[0].score)
      .slice(0, 10);
  }, [results]);
  const counts = useMemo(() => {
    const c: Record<FilterKind, number> = { ALL: watch.length, NODATA: 0, RESEARCH: 0, WATCH: 0, REJECT: 0 };
    for (const w of watch) c[w.lead?.status ?? 'NODATA']++;
    return c;
  }, [watch]);
  const shown = useMemo(() => {
    let list = watch;
    if (filter !== 'ALL') list = list.filter(w => (w.lead?.status ?? 'NODATA') === filter);
    if (sort === 'score') list = [...list].sort((a, b) => (b.lead?.score ?? -1) - (a.lead?.score ?? -1));
    if (sort === 'name') list = [...list].sort((a, b) => a.company.ticker.localeCompare(b.company.ticker));
    return list;
  }, [watch, filter, sort]);
  const current = watch.find(w => w.company.ticker === selectedTicker) ?? watch[0];

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
  function loadDemo() {
    setError(''); setInfo('');
    try {
      const demo = demoRows();
      const merged = new Map(rows.map(r => [uniqueKey(r), r]));
      for (const r of demo) merged.set(uniqueKey(r), r);
      setRows([...merged.values()]);
      setInfo(`U ngarkuan ${demo.length} snapshot-e demo (4 stoqe: NVDA, AMD, GME, TSLA) për 35 ditët e fundit. Vetëm për provë të logjikës — fshiji para të dhënash reale.`);
    } catch (err) { setError((err as Error).message); }
  }
  function clear() {
    if (!window.confirm('Të fshihen të gjitha snapshot-et Social Arb të ruajtura në këtë shfletues?')) return;
    setRows([]); setInfo('Snapshot-et lokale u fshinë. CSV-të origjinale nuk preken.');
  }
  function selectCard(ticker: string) {
    setSelectedTicker(ticker);
    dossierRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  const statusTone: Record<Result['status'], string> = {
    RESEARCH: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
    WATCH: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
    REJECT: 'bg-red-500/15 border-red-500/40 text-red-400',
  };
  const nodataTone = 'bg-slate-500/15 border-slate-500/40 text-slate-400';
  const barColor: Record<Result['status'], string> = { RESEARCH: '#10b981', WATCH: '#f59e0b', REJECT: '#ef4444' };

  return (
    <div className="min-h-screen flex flex-col bg-background" suppressHydrationWarning>
      <Header />
      <main className="flex-1 max-w-6xl mx-auto w-full px-4 sm:px-6 py-6 space-y-5">
        {/* Kokë — identiteti i modulit të veçuar */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="bg-rose-500/15 rounded-lg p-2.5 text-rose-400 flex-shrink-0">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Social Arb Lab</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                10 kompani konsumeri për monitorim, me dosje hulumtimi për secilën. Score-i hapet kur importon snapshot-e reale. Nuk ndryshon sinjalet ekzistuese dhe nuk dërgon urdhra IBKR.
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

        {/* Kontrollet: data e simulimit + filtra + renditja */}
        <section style={box} className="!py-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <label className="text-xs text-muted-foreground">Data e simulimit (UTC):{' '}
              <input type="date" value={asOf} max={todayUTC()} onChange={e => { if (dateOK(e.target.value)) setAsOf(e.target.value); }} style={input} />
            </label>
            <span className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-muted-foreground">Filtri:</span>
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => setFilter(f.key)}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${filter === f.key ? 'border-rose-500/60 bg-rose-500/15 text-rose-300' : 'border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'}`}
                >
                  {f.label} <span className="tabular-nums opacity-70">({counts[f.key] ?? 0})</span>
                </button>
              ))}
            </span>
            <label className="text-xs text-muted-foreground">Rendit:
              <select value={sort} onChange={e => setSort(e.target.value as typeof sort)} style={{ ...input, marginLeft: 6 }} aria-label="Rendit listën">
                <option value="fixed">Renditja fiks</option>
                <option value="score">Score ↓</option>
                <option value="name">Emri A-Z</option>
              </select>
            </label>
          </div>
          <p className="mt-2"><small>Vetëm rreshtat me observed_at dhe available_at deri në këtë datë hyjnë në llogaritje — mbrojtje kundër future data leak.</small></p>
        </section>

        {/* LISTA E MONITORIMIT — 10 kompani, menjëherë edhe pa CSV */}
        <section style={box}>
          <h2>Lista e monitorimit — 10 kompani</h2>
          <p className="text-sm text-muted-foreground">Këto janë kompani për monitorim, jo pretendim se kanë trend aktiv sot. Lidhjet markë–ticker mbështeten nga materialet e kompanive; për t&#39;i quajtur kandidatë Social Arb të konfirmuar duhen matje reale të interesit dhe të çmimit.</p>
          <p className="mt-2 text-xs text-muted-foreground">{counts.ALL - counts.NODATA} me të dhëna · {counts.NODATA} pa të dhëna</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {shown.map(({ company: w, lead }) => (
              <div
                key={w.ticker}
                role="button"
                tabIndex={0}
                onClick={() => selectCard(w.ticker)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectCard(w.ticker); } }}
                className={`rounded-xl border p-4 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-rose-500 ${selectedTicker === w.ticker ? 'border-rose-500/60 bg-rose-500/[0.06]' : 'border-slate-700 bg-slate-900/60 hover:border-slate-500'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-lg font-bold leading-tight text-foreground">{w.ticker}</h3>
                    <p className="truncate text-xs text-muted-foreground">{w.company} · {w.sector}</p>
                  </div>
                  <span className={`inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${lead ? statusTone[lead.status] : nodataTone}`}>
                    {lead ? lead.status : 'PA TË DHËNA'}
                  </span>
                </div>
                {lead ? (
                  <>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/70">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, lead.score))}%`, background: barColor[lead.status] }} />
                      </div>
                      <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-foreground">{lead.score}/100</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                      <span>Burime: <b className="text-foreground">{lead.growingSources}/{lead.validSources}</b></span>
                      <span>Aksion − indeks: <b className="text-foreground">{percent(lead.priceVsIndex)}</b></span>
                      <span>{lead.observations} snapshot-e</span>
                    </div>
                  </>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">Kërko: <span className="text-foreground/80">«{w.search[0]}»</span></p>
                )}
              </div>
            ))}
          </div>
          {!shown.length && <p className="mt-3 text-xs text-muted-foreground">Asnjë kompani nën këtë filtër.</p>}
        </section>

        {/* DOSJA — hulumtimi për kompaninë e zgjedhur */}
        {current && (
          <section ref={dossierRef} style={box}>
            <h2>Dosja: {current.company.ticker} — {current.company.company}</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><Search className="w-3.5 h-3.5 text-rose-400" /> Çfarë trendi të kërkosh</p>
                <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-xs text-foreground/90">
                  {current.company.search.map(s => <li key={s}>«{s}» — Google Trends / TikTok</li>)}
                </ul>
              </div>
              <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> Çfarë do ta konfirmonte</p>
                <p className="mt-1.5 text-xs text-foreground/90">{current.company.confirm}</p>
              </div>
              <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><XCircle className="w-3.5 h-3.5 text-red-400" /> Çfarë e rrëzon tezën</p>
                <p className="mt-1.5 text-xs text-foreground/90">{current.company.kill}</p>
              </div>
              <div className="rounded-lg border border-slate-700/70 bg-slate-900/50 p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"><AlertTriangle className="w-3.5 h-3.5 text-amber-400" /> Rreziku i interpretimit</p>
                <p className="mt-1.5 text-xs text-foreground/90">{current.company.risk}</p>
              </div>
            </div>
            <p className="mt-2"><small>Baza: {current.company.basis}</small></p>

            {current.lead ? (
              <div className="mt-4 rounded-lg border border-slate-700 bg-slate-900/50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-foreground">Score: {current.lead.score}/100 · trend: {current.lead.trend} · {current.lead.observations} snapshot-e · fundit {current.lead.latest}</p>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone[current.lead.status]}`}>{current.lead.status}</span>
                </div>
                <div className="mt-2">
                  {BREAKDOWN_ROWS.map(br => (
                    <div key={br.key} className="mt-1.5 flex items-center gap-2">
                      <span className="w-40 sm:w-64 flex-shrink-0 truncate text-[11px] text-muted-foreground">{br.label}</span>
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/70">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, current.lead!.breakdown[br.key] / br.max * 100))}%`, background: barColor[current.lead!.status] }} />
                      </div>
                      <span className="w-12 flex-shrink-0 text-right text-[11px] tabular-nums text-foreground">{Math.round(current.lead!.breakdown[br.key])}/{br.max}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                  <span>Burime në rritje: <b className="text-foreground">{current.lead.growingSources}/{current.lead.validSources}</b></span>
                  <span>Aksion − indeks: <b className="text-foreground">{percent(current.lead.priceVsIndex)}</b></span>
                  <span>Kthimi: <b className="text-foreground">{percent(current.lead.stockReturn)}</b> (indeksi {percent(current.lead.indexReturn)})</span>
                </div>
                <div className="mt-3 border-t border-slate-700/60 pt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pse?</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-foreground/90">
                    {current.lead.reasons.map(reason => <li key={reason}>{reason}</li>)}
                  </ul>
                </div>
                {current.others.length > 0 && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    +{current.others.length} trend{current.others.length > 1 ? '-e' : ''} të tjera për {current.company.ticker}: {current.others.map(o => `${o.trend} (${o.score}/100, ${o.status})`).join(' · ')}
                  </p>
                )}
                <small style={{ display: 'block', marginTop: 8 }}>Komponentët e score-it janë të rrumbullakosura për shfaqje; shuma mund të diferencohet ±1 nga score-i total. Pragje eksperimentale: RESEARCH ≥75 me dy burime në rritje dhe çmime; WATCH ≥50 ose një burim në rritje; përndryshe REJECT. Promo risk ≥0.7 ose event risk ≥0.8 e bllokon kandidatin.</small>
              </div>
            ) : (
              <div className="mt-4 rounded-lg border border-dashed border-slate-600 p-4 text-center">
                <p className="text-sm font-bold text-slate-300">PA TË DHËNA</p>
                <p className="mt-1 text-xs text-muted-foreground">Importo snapshot-e për trendin «{current.company.search[0]}» te «Burimet e të dhënave» më poshtë — score-i dhe verdicti hapen vetëm me matje reale.</p>
              </div>
            )}
          </section>
        )}

        {/* JASHTË LISTËS — ticker-a nga importi që s'janë në listën fiks */}
        {outside.length > 0 && (
          <section style={box}>
            <h2>Nga importi — jashtë listës së monitorimit (deri në 10)</h2>
            <p className="text-sm text-muted-foreground">Ticker-at nga CSV që s&apos;janë pjesë e listës fiks (p.sh. shembulli demo: NVDA, AMD, GME, TSLA).</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {outside.map(list => {
                const lead = list[0];
                return (
                  <article key={lead.key} className="rounded-xl border border-slate-700 bg-slate-900/60 p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="text-lg font-bold leading-tight text-foreground">{lead.ticker}</h3>
                        <p className="truncate text-xs text-muted-foreground">{lead.company}{lead.region !== 'US' ? ` · ${lead.region}` : ''}</p>
                      </div>
                      <span className={`inline-flex flex-shrink-0 items-center rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusTone[lead.status]}`}>{lead.status}</span>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700/70">
                        <div className="h-full rounded-full" style={{ width: `${Math.min(100, Math.max(0, lead.score))}%`, background: barColor[lead.status] }} />
                      </div>
                      <span className="flex-shrink-0 text-sm font-semibold tabular-nums text-foreground">{lead.score}/100</span>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">{lead.product} · trend: <span className="text-foreground/80">{lead.trend}</span> · {lead.observations} snapshot-e · fundit {lead.latest}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Burime në rritje: <b className="text-foreground">{lead.growingSources}/{lead.validSources}</b></span>
                      <span>Aksion − indeks: <b className="text-foreground">{percent(lead.priceVsIndex)}</b></span>
                      <span>Kthimi: <b className="text-foreground">{percent(lead.stockReturn)}</b> (indeksi {percent(lead.indexReturn)})</span>
                    </div>
                    <div className="mt-2 border-t border-slate-700/60 pt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Pse?</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-foreground/90">
                        {lead.reasons.map(reason => <li key={reason}>{reason}</li>)}
                      </ul>
                    </div>
                    {list.length > 1 && (
                      <p className="mt-2 text-[11px] text-muted-foreground">
                        +{list.length - 1} trend{list.length > 2 ? '-e' : ''} të tjera: {list.slice(1).map(o => `${o.trend} (${o.score}/100, ${o.status})`).join(' · ')}
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          </section>
        )}

        {/* BURIMET E TË DHËNAVE — importi CSV, poshtë faqes */}
        <section style={box}>
          <h2 className="flex items-center gap-1.5"><Database className="w-4 h-4 text-rose-400" /> Burimet e të dhënave</h2>
          <p>Një rresht për burim dhe datë. Datat YYYY-MM-DD; interest është vlera e burimit (jo domosdoshmërisht numër kërkimesh). materiality, promo_risk dhe event_risk janë vlerësime manuale 0–1. Mos përziej rajone ose shkallë të ndryshme nën të njëjtin emër burimi.</p>
          <p className="mt-2"><button onClick={template} style={button}>Shkarko CSV bosh</button>{' '}<input type="file" accept=".csv,text/csv" onChange={importFile} aria-label="Importo CSV" /></p>
          <p className="mt-2">
            <button onClick={loadDemo} className="inline-flex items-center gap-1.5 rounded-md border border-rose-500/50 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-500/20">
              <FlaskConical className="w-3.5 h-3.5" /> Ngarko shembull demo (4 stoqe)
            </button>{' '}
            <button onClick={clear} style={button}>Fshi të dhënat lokale</button>
          </p>
          <p className="mt-2"><small>Kolonat: {HEADER}. stock_price dhe index_price janë opsionale, por duhen dy data me të dy çmimet për vlerësimin e reagimit të tregut. available_at = data kur informacioni u bë realisht i përdorshëm.</small></p>
          <p className="mt-1 text-sm">{rows.length} snapshot-e lokale.</p>
          {error && <p role="alert" style={{ color: '#fca5a5' }}>{error}</p>}
          {info && <p role="status" style={{ color: '#86efac' }}>{info}</p>}
        </section>
        <p><small><ExternalLink className="inline w-3 h-3" /> V1 ruhet vetëm në localStorage të shfletuesit. Ruaj CSV-të origjinale për backtest serioz; kjo faqe nuk përmban feed live, autentikim, sinkronizim mes pajisjeve ose ekzekutim tregtie.</small></p>
      </main>
    </div>
  );
}

const box: React.CSSProperties = { background: '#111c2e', border: '1px solid #334155', borderRadius: 12, padding: 20, margin: '20px 0' };
const button: React.CSSProperties = { background: '#2563eb', color: 'white', border: 0, borderRadius: 6, padding: '8px 12px', cursor: 'pointer' };
const input: React.CSSProperties = { background: '#1e293b', color: 'white', border: '1px solid #64748b', padding: 6, marginLeft: 8 };
