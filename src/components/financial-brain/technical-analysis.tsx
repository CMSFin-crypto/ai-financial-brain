'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useMemo } from 'react';
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

// ═══ TradingView-Style Technical Chart ═══
function CandlestickChart({ data }: { data: CandleData[] }) {
  const chart = useMemo(() => {
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

    // ═══ Compute indicators — ULTRA-ADAPTIVE periods ═══
    // Goal: every line must span ≥90% of chart width
    // With 20 bars → max 2 nulls at start. With 100+ bars → standard TradingView periods.
    const closes = data.map(d => d.close);

    // Stepped adaptation: tiny periods for small datasets, standard for large
    const smaP      = n < 30 ? 3 : n < 60 ? Math.max(3, Math.round(n * 0.18)) : n < 100 ? Math.round(n * 0.20) : 20;
    const smaLongP  = n < 30 ? 5 : n < 60 ? Math.max(5, Math.round(n * 0.35)) : n < 100 ? Math.round(n * 0.50) : 50;
    const bbP       = smaP;
    const emaP      = n < 30 ? 3 : n < 60 ? Math.max(3, Math.round(n * 0.10)) : 12;
    const rsiP      = n < 30 ? 3 : n < 60 ? Math.max(3, Math.round(n * 0.12)) : 14;
    const macdFast  = n < 30 ? 3 : n < 60 ? Math.max(3, Math.round(n * 0.10)) : 12;
    const macdSlow  = n < 30 ? 4 : n < 60 ? Math.max(5, Math.round(n * 0.22)) : 26;

    // Debug: log data length and periods
    console.log(`[CHART] bars=${n} SMA(${smaP}) SMA(${smaLongP}) EMA(${emaP}) RSI(${rsiP}) MACD(${macdFast},${macdSlow})`);

    const sma20 = computeSMA(closes, smaP);
    const sma50 = computeSMA(closes, smaLongP);
    const ema12 = computeEMA(closes, emaP);
    const bb = computeBollingerBands(closes, bbP);
    const rsi = computeRSI(closes, rsiP);
    const macdData = computeMACD(closes, macdFast, macdSlow);

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

    const line = (vals: (number | null)[], color: string, sw = 1, id?: string) => {
      const pts: string[] = [];
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] !== null) pts.push(`${xOf(i)},${vals[i]}`);
      }
      return pts.length > 1 ? <polyline key={id ?? color} points={pts.join(' ')} fill="none" stroke={color} strokeWidth={sw} strokeLinejoin="round" strokeLinecap="round" /> : null;
    };

    // Price grid
    const pGrid: { y: number; lbl: string }[] = [];
    for (let i = 0; i <= 5; i++) {
      const v = pMin + (pMax - pMin) * (i / 5);
      pGrid.push({ y: yP(v), lbl: '$' + v.toFixed(1) });
    }

    // BB fill
    const bbPts: string[] = [];
    for (let i = 0; i < n; i++) if (bb.upper[i] !== null) bbPts.push(`${xOf(i)},${yP(bb.upper[i]!)}`);
    for (let i = n - 1; i >= 0; i--) if (bb.lower[i] !== null) bbPts.push(`${xOf(i)},${yP(bb.lower[i]!)}`);

    // Last values for legend
    const lastSma20 = sma20[n - 1];
    const lastSma50 = sma50[n - 1];
    const lastEma12 = ema12[n - 1];
    const lastRsi = rsi[n - 1];
    const lastMacd = macdData.macd[n - 1];
    const lastSig = macdData.signal[n - 1];
    const lastClose = data[n - 1].close;
    const lastY = yP(lastClose);

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
        {data.map((d, i) => {
          if (i % labelN !== 0 || i === 0) return null;
          return <line key={"vg" + i} x1={xOf(i)} y1={priceTop} x2={xOf(i)} y2={priceTop + priceH} stroke={GRID} strokeOpacity={0.25} strokeDasharray="1 3" />;
        })}

        {/* Volume bars (behind candles, at bottom of price panel) */}
        <g clipPath="url(#priceClip)">
          {data.map((d, i) => {
            const cx = xOf(i);
            const isUp = d.close >= d.open;
            const vy = yV(d.volume || 0);
            return (
              <rect key={"vol" + i} x={cx - candleW / 2} y={vy} width={candleW} height={Math.max(volTop + volH - vy, 0)}
                fill={isUp ? 'rgba(38,166,154,0.4)' : 'rgba(239,83,80,0.4)'} />
            );
          })}
        </g>

        {/* Bollinger Bands fill */}
        {bbPts.length > 2 && <polygon points={bbPts.join(' ')} fill="rgba(124,77,255,0.08)" stroke="none" />}

        {/* Bollinger Band lines */}
        {line(bb.upper.map(v => v !== null ? yP(v) : null), BB_CLR, 1, 'bb-u')}
        {line(bb.middle.map(v => v !== null ? yP(v) : null), BB_CLR, 1, 'bb-m')}
        {line(bb.lower.map(v => v !== null ? yP(v) : null), BB_CLR, 1, 'bb-l')}

        {/* Moving Averages */}
        {line(sma20.map(v => v !== null ? yP(v) : null), SMA20_CLR, 1.5, 's20')}
        {line(sma50.map(v => v !== null ? yP(v) : null), SMA50_CLR, 1.5, 's50')}
        {line(ema12.map(v => v !== null ? yP(v) : null), EMA12_CLR, 1.2, 'e12')}

        {/* Candlesticks */}
        <g clipPath="url(#priceClip)">
          {data.map((d, i) => {
            const cx = xOf(i);
            const up = d.close >= d.open;
            const c = up ? BULL : BEAR;
            const bT = yP(Math.max(d.open, d.close));
            const bB = yP(Math.min(d.open, d.close));
            const bH = Math.max(bB - bT, 1);
            return (
              <g key={"k" + i}>
                <line x1={cx} y1={yP(d.high)} x2={cx} y2={yP(d.low)} stroke={c} strokeWidth={1} />
                <rect x={cx - candleW / 2} y={bT} width={candleW} height={bH} fill={c} stroke={c} strokeWidth={0.5} />
              </g>
            );
          })}
        </g>

        {/* Current price line + tag */}
        <line x1={L} y1={lastY} x2={W - R} y2={lastY} stroke={data[n-1].close >= data[n-1].open ? BULL : BEAR} strokeDasharray="4 2" strokeOpacity={0.7} strokeWidth={1} />
        <rect x={W - R + 1} y={lastY - 10} width={R - 2} height={20} rx={2} fill={data[n-1].close >= data[n-1].open ? BULL : BEAR} />
        <text x={W - R + 8} y={lastY + 4} fill="white" fontSize={10.5} fontFamily="Trebuchet MS, sans-serif" fontWeight="600">{lastClose.toFixed(2)}</text>

        {/* TV-style top-right indicator legend with box */}
        <rect x={W - R - 210} y={priceTop + 4} width={206} height={52} rx={4} fill="rgba(19,23,34,0.85)" stroke="#2a2e39" strokeWidth={0.5} />
        <text x={W - R - 204} y={priceTop + 17} fill={TXT_BRIGHT} fontSize={9} fontFamily="Trebuchet MS, sans-serif" fontWeight="600" opacity={0.7}>Indicators</text>
        {lastSma20 !== null && <text x={W - R - 204} y={priceTop + 30} fill={SMA20_CLR} fontSize={10} fontFamily="Trebuchet MS, sans-serif" fontWeight="600">SMA({smaP})</text>}
        {lastSma20 !== null && <text x={W - R - 130} y={priceTop + 30} fill={TXT_BRIGHT} fontSize={10} fontFamily="Trebuchet MS, sans-serif">{lastSma20.toFixed(2)}</text>}
        {lastSma50 !== null && <text x={W - R - 60} y={priceTop + 30} fill={SMA50_CLR} fontSize={10} fontFamily="Trebuchet MS, sans-serif" fontWeight="600">SMA({smaLongP})</text>}
        {lastSma50 !== null && <text x={W - R - 4} y={priceTop + 30} fill={TXT_BRIGHT} fontSize={10} fontFamily="Trebuchet MS, sans-serif" textAnchor="end">{lastSma50.toFixed(2)}</text>}
        {lastEma12 !== null && <text x={W - R - 204} y={priceTop + 44} fill={EMA12_CLR} fontSize={10} fontFamily="Trebuchet MS, sans-serif" fontWeight="600">EMA({emaP})</text>}
        {lastEma12 !== null && <text x={W - R - 130} y={priceTop + 44} fill={TXT_BRIGHT} fontSize={10} fontFamily="Trebuchet MS, sans-serif">{lastEma12.toFixed(2)}</text>}
        <text x={W - R - 60} y={priceTop + 44} fill={BB_CLR} fontSize={10} fontFamily="Trebuchet MS, sans-serif" fontWeight="600">BB({bbP})</text>

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
          {line(rsi.map(v => v !== null ? yR(v) : null), RSI_CLR, 1.5, 'rsi')}
        </g>
        {/* TV-style RSI label top-left */}
        <text x={L + 8} y={rsiTop + 14} fill={RSI_CLR} fontSize={10.5} fontFamily="Trebuchet MS, sans-serif" fontWeight="700">RSI ({rsiP})</text>
        {lastRsi !== null && (
          <text x={L + 78} y={rsiTop + 14} fill={lastRsi > 70 ? BEAR : lastRsi < 30 ? BULL : TXT_BRIGHT} fontSize={10.5} fontFamily="Trebuchet MS, sans-serif" fontWeight="600">{lastRsi.toFixed(2)}</text>
        )}

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
          {line(macdData.macd.map(v => v !== null ? yM(v) : null), MACD_CLR, 1.5, 'macd')}
          {line(macdData.signal.map(v => v !== null ? yM(v) : null), SIG_CLR, 1.2, 'sig')}
        </g>
        {/* TV-style MACD label top-left */}
        <text x={L + 8} y={macdTop + 14} fill={MACD_CLR} fontSize={10.5} fontFamily="Trebuchet MS, sans-serif" fontWeight="700">MACD ({macdFast},{macdSlow})</text>
        {lastMacd !== null && (
          <text x={L + 105} y={macdTop + 14} fill={TXT_BRIGHT} fontSize={10} fontFamily="Trebuchet MS, sans-serif">{lastMacd.toFixed(2)}</text>
        )}
        {lastSig !== null && (
          <text x={L + 168} y={macdTop + 14} fill={SIG_CLR} fontSize={10} fontFamily="Trebuchet MS, sans-serif">{lastSig.toFixed(2)}</text>
        )}

        {/* ═══════ X-AXIS DATE LABELS ═══════ */}
        {data.map((d, i) => {
          if (i % labelN !== 0) return null;
          return (
            <text key={"d" + i} x={xOf(i)} y={macdTop + macdH + 14} fill={TXT} fontSize={10} textAnchor="middle" fontFamily="Trebuchet MS, sans-serif">
              {d.date.substring(5)}
            </text>
          );
        })}
        {/* Debug: bar count — REMOVE AFTER FIX */}
        <text x={L + 8} y={macdTop + macdH + 14} fill="#ff0" fontSize={11} fontFamily="monospace" fontWeight="bold">{n} bars</text>
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
  const [timeframe, setTimeframe] = useState('6mo');

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
            <div className="rounded-lg overflow-hidden border border-[#2a2e39]" style={{ background: '#131722' }}>
              <div className="h-[500px]">
                <CandlestickChart data={analysis.candlestickData} />
              </div>
            </div>
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
