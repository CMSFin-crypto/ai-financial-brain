'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Search,
  Loader2,
  Building2,
  TrendingUp,
  TrendingDown,
  Shield,
  Award,
  Target,
  AlertTriangle,
  DollarSign,
  BarChart3,
  PieChart,
  HelpCircle,
  X,
} from 'lucide-react';
import { StockSearch } from './stock-search';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
} from 'recharts';

interface FundamentalAnalysisResult {
  ticker: string;
  company: string;
  sector: string;
  industry: string;
  overallRating: string;
  score: number;
  valuation: {
    marketCap: string;
    peRatio: number;
    forwardPE: number;
    pegRatio: number;
    priceToSales: number;
    priceToBook: number;
    evToEBITDA: number;
    dividendYield: string;
    rating: string;
    summary: string;
  };
  profitability: {
    grossMargin: string;
    operatingMargin: string;
    netMargin: string;
    returnOnEquity: string;
    returnOnAssets: string;
    returnOnInvestment: string;
    rating: string;
    summary: string;
  };
  growth: {
    revenueGrowth: string;
    earningsGrowth: string;
    revenueGrowth3Y: string;
    earningsGrowth3Y: string;
    quarterlyRevenueGrowth: string;
    quarterlyEarningsGrowth: string;
    rating: string;
    summary: string;
  };
  financialHealth: {
    currentRatio: number;
    quickRatio: number;
    debtToEquity: number;
    debtToAssets: number;
    freeCashFlow: string;
    rating: string;
    summary: string;
  };
  earnings: {
    eps: string;
    epsGrowth: string;
    forwardEps: string;
    nextEarningsDate: string;
    surprises: Array<{ quarter: string; expected: string; actual: string; surprise: string }>;
    rating: string;
    summary: string;
  };
  competitiveAdvantage: {
    moat: string;
    brandStrength: number;
    marketPosition: string;
    keyStrengths: string[];
    keyWeaknesses: string[];
  };
  analystConsensus: {
    rating: string;
    targetPrice: string;
    lowTarget: string;
    highTarget: string;
    buyRatings: number;
    holdRatings: number;
    sellRatings: number;
    averageRating: number;
  };
  summary: string;
  verdict: string;
  risks: string[];
}

function RatingBadge({ rating }: { rating: string }) {
  const colors: Record<string, string> = {
    STRONG_BUY: 'bg-emerald-600 text-white',
    BUY: 'bg-emerald-500 text-white',
    HOLD: 'bg-amber-500 text-white',
    SELL: 'bg-red-500 text-white',
    STRONG_SELL: 'bg-red-600 text-white',
    EXCELLENT: 'bg-emerald-500 text-white',
    GOOD: 'bg-emerald-400 text-white',
    AVERAGE: 'bg-amber-500 text-white',
    POOR: 'bg-red-500 text-white',
    STRONG: 'bg-emerald-500 text-white',
    MODERATE: 'bg-amber-500 text-white',
    WEAK: 'bg-red-500 text-white',
    UNDERVALUED: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    OVERVALUED: 'bg-red-500/10 text-red-500 border-red-500/30',
    FAIRLY_VALUED: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    WIDE: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/30',
    NARROW: 'bg-amber-500/10 text-amber-500 border-amber-500/30',
    NONE: 'bg-red-500/10 text-red-500 border-red-500/30',
  };

  return (
    <Badge variant="outline" className={`text-[10px] font-semibold ${colors[rating] || ''}`}>
      {rating.replace(/_/g, ' ')}
    </Badge>
  );
}

// ═══ Popup-et arsimore për secilin tregues ═══
type Assmnt = { level: 'good' | 'fair' | 'bad'; label: string };

interface MetricInfo {
  cka: string;   // Çfarë është
  si: string;    // Si duhet të jetë
  assess?: (v: number) => Assmnt | null;
}

// Parser i vlerave: numra, "44.1%", "$4.51T", "110.5B", "1,234.5"
function parseNum(v: string | number): number {
  if (typeof v === 'number') return v;
  if (!v) return NaN;
  const s = String(v).trim().replace(/[$,]/g, '');
  const m = s.match(/^(-?[\d.]+)\s*([TBMK])?/i);
  if (!m) return NaN;
  let n = parseFloat(m[1]);
  if (Number.isNaN(n)) return NaN;
  const suf = (m[2] || '').toUpperCase();
  if (suf === 'T') n *= 1e12;
  else if (suf === 'B') n *= 1e9;
  else if (suf === 'M') n *= 1e6;
  else if (suf === 'K') n *= 1e3;
  return n;
}

const NA = () => null;

