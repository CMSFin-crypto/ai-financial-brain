'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Search, RefreshCw, ArrowRight, CandlestickChart as CandleIcon } from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// GRAFIK FINVIZ — grafik interaktiv në stil finviz.com/charts
// Sfond i zi, qirinj jeshil/kuq, volum poshtë, SMA 20/50/200,
// crosshair me O/H/L/C, zoom me scroll, pan me tërheqje.
// ═══════════════════════════════════════════════════════════════

interface FinvizCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface FinvizData {
  symbol: string;
  company: string;
  exchange: string;
  currency: string;
  price: number;
  previousClose: number;
  marketTime: number;
  interval: string;
  range: string;
  candles: FinvizCandle[];
}

// ─── Ngjyrat e stilit Finviz ───
const UP = '#00c853';
const DOWN = '#ff5252';
const AXIS = '#9aa0aa';
const CROSS = '#787b86';
const PANEL = '#131722';
const BORDER = '#2a2e39';
const FINVIZ_BLUE = '#2962ff';
const SMA_COLORS: Record<number, string> = { 20: '#ff9800', 50: '#2979ff', 200: '#ab47bc' };
const MONTHS = ['Jan', 'Shk', 'Mar', 'Pri', 'Maj', 'Qer', 'Kor', 'Gus', 'Sht', 'Tet', 'Nën', 'Dhj'];

// ─── Geometria (px) ───
const TOTAL_H = 560;
const PAD_T = 8;
const GAP = 14;
const VOL_H = 120;
const AXIS_B = 20;
const AXIS_R = 58;
const PRICE_H = TOTAL_H - PAD_T - GAP - VOL_H - AXIS_B; // 398
const VOL_TOP = PAD_T + PRICE_H + GAP; // 420
const VOL_BOTTOM = VOL_TOP + VOL_H; // 540
const SEP_Y = PAD_T + PRICE_H + GAP / 2; // 413

// ─── Intervali → periudhat e lejuara (si finviz) ───
// SHËNIM: "max" i Yahoo kthen vetëm ~164 pika të grumbulluara (jo granularitet të plotë),
// prandaj për periudha të gjata përdoret "10y" që kthen candle-e realë të plotë.
const INTERVALS: { id: string; label: string; ranges: string[] }[] = [
  { id: '5m', label: '5m', ranges: ['1d', '5d'] },
  { id: '15m', label: '15m', ranges: ['1d', '5d'] },
  { id: '1h', label: '1h', ranges: ['1mo', '3mo', '6mo', '1y'] },
  { id: '1d', label: 'Ditore', ranges: ['1mo', '3mo', '6mo', '1y', '2y', '5y', '10y'] },
  { id: '1wk', label: 'Javore', ranges: ['1y', '2y', '5y', '10y'] },
  { id: '1mo', label: 'Mujore', ranges: ['2y', '5y', '10y'] },
];
const RANGE_LABELS: Record<string, string> = {
  '1d': '1D', '5d': '5D', '1mo': '1M', '3mo': '3M', '6mo': '6M',
  '1y': '1V', '2y': '2V', '5y': '5V', '10y': '10V', 'max': 'MAKS',
};
const INTRADAY_SET = new Set(['5m', '15m', '30m', '60m', '1h']);

