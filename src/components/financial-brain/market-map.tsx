'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import {
  LayoutGrid,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  MousePointerClick,
  Minus,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════
// MAP E TREGUT — heatmap stil Finviz
// Madhësia e pllakave = kapitalizimi i tregut (market cap)
// Ngjyra = ndryshimi ditor % (e gjelbër = majtje, e kuqe = rënie)
// Kliko një kompani → hap Analizën Teknike për të
// ═══════════════════════════════════════════════════════════════

interface MarketMapStock {
  symbol: string;
  name: string;
  sector: string;
  sectorKey: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  marketCap: number;
  volume: number;
}

interface MarketMapProps {
  onSelectStock?: (symbol: string) => void;
}

// ─── Squarified treemap (implementim standard, pa varësi të jashtme) ───

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface SquarifyItem<T> {
  value: number;
  data: T;
}

interface LaidOutTile<T> extends Rect {
  data: T;
}

function squarify<T>(items: SquarifyItem<T>[], container: Rect): LaidOutTile<T>[] {
  const result: LaidOutTile<T>[] = [];
  const valid = items.filter(i => i.value > 0 && Number.isFinite(i.value));
  const total = valid.reduce((s, i) => s + i.value, 0);
  if (total <= 0 || container.w <= 0 || container.h <= 0) return result;

  const scale = (container.w * container.h) / total;
  const sorted = [...valid].sort((a, b) => b.value - a.value);

  let cx = container.x;
  let cy = container.y;
  let cw = container.w;
  let ch = container.h;
  let idx = 0;

  while (idx < sorted.length && cw > 0.5 && ch > 0.5) {
    const isVerticalStrip = cw >= ch; // rrjetë përgjatë anës më të shkurtër (lartësisë)
    const side = Math.min(cw, ch);
    const row: SquarifyItem<T>[] = [];
    let rowArea = 0;
    let bestRatio = Infinity;

    while (idx < sorted.length) {
      const cand = sorted[idx];
      const candArea = cand.value * scale;
      const newArea = rowArea + candArea;
      const newThickness = newArea / side;
      if (newThickness <= 0) break;

      // Raporti më i keq aspekti brenda rreshtit kandidat
      let worst = 0;
      for (const it of row) {
        const a = it.value * scale;
        const len = newThickness > 0 ? a / newThickness : 0;
        const r = len > 0 ? Math.max(newThickness / len, len / newThickness) : Infinity;
        if (r > worst) worst = r;
      }
      const candLen = candArea / newThickness;
      const candRatio = candLen > 0 ? Math.max(newThickness / candLen, candLen / newThickness) : Infinity;
      const candWorst = Math.max(worst, candRatio);

      if (row.length === 0 || candWorst <= bestRatio) {
        row.push(cand);
        rowArea = newArea;
        bestRatio = candWorst;
        idx++;
      } else {
        break;
      }
    }

    if (row.length === 0) break;
    const thickness = rowArea / side;
    let off = 0;
    for (const it of row) {
      const a = it.value * scale;
      const len = thickness > 0 ? a / thickness : 0;
      if (isVerticalStrip) {
        result.push({ x: cx, y: cy + off, w: thickness, h: len, data: it.data });
      } else {
        result.push({ x: cx + off, y: cy, w: len, h: thickness, data: it.data });
      }
      off += len;
    }
    if (isVerticalStrip) {
      cx += thickness;
      cw -= thickness;
    } else {
      cy += thickness;
      ch -= thickness;
    }
  }

  return result;
}

// ─── Ngjyrat sipas % ndryshimit ditor (shkallë Finviz) ───