const METRIC_INFO: Record<string, MetricInfo> = {
  // ── VLERËSIMI ──
  marketCap: {
    cka: 'Vlera totale e kompanisë në treg: çmimi i aksionit × numri i aksioneve në qarkullim.',
    si: 'Mega: mbi $1T (Apple, Nvidia) • Large: $100B–1T • Mid: $10–100B • Small: $2–10B • Micro: nën $2B. Kompanitë e mëdha janë më të qëndrueshme por rriten më ngadalë; Micro-t janë më volatile dhe të rrezikshme.',
    assess: v => Number.isNaN(v) ? null : v >= 1e12 ? { level: 'good', label: 'Mega cap — gigant' } : v >= 1e11 ? { level: 'good', label: 'Large cap — e qëndrueshme' } : v >= 1e10 ? { level: 'fair', label: 'Mid cap' } : v >= 2e9 ? { level: 'fair', label: 'Small cap' } : { level: 'bad', label: 'Micro cap — e rrezikshme' },
  },
  pe: {
    cka: 'Sa paguan tregu për çdo $1 fitim vjetor (Çmimi ÷ EPS). Metrika bazë e vlerësimit.',
    si: 'Nën 15 → potencialisht nënvlerësuar • 15–25 → e drejtë • Mbi 25 → e shtrenjtë. Varësisht sektorit: teknologjia toleron më lart, bankat më ulët. P/E negativ = kompania me humbje.',
    assess: v => Number.isNaN(v) ? null : v <= 0 ? { level: 'bad', label: 'Negativ — kompania me humbje' } : v < 15 ? { level: 'good', label: 'Nënvlerësuar' } : v <= 25 ? { level: 'fair', label: 'E drejtë' } : { level: 'bad', label: 'E shtrenjtë' },
  },
  fpe: {
    cka: 'P/E i llogaritur me fitimet e parashikuara të vitit të ardhshëm — vlerësimi i «ardhshëm» i tregut.',
    si: 'Nën 15 → lirë ndaj pritjeve • 15–25 → normale • Mbi 25 → premium. Nëse Forward P/E < P/E aktual, tregu pret përmirësim fitimesh.',
    assess: v => Number.isNaN(v) ? null : v <= 0 ? { level: 'bad', label: 'Humbje e pritur' } : v < 15 ? { level: 'good', label: 'Tërheqëse' } : v <= 25 ? { level: 'fair', label: 'Normale' } : { level: 'bad', label: 'Premium' },
  },
  peg: {
    cka: 'P/E i «korrigjuar» me rritjen: sa shpenzon për fitim në raport me ritmin e rritjes së fitimeve. Metrika më e përshtatshme për kompanitë në rritje.',
    si: 'Nën 1 → nënvlerësuar (rritja del «lirë») • 1–1.5 → e drejtë • Mbi 1.5 → e shtrenjtë. PEG i ulët me rritje të lartë = kombinimi ideal.',
    assess: v => Number.isNaN(v) || v <= 0 ? null : v < 1 ? { level: 'good', label: 'Nënvlerësuar' } : v <= 1.5 ? { level: 'fair', label: 'E drejtë' } : { level: 'bad', label: 'E shtrenjtë' },
  },
  ps: {
    cka: 'Çmimi në raport me të ardhurat për aksion. Përdoret kur kompania nuk ka fitim (startup, biotech).',
    si: 'Nën 2 → tërheqëse • 2–5 → normale • Mbi 5 → e shtrenjtë. Softueri/SAAS toleron më lart (marzhe të larta), detalit del më ulët.',
    assess: v => Number.isNaN(v) || v <= 0 ? null : v < 2 ? { level: 'good', label: 'Tërheqëse' } : v <= 5 ? { level: 'fair', label: 'Normale' } : { level: 'bad', label: 'E shtrenjtë' },
  },
  pb: {
    cka: 'Çmimi krahasuar me vlerën kontabile të kapitalit (Book Value). Më i dobishëm për bankat dhe kompanitë me aktive fizike.',
    si: 'Nën 1 → potencialisht nënvlerësuar • 1–3 → normale • Mbi 3 → premium. Kompanitë tech dalin natyrshëm më lart sepse aktivet kryesore janë intangjibile (patente, marka).',
    assess: v => Number.isNaN(v) || v <= 0 ? null : v < 1 ? { level: 'good', label: 'Potencialisht nënvlerësuar' } : v <= 3 ? { level: 'fair', label: 'Normale' } : { level: 'bad', label: 'Premium' },
  },
  evebitda: {
    cka: 'Enterprise Value (kapitalizimi + borxhi − kasa) ndaj fitimit operativ (EBITDA). Krahasimi më i paanshëm se P/E sepse merr parasysh borxhin.',
    si: 'Nën 8 → nënvlerësuar • 8–12 → e drejtë • Mbi 12 → e shtrenjtë. I preferuar në analiza M&A dhe për kompanitë me borxh të lartë.',
    assess: v => Number.isNaN(v) || v <= 0 ? null : v < 8 ? { level: 'good', label: 'Nënvlerësuar' } : v <= 12 ? { level: 'fair', label: 'E drejtë' } : { level: 'bad', label: 'E shtrenjtë' },
  },
  div: {
    cka: 'Dividenda vjetore si përqindje e çmimit — të ardhura «pasive» nga mbajtja e aksionit.',
    si: '2–4% → e shëndetshme dhe e qëndrueshme • Mbi 6% → kujdes, mund të jetë e pambajtshme • 0% → kompani rritjeje që reinveston profitin.',
    assess: v => Number.isNaN(v) ? null : v <= 0 ? { level: 'fair', label: 'Pa dividendë (ritje)' } : v < 2 ? { level: 'fair', label: 'E ulët' } : v <= 4 ? { level: 'good', label: 'E shëndetshme' } : v <= 6 ? { level: 'fair', label: 'Kontrollo qëndrueshmërinë' } : { level: 'bad', label: 'Rrezik prerjeje' },
  },
  // ── FITUESHMËRIA ──
  gross: {
    cka: 'Përqindja e të ardhurave që mbetet pas kostos direkte të prodhimit (COGS). Tregon fuqinë e çmimeve të kompanisë.',
    si: 'Mbi 50% → e shkëlqyer (softuer, luks) • 30–50% → e mirë • Nën 20% → e ulët (detalit, energjia). Krahaso gjithmonë brenda sektorit!',
    assess: v => Number.isNaN(v) ? null : v >= 50 ? { level: 'good', label: 'E shkëlqyer' } : v >= 30 ? { level: 'fair', label: 'E mirë' } : { level: 'bad', label: 'E ulët' },
  },
  op: {
    cka: 'Fitimi operativ / të ardhurat — efikasiteti i biznesit kryesor, pa taksa dhe kosto financiare.',
    si: 'Mbi 20% → e shkëlqyer • 10–20% → e mirë • Nën 10% → e dobët. Trendi i marzhit në kohë është më i rëndësishëm se niveli aktual.',
    assess: v => Number.isNaN(v) ? null : v >= 20 ? { level: 'good', label: 'E shkëlqyer' } : v >= 10 ? { level: 'fair', label: 'E mirë' } : { level: 'bad', label: 'E dobët' },
  },
  net: {
    cka: 'Fitimi neto / të ardhura — çfarë mbetet për aksionarët nga çdo $1 shitjesh, pas të gjitha kostove.',
    si: 'Mbi 15% → e shkëlqyer • 5–15% → e mirë • Nën 5% → e hollë. Negativ = kompania me humbje.',
    assess: v => Number.isNaN(v) ? null : v < 0 ? { level: 'bad', label: 'Humbje' } : v >= 15 ? { level: 'good', label: 'E shkëlqyer' } : v >= 5 ? { level: 'fair', label: 'E mirë' } : { level: 'bad', label: 'E hollë' },
  },
  roe: {
    cka: 'Fitimi i gjeneruar nga kapitali i aksionarëve — metrika e preferuar e Warren Buffett-it për cilësinë e biznesit.',
    si: 'Mbi 20% → e shkëlqyer • 12–20% → e mirë • Nën 12% → e dobët. Kujdes: ROE shumë i lartë (mbi 100%) zakonisht vjen nga borxhi i madh ose blerjet e aksioneve të vetë (buybacks) që zvogëlojnë kapitalin.',
    assess: v => Number.isNaN(v) ? null : v < 0 ? { level: 'bad', label: 'Negativ' } : v >= 150 ? { level: 'fair', label: 'Shumë i lartë — kontrollo borxhin/buybacks' } : v >= 20 ? { level: 'good', label: 'E shkëlqyer' } : v >= 12 ? { level: 'fair', label: 'E mirë' } : { level: 'bad', label: 'E dobët' },
  },
  roa: {
    cka: 'Fitimi ndaj totalit të aktiviteteve — sa efikashtë punon gjithçka që zotëron kompania.',
    si: 'Mbi 10% → e shkëlqyer • 5–10% → e mirë • Nën 5% → e dobët. ROA i lartë me aktive të lehta = model biznesi superior.',
    assess: v => Number.isNaN(v) ? null : v < 0 ? { level: 'bad', label: 'Negativ' } : v >= 10 ? { level: 'good', label: 'E shkëlqyer' } : v >= 5 ? { level: 'fair', label: 'E mirë' } : { level: 'bad', label: 'E dobët' },
  },
  roi: {
    cka: 'Kthimi mbi kapitalin e investuar — përfitimet që sjellin investimet e bëra në biznes.',
    si: 'Mbi 15% → i mirë • 8–15% → mesatar • Nën 8% → kthime të dobëta (më mirë obligacione pa rrezik).',
    assess: v => Number.isNaN(v) ? null : v < 0 ? { level: 'bad', label: 'Negativ' } : v >= 15 ? { level: 'good', label: 'I mirë' } : v >= 8 ? { level: 'fair', label: 'Mesatar' } : { level: 'bad', label: 'I dobët' },
  },
  // ── RRITJA ──
  revG: {
    cka: 'Rritja e të ardhurave vit pas viti (YoY) — shëndeti i kërkesës për produktet dhe shërbimet.',
    si: 'Mbi 20% → e fortë • 10–20% → e mirë • 0–10% → mesatare • Negativ → kontrakim. Rritja e ardhurave zakonisht paraprin rritjen e fitimeve.',
    assess: v => Number.isNaN(v) ? null : v < 0 ? { level: 'bad', label: 'Duke kontraktuar' } : v >= 20 ? { level: 'good', label: 'E fortë' } : v >= 10 ? { level: 'fair', label: 'E mirë' } : { level: 'fair', label: 'Mesatare' },
  },
  epsG: {
    cka: 'Rritja e fitimeve vit pas viti — rritja që mbetet realisht për aksionarët.',
    si: 'Mbi 15% → e fortë • 5–15% → e mirë • 0–5% → e ngadaltë • Negativ → fitimet po bien. Fitimet duhet të rriten në ritmin e të ardhurave.',
    assess: v => Number.isNaN(v) ? null : v < 0 ? { level: 'bad', label: 'Fitimet po bien' } : v >= 15 ? { level: 'good', label: 'E fortë' } : v >= 5 ? { level: 'fair', label: 'E mirë' } : { level: 'fair', label: 'E ngadaltë' },
  },
  revG3: {
    cka: 'Rritja mesatare vjetore e të ardhurave gjatë 3 viteve të fundit — qëndrueshmëria e rritjes.',
    si: 'Mbi 15% → e qëndrueshme • 5–15% → e moderuar • Nën 5% → ngadalësim. Kur rritja 3-vjeçare > rritja vjetore, ritmi po përshpejtohet.',
    assess: v => Number.isNaN(v) ? null : v < 0 ? { level: 'bad', label: 'Në rënie' } : v >= 15 ? { level: 'good', label: 'E qëndrueshme' } : v >= 5 ? { level: 'fair', label: 'E moderuar' } : { level: 'bad', label: 'E dobët' },
  },
  epsG3: {
    cka: 'Rritja mesatare vjetore e fitimeve në 3 vitet e fundit — qëndrueshmëria e profitit.',
    si: 'Mbi 15% → e qëndrueshme • 5–15% → e moderuar • Nën 5% → e dobët. Fitimet duhen në ritmin e të ardhurave, ndryshe marzhet po erodojnë.',
    assess: v => Number.isNaN(v) ? null : v < 0 ? { level: 'bad', label: 'Fitimet në rënie' } : v >= 15 ? { level: 'good', label: 'E qëndrueshme' } : v >= 5 ? { level: 'fair', label: 'E moderuar' } : { level: 'bad', label: 'E dobët' },
  },
  qRev: {
    cka: 'Rritja e të ardhurave në tremujorin e fundit — momenti më i freskët i biznesit.',
    si: 'Mbi 15% → moment i fortë • 5–15% → mesatar • Nën 5% → ngadalësim. Krahaso me rritjen vjetore: kuartali më i lartë = përshpejtim, më i ulët = humbje momenti.',
    assess: v => Number.isNaN(v) ? null : v < 0 ? { level: 'bad', label: 'Duke rënë' } : v >= 15 ? { level: 'good', label: 'Moment i fortë' } : v >= 5 ? { level: 'fair', label: 'Mesatar' } : { level: 'fair', label: 'Ngadalësim' },
  },
  qEps: {
    cka: 'Rritja e fitimeve në tremujorin e fundit — momenti fitimor më i freskët.',
    si: 'Mbi 15% → moment i fortë • 5–15% → mesatar • Nën 5% → ngadalësim. Nëse kuartori përshpejtohet ndaj të ardhurave, marzhet po zgjerohen.',
    assess: v => Number.isNaN(v) ? null : v < 0 ? { level: 'bad', label: 'Duke rënë' } : v >= 15 ? { level: 'good', label: 'Moment i fortë' } : v >= 5 ? { level: 'fair', label: 'Mesatar' } : { level: 'fair', label: 'Ngadalësim' },
  },
  // ── SHËNDETI FINANCIAR ──
  curR: {
    cka: 'Aktivet afatshkurtra ndaj detyrimeve afatshkurtra — a mund të paguajë kompania faturat e vitit në vijim?',
    si: 'Mbi 2 → i sigurt • 1.5–2 → i mirë • 1–1.5 → i ngushtë • Nën 1 → rrezik likuiditeti. Mbi 3 mund të tregojë kasa e përdorur dobët.',
    assess: v => Number.isNaN(v) ? null : v < 1 ? { level: 'bad', label: 'Rrezik likuiditeti' } : v >= 2 ? { level: 'good', label: 'I sigurt' } : v >= 1.5 ? { level: 'fair', label: 'I mirë' } : { level: 'fair', label: 'I ngushtë' },
  },
  quickR: {
    cka: 'Si Current Ratio, por pa stoqet (inventari shitet vështirë me vlerë të plotë) — testi më i ashpër i likuiditetit.',
    si: 'Mbi 1 → i mirë • 0.7–1 → në kufi • Nën 0.7 → i dobët. Nën 1 nuk është fatal për biznese me rrotullim të shpejtë kase (retail, restorante).',
    assess: v => Number.isNaN(v) ? null : v < 0.7 ? { level: 'bad', label: 'I dobët' } : v >= 1 ? { level: 'good', label: 'I mirë' } : { level: 'fair', label: 'Në kufi' },
  },
  de: {
    cka: 'Borxhi total ndaj kapitalit të aksionarëve — sa i «leverage-uar» është bilanci i kompanisë.',
    si: 'Nën 0.5 → konservativ • 0.5–1 → normal • 1–2 → i moderuar • Mbi 2 → borxh i lartë. Bankat dhe utility-t kanë natyrshëm më lart. Interesi i borxhit ha fitimet kur normat rriten.',
    assess: v => Number.isNaN(v) || v < 0 ? null : v < 0.5 ? { level: 'good', label: 'Konservativ' } : v <= 1 ? { level: 'fair', label: 'Normal' } : v <= 2 ? { level: 'fair', label: 'I moderuar' } : { level: 'bad', label: 'Borxh i lartë' },
  },
  da: {
    cka: 'Përqindja e aktiviteteve të financuara me borxh (Total Debt ÷ Total Assets).',
    si: 'Nën 0.4 → i shëndetshëm • 0.4–0.6 → i moderuar • Mbi 0.6 → i rrezikshëm — në recesion rrezikon falimentin.',
    assess: v => Number.isNaN(v) ? null : v < 0.4 ? { level: 'good', label: 'I shëndetshëm' } : v <= 0.6 ? { level: 'fair', label: 'I moderuar' } : { level: 'bad', label: 'I rrezikshëm' },
  },
  fcf: {
    cka: 'Kasa e gjeneruar nga operacionet minus investimet kapitale (capex) — paratë «reale» që mbeten në dorë.',
    si: 'Pozitive dhe në rritje = zemra e një aksioni të mirë. FCF > Fitimi neto = cilësi e lartë e fitimit. Negativ për vite me rradhë = djegje kase.',
    assess: v => Number.isNaN(v) ? null : v > 0 ? { level: 'good', label: 'Po gjeneron kasa' } : { level: 'bad', label: 'Djeg kasa' },
  },
  // ── FITIMI (EPS) ──
  eps: {
    cka: 'Fitimi neto për aksion — baza e të gjithë vlerësimeve (P/E, PEG, etj).',
    si: 'Pozitiv dhe në rritje → i shëndetshëm; negativ → humbje. Trendi ka më shumë rëndësi se niveli: kontrollo EPS Growth dhe Forward EPS.',
    assess: v => Number.isNaN(v) ? null : v > 0 ? { level: 'good', label: 'Pozitiv' } : { level: 'bad', label: 'Humbje' },
  },
  feps: {
    cka: 'Fitimi për aksion i parashikuar për vitin e ardhshëm (konsensusi i analistëve).',
    si: 'Nëse Forward EPS > EPS aktual → tregu pret rritje fitimesh; diferencën në % e quajnë rritje e pritur. Parashikimet bien shpejt në recesione.',
    assess: NA,
  },
  nextDate: {
    cka: 'Data e raportimit të ardhshëm të fitimeve (earnings) — katalizatori më i rregullt i lëvizjes së çmimit.',
    si: 'Java para raportimit ka volatilitet më të lartë. Beat (+) zakonisht ngrit çmimin, Miss (−) e ul. Blerja para fitimeve është bast statistikor, jo strategji.',
    assess: NA,
  },
  target: {
    cka: 'Vlerësimi i mesatar i bankave investuese që ndjekin aksionin: Blej (pritet rritje), Mbaj (neutral), Shit (pritet rënie).',
    si: 'Shumica «Blej» → optimizëm institucional • Target Price = çmimi mesatar i pritur. Nëse Target > Çmimi aktual → potencial sipas analistëve. Analistët gabojnë shpesh — përdori si reference, jo garanci.',
    assess: NA,
  },
  moat: {
    cka: '«Hendeku mbrojtës» — avantazhi strukturor që i bën konkurrentët të paaftë t\'i marrin tregun. WIDE = mbrojtje e fortë (monopol praktik), NARROW = e kufizuar, NONE = pa mbrojtje.',
    si: 'Burimet e moat: ekonomia e shkallës, efekti i rrjetit (Apple, Visa), kostoja e ndërrimit (Microsoft), marka (Coca-Cola), patentat/licencat. BrandStrength 0–10: mbi 8 = markë legjendare.',
    assess: NA,
  },
  radar: {
    cka: 'Profili i përgjithshëm i kompanisë në 6 dimensione (0–100): Vlerësimi, Fitueshmëria, Rritja, Shëndeti, Fitimi dhe Moat — syri i shpejtë i investitorit.',
    si: 'Forma e rregullt dhe e mbushur = kompani e ekuilibruar. Boshllëqe të thella në një bosht = dobësi konkrete (p.sh. Rritja e ulët te kompani e shtrenjtë). Krahaso formën mes kompanive të të njëjtit sektor.',
    assess: NA,
  },
};

