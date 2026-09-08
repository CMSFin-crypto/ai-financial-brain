'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  BarChart3,
  Activity,
  Search,
  Loader2,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUp,
  ArrowDown,
  DollarSign,
  AlertTriangle,
  BrainCircuit,
} from 'lucide-react';
import { StockSearch } from './stock-search';

interface CandleData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ═══ Safety helper for numeric formatting ═══
// Prevents "Cannot read properties of undefined (reading 'toFixed')" crashes
// when the AI returns malformed numeric fields.
function fmt(v: unknown, digits = 2): string {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return '—';
  return n.toFixed(digits);
}

// ═══ Normalize actionPlan: AI sometimes returns an object {entryZone, stopLoss, ...}
// instead of a string. Convert it to a readable Albanian string.
function formatActionPlan(plan: string | ActionPlan | undefined | null): string {
  if (!plan) return 'Monitoroni indikatorët dhe prisni sinjal të qartë.';
  if (typeof plan === 'string') return plan;
  const parts: string[] = [];
  if (plan.entryZone) parts.push(`Hyrje: ${plan.entryZone}`);
  if (plan.stopLoss) parts.push(`Stop Loss: ${plan.stopLoss}`);
  if (plan.target1) parts.push(`Target 1: ${plan.target1}`);
  if (plan.target2) parts.push(`Target 2: ${plan.target2}`);
  if (plan.riskRewardRatio) parts.push(`Risk:Reward: ${plan.riskRewardRatio}`);
  if (plan.positionSizing) parts.push(`Madhësia e pozicionit: ${plan.positionSizing}`);
  return parts.length > 0 ? parts.join(' | ') : 'Monitoroni indikatorët dhe prisni sinjal të qartë.';
}

interface Indicator {
  value: number;
  signal: string;
  interpretation: string;
}

interface PriceAnalysis {
  currentPrice: number;
  previousClose: number;
  priceChange: number;
  trend: string;
  trendStrength: string;
}

interface ActionPlan {
  entryZone?: string;
  stopLoss?: string;
  target1?: string;
  target2?: string;
  riskRewardRatio?: string;
  positionSizing?: string;
}

interface TechnicalAnalysisResult {
  ticker: string;
  company: string;
  sector?: string;
  overallSignal: string;
  confidence: number;
  priceAnalysis: PriceAnalysis;
  isDemo?: boolean;
  isRealChart?: boolean;
  indicators: {
    rsi: Indicator;
    macd: Indicator;
    movingAverage: {
      sma20: string;
      sma50: string;
      sma200: string;
      ema12: string;
      signal: string;
      interpretation: string;
    };
    bollingerBands: {
      upper: string;
      middle: string;
      lower: string;
      signal: string;
      interpretation: string;
    };
    volume: Indicator;
    stochastic: { k: number; d: number; signal: string; interpretation: string };
  };
  supportResistance: {
    supports: string[];
    resistances: string[];
  };
  patterns: Array<{ name: string; type: string; reliability: string; description: string }>;
  candlestickData: CandleData[];
  summary: string;
  // AI sometimes returns actionPlan as an object (entryZone, stopLoss, etc.) instead of a string.
  // Support both shapes — the renderer normalizes via formatActionPlan().
  actionPlan: string | ActionPlan;
}

// ═══ Technical indicator computations ═══
function computeSMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += closes[j];
    result.push(sum / period);
  }
  return result;
}

function computeEMA(closes: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = [];
  let ema: number | null = null;
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    if (ema === null) {
      let sum = 0; for (let j = i - period + 1; j <= i; j++) sum += closes[j];
      ema = sum / period;
    } else {
      ema = closes[i] * k + ema * (1 - k);
    }
    result.push(ema);
  }
  return result;
}

function computeRSI(closes: number[], period: number = 14): (number | null)[] {
  const result: (number | null)[] = [];
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    gains.push(diff > 0 ? diff : 0);
    losses.push(diff < 0 ? -diff : 0);
  }
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < Math.min(period, gains.length); i++) { avgGain += gains[i]; avgLoss += losses[i]; }
  avgGain /= period; avgLoss /= period;
  for (let i = 0; i < period - 1; i++) result.push(null);
  const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  result.push(100 - 100 / (1 + rs));
  for (let i = period; i < gains.length; i++) {
    avgGain = (avgGain * (period - 1) + gains[i]) / period;
    avgLoss = (avgLoss * (period - 1) + losses[i]) / period;
    const rs2 = avgLoss === 0 ? 100 : avgGain / avgLoss;
    result.push(100 - 100 / (1 + rs2));
  }
  return result;
}

function computeMACD(closes: number[], fastPeriod = 12, slowPeriod = 26, signalPeriod = 9): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const emaFast = computeEMA(closes, fastPeriod);
  const emaSlow = computeEMA(closes, slowPeriod);
  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (emaFast[i] === null || emaSlow[i] === null) { macdLine.push(null); continue; }
    macdLine.push(emaFast[i]! - emaSlow[i]!);
  }
  // Signal = EMA of MACD line — very short period so signal starts quickly
  const validMACD = macdLine.filter((v): v is number => v !== null);
  const sigPeriod = Math.min(signalPeriod, Math.max(2, Math.floor(validMACD.length * 0.15)));
  const signalEma = computeEMA(validMACD, sigPeriod);
  const signal: (number | null)[] = [];
  let vi = 0;
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] === null) { signal.push(null); continue; }
    signal.push(signalEma[vi] ?? null);
    vi++;
  }
  const histogram: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (macdLine[i] === null || signal[i] === null) { histogram.push(null); continue; }
    histogram.push(macdLine[i]! - signal[i]!);
  }
  return { macd: macdLine, signal, histogram };
}

function computeBollingerBands(closes: number[], period: number = 20, mult: number = 2): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = computeSMA(closes, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (middle[i] === null) { upper.push(null); lower.push(null); continue; }
    let sumSq = 0;
    for (let j = i - period + 1; j <= i; j++) sumSq += (closes[j] - middle[i]!) ** 2;
    const std = Math.sqrt(sumSq / period);
    upper.push(middle[i]! + mult * std);
    lower.push(middle[i]! - mult * std);
  }
  return { upper, middle, lower };
}

// ═══ Volume Profile computation ═══
// Bins candlestick data into horizontal price levels and accumulates traded
// volume at each level. Identifies POC (Point of Control — highest volume
// price), VAH/VAL (Value Area High/Low — prices containing 70% of total volume
// centered on POC), and HVN/LVN (High/Low Volume Nodes — levels with above/
// below-average volume).
//
// Algorithm:
// 1. Determine price range [pMin, pMax] from candle lows/highs.
// 2. Divide range into NUM_BINS equal price buckets.
// 3. For each candle, distribute its volume across the price bins it spans
//    (open→high→low→close range), proportional to the bin overlap.
// 4. Find POC = bin with maximum volume.
// 5. Expand outward from POC until 70% of total volume is captured → VAH/VAL.
// 6. Mark bins above mean+std as HVN, below mean-std as LVN.
function computeVolumeProfile(data: CandleData[], numBins = 28): {
  bins: { priceMid: number; vol: number; isPOC: boolean; isHVN: boolean; isLVN: boolean }[];
  poc: number;        // Point of Control price
  vah: number;        // Value Area High
  val: number;        // Value Area Low
  totalVol: number;
  maxBinVol: number;
  hvn: number[];      // High Volume Node prices
  lvn: number[];      // Low Volume Node prices
} {
  if (!data || data.length === 0) {
    return { bins: [], poc: 0, vah: 0, val: 0, totalVol: 0, maxBinVol: 0, hvn: [], lvn: [] };
  }

  let pMin = Infinity, pMax = -Infinity;
  let totalVol = 0;
  for (const d of data) {
    if (typeof d.low === 'number' && d.low < pMin) pMin = d.low;
    if (typeof d.high === 'number' && d.high > pMax) pMax = d.high;
    if (typeof d.volume === 'number') totalVol += d.volume;
  }
  if (!Number.isFinite(pMin) || !Number.isFinite(pMax) || pMax <= pMin) {
    return { bins: [], poc: 0, vah: 0, val: 0, totalVol: 0, maxBinVol: 0, hvn: [], lvn: [] };
  }

  const pad = (pMax - pMin) * 0.02;
  pMin -= pad;
  pMax += pad;
  const binSize = (pMax - pMin) / numBins;
  const bins = new Array(numBins).fill(0).map((_, i) => ({
    priceMid: pMin + binSize * (i + 0.5),
    vol: 0,
    isPOC: false,
    isHVN: false,
    isLVN: false,
  }));

  // Distribute each candle's volume across the price bins it touched
  for (const d of data) {
    const cLow = Math.min(d.open, d.close, d.low);
    const cHigh = Math.max(d.open, d.close, d.high);
    const startBin = Math.max(0, Math.floor((cLow - pMin) / binSize));
    const endBin = Math.min(numBins - 1, Math.ceil((cHigh - pMin) / binSize));
    const binsTouched = endBin - startBin + 1;
    if (binsTouched <= 0) continue;
    const volPerBin = (d.volume || 0) / binsTouched;
    for (let b = startBin; b <= endBin; b++) bins[b].vol += volPerBin;
  }

  // Find POC (max volume bin)
  let pocIdx = 0, maxBinVol = 0;
  for (let i = 0; i < numBins; i++) {
    if (bins[i].vol > maxBinVol) { maxBinVol = bins[i].vol; pocIdx = i; }
  }
  bins[pocIdx].isPOC = true;

  // Compute mean & std for HVN/LVN classification
  const meanVol = totalVol / numBins;
  let variance = 0;
  for (const b of bins) variance += (b.vol - meanVol) ** 2;
  const std = Math.sqrt(variance / numBins);
  const hvnThreshold = meanVol + std * 0.5;
  const lvnThreshold = Math.max(meanVol * 0.3, meanVol - std * 0.5);

  const hvnPrices: number[] = [];
  const lvnPrices: number[] = [];
  for (const b of bins) {
    if (b.vol >= hvnThreshold) { b.isHVN = true; hvnPrices.push(b.priceMid); }
    if (b.vol > 0 && b.vol <= lvnThreshold) { b.isLVN = true; lvnPrices.push(b.priceMid); }
  }

  // Value Area: expand from POC until 70% of total volume is captured
  const valueAreaPct = 0.70;
  const targetVol = totalVol * valueAreaPct;
  let captured = bins[pocIdx].vol;
  let lo = pocIdx, hi = pocIdx;
  while (captured < targetVol && (lo > 0 || hi < numBins - 1)) {
    const upVol = hi < numBins - 1 ? bins[hi + 1].vol : -1;
    const dnVol = lo > 0 ? bins[lo - 1].vol : -1;
    if (upVol >= dnVol) { hi++; if (hi < numBins) captured += bins[hi].vol; }
    else { lo--; if (lo >= 0) captured += bins[lo].vol; }
  }
  const vah = bins[hi].priceMid;
  const val = bins[lo].priceMid;

  return {
    bins,
    poc: bins[pocIdx].priceMid,
    vah,
    val,
    totalVol,
    maxBinVol,
    hvn: hvnPrices,
    lvn: lvnPrices,
  };
}

// ═══ TradingView-style right-edge label group ═══
// Renders colored tags at the end of each indicator line (left of Y-axis),
// stacking them vertically if they overlap.
function EdgeLabels({ items, rightEdge, fontSize = 9.5 }: {
  items: { label: string; y: number; color: string }[];
  rightEdge: number;
  fontSize?: number;
}) {
  const LH = fontSize + 3; // line height per label
  const MIN_GAP = 2;

  // Sort by Y, then resolve overlaps by pushing downward
  const sorted = [...items].sort((a, b) => a.y - b.y);
  const placed: { label: string; y: number; color: string }[] = [];
  for (const item of sorted) {
    let y = item.y - LH / 2; // center vertically on the line
    for (const p of placed) {
      if (y < p.y + LH + MIN_GAP && y + LH > p.y) {
        y = p.y + LH + MIN_GAP; // push below
      }
    }
    placed.push({ ...item, y });
  }

  return (
    <g>
      {placed.map((p, i) => {
        const textW = p.label.length * fontSize * 0.6 + 8;
        const rx = rightEdge - textW - 4;
        return (
          <g key={i}>
            <rect x={rx} y={p.y} width={textW} height={LH} rx={2} fill={p.color} opacity={0.92} />
            <text
              x={rx + 4}
              y={p.y + fontSize + 1}
              fill="white"
              fontSize={fontSize}
              fontFamily="Trebuchet MS, sans-serif"
              fontWeight="600"
            >{p.label}</text>
          </g>
        );
      })}
    </g>
  );
}

// ═══ Drawing types ═══
type DrawingTool = 'none' | 'trendline' | 'long' | 'short' | 'pan';

interface Drawing {
  id: string;
  type: 'trendline' | 'long' | 'short';
  // Trend line: two normalized points (0..1 of viewBox)
  x1?: number; y1?: number;
  x2?: number; y2?: number;
  // Horizontal lines: just price
  price?: number;
  color: string;
  label?: string;
}

// ═══ TradingView-Style Technical Chart ═══
// Wrapper component that holds drawing state across timeframe switches.
// When `tickerSymbol` changes, drawings are cleared.
// When only `data` changes (timeframe switch), drawings are PRESERVED.
function CandlestickChart({
  data,
  supports = [],
  resistances = [],
  tickerSymbol,
}: {
  data: CandleData[];
  supports?: string[] | number[];
  resistances?: string[] | number[];
  tickerSymbol?: string;
}) {
  return (
    <CandlestickChartInner
      key={tickerSymbol || 'unknown'}
      data={data}
      supports={supports}
      resistances={resistances}
      tickerSymbol={tickerSymbol}
    />
  );
}