function changeColor(chg: number): { bg: string; text: string } {
  if (chg >= 5) return { bg: '#14532d', text: '#dcfce7' };
  if (chg >= 3) return { bg: '#16a34a', text: '#ffffff' };
  if (chg >= 1) return { bg: '#22c55e', text: '#052e16' };
  if (chg >= 0.3) return { bg: '#4ade80', text: '#14532d' };
  if (chg > 0.05) return { bg: '#86efac', text: '#14532d' };
  if (chg >= -0.05) return { bg: '#64748b', text: '#f1f5f9' };
  if (chg > -0.3) return { bg: '#fca5a5', text: '#7f1d1d' };
  if (chg > -1) return { bg: '#f87171', text: '#7f1d1d' };
  if (chg > -3) return { bg: '#ef4444', text: '#ffffff' };
  if (chg > -5) return { bg: '#dc2626', text: '#ffffff' };
  return { bg: '#7f1d1d', text: '#fee2e2' };
}

function sectorHeaderColor(avgChg: number): string {
  if (avgChg >= 1) return 'text-emerald-400';
  if (avgChg > 0.05) return 'text-emerald-300';
  if (avgChg >= -0.05) return 'text-slate-300';
  if (avgChg > -1) return 'text-red-300';
  return 'text-red-400';
}

// ─── Formatues ───

function fmtMcap(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function fmtVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return `${v}`;
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
}