// Butoni «?» që hap popup-in arsimor për një tregues
function InfoButton({ title, info, value }: { title: string; info: MetricInfo; value?: string | number }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ left: 0, top: 0 });
  const iconRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (iconRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener('mousedown', onDown);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  const toggle = () => {
    if (!open && iconRef.current) {
      const r = iconRef.current.getBoundingClientRect();
      const W = 300;
      const estH = 300;
      let left = r.right + 8;
      if (left + W > window.innerWidth - 8) left = Math.max(8, r.left - W - 8);
      let top = r.bottom + 6;
      if (top + estH > window.innerHeight - 8) top = Math.max(8, r.top - estH - 6);
      setPos({ left, top });
    }
    setOpen(!open);
  };

  const ass = info.assess && value !== undefined && value !== null && String(value).trim() !== ''
    ? info.assess(parseNum(value))
    : null;
  const assStyle = ass?.level === 'good'
    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
    : ass?.level === 'fair'
      ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
      : 'bg-red-500/10 text-red-400 border-red-500/30';

  return (
    <>
      <button
        ref={iconRef}
        onClick={toggle}
        title="Çfarë është kjo metrikë?"
        aria-label={`Shpjegim për ${title}`}
        className="text-[#787b86] hover:text-emerald-400 transition-colors flex-shrink-0 inline-flex"
      >
        <HelpCircle className="w-3 h-3" />
      </button>
      {open && createPortal(
        <div
          ref={popRef}
          style={{ left: pos.left, top: pos.top }}
          className="fixed z-[100] w-[300px] rounded-lg border border-[#2a2e39] bg-[#1e222d] shadow-2xl p-3"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-xs font-bold text-white truncate">{title}</p>
            <button onClick={() => setOpen(false)} className="text-[#787b86] hover:text-white flex-shrink-0" aria-label="Mbyll">
              <X className="w-3 h-3" />
            </button>
          </div>
          <p className="text-[9px] font-bold text-emerald-400 uppercase tracking-wide mb-1">Çfarë është</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">{info.cka}</p>
          <p className="text-[9px] font-bold text-amber-400 uppercase tracking-wide mb-1">Si duhet të jetë</p>
          <p className="text-[10px] text-muted-foreground leading-relaxed mb-2">{info.si}</p>
          {ass && (
            <div className={`rounded-md border px-2 py-1.5 flex items-center gap-2 flex-wrap ${assStyle}`}>
              <span className="text-[10px] text-muted-foreground">Vlera aktuale:</span>
              <span className="text-[10px] font-bold text-white">{String(value)}</span>
              <span className="text-[10px] font-semibold ml-auto">● {ass.label}</span>
            </div>
          )}
        </div>,
        document.body
      )}
    </>
  );
}