function CandlestickChartInner({
  data,
  supports = [],
  resistances = [],
  tickerSymbol,
}: {
  data: CandleData[];
  supports?: string[] | number[];
  resistances?: string[] | number[];
  tickerSymbol?: string;
}) {
  const [tooltip, setTooltip] = useState<{ text: string; x: number; y: number } | null>(null);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [activeTool, setActiveTool] = useState<DrawingTool>('none');
  const [pendingPoint, setPendingPoint] = useState<{ x: number; y: number; price: number } | null>(null);
  const [drawingInfo, setDrawingInfo] = useState<{ drawing: Drawing; x: number; y: number } | null>(null);
  const [lineInfo, setLineInfo] = useState<{ lineType: string; label: string; price?: number; x: number; y: number } | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);

  // ─── Zoom & Pan state ───
  // zoom: 1 = fit all data; 2 = 2x zoomed in. zoomPct (0..1) = horizontal position of the viewport.
  const [zoom, setZoom] = useState(1);
  const [zoomPct, setZoomPct] = useState(0); // 0 = left edge, 1 = right edge
  const [isPanning, setIsPanning] = useState(false);
  const panStart = useRef<{ x: number; pct: number } | null>(null);

  // ─── Trend line drag state ───
  // While dragging a trend line, we store the start point and track the current end.
  const [dragTrend, setDragTrend] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  // Listen for tooltip events from buildChart (which can't access setTooltip directly)
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { text: string; x: number; y: number };
      setTooltip(detail);
    };
    window.addEventListener('chart-tooltip', handler as EventListener);
    return () => window.removeEventListener('chart-tooltip', handler as EventListener);
  }, []);

  // Listen for chart-line-click events — when user clicks on a chart line
  // (POC, VAH, VAL, SMA, EMA, BB, Support, Resistance), show a detailed info popup.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { lineType: string; label: string; price?: number; x: number; y: number };
      setLineInfo(detail);
      // Close any open drawing popup
      setDrawingInfo(null);
    };
    window.addEventListener('chart-line-click', handler as EventListener);
    return () => window.removeEventListener('chart-line-click', handler as EventListener);
  }, []);

  // NOTE: Drawings are NOT cleared on timeframe changes.
  // The wrapper component uses key={tickerSymbol} so the inner component
  // (and its drawing state) is fully reset ONLY when the ticker symbol
  // changes. When only `data` changes (timeframe switch), the inner
  // component stays mounted and drawings reposition automatically
  // based on the new price scale.

  // Compute the visible data slice for zoom/pan.
  // zoom=1 → show all data. zoom=2 → show half. zoomPct=0 → start from left.
  const dataStart = Math.floor((zoomPct) * (data?.length || 0));
  const dataEnd = Math.min(data?.length || 0, Math.ceil((zoomPct + 1 / zoom) * (data?.length || 0)));
  const visibleData = (zoom === 1 || !data) ? data : data.slice(dataStart, dataEnd);

  const chart = useMemo(() => {
    if (!visibleData || visibleData.length < 3) return null;
    try {
      return buildChart(visibleData, supports, resistances);
    } catch (err) {
      console.error('[CHART] buildChart failed:', err);
      return null;
    }
  }, [visibleData, supports, resistances]);

  // Compute price at a given Y pixel position (using same scale as buildChart)
  const priceAtY = (y: number): number => {
    if (!visibleData || visibleData.length === 0) return 0;
    const candleH = 280 * 0.82; // matches priceH * (1 - volRatio) in buildChart
    const hiVals = visibleData.map(d => d.high);
    const loVals = visibleData.map(d => d.low);
    const allH = Math.max(...hiVals);
    const allL = Math.min(...loVals);
    const pad = (allH - allL) * 0.06 || 1;
    const pMin = allL - pad;
    const pMax = allH + pad;
    const ratio = 1 - (y / candleH);
    return pMin + (pMax - pMin) * ratio;
  };

  // Convert pixel coords to viewBox coords (880×540)
  const toViewBox = (e: { clientX: number; clientY: number }) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const rect = svg.getBoundingClientRect();
    const VB_W = 880, VB_H = 540;
    const x = ((e.clientX - rect.left) / rect.width) * VB_W;
    const y = ((e.clientY - rect.top) / rect.height) * VB_H;
    return { x, y, nx: x / VB_W, ny: y / VB_H };
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // If a drawing info popup is open, just close it on outside click
    if (drawingInfo) {
      setDrawingInfo(null);
      return;
    }
    // If a chart-line info popup is open, close it on outside click
    if (lineInfo) {
      setLineInfo(null);
      return;
    }
    if (activeTool === 'none') {
      setTooltip(null);
      return;
    }
    e.stopPropagation();
    const pt = toViewBox(e);
    if (!pt) return;
    const price = priceAtY(pt.y);

    if (activeTool === 'long' || activeTool === 'short') {
      const color = activeTool === 'long' ? '#26a69a' : '#ef5350';
      const label = activeTool === 'long' ? `LONG $${fmt(price, 2)}` : `SHORT $${fmt(price, 2)}`;
      setDrawings(prev => [...prev, {
        id: `draw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        type: activeTool,
        price,
        color,
        label,
      }]);
      setActiveTool('none');
    } else if (activeTool === 'trendline') {
      // DRAG-TO-DRAW: start dragging from this point. pointermove updates end, pointerup commits.
      setDragTrend({ startX: pt.nx, startY: pt.ny, endX: pt.nx, endY: pt.ny });
    } else if (activeTool === 'pan') {
      // Start panning
      setIsPanning(true);
      panStart.current = { x: e.clientX, pct: zoomPct };
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    // Update trend line end point while dragging
    if (activeTool === 'trendline' && dragTrend) {
      const pt = toViewBox(e);
      if (!pt) return;
      setDragTrend({ ...dragTrend, endX: pt.nx, endY: pt.ny });
    }
    // Pan: shift the visible window
    if (activeTool === 'pan' && isPanning && panStart.current) {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const dx = e.clientX - panStart.current.x;
      // Convert pixel delta to percentage of total data width
      const pctDelta = dx / rect.width;
      let newPct = panStart.current.pct - pctDelta;
      // Clamp: keep viewport within [0, 1 - 1/zoom]
      const maxPct = Math.max(0, 1 - 1 / zoom);
      newPct = Math.max(0, Math.min(maxPct, newPct));
      setZoomPct(newPct);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    // Commit trend line if dragging
    if (activeTool === 'trendline' && dragTrend) {
      const dx = Math.abs(dragTrend.endX - dragTrend.startX);
      const dy = Math.abs(dragTrend.endY - dragTrend.startY);
      // Only commit if the user dragged more than a tiny threshold
      if (dx > 0.01 || dy > 0.01) {
        setDrawings(prev => [...prev, {
          id: `draw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type: 'trendline',
          x1: dragTrend.startX, y1: dragTrend.startY,
          x2: dragTrend.endX, y2: dragTrend.endY,
          color: '#f0b323',
        }]);
      }
      setDragTrend(null);
      setActiveTool('none');
    }
    // End panning
    if (activeTool === 'pan' && isPanning) {
      setIsPanning(false);
      panStart.current = null;
      (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    }
  };

  // Mouse wheel zoom — scroll up = zoom in, scroll down = zoom out
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Only zoom when pan tool is active OR when not drawing
    if (activeTool !== 'none' && activeTool !== 'pan') return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.8 : 1.25; // zoom factor
    let newZoom = zoom * delta;
    newZoom = Math.max(1, Math.min(20, newZoom)); // clamp 1x..20x
    if (newZoom === zoom) return;
    // Zoom centered on mouse position
    const pt = toViewBox(e);
    if (!pt) { setZoom(newZoom); return; }
    // nx is the normalized X (0..1) of the mouse in the viewBox.
    // We want the data point under the cursor to stay under the cursor.
    // Visible window: [zoomPct, zoomPct + 1/zoom]
    // Mouse position within visible window: (nx - zoomPct) * zoom
    const visW = 1 / zoom;
    const mouseInVis = (pt.nx - zoomPct) / visW; // 0..1 within visible window
    const newVisW = 1 / newZoom;
    // Keep the same data point under the cursor
    let newPct = pt.nx - mouseInVis * newVisW;
    const maxPct = Math.max(0, 1 - 1 / newZoom);
    newPct = Math.max(0, Math.min(maxPct, newPct));
    setZoom(newZoom);
    setZoomPct(newPct);
  };

  if (!chart) return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Asnjë të dhënë grafiku</div>;

  // viewBox dimensions must match buildChart
  const VB_W = 880;
  const VB_H = 540;

  // Helper: compute prices at trend line endpoints for display
  const priceAtNormY = (ny: number): number => {
    if (!data || data.length === 0) return 0;
    const candleH = 280 * 0.82;
    const hiVals = data.map(d => d.high);
    const loVals = data.map(d => d.low);
    const allH = Math.max(...hiVals);
    const allL = Math.min(...loVals);
    const pad = (allH - allL) * 0.06 || 1;
    const pMin = allL - pad;
    const pMax = allH + pad;
    const y = ny * VB_H;
    return pMin + (pMax - pMin) * (1 - y / candleH);
  };

  // Helper: show info popup for a drawing
  const showDrawingInfo = (drawing: Drawing, e: React.PointerEvent<SVGElement>) => {
    e.stopPropagation();
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    setDrawingInfo({
      drawing,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
    setActiveTool('none');
    setPendingPoint(null);
  };

  // Render drawings as overlay — clickable lines
  const drawingsSvg = drawings.map(d => {
    if (d.type === 'trendline' && d.x1 !== undefined && d.y1 !== undefined && d.x2 !== undefined && d.y2 !== undefined) {
      const x1 = d.x1 * VB_W, y1 = d.y1 * VB_H;
      const x2 = d.x2 * VB_W, y2 = d.y2 * VB_H;
      const price1 = priceAtNormY(d.y1);
      const price2 = priceAtNormY(d.y2);
      const slope = price2 - price1;
      const isRising = slope > 0;
      const slopePct = price1 !== 0 ? (slope / price1) * 100 : 0;
      // Angle in degrees for display
      const dx = x2 - x1, dy = y2 - y1;
      const angleDeg = Math.atan2(-dy, dx) * 180 / Math.PI; // negate dy because SVG Y is inverted
      return (
        <g key={d.id} className="cursor-pointer">
          {/* Wide invisible hit area — uses pointerEvents=stroke to ensure clicks register */}
          <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke="transparent"
            strokeWidth={14}
            pointerEvents="stroke"
            onPointerDown={(e) => showDrawingInfo(d, e as unknown as React.PointerEvent<SVGElement>)}
            style={{ cursor: 'pointer' }}
          />
          {/* Visible line */}
          <line
            x1={x1} y1={y1} x2={x2} y2={y2}
            stroke={d.color}
            strokeWidth={2.5}
            strokeLinecap="round"
            opacity={0.95}
            pointerEvents="none"
          />
          {/* Endpoints */}
          <circle cx={x1} cy={y1} r={4} fill={d.color} pointerEvents="none" />
          <circle cx={x2} cy={y2} r={4} fill={d.color} pointerEvents="none" />
          {/* Inline label at midpoint */}
          <g pointerEvents="none">
            <rect
              x={(x1 + x2) / 2 - 35}
              y={(y1 + y2) / 2 - 8}
              width={70}
              height={14}
              rx={2}
              fill={d.color}
              opacity={0.92}
            />
            <text
              x={(x1 + x2) / 2}
              y={(y1 + y2) / 2 + 2}
              fill="#131722"
              fontSize={9}
              fontFamily="Trebuchet MS, sans-serif"
              fontWeight="700"
              textAnchor="middle"
            >
              {isRising ? '↗' : '↘'} {isRising ? '+' : ''}{fmt(slopePct, 1)}%
            </text>
          </g>
        </g>
      );
    }
    if ((d.type === 'long' || d.type === 'short') && d.price !== undefined) {
      const candleH = 280 * 0.82;
      const hiVals = data.map(d => d.high);
      const loVals = data.map(d => d.low);
      const allH = Math.max(...hiVals);
      const allL = Math.min(...loVals);
      const pad = (allH - allL) * 0.06 || 1;
      const pMin = allL - pad;
      const pMax = allH + pad;
      const y = candleH * (1 - (d.price - pMin) / (pMax - pMin));
      const currentPrice = data[data.length - 1]?.close ?? 0;
      const distance = d.price - currentPrice;
      const distancePct = currentPrice !== 0 ? (distance / currentPrice) * 100 : 0;
      return (
        <g key={d.id} className="cursor-pointer">
          {/* Wide invisible hit area */}
          <line
            x1={2} y1={y} x2={VB_W - 60} y2={y}
            stroke="transparent"
            strokeWidth={14}
            pointerEvents="stroke"
            onPointerDown={(e) => showDrawingInfo(d, e as unknown as React.PointerEvent<SVGElement>)}
            style={{ cursor: 'pointer' }}
          />
          {/* Visible dashed line */}
          <line
            x1={2} y1={y}
            x2={VB_W - 60} y2={y}
            stroke={d.color}
            strokeWidth={1.8}
            strokeDasharray="10 3"
            opacity={0.9}
            pointerEvents="none"
          />
          {/* Price tag */}
          <rect x={VB_W - 60} y={y - 9} width={60} height={16} rx={2} fill={d.color} opacity={0.95} pointerEvents="none" />
          <text x={VB_W - 56} y={y + 2} fill="white" fontSize={9} fontFamily="Trebuchet MS, sans-serif" fontWeight="700" pointerEvents="none">
            {d.type === 'long' ? '▲' : '▼'} ${fmt(d.price, 2)}
          </text>
          {/* Distance badge at midpoint */}
          <g pointerEvents="none">
            <rect
              x={VB_W / 2 - 40}
              y={y - 8}
              width={80}
              height={14}
              rx={2}
              fill="#1e222d"
              opacity={0.85}
              stroke={d.color}
              strokeWidth={0.5}
            />
            <text
              x={VB_W / 2}
              y={y + 2}
              fill={d.color}
              fontSize={8.5}
              fontFamily="Trebuchet MS, sans-serif"
              fontWeight="600"
              textAnchor="middle"
            >
              {distance >= 0 ? '+' : ''}{fmt(distancePct, 2)}% nga çmimi
            </text>
          </g>
        </g>
      );
    }
    return null;
  });

  // Pending trend line draft (during drag-to-draw)
  const dragTrendSvg = dragTrend ? (
    <g pointerEvents="none">
      <line
        x1={dragTrend.startX * VB_W}
        y1={dragTrend.startY * VB_H}
        x2={dragTrend.endX * VB_W}
        y2={dragTrend.endY * VB_H}
        stroke="#f0b323"
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray="4 3"
        opacity={0.7}
      />
      <circle cx={dragTrend.startX * VB_W} cy={dragTrend.startY * VB_H} r={4} fill="#f0b323" />
      <circle cx={dragTrend.endX * VB_W} cy={dragTrend.endY * VB_H} r={4} fill="#f0b323" stroke="white" strokeWidth={1} />
    </g>
  ) : null;

  const pendingSvg = pendingPoint ? (
    <circle
      cx={pendingPoint.x * VB_W}
      cy={pendingPoint.y * VB_H}
      r={5}
      fill="#f0b323"
      stroke="white"
      strokeWidth={1.5}
      opacity={0.85}
    />
  ) : null;

  // visibleData, dataStart, dataEnd are computed above (shared with useMemo for chart)

  return (
    <div className="relative w-full h-full">
      {/* Drawing + Zoom toolbar */}
      <div className="absolute top-2 right-2 z-20 flex flex-col gap-1 bg-[#1e222d]/95 border border-[#2a2e39] rounded-md p-1.5 shadow-lg">
        <button
          onClick={() => { setActiveTool('trendline'); setPendingPoint(null); setDragTrend(null); }}
          className={`text-[10px] px-2 py-1 rounded text-white font-medium transition-colors ${
            activeTool === 'trendline' ? 'bg-amber-600' : 'bg-[#363a45] hover:bg-[#434651]'
          }`}
          title="Vizato vijë trendi (mbaj + tërhiq)"
        >
          ↗ Trend
        </button>
        <button
          onClick={() => { setActiveTool('long'); setPendingPoint(null); setDragTrend(null); }}
          className={`text-[10px] px-2 py-1 rounded text-white font-medium transition-colors ${
            activeTool === 'long' ? 'bg-emerald-600' : 'bg-[#363a45] hover:bg-[#434651]'
          }`}
          title="Vendos linjë Long (1 klikim)"
        >
          ▲ Long
        </button>
        <button
          onClick={() => { setActiveTool('short'); setPendingPoint(null); setDragTrend(null); }}
          className={`text-[10px] px-2 py-1 rounded text-white font-medium transition-colors ${
            activeTool === 'short' ? 'bg-red-600' : 'bg-[#363a45] hover:bg-[#434651]'
          }`}
          title="Vendos linjë Short (1 klikim)"
        >
          ▼ Short
        </button>
        <div className="h-px bg-[#2a2e39] my-0.5" />
        {/* Zoom controls */}
        <button
          onClick={() => {
            const newZoom = Math.min(20, zoom * 1.5);
            setZoom(newZoom);
          }}
          className="text-[10px] px-2 py-1 rounded text-white font-medium transition-colors bg-[#363a45] hover:bg-[#434651]"
          title="Zoom in (+)"
        >
          🔍+
        </button>
        <button
          onClick={() => {
            const newZoom = Math.max(1, zoom / 1.5);
            setZoom(newZoom);
            if (newZoom === 1) setZoomPct(0);
            else {
              const maxPct = Math.max(0, 1 - 1 / newZoom);
              setZoomPct(Math.min(zoomPct, maxPct));
            }
          }}
          className="text-[10px] px-2 py-1 rounded text-white font-medium transition-colors bg-[#363a45] hover:bg-[#434651]"
          title="Zoom out (-)"
        >
          🔍−
        </button>
        <button
          onClick={() => { setActiveTool('pan'); }}
          className={`text-[10px] px-2 py-1 rounded text-white font-medium transition-colors ${
            activeTool === 'pan' ? 'bg-blue-600' : 'bg-[#363a45] hover:bg-[#434651]'
          }`}
          title="Lëviz grafikun (drag ose mouse wheel)"
        >
          ✋ Pan
        </button>
        <button
          onClick={() => { setZoom(1); setZoomPct(0); }}
          className="text-[10px] px-2 py-1 rounded text-[#787b86] hover:text-white hover:bg-[#434651] font-medium transition-colors"
          title="Rikthe zoom në default"
        >
          ⤢ Reset
        </button>
        <div className="h-px bg-[#2a2e39] my-0.5" />
        <button
          onClick={() => { setDrawings([]); setActiveTool('none'); setPendingPoint(null); setDragTrend(null); }}
          className="text-[10px] px-2 py-1 rounded text-[#787b86] hover:text-white hover:bg-[#434651] font-medium transition-colors"
          title="Fshi të gjitha vizatimet"
        >
          ✕ Fshi
        </button>
      </div>

      {/* Zoom indicator */}
      {zoom > 1 && (
        <div className="absolute bottom-2 right-2 z-20 bg-[#1e222d]/95 border border-[#2a2e39] rounded-md px-2.5 py-1 text-[10px] text-[#d1d4dc] font-mono shadow-lg">
          🔍 {zoom.toFixed(1)}x · {dataEnd - dataStart} bars
        </div>
      )}

      {/* Status indicator when tool is active */}
      {activeTool !== 'none' && (
        <div className="absolute top-2 left-2 z-20 bg-amber-600/90 text-white text-[10px] px-2.5 py-1 rounded font-medium shadow-lg">
          {activeTool === 'trendline'
            ? 'Mbaj + tërhiq nga pika 1 te pika 2 për vijën e trendit'
            : activeTool === 'pan'
            ? 'Tërhiq për të lëvizur grafikun · Scroll për zoom'
            : `Kliko në chart për linjë ${activeTool === 'long' ? 'Long (blerje)' : 'Short (shitje)'}`}
        </div>
      )}

      <div
        className={`relative w-full h-full ${
          activeTool === 'trendline' ? 'cursor-crosshair' :
          activeTool === 'pan' ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') :
          activeTool !== 'none' ? 'cursor-crosshair' : ''
        }`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        style={{ touchAction: 'none' }}
      >
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          className="w-full h-full"
          style={{ background: '#131722', borderRadius: 0 }}
        >
          {chart.props.children}
          {drawingsSvg}
          {dragTrendSvg}
          {pendingSvg}
        </svg>
        {tooltip && (
          <div
            className="absolute pointer-events-none z-10 px-2.5 py-1.5 rounded text-xs font-semibold"
            style={{
              left: tooltip.x,
              top: tooltip.y,
              transform: 'translate(-50%, -140%)',
              background: '#2a2e39',
              color: '#d1d4dc',
              border: '1px solid #434651',
              whiteSpace: 'nowrap',
            }}
          >
            {tooltip.text}
          </div>
        )}

        {/* ═══ Drawing info popup — shows when clicking on a drawn line ═══ */}
        {drawingInfo && (() => {
          const d = drawingInfo.drawing;
          const currentPrice = data[data.length - 1]?.close ?? 0;
          // Position popup near the click, but keep within bounds
          const popupW = 320;
          const popupH = 240;
          const containerW = 1000; // approx container width
          let left = drawingInfo.x + 12;
          if (left + popupW > containerW) left = drawingInfo.x - popupW - 12;
          if (left < 0) left = 8;
          let top = drawingInfo.y + 12;
          if (top + popupH > 500) top = drawingInfo.y - popupH - 12;
          if (top < 8) top = 8;

          // Build explanation based on line type
          let title = '';
          let titleColor = '';
          let titleIcon = '';
          let details: { label: string; value: string; color?: string }[] = [];
          let explanation = '';

          if (d.type === 'trendline' && d.x1 !== undefined && d.y1 !== undefined && d.x2 !== undefined && d.y2 !== undefined) {
            const price1 = priceAtNormY(d.y1);
            const price2 = priceAtNormY(d.y2);
            const slope = price2 - price1;
            const slopePct = price1 !== 0 ? (slope / price1) * 100 : 0;
            const isRising = slope > 0;
            const dx = (d.x2 - d.x1) * VB_W, dy = (d.y2 - d.y1) * VB_H;
            const angleDeg = Math.atan2(-dy, dx) * 180 / Math.PI;

            title = 'Vijë Trendi';
            titleColor = '#f0b323';
            titleIcon = isRising ? '↗' : '↘';
            details = [
              { label: 'Pika 1 (çmim)', value: `$${fmt(price1, 2)}` },
              { label: 'Pika 2 (çmim)', value: `$${fmt(price2, 2)}` },
              { label: 'Përqindja e ndryshimit', value: `${isRising ? '+' : ''}${fmt(slopePct, 2)}%`, color: isRising ? '#26a69a' : '#ef5350' },
              { label: 'Këndi', value: `${fmt(angleDeg, 1)}°` },
            ];
            explanation = isRising
              ? 'Vijë trendi ngjitëse (bullish). Çmimi po rritet nga pika 1 te pika 2. Kjo vijë vepron si suport dinamik — kur çmimi prek vijën nga lart-poshtë, kërko sinjal blerjeje. Nëse çmimi thyen vijën poshtë, trendi mund të kthehet.'
              : 'Vijë trendi zbritëse (bearish). Çmimi po bie nga pika 1 te pika 2. Kjo vijë vepron si rezistencë dinamike — kur çmimi prek vijën nga poshtë-lart, kërko sinjal shitjeje. Nëse çmimi thyen vijën lart, trendi mund të kthehet.';
          } else if (d.type === 'long' && d.price !== undefined) {
            const distance = d.price - currentPrice;
            const distancePct = currentPrice !== 0 ? (distance / currentPrice) * 100 : 0;
            const isAbove = distance > 0;
            title = 'Linjë Long (Blerje)';
            titleColor = '#26a69a';
            titleIcon = '▲';
            details = [
              { label: 'Niveli i hyrjes', value: `$${fmt(d.price, 2)}` },
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
              { label: 'Distanca nga çmimi', value: `${isAbove ? '+' : ''}${fmt(distancePct, 2)}%`, color: isAbove ? '#ef5350' : '#26a69a' },
            ];
            explanation = isAbove
              ? 'Nivel Long mbi çmimin aktual → Target (marrje fitimi). Kur çmimi arrin këtë nivel, mbyll pozicionin Long. Vendose këtë si target për një tregti Long ekzistuese.'
              : 'Nivel Long nën çmimin aktual → Hyrje blerje. Kur çmimi bie dhe teston këtë nivel, kërko konfirmim (hammer, vëllim rritje, RSI oversold) dhe hyr Long. Vendos Stop Loss 2-3% nën këtë nivel.';
          } else if (d.type === 'short' && d.price !== undefined) {
            const distance = d.price - currentPrice;
            const distancePct = currentPrice !== 0 ? (distance / currentPrice) * 100 : 0;
            const isAbove = distance > 0;
            title = 'Linjë Short (Shitje)';
            titleColor = '#ef5350';
            titleIcon = '▼';
            details = [
              { label: 'Niveli i hyrjes', value: `$${fmt(d.price, 2)}` },
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
              { label: 'Distanca nga çmimi', value: `${isAbove ? '+' : ''}${fmt(distancePct, 2)}%`, color: isAbove ? '#ef5350' : '#26a69a' },
            ];
            explanation = isAbove
              ? 'Nivel Short mbi çmimin aktual → Hyrje shitje. Kur çmimi rritet dhe teston këtë nivel, kërko konfirmim (shooting star, vëllim rritje, RSI overbought) dhe hyr Short. Vendos Stop Loss 2-3% mbi këtë nivel.'
              : 'Nivel Short nën çmimin aktual → Target (mbyllje Short). Kur çmimi arrin këtë nivel, mbyll pozicionin Short ekzistues dhe merr fitimin.';
          }

          return (
            <div
              className="absolute z-30 rounded-lg shadow-2xl"
              style={{
                left, top,
                width: popupW,
                background: '#1e222d',
                border: `1px solid ${titleColor}`,
                color: '#d1d4dc',
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="flex items-center justify-between px-3 py-2 rounded-t-lg"
                style={{ background: titleColor }}
              >
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[#131722]">{titleIcon}</span>
                  <span className="text-sm font-bold text-[#131722]">{title}</span>
                </div>
                <button
                  onClick={() => setDrawingInfo(null)}
                  className="text-[#131722] hover:opacity-70 font-bold text-sm"
                >
                  ✕
                </button>
              </div>
              {/* Details */}
              <div className="px-3 py-2 space-y-1.5">
                {details.map((det, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <span className="text-[#787b86]">{det.label}</span>
                    <span className="font-mono font-semibold" style={{ color: det.color || '#d1d4dc' }}>
                      {det.value}
                    </span>
                  </div>
                ))}
              </div>
              {/* Divider */}
              <div className="h-px bg-[#2a2e39] mx-3" />
              {/* Explanation */}
              <div className="px-3 py-2.5">
                <p className="text-[11px] leading-relaxed text-[#d1d4dc]">
                  {explanation}
                </p>
              </div>
              {/* Actions */}
              <div className="flex gap-2 px-3 pb-3">
                <button
                  onClick={() => {
                    setDrawings(prev => prev.filter(x => x.id !== d.id));
                    setDrawingInfo(null);
                  }}
                  className="flex-1 text-[11px] py-1.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30 font-medium transition-colors border border-red-500/30"
                >
                  ✕ Fshi këtë linjë
                </button>
                <button
                  onClick={() => setDrawingInfo(null)}
                  className="flex-1 text-[11px] py-1.5 rounded bg-[#363a45] text-[#d1d4dc] hover:bg-[#434651] font-medium transition-colors"
                >
                  Mbyll
                </button>
              </div>
            </div>
          );
        })()}

        {/* ═══ Chart-line info popup — shows when clicking on POC, VAH, VAL, SMA, EMA, BB, S/R ═══ */}
        {lineInfo && (() => {
          const currentPrice = data && data.length > 0 ? data[data.length - 1].close : 0;
          const popupW = 340;
          const popupH = 280;
          const containerW = 1000;
          let left = lineInfo.x + 12;
          if (left + popupW > containerW) left = lineInfo.x - popupW - 12;
          if (left < 0) left = 8;
          let top = lineInfo.y + 12;
          if (top + popupH > 500) top = lineInfo.y - popupH - 12;
          if (top < 8) top = 8;

          // Build content based on lineType
          let title = '';
          let titleColor = '';
          let titleIcon = '';
          let details: { label: string; value: string; color?: string }[] = [];
          let explanation = '';
          const lt = lineInfo.lineType;

          if (lt === 'poc') {
            const pocPrice = lineInfo.price || parseFloat(lineInfo.label.replace(/[^0-9.]/g, '')) || 0;
            title = 'POC — Point of Control';
            titleColor = '#f0b323';
            titleIcon = '●';
            details = [
              { label: 'Niveli POC', value: `$${fmt(pocPrice, 2)}` },
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
              { label: 'Distanca', value: `${currentPrice > pocPrice ? '+' : ''}${fmt(((currentPrice - pocPrice) / pocPrice) * 100, 2)}%`, color: currentPrice >= pocPrice ? '#26a69a' : '#ef5350' },
            ];
            explanation = 'POC (Point of Control) është niveli i çmimit ku është traduar volumi më i madh në periudhën e analizuar. Ky është niveli më i rëndësishëm sepse tregon ku ka pasur më shumë aktivitet tregtar. Çmimi ka tendencë të kthehet tek POC sepse aty është "vlera e drejtë" e tregut. Kur çmimi është mbi POC → tregu është bullish. Kur është nën POC → tregu është bearish.';
          } else if (lt === 'vah') {
            title = 'VAH — Value Area High';
            titleColor = '#2962ff';
            titleIcon = '▲';
            details = [
              { label: 'Niveli VAH', value: lineInfo.label.replace(/VAH\s*/, '') },
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
            ];
            explanation = 'VAH (Value Area High) është çmimi më i lartë brenda Value Area — zonës që përmban 70% të volumit total të tregtuar rreth POC. Kur çmimi thyen VAH lart → sinjal bullish, tregu po zgjerohet. Kur çmimi refuzohet tek VAH → sinjal bearish, rezistencë e fortë.';
          } else if (lt === 'val') {
            title = 'VAL — Value Area Low';
            titleColor = '#2962ff';
            titleIcon = '▼';
            details = [
              { label: 'Niveli VAL', value: lineInfo.label.replace(/VAL\s*/, '') },
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
            ];
            explanation = 'VAL (Value Area Low) është çmimi më i ulët brenda Value Area. Kur çmimi thyen VAL poshtë → sinjal bearish, tregu po dobësohet. Kur çmimi refuzohet tek VAL → sinjal bullish, suport i fortë. Zona mes VAH dhe VAL është ku tregu kalon 70% të kohës.';
          } else if (lt === 'sma20') {
            title = 'SMA 20 — Mesatare e Thjeshtë 20-periodeshe';
            titleColor = '#f0b323';
            titleIcon = '—';
            details = [
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
            ];
            explanation = 'SMA 20 llogarit mesataren e çmimeve të 20 periudhave të fundit. Është një indikator trendi afatshkurtër. Kur çmimi është MBAI SMA 20 → trend bullish afatshkurtër. Kur është NËN → trend bearish. Kryqëzimi me SMA 50 (Golden/Death Cross) jep sinjale më të forta.';
          } else if (lt === 'sma50') {
            title = 'SMA 50 — Mesatare e Gjatë 50-periodeshe';
            titleColor = '#2962ff';
            titleIcon = '—';
            details = [
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
            ];
            explanation = 'SMA 50 llogarit mesataren e 50 periudhave. Është indikator trendi afatmesëm. Kur çmimi është mbi SMA 50 → trend pozitiv. Golden Cross (SMA 50 kalon mbi SMA 200) = sinjal blerjeje i fortë. Death Cross (SMA 50 kalon nën SMA 200) = sinjal shitjeje i fortë.';
          } else if (lt === 'ema12') {
            title = 'EMA 12 — Mesatare Eksponenciale 12-periodeshe';
            titleColor = '#ff6d00';
            titleIcon = '—';
            details = [
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
            ];
            explanation = 'EMA 12 i jep më shumë peshë çmimeve të fundit krahasuar me SMA. Reagon më shpejt ndaj ndryshimeve të çmimit. Përdoret në MACD (EMA 12 - EMA 26). Kur EMA 12 kalon mbi EMA 26 → sinjal bullish. Kur kalon nën → sinjal bearish.';
          } else if (lt === 'bb-upper') {
            title = 'BB Upper — Bollinger Band Sipërme';
            titleColor = '#7c4dff';
            titleIcon = '▲';
            details = [
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
            ];
            explanation = 'Bollinger Band Upper = SMA 20 + 2 devijime standarde. Kur çmimi prek BB Upper → tregu është i mbipëshuar (overbought), mund të ketë kthim poshtë. Kur çmimi thyen BB Upper me vëllim → sinjal i fortë bullish, trendi po zgjerohet.';
          } else if (lt === 'bb-middle') {
            title = 'BB Mid — Bollinger Band Mes (SMA 20)';
            titleColor = '#7c4dff';
            titleIcon = '—';
            details = [
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
            ];
            explanation = 'BB Mid është SMA 20 — vija e mesme e Bollinger Bands. Shërben si suport/rezistencë dinamike. Kur çmimi është mbi BB Mid → tregu në uptrend. Nën BB Mid → downtrend. Kthimi nga njëra anë në tjetrën tregon ndryshim trendi.';
          } else if (lt === 'bb-lower') {
            title = 'BB Lower — Bollinger Band Poshtëme';
            titleColor = '#7c4dff';
            titleIcon = '▼';
            details = [
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
            ];
            explanation = 'Bollinger Band Lower = SMA 20 - 2 devijime standarde. Kur çmimi prek BB Lower → tregu është i nënpëshuar (oversold), mund të ketë kthim lart. Kur çmimi thyen BB Lower me vëllim → sinjal bearish i fortë. Ngushtimi i brezave (squeeze) parandalon shpërthim të madh.';
          } else if (lt === 'rsi') {
            title = 'RSI — Indeksi i Forcës Relative';
            titleColor = '#2962ff';
            titleIcon = '∿';
            explanation = 'RSI mat shpejtësinë dhe ndryshimin e lëvizjeve të çmimit në shkallë 0-100. Mbi 70 = overbought (mbipëshuar, mund të bjerë). Nën 30 = oversold (nënpëshuar, mund të rritet). 50 = vija neutrale. Divergjenca mes RSI dhe çmimit tregon kthim të mundshëm trendi.';
          } else if (lt === 'macd') {
            title = 'MACD — Divergjenca e Mesatareve Lëvizëse';
            titleColor = '#2962ff';
            titleIcon = '∿';
            explanation = 'MACD = EMA 12 - EMA 26. Tregon momentumin e trendit. Kur MACD është pozitiv dhe duke u rritur → trend bullish i fortë. Kur është negativ dhe duke u rritur → trend bearish po dobësohet. Kryqëzimi me vijën e sinjalit jep sinjale blerjeje/shitjeje.';
          } else if (lt === 'macd-signal') {
            title = 'Signal Line — Vija e Sinjalit MACD';
            titleColor = '#ff6d00';
            titleIcon = '∿';
            explanation = 'Signal Line = EMA 9 e MACD. Kur MACD kalon mbi Signal → sinjal blerjeje (bullish crossover). Kur MACD kalon nën Signal → sinjal shitjeje (bearish crossover). Histogrami (MACD - Signal) tregon forcën e momentit.';
          } else if (lt === 'resistance') {
            const resPrice = lineInfo.price || parseFloat(lineInfo.label.replace(/[^0-9.]/g, '')) || 0;
            title = 'Rezistencë (Resistance)';
            titleColor = '#ef5350';
            titleIcon = '▲';
            details = [
              { label: 'Niveli i rezistencës', value: `$${fmt(resPrice, 2)}` },
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
              { label: 'Distanca', value: `${fmt(((resPrice - currentPrice) / currentPrice) * 100, 2)}%`, color: '#ef5350' },
            ];
            explanation = 'Rezistenca është niveli ku çmimi ka hasur presion shitës dhe ka refuzuar të rritet më tej. Kur çmimi afrohet tek rezistenca → shitësit bëhen aktiv. Nëse çmimi thyen rezistencën me vëllim → kthehet në suport dhe sinjal bullish. Nëse refuzohet → pritet rënie.';
          } else if (lt === 'support') {
            const supPrice = lineInfo.price || parseFloat(lineInfo.label.replace(/[^0-9.]/g, '')) || 0;
            title = 'Suport (Support)';
            titleColor = '#26a69a';
            titleIcon = '▼';
            details = [
              { label: 'Niveli i suportit', value: `$${fmt(supPrice, 2)}` },
              { label: 'Çmimi aktual', value: `$${fmt(currentPrice, 2)}` },
              { label: 'Distanca', value: `${fmt(((supPrice - currentPrice) / currentPrice) * 100, 2)}%`, color: '#26a69a' },
            ];
            explanation = 'Suporti është niveli ku çmimi ka gjetur presion blerës dhe ka refuzuar të bjerë më poshtë. Kur çmimi afrohet tek suporti → blerësit bëhen aktiv. Nëse çmimi thyen suportin me vëllim → kthehet në rezistencë dhe sinjal bearish. Nëse mban → pritet rikthim lart.';
          } else {
            title = lineInfo.label;
            titleColor = '#787b86';
            titleIcon = '●';
            explanation = 'Klikuat mbi një element të chart-it.';
          }

          return (
            <div
              className="absolute z-30 rounded-lg shadow-2xl"
              style={{
                left, top,
                width: popupW,
                background: '#1e222d',
                border: `1px solid ${titleColor}`,
                color: '#d1d4dc',
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-3 py-2 rounded-t-lg" style={{ background: titleColor }}>
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[#131722]">{titleIcon}</span>
                  <span className="text-xs font-bold text-[#131722]">{title}</span>
                </div>
                <button onClick={() => setLineInfo(null)} className="text-[#131722] hover:opacity-70 font-bold text-sm">✕</button>
              </div>
              {details.length > 0 && (
                <div className="px-3 py-2 space-y-1.5">
                  {details.map((det, i) => (
                    <div key={i} className="flex items-center justify-between text-xs">
                      <span className="text-[#787b86]">{det.label}</span>
                      <span className="font-mono font-semibold" style={{ color: det.color || '#d1d4dc' }}>{det.value}</span>
                    </div>
                  ))}
                </div>
              )}
              {details.length > 0 && <div className="h-px bg-[#2a2e39] mx-3" />}
              <div className="px-3 py-2.5">
                <p className="text-[11px] leading-relaxed text-[#d1d4dc]">{explanation}</p>
              </div>
              <div className="flex px-3 pb-3">
                <button onClick={() => setLineInfo(null)} className="flex-1 text-[11px] py-1.5 rounded bg-[#363a45] text-[#d1d4dc] hover:bg-[#434651] font-medium transition-colors">
                  E kuptova
                </button>
              </div>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ═══ Chart builder — pure function, throws on error ═══
function buildChart(
  data: CandleData[],
  supports: string[] | number[] = [],
  resistances: string[] | number[] = [],
) {
  if (!data || data.length < 3) return null;

  // TradingView dark palette (matching reference)
  const BG = '#131722';
  const GRID = '#2a2e39';
  const GRID_OP = 0.3;
  const TXT = '#787b86';
  const TXT_BRIGHT = '#d1d4dc';
  const BULL = '#26a69a';
  const BEAR = '#ef5350';
  const SMA20_CLR = '#f0b323'; // Gold/Yellow — fast MA
  const SMA50_CLR = '#2962ff'; // Blue — slow MA
  const EMA12_CLR = '#ff6d00'; // Orange — EMA
  const BB_CLR = '#7c4dff';   // Purple — Bollinger Bands
  const RSI_CLR = '#2962ff';  // Blue
  const MACD_CLR = '#2962ff'; // Blue
  const SIG_CLR = '#ff6d00';  // Orange

  const W = 880;
    const H = 540;
    const R = 60; // right axis width
    const L = 2;  // left margin
    const chartW = W - L - R;
    const n = data.length;
    const barW = chartW / n;
    const candleW = Math.max(barW * 0.6, 2);

    // Layout: price (with volume overlay), separator, RSI, separator, MACD
    const priceH = 280;
    const volRatio = 0.18; // volume takes bottom 18% of price panel
    const volH = priceH * volRatio;
    const candleH = priceH - volH; // candles use top 82%
    const sep = 1;
    const rsiH = 80;
    const macdH = 85;
    const bottomLabel = 18;

    const priceTop = 0;
    const volTop = priceTop + candleH;
    const rsiTop = priceTop + priceH + sep;
    const macdTop = rsiTop + rsiH + sep;
    const totalH = macdTop + macdH + bottomLabel;

    // ═══ Compute indicators — DUAL STRATEGY ═══
    // 70+ bars → standard TradingView periods
    // <70 bars → scaled-down periods for small datasets
    const closes = data.map(d => d.close);

    let smaP: number, smaLongP: number, bbP: number, emaP: number, rsiP: number, macdFast: number, macdSlow: number;

    if (n >= 70) {
      smaP = 20; smaLongP = 50; bbP = 20; emaP = 12; rsiP = 14; macdFast = 12; macdSlow = 26;
    } else {
      const maxPeriod = Math.max(3, Math.floor(n * 0.08) + 1);
      smaLongP  = maxPeriod;
      smaP      = Math.max(2, Math.round(maxPeriod * 0.4));
      bbP       = smaP;
      emaP      = Math.max(2, Math.round(maxPeriod * 0.3));
      rsiP      = Math.max(2, Math.round(maxPeriod * 0.35));
      macdFast  = emaP;
      macdSlow  = Math.max(macdFast + 1, Math.round(maxPeriod * 0.6));
    }

    const sma20 = computeSMA(closes, smaP);
    const sma50 = computeSMA(closes, smaLongP);
    const ema12 = computeEMA(closes, emaP);
    const bb = computeBollingerBands(closes, bbP);
    const rsi = computeRSI(closes, rsiP);
    const macdData = computeMACD(closes, macdFast, macdSlow);

    console.log(`[CHART] bars=${n} periods: SMA(${smaP},${smaLongP}) EMA(${emaP}) RSI(${rsiP}) MACD(${macdFast},${macdSlow})`);

    // ═══ Price Y scale (candles area only, not volume) ═══
    const hiVals = [ ...data.map(d => d.high), ...bb.upper.filter((v): v is number => v !== null), ...sma20.filter((v): v is number => v !== null) ];
    const loVals = [ ...data.map(d => d.low), ...bb.lower.filter((v): v is number => v !== null), ...sma20.filter((v): v is number => v !== null) ];
    const allH = Math.max(...hiVals);
    const allL = Math.min(...loVals);
    const pad = (allH - allL) * 0.06 || 1;
    const pMin = allL - pad;
    const pMax = allH + pad;
    const yP = (v: number) => priceTop + (1 - (v - pMin) / (pMax - pMin)) * candleH;

    // ═══ Volume Y scale (bottom of price panel) ═══
    const maxVol = Math.max(...data.map(d => d.volume || 0)) || 1;
    const yV = (v: number) => volTop + volH - (v / maxVol) * volH;

    // ═══ RSI scale 0-100 ═══
    const yR = (v: number) => rsiTop + (1 - v / 100) * rsiH;

    // ═══ MACD scale ═══
    const macdVals = macdData.macd.filter((v): v is number => v !== null);
    const histVals = macdData.histogram.filter((v): v is number => v !== null);
    const mMax = Math.max(Math.abs(Math.min(...macdVals, ...histVals)), Math.abs(Math.max(...macdVals, ...histVals)), 0.01);
    const yM = (v: number) => macdTop + macdH / 2 - (v / mMax) * (macdH / 2);

    // ═══ Helpers ═══
    const xOf = (i: number) => L + barW * i + barW / 2;
    const labelN = n <= 15 ? 1 : n <= 30 ? 3 : n <= 60 ? 5 : n <= 130 ? 10 : 20;

    // ═══ FULL-WIDTH LINE FUNCTION ═══
    // Every line ALWAYS spans from left edge (x=L) to right edge (x=W-R).
    // Horizontal extension uses first/last valid Y value — exactly like TradingView.
    // lineType is used by CandlestickChartInner to show detailed info popups
    const fullLine = (vals: (number | null)[], color: string, sw = 1, id?: string, label?: string, lineType?: string) => {
      let firstY: number | null = null;
      let lastY: number | null = null;
      const validPts: string[] = [];
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] !== null) {
          if (firstY === null) firstY = vals[i];
          lastY = vals[i];
          validPts.push(`${xOf(i)},${vals[i]}`);
        }
      }
      if (firstY === null || validPts.length === 0) return null;
      const allPts = [`${L},${firstY}`, ...validPts, `${W - R},${lastY}`];
      const ptsStr = allPts.join(' ');
      // Click handler — emit CustomEvent with lineType so CandlestickChartInner
      // can show a detailed info popup explaining what this line is.
      const clickHandler = label ? ((e: { stopPropagation: () => void; currentTarget: { closest: (s: string) => SVGSVGElement | null }; clientX: number; clientY: number }) => {
        e.stopPropagation();
        const svgEl = e.currentTarget.closest('svg');
        if (!svgEl) return;
        const rect = svgEl.getBoundingClientRect();
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('chart-line-click', {
            detail: { lineType: lineType || 'unknown', label, x: e.clientX - rect.left, y: e.clientY - rect.top }
          }));
        }
      }) : undefined;
      return (
        <g key={id ?? color}>
          {label && <polyline points={ptsStr} fill="none" stroke="transparent" strokeWidth={14} strokeLinecap="round" style={{ cursor: 'pointer' }} onPointerDown={clickHandler} />}
          <polyline points={ptsStr} fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" pointerEvents="none" />
        </g>
      );
    };

    // Price grid
    const pGrid: { y: number; lbl: string }[] = [];
    const safePMin = Number.isFinite(pMin) ? pMin : 0;
    const safePMax = Number.isFinite(pMax) ? pMax : 1;
    for (let i = 0; i <= 5; i++) {
      const v = safePMin + (safePMax - safePMin) * (i / 5);
      pGrid.push({ y: yP(v), lbl: '$' + fmt(v, 1) });
    }

    // BB fill
    const bbPts: string[] = [];
    for (let i = 0; i < n; i++) if (bb.upper[i] !== null) bbPts.push(`${xOf(i)},${yP(bb.upper[i]!)}`);
    for (let i = n - 1; i >= 0; i--) if (bb.lower[i] !== null) bbPts.push(`${xOf(i)},${yP(bb.lower[i]!)}`);

    // Last values for labels
    const lastSma20 = sma20[n - 1];
    const lastSma50 = sma50[n - 1];
    const lastEma12 = ema12[n - 1];
    const lastRsi = rsi[n - 1];
    const lastMacd = macdData.macd[n - 1];
    const lastSig = macdData.signal[n - 1];
    const lastBar = data[n - 1];
    const lastClose = (lastBar && typeof lastBar.close === 'number') ? lastBar.close : 0;
    const lastY = yP(lastClose);

    // ═══ Volume Profile computation ═══
    // Compute horizontal volume histogram + POC/VAH/VAL + S/R levels
    const vp = computeVolumeProfile(data, 28);

    // Normalize S/R levels to numbers (API may return strings like "315.00")
    const srSupports = (supports || []).map(s => typeof s === 'number' ? s : parseFloat(String(s))).filter(n => Number.isFinite(n));
    const srResistances = (resistances || []).map(r => typeof r === 'number' ? r : parseFloat(String(r))).filter(n => Number.isFinite(n));

    // Volume Profile bar area — overlay on right portion of price panel
    // Bars grow LEFTWARD from the right edge of the price panel (W-R),
    // so they don't obscure the candles on the left side.
    const vpRightEdge = W - R - 2;       // leave 2px gap before Y-axis labels
    const vpMaxWidth = chartW * 0.28;    // VP bars take up to 28% of chart width
    const vpBarHeight = candleH / Math.max(vp.bins.length, 1) * 0.85; // small gap between bars
    const vpBarY = (price: number) => priceTop + (1 - (price - pMin) / (pMax - pMin)) * candleH - vpBarHeight / 2;

    return (
      <svg viewBox={`0 0 ${W} ${totalH}`} className="w-full h-full" style={{ background: BG, borderRadius: 0 }}>
        <defs>
          <clipPath id="priceClip"><rect x={L} y={priceTop} width={chartW} height={priceH} /></clipPath>
          <clipPath id="rsiClip"><rect x={L} y={rsiTop} width={chartW} height={rsiH} /></clipPath>
          <clipPath id="macdClip"><rect x={L} y={macdTop} width={chartW} height={macdH} /></clipPath>
        </defs>
        {/* Background fill for each panel */}
        <rect x={L} y={priceTop} width={chartW} height={priceH} fill="#1e222d" opacity={0.3} />
        <rect x={L} y={rsiTop} width={chartW} height={rsiH} fill="#1e222d" opacity={0.2} />
        <rect x={L} y={macdTop} width={chartW} height={macdH} fill="#1e222d" opacity={0.2} />

        {/* ═══════ PRICE CHART (candles + volume) ═══════ */}

        {/* Grid lines — dotted, TradingView style */}
        {pGrid.map((g, i) => (
          <g key={"g" + i}>
            <line x1={L} y1={g.y} x2={W - R} y2={g.y} stroke={GRID} strokeOpacity={GRID_OP} strokeDasharray="1 3" />
            <text x={W - R + 6} y={g.y + 3.5} fill={TXT_BRIGHT} fontSize={10} fontFamily="Trebuchet MS, Tahoma, sans-serif">{g.lbl}</text>
          </g>
        ))}

        {/* Vertical grid (time axis) */}
        {data.map((dd, i) => {
          if (i % labelN !== 0 || i === 0) return null;
          return <line key={"vg" + i} x1={xOf(i)} y1={priceTop} x2={xOf(i)} y2={priceTop + priceH} stroke={GRID} strokeOpacity={0.25} strokeDasharray="1 3" />;
        })}

        {/* Volume bars (behind candles, at bottom of price panel) */}
        <g clipPath="url(#priceClip)">
          {data.map((dd, i) => {
            const cx = xOf(i);
            const isUp = dd.close >= dd.open;
            const vy = yV(dd.volume || 0);
            return (
              <rect key={"vol" + i} x={cx - candleW / 2} y={vy} width={candleW} height={Math.max(volTop + volH - vy, 0)}
                fill={isUp ? 'rgba(38,166,154,0.4)' : 'rgba(239,83,80,0.4)'} />
            );
          })}
        </g>

        {/* Bollinger Bands fill */}
        {bbPts.length > 2 && <polygon points={bbPts.join(' ')} fill="rgba(124,77,255,0.08)" stroke="none" />}

        {/* Bollinger Band lines */}
        {fullLine(bb.upper.map(v => v !== null ? yP(v) : null), BB_CLR, 1, 'bb-u', `BB Sip\u00ebrme — Bollinger Band Upper`, 'bb-upper')}
        {fullLine(bb.middle.map(v => v !== null ? yP(v) : null), BB_CLR, 1, 'bb-m', `BB Mesme — Bollinger Band Mid (SMA ${bbP})`, 'bb-middle')}
        {fullLine(bb.lower.map(v => v !== null ? yP(v) : null), BB_CLR, 1, 'bb-l', `BB Posht\u00ebme — Bollinger Band Lower`, 'bb-lower')}

        {/* Moving Averages */}
        {fullLine(sma20.map(v => v !== null ? yP(v) : null), SMA20_CLR, 1.5, 's20', `SMA(${smaP}) — Mesatare e Thjesht\u00eb`, 'sma20')}
        {fullLine(sma50.map(v => v !== null ? yP(v) : null), SMA50_CLR, 1.5, 's50', `SMA(${smaLongP}) — Mesatare e Gjat\u00eb`, 'sma50')}
        {fullLine(ema12.map(v => v !== null ? yP(v) : null), EMA12_CLR, 1.2, 'e12', `EMA(${emaP}) — Mesatare Eksponenciale`, 'ema12')}

        {/* Candlesticks */}
        <g clipPath="url(#priceClip)">
          {data.map((dd, i) => {
            const cx = xOf(i);
            const up = dd.close >= dd.open;
            const c = up ? BULL : BEAR;
            const bT = yP(Math.max(dd.open, dd.close));
            const bB = yP(Math.min(dd.open, dd.close));
            const bH = Math.max(bB - bT, 1);
            return (
              <g key={"k" + i}>
                <line x1={cx} y1={yP(dd.high)} x2={cx} y2={yP(dd.low)} stroke={c} strokeWidth={1} />
                <rect x={cx - candleW / 2} y={bT} width={candleW} height={bH} fill={c} stroke={c} strokeWidth={0.5} />
              </g>
            );
          })}
        </g>

        {/* Current price line + tag */}
        <line x1={L} y1={lastY} x2={W - R} y2={lastY} stroke={(lastBar?.close ?? 0) >= (lastBar?.open ?? 0) ? BULL : BEAR} strokeDasharray="4 2" strokeOpacity={0.7} strokeWidth={1} />
        <rect x={W - R + 1} y={lastY - 10} width={R - 2} height={20} rx={2} fill={(lastBar?.close ?? 0) >= (lastBar?.open ?? 0) ? BULL : BEAR} />
        <text x={W - R + 8} y={lastY + 4} fill="white" fontSize={10.5} fontFamily="Trebuchet MS, sans-serif" fontWeight="600">{fmt(lastClose, 2)}</text>

        {/* ═══ TradingView-style RIGHT-EDGE line labels ═══ */}
        {/* REMOVED: SMA, BB, EMA labels were cluttering the right edge.
             TradingView shows only the current price tag on the right axis.
             Indicator values are now displayed in the cards below the chart. */}

        {/* Volume label */}
        <text x={L + 8} y={volTop + 12} fill={TXT} fontSize={9} fontFamily="Trebuchet MS, sans-serif" opacity={0.5}>Vol</text>

        {/* ═══════ PANEL SEPARATOR ═══════ */}
        <line x1={L} y1={rsiTop - 1} x2={W - R} y2={rsiTop - 1} stroke={GRID} strokeOpacity={0.5} />

        {/* ═══════ RSI (14) ═══════ */}
        {/* RSI grid */}
        <line x1={L} y1={yR(70)} x2={W - R} y2={yR(70)} stroke={GRID} strokeOpacity={GRID_OP} strokeDasharray="1 3" />
        <line x1={L} y1={yR(50)} x2={W - R} y2={yR(50)} stroke={GRID} strokeOpacity={GRID_OP * 0.6} strokeDasharray="1 3" />
        <line x1={L} y1={yR(30)} x2={W - R} y2={yR(30)} stroke={GRID} strokeOpacity={GRID_OP} strokeDasharray="1 3" />
        {/* RSI Y labels */}
        <text x={W - R + 6} y={yR(70) + 3.5} fill={TXT} fontSize={9.5} fontFamily="Trebuchet MS, sans-serif">70.00</text>
        <text x={W - R + 6} y={yR(50) + 3.5} fill={TXT} fontSize={9.5} fontFamily="Trebuchet MS, sans-serif" opacity={0.6}>50.00</text>
        <text x={W - R + 6} y={yR(30) + 3.5} fill={TXT} fontSize={9.5} fontFamily="Trebuchet MS, sans-serif">30.00</text>
        {/* RSI line */}
        <g clipPath="url(#rsiClip)">
          {fullLine(rsi.map(v => v !== null ? yR(v) : null), RSI_CLR, 1.5, 'rsi', `RSI(${rsiP}) — Indeksi i Forc\u00ebs Relative`, 'rsi')}
        </g>
        {/* RSI right-edge label REMOVED — value shown in indicator card below */}

        {/* ═══════ PANEL SEPARATOR ═══════ */}
        <line x1={L} y1={macdTop - 1} x2={W - R} y2={macdTop - 1} stroke={GRID} strokeOpacity={0.5} />

        {/* ═══════ MACD ═══════ */}
        {/* Zero line */}
        <line x1={L} y1={macdTop + macdH / 2} x2={W - R} y2={macdTop + macdH / 2} stroke={GRID} strokeOpacity={GRID_OP} strokeDasharray="1 3" />
        <text x={W - R + 6} y={macdTop + macdH / 2 + 3.5} fill={TXT} fontSize={9.5} fontFamily="Trebuchet MS, sans-serif" opacity={0.5}>0.00</text>
        {/* Histogram */}
        <g clipPath="url(#macdClip)">
          {macdData.histogram.map((v, i) => {
            if (v === null) return null;
            const cx = xOf(i);
            const pos = v >= 0;
            const barY = pos ? yM(v) : macdTop + macdH / 2;
            const barH = Math.abs(yM(v) - (macdTop + macdH / 2));
            return (
              <rect key={"h" + i} x={cx - candleW * 0.4} y={barY} width={candleW * 0.8} height={Math.max(barH, 0.5)}
                fill={pos ? 'rgba(38,166,154,0.6)' : 'rgba(239,83,80,0.6)'} />
            );
          })}
          {/* MACD & Signal lines */}
          {fullLine(macdData.macd.map(v => v !== null ? yM(v) : null), MACD_CLR, 1.5, 'macd', `MACD(${macdFast},${macdSlow}) — Divergjenc\u00eb Mesataresh`, 'macd')}
          {fullLine(macdData.signal.map(v => v !== null ? yM(v) : null), SIG_CLR, 1.2, 'sig', `Signal — Vija e Sinjalit MACD`, 'macd-signal')}
        </g>
        {/* MACD right-edge labels REMOVED — values shown in indicator card below */}

        {/* ═══════ VOLUME PROFILE (horizontal histogram, right side of price panel) ═══════ */}
        {vp.bins.length > 0 && vp.maxBinVol > 0 && (
          <g>
            {/* Value Area (VAH→VAL) shaded background — subtle blue tint */}
            {vp.vah > vp.val && (
              <rect
                x={L}
                y={Math.min(vpBarY(vp.vah), vpBarY(vp.val))}
                width={chartW}
                height={Math.abs(vpBarY(vp.vah) - vpBarY(vp.val)) + vpBarHeight}
                fill="#2962ff"
                opacity={0.05}
              />
            )}

            {/* VP bars — grow LEFTWARD from right edge of price panel */}
            {vp.bins.map((bin, i) => {
              if (bin.vol <= 0) return null;
              const barW = (bin.vol / vp.maxBinVol) * vpMaxWidth;
              const y = vpBarY(bin.priceMid);
              let fill = 'rgba(41, 98, 255, 0.35)';
              let stroke = 'rgba(41, 98, 255, 0.55)';
              if (bin.isPOC) { fill = 'rgba(240, 179, 35, 0.85)'; stroke = '#f0b323'; }
              else if (bin.isHVN) { fill = 'rgba(38, 166, 154, 0.5)'; stroke = 'rgba(38, 166, 154, 0.7)'; }
              else if (bin.isLVN) { fill = 'rgba(120, 123, 134, 0.2)'; stroke = 'rgba(120, 123, 134, 0.35)'; }
              return (
                <rect
                  key={"vp" + i}
                  x={vpRightEdge - barW}
                  y={y}
                  width={barW}
                  height={vpBarHeight}
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={bin.isPOC ? 0.5 : 0}
                />
              );
            })}

            {/* POC line — clickable, shows info popup */}
            <line
              x1={L}
              y1={vpBarY(vp.poc) + vpBarHeight / 2}
              x2={W - R}
              y2={vpBarY(vp.poc) + vpBarHeight / 2}
              stroke="#f0b323"
              strokeWidth={1}
              strokeDasharray="5 3"
              opacity={0.9}
              pointerEvents="none"
            />
            {/* Invisible wide hit area for POC */}
            <line
              x1={L}
              y1={vpBarY(vp.poc) + vpBarHeight / 2}
              x2={W - R}
              y2={vpBarY(vp.poc) + vpBarHeight / 2}
              stroke="transparent"
              strokeWidth={14}
              pointerEvents="stroke"
              style={{ cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const svgEl = (e.currentTarget as unknown as { closest: (s: string) => SVGSVGElement | null }).closest('svg');
                if (!svgEl) return;
                const rect = svgEl.getBoundingClientRect();
                window.dispatchEvent(new CustomEvent('chart-line-click', {
                  detail: { lineType: 'poc', label: `POC $${fmt(vp.poc, 2)}`, x: e.clientX - rect.left, y: e.clientY - rect.top }
                }));
              }}
            />
            <g pointerEvents="none">
              <rect x={L + 4} y={vpBarY(vp.poc) - 8} width={70} height={14} rx={2} fill="#f0b323" opacity={0.95} />
              <text x={L + 8} y={vpBarY(vp.poc) + 2} fill="#131722" fontSize={9.5} fontFamily="Trebuchet MS, sans-serif" fontWeight="700">
                POC {fmt(vp.poc, 2)}
              </text>
            </g>

            {/* VAH line — clickable */}
            <line x1={L} y1={vpBarY(vp.vah) + vpBarHeight / 2} x2={W - R} y2={vpBarY(vp.vah) + vpBarHeight / 2} stroke="#2962ff" strokeWidth={0.8} strokeDasharray="3 4" opacity={0.6} pointerEvents="none" />
            <line
              x1={L} y1={vpBarY(vp.vah) + vpBarHeight / 2} x2={W - R} y2={vpBarY(vp.vah) + vpBarHeight / 2}
              stroke="transparent" strokeWidth={14} pointerEvents="stroke" style={{ cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const svgEl = (e.currentTarget as unknown as { closest: (s: string) => SVGSVGElement | null }).closest('svg');
                if (!svgEl) return;
                const rect = svgEl.getBoundingClientRect();
                window.dispatchEvent(new CustomEvent('chart-line-click', {
                  detail: { lineType: 'vah', label: `VAH $${fmt(vp.vah, 2)}`, x: e.clientX - rect.left, y: e.clientY - rect.top }
                }));
              }}
            />
            <text x={W - R - 4} y={vpBarY(vp.vah) - 2} fill="#2962ff" fontSize={8.5} fontFamily="Trebuchet MS, sans-serif" fontWeight="600" textAnchor="end" pointerEvents="none">
              VAH {fmt(vp.vah, 2)}
            </text>

            {/* VAL line — clickable */}
            <line x1={L} y1={vpBarY(vp.val) + vpBarHeight / 2} x2={W - R} y2={vpBarY(vp.val) + vpBarHeight / 2} stroke="#2962ff" strokeWidth={0.8} strokeDasharray="3 4" opacity={0.6} pointerEvents="none" />
            <line
              x1={L} y1={vpBarY(vp.val) + vpBarHeight / 2} x2={W - R} y2={vpBarY(vp.val) + vpBarHeight / 2}
              stroke="transparent" strokeWidth={14} pointerEvents="stroke" style={{ cursor: 'pointer' }}
              onPointerDown={(e) => {
                e.stopPropagation();
                const svgEl = (e.currentTarget as unknown as { closest: (s: string) => SVGSVGElement | null }).closest('svg');
                if (!svgEl) return;
                const rect = svgEl.getBoundingClientRect();
                window.dispatchEvent(new CustomEvent('chart-line-click', {
                  detail: { lineType: 'val', label: `VAL $${fmt(vp.val, 2)}`, x: e.clientX - rect.left, y: e.clientY - rect.top }
                }));
              }}
            />
            <text x={W - R - 4} y={vpBarY(vp.val) + 10} fill="#2962ff" fontSize={8.5} fontFamily="Trebuchet MS, sans-serif" fontWeight="600" textAnchor="end" pointerEvents="none">
              VAL {fmt(vp.val, 2)}
            </text>

            <text x={L + 4} y={priceTop + 12} fill={TXT} fontSize={9} fontFamily="Trebuchet MS, sans-serif" opacity={0.7} fontWeight="600" pointerEvents="none">
              VOL PROFILE
            </text>
          </g>
        )}

        {/* ═══════ SUPPORT / RESISTANCE LEVELS — clickable ═══════ */}
        {srResistances.map((r, i) => {
          if (r < pMin || r > pMax) return null;
          const y = yP(r);
          return (
            <g key={"res" + i}>
              <line x1={L} y1={y} x2={W - R} y2={y} stroke="#ef5350" strokeWidth={0.9} strokeDasharray="6 4" opacity={0.55} pointerEvents="none" />
              <line
                x1={L} y1={y} x2={W - R} y2={y}
                stroke="transparent" strokeWidth={14} pointerEvents="stroke" style={{ cursor: 'pointer' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const svgEl = (e.currentTarget as unknown as { closest: (s: string) => SVGSVGElement | null }).closest('svg');
                  if (!svgEl) return;
                  const rect = svgEl.getBoundingClientRect();
                  window.dispatchEvent(new CustomEvent('chart-line-click', {
                    detail: { lineType: 'resistance', label: `Rezistenca $${fmt(r, 2)}`, price: r, x: e.clientX - rect.left, y: e.clientY - rect.top }
                  }));
                }}
              />
              <rect x={L + 4} y={y - 11} width={58} height={12} rx={2} fill="#ef5350" opacity={0.92} pointerEvents="none" />
              <text x={L + 7} y={y - 2} fill="white" fontSize={8.5} fontFamily="Trebuchet MS, sans-serif" fontWeight="700" pointerEvents="none">
                R ${fmt(r, 2)}
              </text>
            </g>
          );
        })}
        {srSupports.map((s, i) => {
          if (s < pMin || s > pMax) return null;
          const y = yP(s);
          return (
            <g key={"sup" + i}>
              <line x1={L} y1={y} x2={W - R} y2={y} stroke="#26a69a" strokeWidth={0.9} strokeDasharray="6 4" opacity={0.55} pointerEvents="none" />
              <line
                x1={L} y1={y} x2={W - R} y2={y}
                stroke="transparent" strokeWidth={14} pointerEvents="stroke" style={{ cursor: 'pointer' }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  const svgEl = (e.currentTarget as unknown as { closest: (s: string) => SVGSVGElement | null }).closest('svg');
                  if (!svgEl) return;
                  const rect = svgEl.getBoundingClientRect();
                  window.dispatchEvent(new CustomEvent('chart-line-click', {
                    detail: { lineType: 'support', label: `Suporti $${fmt(s, 2)}`, price: s, x: e.clientX - rect.left, y: e.clientY - rect.top }
                  }));
                }}
              />
              <rect x={L + 4} y={y - 1} width={58} height={12} rx={2} fill="#26a69a" opacity={0.92} pointerEvents="none" />
              <text x={L + 7} y={y + 8} fill="white" fontSize={8.5} fontFamily="Trebuchet MS, sans-serif" fontWeight="700" pointerEvents="none">
                S ${fmt(s, 2)}
              </text>
            </g>
          );
        })}

        {/* ═══════ X-AXIS DATE LABELS ═══════ */}
        {data.map((dd, i) => {
          if (i % labelN !== 0 || i === 0) return null;
          return (
            <text key={"d" + i} x={xOf(i)} y={macdTop + macdH + 14} fill={TXT} fontSize={10} textAnchor="middle" fontFamily="Trebuchet MS, sans-serif">
              {dd.date.substring(5)}
            </text>
          );
        })}
      </svg>
    );
  // end of buildChart
}

// ═══ Indicator Explanations — collapsible educational section ═══
function IndicatorExplanations() {
  const [expanded, setExpanded] = useState(false);
  const [activeIndicator, setActiveIndicator] = useState<string | null>(null);

  const indicators = [
    {
      id: 'rsi',
      name: 'RSI (Relative Strength Index)',
      icon: '∿',
      color: '#2962ff',
      what: 'Mat shpejtësinë dhe madhësinë e lëvizjeve të çmimit në shkallë 0-100.',
      how: 'Mbi 70 = overbought (mbipëshuar, çmimi mund të bjerë). Nën 30 = oversold (nënpëshuar, çmimi mund të rritet). 50 = neutrale. Divergjenca mes RSI dhe çmimit tregon kthim të mundshëm trendi.',
      signals: 'Blerje: RSI < 30 ose kryqëzim mbi 50. Shitje: RSI > 70 ose kryqëzim nën 50.',
    },
    {
      id: 'macd',
      name: 'MACD (Moving Average Convergence Divergence)',
      icon: '∿',
      color: '#2962ff',
      what: 'Tregon divergjencën mes dy mesatareve lëvizëse eksponenciale (EMA 12 dhe EMA 26).',
      how: 'MACD pozitiv = trend bullish. MACD negativ = trend bearish. Histogrami tregon forcën e momentit. Kur histogrami rritet → momenti po forcohet.',
      signals: 'Blerje: MACD kalon mbi Signal line. Shitje: MACD kalon nën Signal line.',
    },
    {
      id: 'sma',
      name: 'SMA / EMA (Mesataret Lëvizëse)',
      icon: '—',
      color: '#f0b323',
      what: 'SMA llogarit mesataren e çmimeve të N periudhave. EMA i jep më shumë peshë çmimeve të fundit.',
      how: 'Çmimi mbi SMA = trend bullish. Nën SMA = bearish. Golden Cross (SMA 50 mbi SMA 200) = sinjal i fortë blerjeje. Death Cross = sinjal shitjeje.',
      signals: 'Blerje: Çmimi mbi SMA 50 + Golden Cross. Shitje: Çmimi nën SMA 50 + Death Cross.',
    },
    {
      id: 'bb',
      name: 'Bollinger Bands',
      icon: '☰',
      color: '#7c4dff',
      what: 'Tre vija: BB Upper (SMA 20 + 2σ), BB Mid (SMA 20), BB Lower (SMA 20 - 2σ). Mat volatilitetin.',
      how: 'Çmimi tek BB Upper = overbought. Tek BB Lower = oversold. Ngushtimi i brezave (squeeze) parandalon shpërthim të madh. Zgjerimi = volatilitet i lartë.',
      signals: 'Blerje: Çmimi prek BB Lower + kthim. Shitje: Çmimi prek BB Upper + kthim. Breakout: Çmimi thyen BB me vëllim.',
    },
    {
      id: 'stochastic',
      name: 'Stochastic Oscillator',
      icon: '∿',
      color: '#787b86',
      what: 'Krahason çmimin aktual me rangun e çmimeve të N periudhave (0-100).',
      how: '%K mbi 80 = overbought. %K nën 20 = oversold. Kryqëzimi %K/%D jep sinjale. Kur %K kalon mbi %D në zonën oversold = sinjal blerjeje.',
      signals: 'Blerje: %K < 20 + kryqëzim mbi %D. Shitje: %K > 80 + kryqëzim nën %D.',
    },
    {
      id: 'volume',
      name: 'Volumi',
      icon: '▊',
      color: '#26a69a',
      what: 'Numri i aksioneve të tregtuara në një periudhë. Tregon forcën e lëvizjeve.',
      how: 'Volumi i lartë me rritje = trend i fortë. Volumi i ulët me rritje = trend i dobët. Volumi që rritet në rënie = presion shitës i fortë.',
      signals: 'Konfirmim: Volumi duhet të rritet në drejtimin e trendit. Divergjenca = kujdes.',
    },
    {
      id: 'poc',
      name: 'POC / VAH / VAL (Volume Profile)',
      icon: '●',
      color: '#f0b323',
      what: 'POC = niveli me volumin më të madh. VAH/VAL = kufijtë e Value Area (70% e volumit).',
      how: 'Çmimi ka tendencë të kthehet tek POC. Kur çmimi është mbi POC = bullish. Nën POC = bearish. Value Area = zona ku tregu kalon 70% të kohës.',
      signals: 'Blerje: Çmimi mban mbi VAL ose POC. Shitje: Çmimi refuzohet tek VAH.',
    },
    {
      id: 'sr',
      name: 'Suporti & Rezistenca',
      icon: '☰',
      color: '#26a69a',
      what: 'Suporti = niveli ku çmimi gjen presion blerës. Rezistenca = niveli ku gjen presion shitës.',
      how: 'Sa më shumë herë çmimi ka prekur një nivel pa e thyer, aq më i fortë është. Kur thyhet rezistenca → kthehet në suport. Kur thyhet suporti → kthehet në rezistencë.',
      signals: 'Blerje: Çmimi mban tek suporti + konfirmim. Shitje: Çmimi refuzohet tek rezistenca.',
    },
  ];

  return (
    <Card className="border-blue-500/20 bg-blue-500/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center justify-between">
          <span className="flex items-center gap-2">
            <BrainCircuit className="w-4 h-4 text-blue-500" />
            Çfarë janë indikatorët?
          </span>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-500 hover:text-blue-400 font-medium transition-colors"
          >
            {expanded ? '▲ Mbyll' : '▼ Shpjego'}
          </button>
        </CardTitle>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-2">
          <p className="text-[11px] text-muted-foreground mb-3">
            Kliko mbi një indikator për të parë shpjegimin e detajuar. Gjithashtu, mund të klikosh direkt mbi linjat në chart (POC, VAH, VAL, SMA, BB, suport/rezistencë) për shpjegim.
          </p>
          {/* Indicator chips */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {indicators.map(ind => (
              <button
                key={ind.id}
                onClick={() => setActiveIndicator(activeIndicator === ind.id ? null : ind.id)}
                className={`text-[10px] px-2.5 py-1 rounded-full font-medium transition-all ${
                  activeIndicator === ind.id
                    ? 'text-white shadow-md'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted'
                }`}
                style={activeIndicator === ind.id ? { background: ind.color } : {}}
              >
                {ind.icon} {ind.name.split(' ')[0]}
              </button>
            ))}
          </div>
          {/* Active indicator explanation */}
          {activeIndicator && (() => {
            const ind = indicators.find(i => i.id === activeIndicator);
            if (!ind) return null;
            return (
              <div className="bg-card/50 rounded-lg p-3 border border-border/30 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold" style={{ color: ind.color }}>{ind.icon}</span>
                  <span className="text-sm font-bold">{ind.name}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Çfarë është</span>
                  <p className="text-[11px] leading-relaxed mt-0.5">{ind.what}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Si të lexohet</span>
                  <p className="text-[11px] leading-relaxed mt-0.5">{ind.how}</p>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wide">Sinjale tregtare</span>
                  <p className="text-[11px] leading-relaxed mt-0.5">{ind.signals}</p>
                </div>
              </div>
            );
          })()}
        </CardContent>
      )}
    </Card>
  );
}

export function TechnicalAnalysis() {
  const [ticker, setTicker] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<TechnicalAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState('1D'); // default 1 ditore

  const timeframes = [
    { value: '1h', label: '1 Orë' },
    { value: '4h', label: '4 Orë' },
    { value: '1D', label: '1 Ditore' },
    { value: '1W', label: '1 Javë' },
    { value: '1M', label: '1 Muaj' },
  ];

  // Track the timeframe that was used for the LAST successful analysis.
  // When user changes timeframe, auto re-run analysis if we already have
  // a ticker analyzed (so user doesn't have to click "Analizo" again).
  const lastAnalyzedTimeframe = useRef<string>('');
  const lastAnalyzedTicker = useRef<string>('');

  useEffect(() => {
    // Only auto-run if:
    // 1. We have a ticker
    // 2. We already analyzed something before (lastAnalyzedTicker is set)
    // 3. The new timeframe is different from the one we last analyzed
    if (
      ticker &&
      lastAnalyzedTicker.current &&
      lastAnalyzedTicker.current === ticker &&
      lastAnalyzedTimeframe.current &&
      lastAnalyzedTimeframe.current !== timeframe
    ) {
      lastAnalyzedTimeframe.current = timeframe;
      runAnalysisForTicker();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeframe]);

  const runAnalysisForTicker = async (tickerSymbol?: string) => {
    const sym = (tickerSymbol || ticker).trim().toUpperCase();
    if (!sym) return;
    setTicker(sym);
    // Record what we're analyzing now so the timeframe effect doesn't loop
    lastAnalyzedTicker.current = sym;
    lastAnalyzedTimeframe.current = timeframe;
    setIsLoading(true);
    setError(null);
    // NOTE: We do NOT call setAnalysis(null) here — keeping the old chart
    // visible during loading preserves the CandlestickChart component
    // instance and its drawn lines (Long/Short/Trend). Only the data
    // updates when the new analysis arrives, and the drawings
    // reposition automatically based on the new price scale.

    try {
      const res = await fetch('/api/technical-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: sym, range: timeframe }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Analiza dështoi');
        return;
      }
      setAnalysis(data.analysis);
    } catch {
      setError('Gabim rrjeti. Provo përsëri.');
    } finally {
      setIsLoading(false);
    }
  };

  const runAnalysis = () => runAnalysisForTicker();

  const getSignalIcon = (signal: string) => {
    const s = signal.toLowerCase();
    if (s.includes('bullish') || s.includes('buy') || s === 'overbought')
      return <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />;
    if (s.includes('bearish') || s.includes('sell') || s === 'oversold')
      return <TrendingDown className="w-3.5 h-3.5 text-red-400" />;
    return <Minus className="w-3.5 h-3.5 text-amber-400" />;
  };

  const getSignalColor = (signal: string) => {
    const s = signal.toLowerCase();
    if (s.includes('bullish') || s.includes('buy')) return 'text-emerald-400';
    if (s.includes('bearish') || s.includes('sell')) return 'text-red-400';
    return 'text-amber-400';
  };

  const getSignalBg = (signal: string) => {
    const s = signal.toLowerCase();
    if (s.includes('bullish') || s.includes('buy')) return 'bg-emerald-500';
    if (s.includes('bearish') || s.includes('sell')) return 'bg-red-500';
    return 'bg-amber-500';
  };

  const price = analysis?.priceAnalysis?.currentPrice;
  const priceChange = analysis?.priceAnalysis?.priceChange;

  return (
    <div className="space-y-4">
      {/* Timeframe Selector */}
      <div className="flex items-center gap-1.5">
        {timeframes.map((tf) => (
          <button
            key={tf.value}
            onClick={() => setTimeframe(tf.value)}
            className={`text-xs px-2.5 py-1 rounded-md transition-colors font-medium ${
              timeframe === tf.value
                ? 'bg-emerald-600 text-white'
                : 'bg-muted/50 text-muted-foreground hover:bg-muted'
            }`}
          >
            {tf.label}
          </button>
        ))}
      </div>

      {/* Search Bar */}
      <div className="flex gap-2">
        <StockSearch
          onSelect={(t) => runAnalysisForTicker(t)}
          onQueryChange={(q) => setSearchQuery(q)}
          placeholder="Kërko ticker-in... AAPL, VRT, GLW"
          className="flex-1"
          inputClassName="h-10 text-sm"
        />
        <Button
          onClick={() => runAnalysisForTicker(searchQuery || ticker)}
          disabled={isLoading || !(searchQuery.trim() || ticker.trim())}
          className="bg-emerald-600 hover:bg-emerald-700 text-white"
        >
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BarChart3 className="w-4 h-4 mr-1.5" />}
          Analizo
        </Button>
      </div>

      {/* Error */}
      {error && (
        <div className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          {error}
        </div>
      )}

      {/* Loading — only show full skeleton on INITIAL load (no analysis yet).
          On subsequent loads (timeframe switches), the existing chart stays
          visible with a small loading badge. */}
      {isLoading && !analysis && (
        <div className="space-y-4">
          <Skeleton className="h-[120px] rounded-xl" />
          <Skeleton className="h-[300px] rounded-xl" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Skeleton className="h-[180px] rounded-xl" />
            <Skeleton className="h-[180px] rounded-xl" />
            <Skeleton className="h-[180px] rounded-xl" />
          </div>
        </div>
      )}

      {/* Results — keep mounted during loading so chart drawings (Long/Short/Trend)
          are preserved across timeframe switches. We show a loading overlay
          instead of unmounting the entire results block. */}
      {analysis && (
        <div className="space-y-4">
          {/* ═══ HEADER — Ticker, Price, Signal ═══ */}
          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-2xl font-bold">{analysis.ticker}</h3>
                    <Badge className={`${getSignalBg(analysis.overallSignal)} text-white font-semibold`}>
                      {analysis.overallSignal}
                    </Badge>
                    {analysis.isDemo && (
                      <Badge variant="outline" className="text-[9px] text-muted-foreground border-muted">
                        <AlertTriangle className="w-2.5 h-2.5 mr-0.5" /> Demo
                      </Badge>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-0.5">{analysis.company}</p>
                  {analysis.sector && (
                    <p className="text-[11px] text-muted-foreground">{analysis.sector}</p>
                  )}
                </div>

                {/* PRICE DISPLAY — Prominent */}
                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <div className="flex items-center gap-1.5 justify-end">
                      <DollarSign className="w-4 h-4 text-muted-foreground" />
                      <p className="text-3xl font-bold tabular-nums">
                        {price ? price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                      </p>
                    </div>
                    {priceChange !== undefined && priceChange !== 0 && (
                      <p className={`text-sm font-medium tabular-nums ${priceChange >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                        {priceChange >= 0 ? '▲' : '▼'} {priceChange >= 0 ? '+' : ''}{fmt(priceChange, 2)}%
                      </p>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Besueshmëria</p>
                    <p className="text-2xl font-bold">{analysis.confidence}<span className="text-sm text-muted-foreground">%</span></p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Trendi</p>
                    <div className="flex items-center gap-1 justify-end">
                      {getSignalIcon(analysis.priceAnalysis?.trend || '')}
                      <span className="text-sm font-medium capitalize">{analysis.priceAnalysis?.trend}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground capitalize">
                      {analysis.priceAnalysis?.trendStrength}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ═══ CHART — Candlestick + Volume + Volume Profile + S/R ═══ */}
          {/* Always render CandlestickChart (even during loading or when data
              is briefly empty) so the component stays mounted across timeframe
              switches — this preserves user-drawn lines (Long/Short/Trend). */}
          <div className="rounded-lg overflow-hidden border border-[#2a2e39] relative" style={{ background: '#131722' }}>
            {/* Loading overlay — shown when fetching new timeframe data */}
            {isLoading && (
              <div className="absolute top-2 left-1/2 -translate-x-1/2 z-30 bg-amber-600/90 text-white text-[10px] px-3 py-1 rounded-full font-medium flex items-center gap-1.5 shadow-lg">
                <Loader2 className="w-3 h-3 animate-spin" />
                Po ngarkohet {timeframe}...
              </div>
            )}
            <div className="h-[500px]">
              <CandlestickChart
                data={analysis?.candlestickData || []}
                supports={analysis?.supportResistance?.supports || []}
                resistances={analysis?.supportResistance?.resistances || []}
                tickerSymbol={analysis?.ticker}
              />
            </div>
              {/* Volume Profile legend */}
              <div className="flex items-center gap-3 px-3 py-1.5 border-t border-[#2a2e39] text-[10px] text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#f0b323' }}></span>
                  <span>POC (Point of Control)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#26a69a' }}></span>
                  <span>HVN (High Volume Node)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: 'rgba(41, 98, 255, 0.5)' }}></span>
                  <span>VAH/VAL (Value Area)</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: '#787b86' }}></span>
                  <span>LVN (Low Volume Node)</span>
                </span>
                <span className="flex items-center gap-1.5 ml-auto">
                  <span className="inline-block w-3 h-0.5" style={{ background: '#ef5350' }}></span>
                  <span>Rezistenca</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="inline-block w-3 h-0.5" style={{ background: '#26a69a' }}></span>
                  <span>Suporti</span>
                </span>
              </div>
            </div>

          {/* ═══ INDICATOR EXPLANATIONS — collapsible educational section ═══ */}
          <IndicatorExplanations />

          {/* ═══ INDICATORS — Detailed Cards ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">

            {/* RSI */}
            {analysis.indicators?.rsi && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">RSI (14)</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.rsi.signal)}
                      <span className={`text-sm font-bold ${getSignalColor(analysis.indicators.rsi.signal)}`}>
                        {analysis.indicators.rsi.value}
                      </span>
                    </div>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-700 ${
                        analysis.indicators.rsi.value > 70
                          ? 'bg-red-500'
                          : analysis.indicators.rsi.value < 30
                            ? 'bg-emerald-500'
                            : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(analysis.indicators.rsi.value, 100)}%` }}
                    />
                  </div>
                  {/* RSI zones */}
                  <div className="flex justify-between text-[8px] text-muted-foreground">
                    <span>Nënshitje (&lt;30)</span>
                    <span>Neutral</span>
                    <span>Mbipëshitje (&gt;70)</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.rsi.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* MACD */}
            {analysis.indicators?.macd && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">MACD</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.macd.signal)}
                      <span className={`text-xs font-semibold uppercase ${getSignalColor(analysis.indicators.macd.signal)}`}>
                        {analysis.indicators.macd.signal}
                      </span>
                    </div>
                  </div>
                  <p className="text-2xl font-bold tabular-nums">{analysis.indicators.macd.value}</p>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.macd.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Moving Averages */}
            {analysis.indicators?.movingAverage && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Moving Averages</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.movingAverage.signal)}
                      <span className={`text-[10px] font-semibold uppercase ${getSignalColor(analysis.indicators.movingAverage.signal)}`}>
                        {analysis.indicators.movingAverage.signal}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between"><span className="text-muted-foreground">SMA 20</span><span className="font-mono font-medium">${analysis.indicators.movingAverage.sma20}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">SMA 50</span><span className="font-mono font-medium">${analysis.indicators.movingAverage.sma50}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">SMA 200</span><span className="font-mono font-medium">${analysis.indicators.movingAverage.sma200}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">EMA 12</span><span className="font-mono font-medium">${analysis.indicators.movingAverage.ema12}</span></div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.movingAverage.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Bollinger Bands */}
            {analysis.indicators?.bollingerBands && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Bollinger Bands</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.bollingerBands.signal)}
                      <span className={`text-[10px] font-semibold uppercase ${getSignalColor(analysis.indicators.bollingerBands.signal)}`}>
                        {analysis.indicators.bollingerBands.signal}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 text-[11px]">
                    <div className="flex justify-between"><span className="text-red-400">Upper Band</span><span className="font-mono font-medium text-red-400">${analysis.indicators.bollingerBands.upper}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">Middle (SMA 20)</span><span className="font-mono font-medium">${analysis.indicators.bollingerBands.middle}</span></div>
                    <div className="flex justify-between"><span className="text-emerald-400">Lower Band</span><span className="font-mono font-medium text-emerald-400">${analysis.indicators.bollingerBands.lower}</span></div>
                    {/* Price position indicator */}
                    {price && (
                      <div className="flex justify-between text-[10px]">
                        <span className="text-muted-foreground">Çmimi aktual</span>
                        <span className="font-mono font-bold">${fmt(price, 2)}</span>
                      </div>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.bollingerBands.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Volume */}
            {analysis.indicators?.volume && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Volumi</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.volume.signal)}
                      <span className={`text-[10px] font-semibold uppercase ${getSignalColor(analysis.indicators.volume.signal)}`}>
                        {analysis.indicators.volume.signal}
                      </span>
                    </div>
                  </div>
                  <Badge variant="secondary" className="text-[10px] capitalize">
                    {(analysis.indicators.volume as any)?.trend ?? 'N/A'}
                  </Badge>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.volume.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}

            {/* Stochastic */}
            {analysis.indicators?.stochastic && (
              <Card className="border-border/50 bg-card/50">
                <CardContent className="pt-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold">Stochastic</span>
                    <div className="flex items-center gap-1.5">
                      {getSignalIcon(analysis.indicators.stochastic.signal)}
                      <span className={`text-[10px] font-semibold uppercase ${getSignalColor(analysis.indicators.stochastic.signal)}`}>
                        {analysis.indicators.stochastic.signal}
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <span>%K: <b className="font-mono">{analysis.indicators.stochastic.k}</b></span>
                    <span>%D: <b className="font-mono">{analysis.indicators.stochastic.d}</b></span>
                  </div>
                  {/* Stochastic visual bar */}
                  <div className="relative h-2 bg-muted rounded-full overflow-hidden">
                    <div className="absolute left-[20%] w-[60%] h-full bg-emerald-500/20 rounded-full" />
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        analysis.indicators.stochastic.k > 80 ? 'bg-red-500' : analysis.indicators.stochastic.k < 20 ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.min(Math.max(analysis.indicators.stochastic.k, 0), 100)}%` }}
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">
                    {analysis.indicators.stochastic.interpretation}
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ═══ SUPPORT/RESISTANCE + PATTERNS ═══ */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {analysis.supportResistance && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <ArrowDown className="w-3.5 h-3.5 text-emerald-500" />
                    Suporti & Rezistenca
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <p className="text-xs text-emerald-500 font-medium mb-1.5">Suporte (nivele blerjeje)</p>
                    <div className="flex flex-wrap gap-1">
                      {analysis.supportResistance.supports.map((s, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] border-emerald-500/30 text-emerald-500 font-mono px-2 py-0.5">
                          ${s}
                        </Badge>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-red-500 font-medium mb-1.5">Rezistencë (nivele shitjeje)</p>
                    <div className="flex flex-wrap gap-1">
                      {analysis.supportResistance.resistances.map((r, i) => (
                        <Badge key={i} variant="outline" className="text-[10px] border-red-500/30 text-red-500 font-mono px-2 py-0.5">
                          ${r}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ═══ VOLUME PROFILE STATS CARD ═══ */}
            {analysis.candlestickData && analysis.candlestickData.length > 5 && (() => {
              const vp = computeVolumeProfile(analysis.candlestickData, 24);
              if (!vp.bins.length || vp.maxBinVol <= 0) return null;
              const price = analysis.priceAnalysis?.currentPrice;
              const priceVsPOC = price && vp.poc ? ((price - vp.poc) / vp.poc) * 100 : null;
              const inValueArea = price && vp.vah > 0 && vp.val > 0 ? (price <= vp.vah && price >= vp.val) : null;
              return (
                <Card className="border-blue-500/20 bg-blue-500/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <BarChart3 className="w-3.5 h-3.5 text-blue-500" />
                      Volume Profile
                      <span className="text-[10px] text-muted-foreground font-normal">(24 nivele çmimi)</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2.5">
                    {/* POC */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ background: '#f0b323' }}></span>
                        <span className="text-xs">POC (Point of Control)</span>
                      </div>
                      <span className="text-sm font-mono font-bold text-amber-400">${fmt(vp.poc, 2)}</span>
                    </div>
                    {/* VAH */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ background: '#2962ff' }}></span>
                        <span className="text-xs">VAH (Value Area High)</span>
                      </div>
                      <span className="text-sm font-mono font-bold text-blue-400">${fmt(vp.vah, 2)}</span>
                    </div>
                    {/* VAL */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-block w-2 h-2 rounded-sm" style={{ background: '#2962ff' }}></span>
                        <span className="text-xs">VAL (Value Area Low)</span>
                      </div>
                      <span className="text-sm font-mono font-bold text-blue-400">${fmt(vp.val, 2)}</span>
                    </div>
                    {/* Divider */}
                    <div className="border-t border-border/30 pt-2 space-y-2">
                      {/* HVN count */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: '#26a69a' }}></span>
                          <span className="text-xs">HVN (High Volume Nodes)</span>
                        </div>
                        <span className="text-xs font-mono">{vp.hvn.length} nivele</span>
                      </div>
                      {/* LVN count */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block w-2 h-2 rounded-sm" style={{ background: '#787b86' }}></span>
                          <span className="text-xs">LVN (Low Volume Nodes)</span>
                        </div>
                        <span className="text-xs font-mono">{vp.lvn.length} nivele</span>
                      </div>
                    </div>
                    {/* Interpretation */}
                    <div className="bg-card/50 rounded-md p-2 border border-border/30 mt-2">
                      {priceVsPOC !== null && (
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <span className="text-muted-foreground">Çmimi vs POC</span>
                          <span className={`font-mono font-semibold ${priceVsPOC >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {priceVsPOC >= 0 ? '+' : ''}{fmt(priceVsPOC, 2)}%
                          </span>
                        </div>
                      )}
                      {inValueArea !== null && (
                        <div className="flex items-center justify-between text-[11px] mb-1.5">
                          <span className="text-muted-foreground">Në Value Area</span>
                          <span className={`font-mono font-semibold ${inValueArea ? 'text-emerald-500' : 'text-amber-500'}`}>
                            {inValueArea ? 'PO — Brenda' : 'JO — Jashtë'}
                          </span>
                        </div>
                      )}
                      <p className="text-[11px] text-muted-foreground leading-relaxed mt-1.5">
                        {price && vp.poc && price < vp.poc * 0.98
                          ? 'Çmimi është nën POC — presion shitës, kërko konfirmim në HVN më të afërt për rebound.'
                          : price && vp.poc && price > vp.poc * 1.02
                          ? 'Çmimi është mbi POC — moment blerës, vëzhgo thyerjen e VAH për vazhdim trendi.'
                          : 'Çmimi është afër POC — zonë e ekuilibrit, prit thyerje me vëllim.'}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              );
            })()}

            {analysis.patterns && analysis.patterns.length > 0 && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium">Modelet Grafike</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {analysis.patterns.map((p, i) => (
                      <div key={i} className={`p-2.5 rounded-lg ${
                        p.type === 'bullish' ? 'bg-emerald-500/5 border border-emerald-500/20'
                        : p.type === 'bearish' ? 'bg-red-500/5 border border-red-500/20'
                        : 'bg-muted/30 border border-muted/30'
                      }`}>
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold">{p.name}</span>
                          <Badge
                            variant="outline"
                            className={`text-[9px] ${
                              p.type === 'bullish'
                                ? 'border-emerald-500/30 text-emerald-500'
                                : p.type === 'bearish'
                                  ? 'border-red-500/30 text-red-500'
                                  : 'border-amber-500/30 text-amber-500'
                            }`}
                          >
                            {p.type}
                          </Badge>
                          <Badge variant="outline" className="text-[9px]">
                            {p.reliability}
                          </Badge>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{p.description}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* ═══ SUMMARY & ACTION PLAN — ALWAYS visible, NEVER empty ═══ */}
          {(analysis.summary || analysis.actionPlan) && (
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="pt-5 space-y-4">
              <div>
                <h4 className="text-sm font-bold text-emerald-500 mb-2 flex items-center gap-1.5">
                  <Activity className="w-4 h-4" /> Përmbledhje
                </h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{analysis.summary || 'Analiza teknike është e disponueshme në indikatorët më sipër.'}</p>
              </div>
              <div>
                <h4 className="text-sm font-bold text-emerald-500 mb-2 flex items-center gap-1.5">
                  <TrendingUp className="w-4 h-4" /> Plan i Veprimit
                </h4>
                <div className="bg-card/80 rounded-lg p-3 border border-emerald-500/20">
                  <p className="text-sm text-foreground leading-relaxed font-medium">{formatActionPlan(analysis.actionPlan)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          )}
        </div>
      )}
    </div>
  );
}