// ─── Formatuesit ───
function fmtPrice(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  const d = a >= 1000 ? 0 : a >= 1 ? 2 : 4;
  return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function fmtAxisPrice(v: number): string {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a >= 10000) return v.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (a >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

function fmtVol(v: number): string {
  if (!Number.isFinite(v) || v <= 0) return '—';
  if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B';
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K';
  return String(Math.round(v));
}

function fmtDateLabel(iso: string, interval: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const mon = MONTHS[d.getUTCMonth()];
  if (INTRADAY_SET.has(interval)) {
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${d.getUTCDate()} ${mon} ${hh}:${mm}`;
  }
  if (interval === '1wk' || interval === '1mo') return `${mon} ${d.getUTCFullYear()}`;
  return `${d.getUTCDate()} ${mon}`;
}

function fmtDateFull(iso: string, interval: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (INTRADAY_SET.has(interval)) {
    const hh = String(d.getUTCHours()).padStart(2, '0');
    const mm = String(d.getUTCMinutes()).padStart(2, '0');
    return `${base} ${hh}:${mm} UTC`;
  }
  return base;
}

function tbtn(active: boolean): string {
  return `h-7 px-2.5 rounded text-[11px] font-medium transition-colors border whitespace-nowrap ${
    active
      ? 'bg-[#2962ff] border-[#2962ff] text-white'
      : 'bg-transparent border-[#2a2e39] text-gray-400 hover:text-gray-200 hover:border-[#3a404d]'
  }`;
}

interface FinvizChartProps {
  initialTicker?: string;
  onAnalyze?: (ticker: string) => void;
}

export function FinvizChart({ initialTicker = 'EXPE', onAnalyze }: FinvizChartProps) {
  const [tickerInput, setTickerInput] = useState(initialTicker);
  const [ticker, setTicker] = useState(initialTicker.toUpperCase());
  const [interval, setIntervalId] = useState('1d');
  const [range, setRange] = useState('1y');
  const [data, setData] = useState<FinvizData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<{ i: number; mx: number; my: number } | null>(null);
  const [show, setShow] = useState({ sma20: true, sma50: true, sma200: false });
  const [zoom, setZoom] = useState(1);
  const [zoomPct, setZoomPct] = useState(0);
  const [width, setWidth] = useState(920);
  const [refreshKey, setRefreshKey] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<number | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const panRef = useRef<{ x: number; pct: number } | null>(null);
  const [isPanning, setIsPanning] = useState(false);

  // ─── Ticker-i nga props (p.sh. klik nga Map e Tregut) ───
  useEffect(() => {
    const t = (initialTicker || '').toUpperCase().trim();
    if (t && t !== ticker) {
      setTicker(t);
      setTickerInput(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialTicker]);

  // ─── Mat gjerësinë e kontejnerit ───
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect?.width;
      if (w && w > 100) setWidth(Math.floor(w));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ─── Fetch + auto-refresh çdo 60s ───
  useEffect(() => {
    let cancelled = false;
    const run = async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const res = await fetch(
          `/api/finviz-chart?symbol=${encodeURIComponent(ticker)}&range=${range}&interval=${interval}`,
        );
        const json = await res.json().catch(() => null);
        if (cancelled) return;
        if (!res.ok || !json || json.ok !== true) {
          throw new Error(json?.error || `Gabim nga serveri (${res.status})`);
        }
        setData(json as FinvizData);
        setError(null);
        setLastRefresh(Date.now());
        if (!silent) {
          setZoom(1);
          setZoomPct(0);
          setHover(null);
        }
      } catch (e: unknown) {
        if (cancelled) return;
        if (!silent) setError(e instanceof Error ? e.message : 'Gabim i panjohur');
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };
    run(false);
    const timer = window.setInterval(() => run(true), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [ticker, range, interval, refreshKey]);

  const candles = useMemo(() => data?.candles || [], [data]);

  // ─── SMA mbi të gjithë serinë ───
  const smaArr = useMemo(() => {
    const closes = candles.map((c) => c.close);
    const calc = (p: number): (number | null)[] => {
      const out: (number | null)[] = [];
      let sum = 0;
      for (let i = 0; i < closes.length; i++) {
        sum += closes[i];
        if (i >= p) sum -= closes[i - p];
        out.push(i >= p - 1 ? sum / p : null);
      }
      return out;
    };
    return { 20: calc(20), 50: calc(50), 200: calc(200) };
  }, [candles]);

  // ─── Dritarja e dukshme (zoom/pan) + domeni i çmimeve ───
  const view = useMemo(() => {
    const n = candles.length;
    if (n === 0) return { n: 0, start: 0, vis: [] as FinvizCandle[], pMin: 0, pMax: 1, vMax: 1 };
    const start = Math.floor(zoomPct * n);
    const end = Math.min(n, Math.ceil((zoomPct + 1 / zoom) * n));
    const vis = candles.slice(start, Math.max(end, start + 2));
    let hi = -Infinity;
    let lo = Infinity;
    let vm = 0;
    for (const c of vis) {
      if (c.high > hi) hi = c.high;
      if (c.low < lo) lo = c.low;
      if (c.volume > vm) vm = c.volume;
    }
    const addSma = (arr: (number | null)[], on: boolean) => {
      if (!on) return;
      for (let i = start; i < end && i < arr.length; i++) {
        const v = arr[i];
        if (v != null) {
          if (v > hi) hi = v;
          if (v < lo) lo = v;
        }
      }
    };
    addSma(smaArr[20], show.sma20);
    addSma(smaArr[50], show.sma50);
    addSma(smaArr[200], show.sma200);
    const pad = (hi - lo) * 0.05 || 1;
    return { n, start, vis, pMin: lo - pad, pMax: hi + pad, vMax: vm || 1 };
  }, [candles, zoom, zoomPct, show, smaArr]);

  const plotW = Math.max(120, width - AXIS_R);
  const curCfg = INTERVALS.find((c) => c.id === interval) || INTERVALS[3];

  // ─── Elementet statike të SVG (memo → s'ri-renderohen në hover) ───
  const staticEls = useMemo(() => {
    if (!view.vis.length || plotW <= 10) return null;
    const { vis, start, pMin, pMax, vMax } = view;
    const slot = plotW / vis.length;
    const bw = Math.max(1, slot * 0.7);
    const span = pMax - pMin || 1;
    const yP = (p: number) => PAD_T + (1 - (p - pMin) / span) * PRICE_H;
    const yV = (v: number) => VOL_BOTTOM - (v / vMax) * (VOL_H - 6);

    const els: React.ReactNode[] = [];

    // Qirinj + volum
    const body: React.ReactNode[] = [];
    const vols: React.ReactNode[] = [];
    for (let i = 0; i < vis.length; i++) {
      const c = vis[i];
      const up = c.close >= c.open;
      const col = up ? UP : DOWN;
      const cx = (i + 0.5) * slot;
      body.push(
        <line key={`w${i}`} x1={cx} x2={cx} y1={yP(c.high)} y2={yP(c.low)} stroke={col} strokeWidth={1} />,
      );
      const yTop = yP(Math.max(c.open, c.close));
      const bh = Math.max(1, yP(Math.min(c.open, c.close)) - yTop);
      body.push(<rect key={`b${i}`} x={cx - bw / 2} y={yTop} width={bw} height={bh} fill={col} />);
      const vy = yV(c.volume);
      vols.push(
        <rect
          key={`v${i}`}
          x={cx - bw / 2}
          y={vy}
          width={bw}
          height={Math.max(1, VOL_BOTTOM - vy)}
          fill={col}
          opacity={0.55}
        />,
      );
    }
    els.push(<g key="candles">{body}</g>);
    els.push(<g key="vols">{vols}</g>);

    // SMA
    const smaPath = (arr: (number | null)[]): string => {
      let d = '';
      let pen = false;
      for (let i = 0; i < vis.length; i++) {
        const v = arr[start + i];
        if (v == null) {
          pen = false;
          continue;
        }
        d += (pen ? 'L' : 'M') + ((i + 0.5) * slot).toFixed(1) + ' ' + yP(v).toFixed(1);
        pen = true;
      }
      return d;
    };
    if (show.sma20 && smaArr[20].length)
      els.push(<path key="sma20" d={smaPath(smaArr[20])} fill="none" stroke={SMA_COLORS[20]} strokeWidth={1.3} />);
    if (show.sma50 && smaArr[50].length)
      els.push(<path key="sma50" d={smaPath(smaArr[50])} fill="none" stroke={SMA_COLORS[50]} strokeWidth={1.3} />);
    if (show.sma200 && smaArr[200].length)
      els.push(<path key="sma200" d={smaPath(smaArr[200])} fill="none" stroke={SMA_COLORS[200]} strokeWidth={1.3} />);

    // Vijë ndarëse e pane-it të volumit
    els.push(<line key="sep" x1={0} x2={width} y1={SEP_Y} y2={SEP_Y} stroke={BORDER} strokeWidth={1} />);

    // Boshti i çmimit (djathtas)
    for (let k = 0; k <= 5; k++) {
      const p = pMin + ((pMax - pMin) * k) / 5;
      const y = yP(p);
      els.push(
        <g key={`pt${k}`}>
          <line x1={plotW} x2={width} y1={y} y2={y} stroke={BORDER} strokeWidth={1} />
          <text x={width - 6} y={y + 3.5} textAnchor="end" fontSize={10} fill={AXIS}>
            {fmtAxisPrice(p)}
          </text>
        </g>,
      );
    }

    // Boshti kohor (poshtë)
    const step = Math.max(1, Math.ceil(vis.length / 8));
    for (let i = 0; i < vis.length; i += step) {
      els.push(
        <text
          key={`tt${i}`}
          x={(i + 0.5) * slot}
          y={TOTAL_H - 6}
          textAnchor="middle"
          fontSize={10}
          fill={AXIS}
        >
          {fmtDateLabel(vis[i].date, interval)}
        </text>,
      );
    }

    // Çmimi i fundit — vijë me pikë + etiketë në bosht
    const last = vis[vis.length - 1];
    const prevC = vis.length > 1 ? vis[vis.length - 2] : null;
    const lc = last.close >= (prevC ? prevC.close : last.open) ? UP : DOWN;
    const ly = yP(last.close);
    els.push(
      <g key="lastpx">
        <line x1={0} x2={plotW} y1={ly} y2={ly} stroke={lc} strokeWidth={1} strokeDasharray="4 3" opacity={0.9} />
        <rect x={plotW + 1} y={ly - 8} width={AXIS_R - 3} height={16} rx={2} fill={lc} />
        <text
          x={plotW + 1 + (AXIS_R - 3) / 2}
          y={ly + 3.5}
          textAnchor="middle"
          fontSize={10}
          fontWeight={700}
          fill="#0a0a0a"
        >
          {fmtAxisPrice(last.close)}
        </text>
      </g>,
    );

    return { els, slot };
  }, [view, plotW, width, show, interval, smaArr]);

  // ─── Crosshair + interaksione ───
  const priceAtY = (y: number): number => {
    const t = 1 - (y - PAD_T) / PRICE_H;
    return view.pMin + (view.pMax - view.pMin) * Math.min(1, Math.max(0, t));
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isPanning && panRef.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const dx = e.clientX - panRef.current.x;
      const dPct = dx / Math.max(1, rect.width);
      const maxP = Math.max(0, 1 - 1 / zoom);
      let np = panRef.current.pct - dPct;
      np = Math.max(0, Math.min(maxP, np));
      setZoomPct(np);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    if (!staticEls || mx < 0 || mx > plotW || my < 0 || my > VOL_BOTTOM) {
      setHover(null);
      return;
    }
    const i = Math.min(view.vis.length - 1, Math.max(0, Math.floor(mx / staticEls.slot)));
    setHover({ i, mx, my });
  };

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (e.button !== 0 || zoom <= 1) return;
    setIsPanning(true);
    panRef.current = { x: e.clientX, pct: zoomPct };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    if (isPanning) {
      setIsPanning(false);
      panRef.current = null;
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    }
  };

  const handleWheel = (e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.8 : 1.25;
    const nz = Math.max(1, Math.min(12, zoom * factor));
    if (nz === zoom) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / Math.max(1, rect.width);
    const visW = 1 / zoom;
    const mouseInVis = (nx - zoomPct) / visW;
    const newVisW = 1 / nz;
    let np = nx - mouseInVis * newVisW;
    const maxP = Math.max(0, 1 - newVisW);
    np = Math.max(0, Math.min(maxP, np));
    setZoom(nz);
    setZoomPct(np);
  };

  const setInterval_ = (id: string) => {
    const cfg = INTERVALS.find((c) => c.id === id);
    if (!cfg) return;
    setIntervalId(id);
    if (!cfg.ranges.includes(range)) setRange(cfg.ranges[Math.floor(cfg.ranges.length / 2)]);
  };

  // ─── Të dhënat e legjendës (candle-i në hover ose i fundit) ───
  const legIdx = hover ? hover.i : view.vis.length - 1;
  const legendC = legIdx >= 0 && view.vis.length ? view.vis[legIdx] : null;
  const legendFullIdx = view.start + legIdx;
  const legendPrev = legendC && legendFullIdx > 0 ? candles[legendFullIdx - 1] : null;
  const legendCol = legendC ? (legendC.close >= legendC.open ? UP : DOWN) : AXIS;
  const legendChg = legendC && legendPrev ? legendC.close - legendPrev.close : null;
  const legendPct =
    legendC && legendPrev && legendPrev.close > 0
      ? (((legendC.close - legendPrev.close) / legendPrev.close) * 100).toFixed(2)
      : null;

  const crossCx = hover && staticEls ? (hover.i + 0.5) * staticEls.slot : 0;
  const crossLabel = legendC ? fmtDateFull(legendC.date, interval) : '';
  const chipW = Math.min(plotW - 4, Math.max(60, crossLabel.length * 6.2 + 12));
  const chipX = Math.min(Math.max(0, crossCx - chipW / 2), Math.max(0, plotW - chipW));

  const isLive = data ? Date.now() / 1000 - data.marketTime < 900 : false;
  const hdrUp = data ? data.price >= data.previousClose : true;

  const smaLegend = (p: keyof typeof show, arr: (number | null)[]) =>
    show[p] && legendC && arr[legendFullIdx] != null ? (
      <span style={{ color: SMA_COLORS[p === 'sma20' ? 20 : p === 'sma50' ? 50 : 200] }}>
        SMA{p === 'sma20' ? 20 : p === 'sma50' ? 50 : 200} {fmtAxisPrice(arr[legendFullIdx] as number)}
      </span>
    ) : null;

  return (
    <div className="rounded-lg border border-[#2a2e39] bg-[#131722] overflow-hidden">
      {/* ═══ KOKAFAJA ═══ */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2 px-4 pt-3 pb-2.5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xl font-bold tracking-tight text-white">{data?.symbol || ticker}</span>
            {data && data.company && data.company !== data.symbol && (
              <span className="text-sm text-gray-400 truncate max-w-[280px] sm:max-w-[420px]">{data.company}</span>
            )}
            {data?.exchange && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border border-[#2a2e39] text-gray-500">
                {data.exchange}
              </span>
            )}
            {isLive && (
              <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Grafik interaktiv në stil Finviz — qirinj, volum dhe mesatare lëvizëse
          </p>
        </div>
        <div className="flex items-end gap-4">
          <div className="text-right">
            <div className="text-3xl font-bold tabular-nums text-white leading-none">
              {data ? fmtPrice(data.price) : '—'}
              {data && <span className="text-sm text-gray-500 ml-1">{data.currency}</span>}
            </div>
            {data && (
              <div
                className={`text-sm font-semibold tabular-nums mt-1 ${
                  hdrUp ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {hdrUp ? '▲' : '▼'} {Math.abs(data.price - data.previousClose).toFixed(2)} (
                {(((data.price - data.previousClose) / (data.previousClose || 1)) * 100).toFixed(2)}%)
              </div>
            )}
          </div>
          {onAnalyze && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onAnalyze(ticker)}
              className="border-[#2a2e39] bg-transparent text-gray-300 hover:text-white hover:bg-[#1e222d] hover:border-[#3a404d] gap-1.5"
            >
              Analiza e Thelluar <ArrowRight className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      </div>

      {/* ═══ PANELI I KONTROLLEVE (stil Finviz) ═══ */}
      <div className="flex flex-wrap items-center gap-1.5 px-4 pb-2.5 border-b border-[#1e222d]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const t = tickerInput.trim().toUpperCase();
            if (t) setTicker(t);
          }}
          className="flex items-center gap-1"
        >
          <Input
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            placeholder="SIMBOLI"
            className="h-8 w-28 font-mono text-xs bg-[#0d1117] border-[#2a2e39] text-white"
          />
          <Button
            type="submit"
            size="icon"
            variant="secondary"
            className="h-8 w-8 p-0 bg-[#1e222d] border border-[#2a2e39] hover:bg-[#2a2e39]"
            aria-label="Shfaq grafikun"
          >
            <Search className="w-3.5 h-3.5" />
          </Button>
        </form>

        <span className="h-5 w-px bg-[#2a2e39] mx-0.5" />

        {INTERVALS.map((cfg) => (
          <button
            key={cfg.id}
            type="button"
            onClick={() => setInterval_(cfg.id)}
            className={tbtn(interval === cfg.id)}
          >
            {cfg.label}
          </button>
        ))}

        <span className="h-5 w-px bg-[#2a2e39] mx-0.5" />

        {curCfg.ranges.map((r) => (
          <button key={r} type="button" onClick={() => setRange(r)} className={tbtn(range === r)}>
            {RANGE_LABELS[r] || r}
          </button>
        ))}

        <span className="h-5 w-px bg-[#2a2e39] mx-0.5" />

        {([20, 50, 200] as const).map((p) => {
          const key = `sma${p}` as keyof typeof show;
          return (
            <button
              key={p}
              type="button"
              onClick={() => setShow((s) => ({ ...s, [key]: !s[key] }))}
              className={`${tbtn(show[key])} flex items-center gap-1.5`}
            >
              <span
                className="w-3 h-0.5 rounded-full"
                style={{ background: show[key] ? SMA_COLORS[p] : '#4b5563' }}
              />
              SMA{p}
            </button>
          );
        })}

        <div className="ml-auto flex items-center gap-2">
          <span className="hidden md:inline text-[10px] text-gray-600">
            {zoom > 1 ? `${zoom.toFixed(1)}× zoom (dopio-klik = rikthe)` : 'scroll = zoom'}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRefreshKey((k) => k + 1)}
            className="h-7 px-2 text-[11px] gap-1.5 text-gray-400 hover:text-white"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Rifresko
          </Button>
        </div>
      </div>

      {/* Gabim me të dhëna të vjetra në ekran */}
      {error && data && (
        <div className="px-4 py-1.5 text-[11px] text-amber-400 bg-amber-500/10 border-b border-amber-500/20">
          {error} — shfaqen të dhënat e fundit të vlefshme
        </div>
      )}

      {/* ═══ GRAFIKU ═══ */}
      <div className="relative" ref={containerRef}>
        {loading && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-amber-600/90 text-white text-[10px] px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-lg">
            <Loader2 className="w-3 h-3 animate-spin" />
            Po ngarkohet…
          </div>
        )}

        {error && !data ? (
          <div className="h-[560px] flex flex-col items-center justify-center gap-3 bg-[#131722] px-6 text-center">
            <CandleIcon className="w-10 h-10 text-gray-600" />
            <p className="text-sm text-gray-400">{error}</p>
            <Button
              size="sm"
              onClick={() => setRefreshKey((k) => k + 1)}
              className="gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Provo përsëri
            </Button>
          </div>
        ) : (
          <svg
            width={width}
            height={TOTAL_H}
            className="block cursor-crosshair select-none"
            style={{ touchAction: 'none' }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={() => {
              setHover(null);
              if (isPanning) {
                setIsPanning(false);
                panRef.current = null;
              }
            }}
            onWheel={handleWheel}
            onDoubleClick={() => {
              setZoom(1);
              setZoomPct(0);
            }}
          >
            <rect x={0} y={0} width={width} height={TOTAL_H} fill="#000000" />
            {staticEls?.els}
            {hover && staticEls && legendC && (
              <g pointerEvents="none">
                <line x1={crossCx} x2={crossCx} y1={PAD_T} y2={VOL_BOTTOM} stroke={CROSS} strokeWidth={1} strokeDasharray="3 3" />
                <line x1={0} x2={plotW} y1={hover.my} y2={hover.my} stroke={CROSS} strokeWidth={1} strokeDasharray="3 3" />
                <rect x={plotW + 1} y={hover.my - 8} width={AXIS_R - 3} height={16} rx={2} fill="#2a2e39" />
                <text
                  x={plotW + 1 + (AXIS_R - 3) / 2}
                  y={hover.my + 3.5}
                  textAnchor="middle"
                  fontSize={10}
                  fill="#ffffff"
                >
                  {fmtAxisPrice(priceAtY(hover.my))}
                </text>
                <rect x={chipX} y={VOL_BOTTOM + 2} width={chipW} height={15} rx={2} fill="#2a2e39" />
                <text x={chipX + chipW / 2} y={VOL_BOTTOM + 13} textAnchor="middle" fontSize={10} fill="#ffffff">
                  {crossLabel}
                </text>
              </g>
            )}
          </svg>
        )}

        {/* Legjenda O/H/L/C — sipër majtas si në Finviz */}
        {legendC && staticEls && (
          <div className="absolute left-2.5 top-1.5 z-20 pointer-events-none select-none">
            <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 font-mono text-[11px] leading-4 [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
              <span className="font-bold text-white">{data?.symbol || ticker}</span>
              <span className="text-gray-400">
                O <b style={{ color: legendCol }}>{fmtAxisPrice(legendC.open)}</b>
              </span>
              <span className="text-gray-400">
                H <b style={{ color: legendCol }}>{fmtAxisPrice(legendC.high)}</b>
              </span>
              <span className="text-gray-400">
                L <b style={{ color: legendCol }}>{fmtAxisPrice(legendC.low)}</b>
              </span>
              <span className="text-gray-400">
                C <b style={{ color: legendCol }}>{fmtAxisPrice(legendC.close)}</b>
              </span>
              {legendChg != null && (
                <span style={{ color: legendChg >= 0 ? UP : DOWN }}>
                  {legendChg >= 0 ? '+' : ''}
                  {legendChg.toFixed(2)} ({legendPct}%)
                </span>
              )}
              <span className="text-gray-400">
                Vol <b style={{ color: legendCol }}>{fmtVol(legendC.volume)}</b>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2.5 mt-0.5 font-mono text-[10px] [text-shadow:0_1px_3px_rgba(0,0,0,0.95)]">
              <span className="text-gray-400">{fmtDateFull(legendC.date, interval)}</span>
              {smaLegend('sma20', smaArr[20])}
              {smaLegend('sma50', smaArr[50])}
              {smaLegend('sma200', smaArr[200])}
            </div>
          </div>
        )}
      </div>

      {/* ═══ FUNDI I FAQES ═══ */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 border-t border-[#1e222d] text-[10px] text-gray-500">
        <span>Të dhëna reale: Yahoo Finance</span>
        <span>
          Rifreskohet automatikisht çdo 60 sekonda
          {lastRefresh ? ` · e përditësuar ${new Date(lastRefresh).toLocaleTimeString('sq-AL')}` : ''}
        </span>
        <span className="hidden sm:inline">tërhiq = pan · dopio-klik = rikthe</span>
        <span className="ml-auto flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: UP }} />
            në rritje
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-sm inline-block" style={{ background: DOWN }} />
            në rënie
          </span>
        </span>
      </div>
    </div>
  );
}