function fmtPrice(v: number): string {
  return `$${v.toFixed(2)}`;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString('sq-AL', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ─── Strukturat e layout-it ───

interface CompanyTile {
  stock: MarketMapStock;
  rect: Rect;
}

interface SectorBlock {
  key: string;
  label: string;
  rect: Rect;
  avgChange: number;
  count: number;
  totalCap: number;
  companies: CompanyTile[];
}

const SECTOR_BG = 'rgba(30, 41, 59, 0.55)'; // slate-800 i tejdukshëm
const HEADER_H = 20;

export function MarketMap({ onSelectStock }: MarketMapProps) {
  const [stocks, setStocks] = useState<MarketMapStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const [isLive, setIsLive] = useState(true);
  const [selectedSector, setSelectedSector] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [hovered, setHovered] = useState<{ stock: MarketMapStock; x: number; y: number } | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);

  // Matja e gjerësisë me ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setWidth(el.getBoundingClientRect().width);
    return () => observer.disconnect();
  }, []);

  const load = useCallback(async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/market-map${force ? '?refresh=1' : ''}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.ok && Array.isArray(data.stocks) && data.stocks.length > 0) {
        setStocks(data.stocks);
        setUpdatedAt(typeof data.fetchedAt === 'number' ? data.fetchedAt : Date.now());
        setIsLive(true);
      } else {
        setError(data.error || 'Nuk morën dot të dhënat e tregut.');
        if (Array.isArray(data.stocks) && data.stocks.length > 0) {
          setStocks(data.stocks);
          setIsLive(false);
        }
      }
    } catch {
      setError('Gabim rrjeti — nuk u lidh dot me serverin.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  // Rifreskimi automatik çdo 60s
  const autoRefreshRef = useRef(autoRefresh);
  autoRefreshRef.current = autoRefresh;
  useEffect(() => {
    const id = window.setInterval(() => {
      if (autoRefreshRef.current) load(false);
    }, 60000);
    return () => window.clearInterval(id);
  }, [load]);

  // ─── Statistika kokëfaqe ───
  const stats = useMemo(() => {
    if (stocks.length === 0) return { adv: 0, dec: 0, avg: 0, totalCap: 0 };
    let adv = 0;
    let dec = 0;
    let capSum = 0;
    let chgSum = 0;
    for (const s of stocks) {
      if (s.changePercent > 0.05) adv++;
      else if (s.changePercent < -0.05) dec++;
      capSum += s.marketCap;
      chgSum += s.changePercent * s.marketCap;
    }
    return { adv, dec, avg: capSum > 0 ? chgSum / capSum : 0, totalCap: capSum };
  }, [stocks]);

  // ─── Llogaritja e layout-it (squarify 2-nivelesh) ───
  const height = Math.round(Math.max(520, Math.min(780, width * 0.55)));

  const sectorBlocks = useMemo<SectorBlock[]>(() => {
    if (!width || stocks.length === 0) return [];
    const w = width;
    const h = height;

    // Kur është zgjedhur një sektor i vetëm — të gjitha kompanitë e tij mbushin mapën
    if (selectedSector) {
      const sectorStocks = stocks
        .filter(s => s.sectorKey === selectedSector)
        .sort((a, b) => b.marketCap - a.marketCap);
      if (sectorStocks.length === 0) return [];
      const tiles = squarify(
        sectorStocks.map(s => ({ value: s.marketCap, data: s })),
        { x: 0, y: 0, w, h },
      );
      const capSum = sectorStocks.reduce((sum, s) => sum + s.marketCap, 0);
      const chgSum = sectorStocks.reduce((sum, s) => sum + s.changePercent * s.marketCap, 0);
      const label = sectorStocks[0]?.sector || '';
      return [{
        key: selectedSector,
        label,
        rect: { x: 0, y: 0, w, h },
        avgChange: capSum > 0 ? chgSum / capSum : 0,
        count: sectorStocks.length,
        totalCap: capSum,
        companies: tiles.map(t => ({ stock: t.data, rect: { x: t.x, y: t.y, w: t.w, h: t.h } })),
      }];
    }

    // Grupimi sipas sektorëve
    const bySector = new Map<string, MarketMapStock[]>();
    for (const s of stocks) {
      const list = bySector.get(s.sectorKey);
      if (list) list.push(s);
      else bySector.set(s.sectorKey, [s]);
    }

    const sectorItems: SquarifyItem<{ key: string; label: string; stocks: MarketMapStock[]; totalCap: number; avgChange: number }>[] = [];
    for (const [key, list] of bySector) {
      if (list.length === 0) continue;
      const totalCap = list.reduce((sum, s) => sum + s.marketCap, 0);
      if (totalCap <= 0) continue;
      const chgSum = list.reduce((sum, s) => sum + s.changePercent * s.marketCap, 0);
      sectorItems.push({
        value: totalCap,
        data: { key, label: list[0].sector, stocks: [...list].sort((a, b) => b.marketCap - a.marketCap), totalCap, avgChange: chgSum / totalCap },
      });
    }

    const sectorRects = squarify(sectorItems, { x: 0, y: 0, w, h });

    const blocks: SectorBlock[] = [];
    for (const sr of sectorRects) {
      const hasHeader = sr.h >= 64 && sr.w >= 90;
      const inner: Rect = hasHeader
        ? { x: sr.x + 2, y: sr.y + HEADER_H + 1, w: Math.max(0, sr.w - 4), h: Math.max(0, sr.h - HEADER_H - 3) }
        : { x: sr.x + 2, y: sr.y + 2, w: Math.max(0, sr.w - 4), h: Math.max(0, sr.h - 4) };

      const tiles = squarify(
        sr.data.stocks.map(s => ({ value: s.marketCap, data: s })),
        inner,
      );

      blocks.push({
        key: sr.data.key,
        label: sr.data.label,
        rect: { x: sr.x, y: sr.y, w: sr.w, h: sr.h },
        avgChange: sr.data.avgChange,
        count: sr.data.stocks.length,
        totalCap: sr.data.totalCap,
        companies: tiles
          .map(t => ({ stock: t.data, rect: { x: t.x, y: t.y, w: t.w, h: t.h } }))
          .filter(t => t.rect.w >= 1.5 && t.rect.h >= 1.5),
      });
    }
    return blocks;
  }, [stocks, width, height, selectedSector]);

  const sectorList = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of stocks) map.set(s.sectorKey, s.sector);
    return Array.from(map.entries()).map(([key, label]) => ({ key, label }));
  }, [stocks]);

  // ─── Render ───

  const handleMouseMove = (e: React.MouseEvent, stock: MarketMapStock) => {
    setHovered({ stock, x: e.clientX, y: e.clientY });
  };

  const tooltip = useMemo(() => {
    if (!hovered) return null;
    const { stock } = hovered;
    const color = changeColor(stock.changePercent);
    // ── Kompanitë e të njëjtit sektor si listë me lëvizjet (stil Finviz) ──
    const members = stocks
      .filter(s => s.sectorKey === stock.sectorKey)
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0));
    const withChg = members.filter(m => Number.isFinite(m.changePercent));
    const wSum = withChg.reduce((sum, m) => sum + (m.marketCap || 0), 0);
    const sectorAvg =
      wSum > 0
        ? withChg.reduce((sum, m) => sum + (m.marketCap || 0) * m.changePercent, 0) / wSum
        : null;
    // Lartësia e parashikuar për pozicionim pa prerje
    const listRows = Math.min(members.length, 20);
    const estH = 132 + listRows * 17 + 34;
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;
    return (
      <div
        className="fixed z-50 pointer-events-none overflow-hidden rounded-lg border border-slate-600 bg-slate-900/95 shadow-2xl w-[300px]"
        style={{
          left: Math.max(8, Math.min(hovered.x + 14, vw - 310)),
          top: Math.max(8, Math.min(hovered.y + 14, vh - estH - 10)),
        }}
      >
        {/* Kokë — kompania mbi të cilën është miu */}
        <div className="px-3 py-2">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-bold text-white">{stock.symbol}</span>
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded" style={{ background: color.bg, color: color.text }}>
              {fmtPct(stock.changePercent)}
            </span>
          </div>
          <div className="text-[11px] text-slate-300 mt-0.5 truncate">{stock.name}</div>
          <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">Çmimi</span>
              <span className="font-semibold text-white">{fmtPrice(stock.price)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">Mbyllja</span>
              <span className="text-slate-300">{fmtPrice(stock.previousClose)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">Kapitalizimi</span>
              <span className="text-slate-300">{fmtMcap(stock.marketCap)}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-400">Volumi</span>
              <span className="text-slate-300">{fmtVol(stock.volume)}</span>
            </div>
          </div>
        </div>

        {/* Kreu i listës së sektorit */}
        <div className="flex items-center justify-between border-t border-slate-700/70 bg-slate-800/70 px-3 py-1">
          <span className="text-[10px] font-bold uppercase tracking-wide text-slate-300">
            {stock.sector} · {members.length} kompani
          </span>
          {sectorAvg != null && Number.isFinite(sectorAvg) && (
            <span className={`text-[10px] font-bold ${sectorHeaderColor(sectorAvg)}`}>
              {fmtPct(sectorAvg)}
            </span>
          )}
        </div>

        {/* Lista: të gjitha kompanitë e sektorit me lëvizjet ditore */}
        <div className="max-h-[220px] overflow-y-auto py-0.5">
          {members.map(m => {
            const isMe = m.symbol === stock.symbol;
            const up = Number.isFinite(m.changePercent) ? m.changePercent >= 0 : null;
            return (
              <div
                key={m.symbol}
                className={`grid grid-cols-[44px_1fr_52px] items-center gap-1 px-3 py-[2px] text-[10.5px] ${
                  isMe ? 'border-l-2 border-blue-400 bg-blue-500/15' : ''
                }`}
              >
                <span className="font-bold text-slate-100">
                  {isMe ? '\u25b8' : ''} {m.symbol}
                </span>
                <span className="truncate text-slate-400">{m.name}</span>
                <span
                  className={`text-right font-bold ${
                    up == null ? 'text-slate-500' : up ? 'text-emerald-400' : 'text-red-400'
                  }`}
                >
                  {fmtPct(m.changePercent)}
                </span>
              </div>
            );
          })}
        </div>

        {onSelectStock && (
          <div className="flex items-center gap-1 border-t border-slate-700/70 bg-slate-900/95 px-3 py-1 text-[9.5px] text-emerald-400">
            <MousePointerClick className="w-3 h-3" /> Kliko pllakën për grafikun Finviz / analizën me AI
          </div>
        )}
      </div>
    );
  }, [hovered, stocks, onSelectStock]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="pt-5 pb-5 space-y-4">
          {/* Kokëfaqja */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="bg-emerald-500/15 rounded-lg p-2.5 text-emerald-400 flex-shrink-0">
                <LayoutGrid className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-foreground">Map e Tregut (stil Finviz)</h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Kompanitë më të mëdha sipas sektorëve · madhësia = kapitalizimi · ngjyra = ndryshimi ditor
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {isLive && !error && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> LIVE
                </span>
              )}
              <button
                onClick={() => setAutoRefresh(v => !v)}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[10px] font-medium transition-colors ${
                  autoRefresh
                    ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-400'
                    : 'border-slate-600 bg-slate-800/60 text-slate-400'
                }`}
                title="Rifreskimi automatik çdo 60 sekonda"
              >
                <RefreshCw className={`w-3 h-3 ${autoRefresh ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                Auto 60s {autoRefresh ? 'ON' : 'OFF'}
              </button>
              <button
                onClick={() => load(true)}
                disabled={loading}
                className="inline-flex items-center gap-1 rounded-md bg-emerald-600/90 border border-emerald-500/50 px-2.5 py-1 text-[10px] font-medium text-white hover:bg-emerald-600 disabled:opacity-60 transition-colors"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                Rifresko
              </button>
            </div>
          </div>

          {/* Statistikat */}
          {stocks.length > 0 && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
              <span className="inline-flex items-center gap-1 text-emerald-400 font-medium">
                <TrendingUp className="w-3.5 h-3.5" /> {stats.adv} në majtje
              </span>
              <span className="inline-flex items-center gap-1 text-red-400 font-medium">
                <TrendingDown className="w-3.5 h-3.5" /> {stats.dec} në rënie
              </span>
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <Minus className="w-3.5 h-3.5" /> {stocks.length - stats.adv - stats.dec} pa ndryshim
              </span>
              <span className="text-muted-foreground">
                Mesatarja e ponderuar: <span className={`font-semibold ${stats.avg >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>{fmtPct(stats.avg)}</span>
              </span>
              {updatedAt && <span className="text-muted-foreground">· Përditësuar: {fmtTime(updatedAt)}</span>}
            </div>
          )}

          {/* Filtri i sektorëve */}
          {sectorList.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setSelectedSector(null)}
                className={`rounded-md px-2.5 py-1 text-[10px] font-medium border transition-colors ${
                  selectedSector === null
                    ? 'bg-slate-200 border-slate-200 text-slate-900'
                    : 'bg-slate-800/60 border-slate-600/60 text-slate-300 hover:bg-slate-700/60'
                }`}
              >
                Të gjitha sektorët
              </button>
              {sectorList.map(sec => (
                <button
                  key={sec.key}
                  onClick={() => setSelectedSector(selectedSector === sec.key ? null : sec.key)}
                  className={`rounded-md px-2.5 py-1 text-[10px] font-medium border transition-colors ${
                    selectedSector === sec.key
                      ? 'bg-slate-200 border-slate-200 text-slate-900'
                      : 'bg-slate-800/60 border-slate-600/60 text-slate-300 hover:bg-slate-700/60'
                  }`}
                >
                  {sec.label}
                </button>
              ))}
            </div>
          )}

          {/* Gabimi */}
          {error && (
            <div className="rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2.5">
              <p className="text-xs text-red-400">{error}</p>
              <button onClick={() => load(true)} className="mt-2 rounded-md bg-red-600/90 px-3 py-1 text-[11px] font-medium text-white hover:bg-red-600">
                Provo përsëri
              </button>
            </div>
          )}

          {/* Mapa */}
          <div ref={containerRef} className="relative w-full overflow-hidden rounded-lg border border-slate-700/60 bg-slate-950" style={{ height: Math.max(height, 300) }}>
            {loading && stocks.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <RefreshCw className="w-6 h-6 text-emerald-400 animate-spin" />
                  <span className="text-xs text-muted-foreground">Duke ngarkuar të dhënat e tregut…</span>
                </div>
              </div>
            ) : stocks.length === 0 ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-xs text-muted-foreground">Pa të dhëna</span>
              </div>
            ) : (
              width > 0 &&
              sectorBlocks.map(block => (
                <div
                  key={block.key}
                  className="absolute"
                  style={{
                    left: block.rect.x,
                    top: block.rect.y,
                    width: block.rect.w,
                    height: block.rect.h,
                    background: SECTOR_BG,
                    border: '1px solid rgba(148, 163, 184, 0.25)',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  {/* Kokëfaqa e sektorit */}
                  {block.rect.h >= 64 && block.rect.w >= 90 && !selectedSector && (
                    <div className="flex items-center justify-between gap-1 px-1.5" style={{ height: HEADER_H }}>
                      <span className="text-[10px] font-semibold text-slate-200 truncate">{block.label}</span>
                      <span className={`text-[10px] font-semibold whitespace-nowrap ${sectorHeaderColor(block.avgChange)}`}>
                        {fmtPct(block.avgChange)}
                      </span>
                    </div>
                  )}
                  {/* Pllakat e kompanive */}
                  {block.companies.map(tile => {
                    const c = changeColor(tile.stock.changePercent);
                    const w = tile.rect.w;
                    const h = tile.rect.h;
                    const showBoth = w >= 46 && h >= 34;
                    const showTickerOnly = !showBoth && w >= 30 && h >= 16;
                    return (
                      <div
                        key={tile.stock.symbol}
                        className="absolute cursor-pointer transition-[filter] duration-75 hover:brightness-125 hover:z-10"
                        style={{
                          left: tile.rect.x - block.rect.x,
                          top: tile.rect.y - block.rect.y,
                          width: tile.rect.w,
                          height: tile.rect.h,
                          background: c.bg,
                          color: c.text,
                          border: '1px solid rgba(15, 23, 42, 0.9)',
                          borderRadius: 2,
                          overflow: 'hidden',
                          display: 'flex',
                          flexDirection: 'column',
                          alignItems: 'center',
                          justifyContent: 'center',
                          lineHeight: 1.15,
                          padding: '0 2px',
                        }}
                        onMouseMove={e => handleMouseMove(e, tile.stock)}
                        onMouseLeave={() => setHovered(null)}
                        onClick={() => onSelectStock?.(tile.stock.symbol)}
                        title={showBoth ? undefined : `${tile.stock.symbol} ${fmtPct(tile.stock.changePercent)}`}
                      >
                        {showBoth && (
                          <>
                            <span style={{ fontSize: w >= 74 && h >= 44 ? 12 : 10, fontWeight: 700 }}>{tile.stock.symbol}</span>
                            <span style={{ fontSize: w >= 74 && h >= 44 ? 11 : 9, fontWeight: 600, marginTop: 1 }}>
                              {fmtPct(tile.stock.changePercent)}
                            </span>
                          </>
                        )}
                        {showTickerOnly && (
                          <span style={{ fontSize: 8.5, fontWeight: 700 }}>{tile.stock.symbol}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          {/* Legjenda */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">−5%</span>
              {['#7f1d1d', '#dc2626', '#ef4444', '#f87171', '#fca5a5', '#64748b', '#86efac', '#4ade80', '#22c55e', '#16a34a', '#14532d'].map(bg => (
                <span key={bg} className="w-4 h-3.5 rounded-sm" style={{ background: bg }} />
              ))}
              <span className="text-[10px] text-muted-foreground">+5%</span>
            </div>
            <span className="text-[10px] text-muted-foreground">
              Burimi: Yahoo Finance (vonesa deri 15 min) · {stocks.length} kompani · kliko pllakën për analizë
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Tooltip global */}
      {tooltip}
    </motion.div>
  );
}

export default MarketMap;
