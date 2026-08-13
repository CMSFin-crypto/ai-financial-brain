'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo } from 'react';
import { ResponsiveContainer } from 'recharts';
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
  actionPlan: string;
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

function computeMACD(closes: number[]): { macd: (number | null)[]; signal: (number | null)[]; histogram: (number | null)[] } {
  const ema12 = computeEMA(closes, 12);
  const ema26 = computeEMA(closes, 26);
  const macdLine: (number | null)[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (ema12[i] === null || ema26[i] === null) { macdLine.push(null); continue; }
    macdLine.push(ema12[i]! - ema26[i]!);
  }
  // Signal = 9-period EMA of MACD line
  const validMACD = macdLine.filter((v): v is number => v !== null);
  const signalEma = computeEMA(validMACD, 9);
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

// ═══ Full Technical Chart with Indicators ═══
function CandlestickChart({ data }: { data: CandleData[] }) {
  const chart = useMemo(() => {
    if (!data || data.length < 3) return null;

    const W = 880;
    const H = 560;
    const margin = { top: 8, right: 58, bottom: 4, left: 6 };
    const chartW = W - margin.left - margin.right;
    const n = data.length;
    const barSpace = chartW / n;
    const bodyW = Math.max(barSpace * 0.55, 2.5);

    // Panel layout
    const sepH = 4;
    const priceH = 220;
    const volH = 48;
    const rsiH = 72;
    const macdH = 80;
    const legendH = 18;

    let yCursor = margin.top;
    const priceTop = yCursor; yCursor += priceH;
    const volTop = yCursor + sepH; yCursor = volTop + volH;
    const rsiTop = yCursor + sepH; yCursor = rsiTop + rsiH;
    const macdTop = yCursor + sepH; yCursor = macdTop + macdH;
    const legendTop = yCursor + sepH;
    const xLabelY = legendTop + legendH + 12;

    // Colors
    const bgPanel = 'hsl(240 6% 9%)';
    const gridClr = 'hsl(240 6% 22%)';
    const txtClr = 'hsl(240 5% 55%)';
    const sepClr = 'hsl(240 6% 18%)';
    const bullClr = '#22c55e';
    const bearClr = '#ef4444';

    // ═══ Compute indicators ═══
    const closes = data.map(d => d.close);
    const sma20 = computeSMA(closes, Math.min(20, n));
    const sma50 = n >= 50 ? computeSMA(closes, 50) : computeSMA(closes, n);
    const ema12 = computeEMA(closes, Math.min(12, n));
    const bb = computeBollingerBands(closes, Math.min(20, n));
    const rsi = computeRSI(closes, 14);
    const macdData = computeMACD(closes);

    // ═══ Price scale ═══
    const priceHighs = data.map(d => d.high);
    const priceLows = data.map(d => d.low);
    const bbUpperVals = bb.upper.filter((v): v is number => v !== null);
    const bbLowerVals = bb.lower.filter((v): v is number => v !== null);
    const smaVals = sma20.filter((v): v is number => v !== null);
    const allH = Math.max(...priceHighs, ...bbUpperVals, ...smaVals);
    const allL = Math.min(...priceLows, ...bbLowerVals, ...smaVals);
    const pPad = (allH - allL) * 0.08 || 1;
    const pMin = allL - pPad;
    const pMax = allH + pPad;
    const yP = (v: number) => priceTop + (1 - (v - pMin) / (pMax - pMin)) * priceH;

    // ═══ Volume scale ═══
    const maxVol = Math.max(...data.map(d => d.volume || 0)) || 1;
    const yV = (v: number) => volTop + volH - (v / maxVol) * volH;

    // ═══ RSI scale (0-100) ═══
    const yR = (v: number) => rsiTop + (1 - v / 100) * rsiH;

    // ═══ MACD scale ═══
    const allMacd = macdData.macd.filter((v): v is number => v !== null);
    const allHist = macdData.histogram.filter((v): v is number => v !== null);
    const macdAbsMax = Math.max(Math.abs(Math.min(...allMacd, ...allHist)), Math.abs(Math.max(...allMacd, ...allHist)), 0.01);
    const yM = (v: number) => macdTop + macdH / 2 - (v / macdAbsMax) * (macdH / 2);

    // ═══ Helpers ═══
    const xOf = (i: number) => margin.left + barSpace * i + barSpace / 2;
    const labelEvery = n <= 8 ? 1 : n <= 15 ? 2 : n <= 25 ? 3 : 5;

    // ═══ Polyline helper ═══
    const polyline = (vals: (number | null)[], color: string, width = 1.2, id?: string) => {
      const pts: string[] = [];
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] !== null) pts.push(`${xOf(i)},${vals[i]}`);
      }
      return pts.length > 1 ? <polyline key={id || color} points={pts.join(' ')} fill="none" stroke={color} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" /> : null;
    };

    // ═══ Price grid lines ═══
    const priceGrid: { y: number; label: string }[] = [];
    for (let i = 0; i <= 5; i++) {
      const v = pMin + (pMax - pMin) * (i / 5);
      priceGrid.push({ y: yP(v), label: '$' + v.toFixed(1) });
    }

    // ═══ Bollinger Band fill polygon ═══
    const bbFillPts: string[] = [];
    for (let i = 0; i < n; i++) {
      if (bb.upper[i] !== null) bbFillPts.push(`${xOf(i)},${yP(bb.upper[i]!)}`);
    }
    for (let i = n - 1; i >= 0; i--) {
      if (bb.lower[i] !== null) bbFillPts.push(`${xOf(i)},${yP(bb.lower[i]!)}`);
    }

    // ═══ RSI zones ═══
    const rsiOB = yR(70);
    const rsiOS = yR(30);
    const rsiMid = yR(50);

    // ═══ Current price line ═══
    const lastClose = data[n - 1].close;
    const lastY = yP(lastClose);

    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ background: 'transparent' }}>
        <defs>
          <linearGradient id="bbGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.12" />
            <stop offset="50%" stopColor="#8b5cf6" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#8b5cf6" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="rsiOBGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ef4444" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#ef4444" stopOpacity="0.02" />
          </linearGradient>
          <linearGradient id="rsiOSGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#22c55e" stopOpacity="0.02" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.10" />
          </linearGradient>
        </defs>

        {/* ════════ PRICE PANEL ════════ */}
        {/* Panel background */}
        <rect x={margin.left} y={priceTop} width={chartW} height={priceH} fill={bgPanel} rx={4} />

        {/* Price grid lines + labels */}
        {priceGrid.map((g, i) => (
          <g key={"pg" + i}>
            <line x1={margin.left} y1={g.y} x2={W - margin.right} y2={g.y} stroke={gridClr} strokeDasharray="3 4" strokeOpacity={0.5} />
            <text x={W - margin.right + 5} y={g.y + 3.5} fill={txtClr} fontSize={9} fontFamily="ui-monospace, monospace" fontWeight="500">{g.label}</text>
          </g>
        ))}

        {/* Bollinger Bands shaded fill */}
        {bbFillPts.length > 2 && (
          <polygon points={bbFillPts.join(' ')} fill="url(#bbGrad)" stroke="none" />
        )}

        {/* Bollinger Band lines (upper, middle, lower) */}
        {polyline(bb.upper.map(v => v !== null ? yP(v) : null), '#8b5cf6', 1, 'bb-upper')}
        {polyline(bb.middle.map(v => v !== null ? yP(v) : null), '#8b5cf6', 1, 'bb-mid')}
        {polyline(bb.lower.map(v => v !== null ? yP(v) : null), '#8b5cf6', 1, 'bb-lower')}

        {/* Moving Average lines */}
        {polyline(sma20.map(v => v !== null ? yP(v) : null), '#f59e0b', 1.6, 'sma20')}
        {polyline(sma50.map(v => v !== null ? yP(v) : null), '#3b82f6', 1.6, 'sma50')}
        {polyline(ema12.map(v => v !== null ? yP(v) : null), '#ec4899', 1.3, 'ema12')}

        {/* Candlesticks */}
        {data.map((d, i) => {
          const cx = xOf(i);
          const isUp = d.close >= d.open;
          const color = isUp ? bullClr : bearClr;
          const bodyTop = yP(Math.max(d.open, d.close));
          const bodyBot = yP(Math.min(d.open, d.close));
          const bodyH = Math.max(Math.abs(bodyBot - bodyTop), 1.5);
          return (
            <g key={"c" + i}>
              <line x1={cx} y1={yP(d.high)} x2={cx} y2={yP(d.low)} stroke={color} strokeWidth={1.2} />
              <rect x={cx - bodyW / 2} y={bodyTop} width={bodyW} height={bodyH} fill={isUp ? color : color} stroke={color} strokeWidth={0.6} rx={1.5} />
            </g>
          );
        })}

        {/* Current price dashed line */}
        <line x1={margin.left} y1={lastY} x2={W - margin.right} y2={lastY} stroke={data[n-1].close >= data[n-1].open ? bullClr : bearClr} strokeDasharray="4 3" strokeOpacity={0.6} strokeWidth={1} />
        <rect x={W - margin.right + 1} y={lastY - 8} width={58} height={16} rx={3} fill={data[n-1].close >= data[n-1].open ? bullClr : bearClr} fillOpacity={0.85} />
        <text x={W - margin.right + 4} y={lastY + 3.5} fill="white" fontSize={8.5} fontFamily="ui-monospace, monospace" fontWeight="600">{'$' + lastClose.toFixed(2)}</text>

        {/* Price panel label */}
        <text x={margin.left + 6} y={priceTop + 14} fill={txtClr} fontSize={9} fontWeight="600" opacity={0.7}>CENA</text>

        {/* ════════ VOLUME PANEL ════════ */}
        <rect x={margin.left} y={volTop} width={chartW} height={volH} fill={bgPanel} rx={4} />
        {/* Volume grid */}
        <line x1={margin.left} y1={volTop + volH * 0.5} x2={W - margin.right} y2={volTop + volH * 0.5} stroke={gridClr} strokeDasharray="2 4" strokeOpacity={0.3} />
        {data.map((d, i) => {
          const cx = xOf(i);
          const isUp = d.close >= d.open;
          const vy = yV(d.volume || 0);
          const vh = Math.max(volTop + volH - vy, 0);
          return (
            <rect key={"v" + i} x={cx - bodyW / 2} y={vy} width={bodyW} height={vh}
              fill={isUp ? 'rgba(34,197,94,0.35)' : 'rgba(239,68,68,0.35)'} rx={1} />
          );
        })}
        <text x={margin.left + 6} y={volTop + 12} fill={txtClr} fontSize={8.5} fontWeight="600" opacity={0.65}>VOL</text>
        {/* Volume Y labels */}
        <text x={W - margin.right + 5} y={volTop + 12} fill={txtClr} fontSize={7} fontFamily="ui-monospace, monospace">{(maxVol / 1e6).toFixed(1)}M</text>
        <text x={W - margin.right + 5} y={volTop + volH - 2} fill={txtClr} fontSize={7} fontFamily="ui-monospace, monospace">0</text>

        {/* ════════ RSI PANEL ════════ */}
        <rect x={margin.left} y={rsiTop} width={chartW} height={rsiH} fill={bgPanel} rx={4} />
        {/* Overbought zone */}
        <rect x={margin.left} y={rsiTop} width={chartW} height={rsiOB - rsiTop} fill="url(#rsiOBGrad)" rx={4} />
        {/* Oversold zone */}
        <rect x={margin.left} y={rsiOS} width={chartW} height={rsiTop + rsiH - rsiOS} fill="url(#rsiOSGrad)" rx={4} />
        {/* Grid lines */}
        <line x1={margin.left} y1={rsiOB} x2={W - margin.right} y2={rsiOB} stroke="#ef4444" strokeDasharray="4 3" strokeOpacity={0.35} strokeWidth={0.8} />
        <line x1={margin.left} y1={rsiOS} x2={W - margin.right} y2={rsiOS} stroke="#22c55e" strokeDasharray="4 3" strokeOpacity={0.35} strokeWidth={0.8} />
        <line x1={margin.left} y1={rsiMid} x2={W - margin.right} y2={rsiMid} stroke={gridClr} strokeDasharray="2 4" strokeOpacity={0.25} />
        {/* RSI labels */}
        <text x={W - margin.right + 5} y={rsiOB + 3.5} fill="#ef4444" fontSize={8} fontFamily="ui-monospace, monospace" opacity={0.7}>70</text>
        <text x={W - margin.right + 5} y={rsiMid + 3.5} fill={txtClr} fontSize={8} fontFamily="ui-monospace, monospace" opacity={0.5}>50</text>
        <text x={W - margin.right + 5} y={rsiOS + 3.5} fill="#22c55e" fontSize={8} fontFamily="ui-monospace, monospace" opacity={0.7}>30</text>
        {/* RSI line */}
        {polyline(rsi.map(v => v !== null ? yR(v) : null), '#a855f7', 1.5, 'rsi-line')}
        {/* RSI panel label */}
        <text x={margin.left + 6} y={rsiTop + 11} fill="#a855f7" fontSize={8} fontWeight="700" opacity={0.85}>RSI (14)</text>
        {/* Latest RSI value */}
        {rsi[n - 1] !== null && (
          <text x={margin.left + 58} y={rsiTop + 11} fill={rsi[n-1]! > 70 ? '#ef4444' : rsi[n-1]! < 30 ? '#22c55e' : txtClr} fontSize={8} fontWeight="600" fontFamily="ui-monospace, monospace">{rsi[n-1]!.toFixed(1)}</text>
        )}

        {/* ════════ MACD PANEL ════════ */}
        <rect x={margin.left} y={macdTop} width={chartW} height={macdH} fill={bgPanel} rx={4} />
        {/* Zero line */}
        <line x1={margin.left} y1={macdTop + macdH / 2} x2={W - margin.right} y2={macdTop + macdH / 2} stroke={gridClr} strokeDasharray="3 3" strokeOpacity={0.4} />
        {/* MACD histogram bars */}
        {macdData.histogram.map((v, i) => {
          if (v === null) return null;
          const cx = xOf(i);
          const isPos = v >= 0;
          const barY = isPos ? yM(v) : macdTop + macdH / 2;
          const barH = Math.abs(yM(v) - (macdTop + macdH / 2));
          return (
            <rect key={"mh" + i} x={cx - bodyW * 0.4} y={barY} width={bodyW * 0.8} height={Math.max(barH, 0.5)}
              fill={isPos ? 'rgba(34,197,94,0.55)' : 'rgba(239,68,68,0.55)'} rx={1} />
          );
        })}
        {/* MACD line */}
        {polyline(macdData.macd.map(v => v !== null ? yM(v) : null), '#06b6d4', 1.8, 'macd-line')}
        {/* Signal line */}
        {polyline(macdData.signal.map(v => v !== null ? yM(v) : null), '#f97316', 1.4, 'signal-line')}
        {/* MACD panel label + legend */}
        <text x={margin.left + 6} y={macdTop + 12} fill={txtClr} fontSize={8.5} fontWeight="700" opacity={0.85}>MACD</text>
        <line x1={margin.left + 46} y1={macdTop + 9} x2={margin.left + 60} y2={macdTop + 9} stroke="#06b6d4" strokeWidth={1.5} />
        <text x={margin.left + 63} y={macdTop + 12} fill="#06b6d4" fontSize={7.5} opacity={0.8}>Line</text>
        <line x1={margin.left + 90} y1={macdTop + 9} x2={margin.left + 104} y2={macdTop + 9} stroke="#f97316" strokeWidth={1.5} />
        <text x={margin.left + 107} y={macdTop + 12} fill="#f97316" fontSize={7.5} opacity={0.8}>Signal</text>
        <rect x={margin.left + 142} y={macdTop + 4} width={8} height={8} fill="rgba(34,197,94,0.5)" rx={1} />
        <text x={margin.left + 153} y={macdTop + 12} fill={txtClr} fontSize={7.5} opacity={0.6}>Hist</text>
        {/* MACD zero label */}
        <text x={W - margin.right + 5} y={macdTop + macdH / 2 + 3.5} fill={txtClr} fontSize={7.5} fontFamily="ui-monospace, monospace" opacity={0.5}>0</text>

        {/* ════════ LEGEND BAR ════════ */}
        <rect x={margin.left} y={legendTop} width={chartW} height={legendH} fill={bgPanel} rx={3} />
        {/* SMA 20 */}
        <line x1={margin.left + 10} y1={legendTop + legendH / 2} x2={margin.left + 24} y2={legendTop + legendH / 2} stroke="#f59e0b" strokeWidth={2} />
        <text x={margin.left + 27} y={legendTop + legendH / 2 + 3} fill={txtClr} fontSize={7.5}>SMA20</text>
        {/* SMA 50 */}
        <line x1={margin.left + 75} y1={legendTop + legendH / 2} x2={margin.left + 89} y2={legendTop + legendH / 2} stroke="#3b82f6" strokeWidth={2} />
        <text x={margin.left + 92} y={legendTop + legendH / 2 + 3} fill={txtClr} fontSize={7.5}>SMA50</text>
        {/* EMA 12 */}
        <line x1={margin.left + 140} y1={legendTop + legendH / 2} x2={margin.left + 154} y2={legendTop + legendH / 2} stroke="#ec4899" strokeWidth={2} />
        <text x={margin.left + 157} y={legendTop + legendH / 2 + 3} fill={txtClr} fontSize={7.5}>EMA12</text>
        {/* Bollinger Bands */}
        <rect x={margin.left + 205} y={legendTop + 3} width={14} height={legendH - 6} fill="url(#bbGrad)" stroke="#8b5cf6" strokeWidth={0.8} rx={2} />
        <text x={margin.left + 222} y={legendTop + legendH / 2 + 3} fill={txtClr} fontSize={7.5}>BB</text>
        {/* Bullish / Bearish */}
        <rect x={margin.left + 248} y={legendTop + 3} width={7} height={legendH - 6} fill={bullClr} rx={1} />
        <text x={margin.left + 258} y={legendTop + legendH / 2 + 3} fill={txtClr} fontSize={7.5}>Bull</text>
        <rect x={margin.left + 288} y={legendTop + 3} width={7} height={legendH - 6} fill={bearClr} rx={1} />
        <text x={margin.left + 298} y={legendTop + legendH / 2 + 3} fill={txtClr} fontSize={7.5}>Bear</text>

        {/* ════════ X-AXIS DATE LABELS ════════ */}
        {data.map((d, i) => {
          if (i % labelEvery !== 0) return null;
          return (
            <text key={"x" + i} x={xOf(i)} y={xLabelY} fill={txtClr} fontSize={8.5} textAnchor="middle" fontFamily="ui-monospace, monospace" opacity={0.75}>
              {d.date.substring(5)}
            </text>
          );
        })}
      </svg>
    );
  }, [data]);

  return chart || <div className="flex items-center justify-center h-full text-muted-foreground text-sm">Asnjë të dhënë grafiku</div>;
}