function MetricRow({ label, value, info }: { label: string; value: string | number; info?: MetricInfo }) {
  return (
    <div className="flex justify-between items-center py-1 gap-1">
      <span className="text-[11px] text-muted-foreground flex items-center gap-1 min-w-0">
        <span className="truncate">{label}</span>
        {info && <InfoButton title={label} info={info} value={value} />}
      </span>
      <span className="text-[11px] font-semibold whitespace-nowrap">{value}</span>
    </div>
  );
}

export function FundamentalAnalysis() {
  const [ticker, setTicker] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [analysis, setAnalysis] = useState<FundamentalAnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runAnalysisForTicker = async (tickerSymbol?: string) => {
    const sym = (tickerSymbol || ticker).trim().toUpperCase();
    if (!sym) return;
    setTicker(sym);
    setIsLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch('/api/fundamental-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker: sym }),
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

  // Radar chart data
  const getRadarData = () => {
    if (!analysis) return [];
    return [
      { subject: 'Vlerësimi', value: analysis.valuation.rating === 'UNDERVALUED' ? 85 : analysis.valuation.rating === 'FAIRLY_VALUED' ? 60 : 30 },
      { subject: 'Fitueshmëria', value: analysis.profitability.rating === 'EXCELLENT' ? 90 : analysis.profitability.rating === 'GOOD' ? 70 : 40 },
      { subject: 'Rritja', value: analysis.growth.rating === 'STRONG' ? 85 : analysis.growth.rating === 'MODERATE' ? 60 : 35 },
      { subject: 'Shëndeti', value: analysis.financialHealth.rating === 'STRONG' ? 85 : analysis.financialHealth.rating === 'MODERATE' ? 60 : 30 },
      { subject: 'Fitimi', value: analysis.earnings.rating === 'STRONG' ? 80 : analysis.earnings.rating === 'MODERATE' ? 60 : 35 },
      { subject: 'Moat', value: analysis.competitiveAdvantage.brandStrength * 10 },
    ];
  };

  return (
    <div className="space-y-4">
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
          {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Building2 className="w-4 h-4 mr-1.5" />}
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
          <Skeleton className="h-[100px] rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Skeleton className="h-[250px] rounded-xl" />
            <Skeleton className="h-[250px] rounded-xl" />
          </div>
        </div>
      )}

      {/* Results */}
      {analysis && !isLoading && (
        <div className="space-y-4">
          {/* Header */}
          <Card className="border-border/50 bg-card/50">
            <CardContent className="pt-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-2xl font-bold">{analysis.ticker}</h3>
                    <RatingBadge rating={analysis.overallRating} />
                  </div>
                  <p className="text-sm text-muted-foreground">{analysis.company}</p>
                  <p className="text-xs text-muted-foreground">{analysis.sector} • {analysis.industry}</p>
                </div>
                <div className="text-center sm:text-right">
                  <p className="text-xs text-muted-foreground">Score Total</p>
                  <p className="text-3xl font-bold">{analysis.score}<span className="text-lg text-muted-foreground">/100</span></p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <Card className="border-emerald-500/20 bg-emerald-500/5">
            <CardContent className="pt-5">
              <p className="text-sm leading-relaxed text-muted-foreground">{analysis.summary}</p>
              <p className="text-sm leading-relaxed mt-2 font-medium">{analysis.verdict}</p>
            </CardContent>
          </Card>

          {/* Radar + Analyst Consensus */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <PieChart className="w-4 h-4 text-emerald-500" />
                  Score Radari
                  <InfoButton title="Score Radari" info={METRIC_INFO.radar} />
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[220px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={getRadarData()}>
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="subject" tick={{ fontSize: 10 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={{ fontSize: 8 }} />
                      <Radar
                        name="Score"
                        dataKey="value"
                        stroke="#21c55e"
                        fill="#21c55e"
                        fillOpacity={0.2}
                        strokeWidth={2}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {analysis.analystConsensus && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Target className="w-4 h-4 text-amber-500" />
                    Konsensusi i Analistëve
                    <InfoButton title="Konsensusi i Analistëve" info={METRIC_INFO.target} />
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <RatingBadge rating={analysis.analystConsensus.rating} />
                    <span className="text-lg font-bold">${analysis.analystConsensus.targetPrice}</span>
                  </div>
                  <div className="flex gap-2 text-xs">
                    <span className="bg-muted/50 px-2 py-1 rounded">Low: ${analysis.analystConsensus.lowTarget}</span>
                    <span className="bg-muted/50 px-2 py-1 rounded">High: ${analysis.analystConsensus.highTarget}</span>
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-sm bg-emerald-500" />
                      <span className="flex-1">Blej: {analysis.analystConsensus.buyRatings}</span>
                      <Progress value={(analysis.analystConsensus.buyRatings / (analysis.analystConsensus.buyRatings + analysis.analystConsensus.holdRatings + analysis.analystConsensus.sellRatings)) * 100} className="flex-1 h-1.5 [&>div]:bg-emerald-500" />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-sm bg-amber-500" />
                      <span className="flex-1">Mbaj: {analysis.analystConsensus.holdRatings}</span>
                      <Progress value={(analysis.analystConsensus.holdRatings / (analysis.analystConsensus.buyRatings + analysis.analystConsensus.holdRatings + analysis.analystConsensus.sellRatings)) * 100} className="flex-1 h-1.5 [&>div]:bg-amber-500" />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-3 h-3 rounded-sm bg-red-500" />
                      <span className="flex-1">Shit: {analysis.analystConsensus.sellRatings}</span>
                      <Progress value={(analysis.analystConsensus.sellRatings / (analysis.analystConsensus.buyRatings + analysis.analystConsensus.holdRatings + analysis.analystConsensus.sellRatings)) * 100} className="flex-1 h-1.5 [&>div]:bg-red-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Valuation */}
          {analysis.valuation && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  Vlerësimi
                  <div className="ml-auto">
                    <RatingBadge rating={analysis.valuation.rating} />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <MetricRow label="Market Cap" value={analysis.valuation.marketCap} info={METRIC_INFO.marketCap} />
                  <MetricRow label="P/E Ratio" value={analysis.valuation.peRatio} info={METRIC_INFO.pe} />
                  <MetricRow label="Forward P/E" value={analysis.valuation.forwardPE} info={METRIC_INFO.fpe} />
                  <MetricRow label="PEG Ratio" value={analysis.valuation.pegRatio} info={METRIC_INFO.peg} />
                  <MetricRow label="P/S Ratio" value={analysis.valuation.priceToSales} info={METRIC_INFO.ps} />
                  <MetricRow label="P/B Ratio" value={analysis.valuation.priceToBook} info={METRIC_INFO.pb} />
                  <MetricRow label="EV/EBITDA" value={analysis.valuation.evToEBITDA} info={METRIC_INFO.evebitda} />
                  <MetricRow label="Dividend Yield" value={analysis.valuation.dividendYield} info={METRIC_INFO.div} />
                </div>
                <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{analysis.valuation.summary}</p>
              </CardContent>
            </Card>
          )}

          {/* Profitability + Growth + Financial Health + Earnings */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Profitability */}
            {analysis.profitability && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    Fitueshmëria
                    <div className="ml-auto">
                      <RatingBadge rating={analysis.profitability.rating} />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="Gross Margin" value={analysis.profitability.grossMargin} info={METRIC_INFO.gross} />
                  <MetricRow label="Operating Margin" value={analysis.profitability.operatingMargin} info={METRIC_INFO.op} />
                  <MetricRow label="Net Margin" value={analysis.profitability.netMargin} info={METRIC_INFO.net} />
                  <MetricRow label="ROE" value={analysis.profitability.returnOnEquity} info={METRIC_INFO.roe} />
                  <MetricRow label="ROA" value={analysis.profitability.returnOnAssets} info={METRIC_INFO.roa} />
                  <MetricRow label="ROI" value={analysis.profitability.returnOnInvestment} info={METRIC_INFO.roi} />
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{analysis.profitability.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Growth */}
            {analysis.growth && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <BarChart3 className="w-4 h-4 text-amber-500" />
                    Rritja
                    <div className="ml-auto">
                      <RatingBadge rating={analysis.growth.rating} />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="Rritja e të Ardhurave" value={analysis.growth.revenueGrowth} info={METRIC_INFO.revG} />
                  <MetricRow label="Rritja e Fitimeve" value={analysis.growth.earningsGrowth} info={METRIC_INFO.epsG} />
                  <MetricRow label="Rritja 3-vjeçare (Ardhura)" value={analysis.growth.revenueGrowth3Y} info={METRIC_INFO.revG3} />
                  <MetricRow label="Rritja 3-vjeçare (Fitime)" value={analysis.growth.earningsGrowth3Y} info={METRIC_INFO.epsG3} />
                  <MetricRow label="Kuartali Ardhura" value={analysis.growth.quarterlyRevenueGrowth} info={METRIC_INFO.qRev} />
                  <MetricRow label="Kuartali Fitime" value={analysis.growth.quarterlyEarningsGrowth} info={METRIC_INFO.qEps} />
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{analysis.growth.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Financial Health */}
            {analysis.financialHealth && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Shield className="w-4 h-4 text-teal-500" />
                    Shëndeti Financiar
                    <div className="ml-auto">
                      <RatingBadge rating={analysis.financialHealth.rating} />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="Current Ratio" value={analysis.financialHealth.currentRatio} info={METRIC_INFO.curR} />
                  <MetricRow label="Quick Ratio" value={analysis.financialHealth.quickRatio} info={METRIC_INFO.quickR} />
                  <MetricRow label="Debt/Equity" value={analysis.financialHealth.debtToEquity} info={METRIC_INFO.de} />
                  <MetricRow label="Debt/Assets" value={analysis.financialHealth.debtToAssets} info={METRIC_INFO.da} />
                  <MetricRow label="Free Cash Flow" value={analysis.financialHealth.freeCashFlow} info={METRIC_INFO.fcf} />
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{analysis.financialHealth.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Earnings */}
            {analysis.earnings && (
              <Card className="border-border/50 bg-card/50">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    Fitimi (EPS)
                    <div className="ml-auto">
                      <RatingBadge rating={analysis.earnings.rating} />
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <MetricRow label="EPS" value={analysis.earnings.eps} info={METRIC_INFO.eps} />
                  <MetricRow label="EPS Rritja" value={analysis.earnings.epsGrowth} info={METRIC_INFO.epsG} />
                  <MetricRow label="Forward EPS" value={analysis.earnings.forwardEps} info={METRIC_INFO.feps} />
                  <MetricRow label="Fitimi i Ardhshëm" value={analysis.earnings.nextEarningsDate} info={METRIC_INFO.nextDate} />
                  {analysis.earnings.surprises && analysis.earnings.surprises.length > 0 && (
                    <div className="mt-2 space-y-1">
                      <p className="text-[10px] font-medium text-muted-foreground">Surprizat e fundit:</p>
                      {analysis.earnings.surprises.map((s, i) => (
                        <div key={i} className="text-[10px] flex justify-between bg-muted/30 rounded px-2 py-1">
                          <span>{s.quarter}</span>
                          <span className={s.surprise.startsWith('+') ? 'text-emerald-500' : 'text-red-500'}>
                            {s.surprise}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{analysis.earnings.summary}</p>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Competitive Advantage */}
          {analysis.competitiveAdvantage && (
            <Card className="border-border/50 bg-card/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Shield className="w-4 h-4 text-emerald-500" />
                  Avantazhi Konkurrues (Moat)
                  <InfoButton title="Avantazhi Konkurrues (Moat)" info={METRIC_INFO.moat} />
                  <div className="ml-auto">
                    <RatingBadge rating={analysis.competitiveAdvantage.moat} />
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">{analysis.competitiveAdvantage.marketPosition}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs font-medium text-emerald-500 mb-1">Pikë të Forta</p>
                    <ul className="space-y-1">
                      {analysis.competitiveAdvantage.keyStrengths.map((s, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <span className="w-1 h-1 bg-emerald-500 rounded-full" />
                          {s}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-red-500 mb-1">Pikë të Dobëta</p>
                    <ul className="space-y-1">
                      {analysis.competitiveAdvantage.keyWeaknesses.map((w, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <span className="w-1 h-1 bg-red-500 rounded-full" />
                          {w}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Risks */}
          {analysis.risks && analysis.risks.length > 0 && (
            <Card className="border-red-500/20 bg-red-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-red-500" />
                  Risket Kryesore
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {analysis.risks.map((risk, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                      <span className="leading-relaxed">{risk}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