export function TechnicalAnalysis() {
  const [ticker, setTicker] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<TechnicalAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState('1mo');

  const timeframes = [
    { value: '1d', label: '1D' },
    { value: '5d', label: '5D' },
    { value: '1mo', label: '1Mo' },
    { value: '3mo', label: '3Mo' },
    { value: '6mo', label: '6Mo' },
    { value: '1y', label: '1V' },
    { value: '5y', label: '5V' },
  ];

  const runAnalysisForTicker = async (tickerSymbol?: string) => {
    const sym = (tickerSymbol || ticker).trim().toUpperCase();
    if (!sym) return;
    setTicker(sym);
    setIsLoading(true);
    setError(null);
    setAnalysis(null);

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

      {/* Loading */}
      {isLoading && (
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

      {/* Results */}
      {analysis && !isLoading && (
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
                        {priceChange >= 0 ? '▲' : '▼'} {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
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

          {/* ═══ CHART — Candlestick + Volume ═══ */}
          {analysis.candlestickData && analysis.candlestickData.length > 0 && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" />
                  Candlestick Chart ({timeframe}) + Volumi
                  {analysis.isRealChart && (
                    <Badge variant="outline" className="text-[9px] border-emerald-500/30 text-emerald-400">Real Data</Badge>
                  )}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[500px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <CandlestickChart data={analysis.candlestickData} />
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

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
                        <span className="font-mono font-bold">${price.toFixed(2)}</span>
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
                  <p className="text-sm text-foreground leading-relaxed font-medium">{analysis.actionPlan || 'Monitoroni indikatorët dhe prisni sinjal të qartë.'}</p>
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
