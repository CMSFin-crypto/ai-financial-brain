'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Target,
  BarChart3,
  DollarSign,
  Clock,
  Layers,
  Zap,
  ArrowRight,
  Calculator,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useState } from 'react';

// ── Data ──
const STRATEGY_RULES = [
  {
    element: 'Universe',
    icon: Layers,
    rule: 'Large-cap ose ETF likuide: NVDA, AMD, MSFT, AAPL, AMZN, META, GOOGL, ETF si QQQ/SPY/SMH',
    color: 'text-blue-400',
  },
  {
    element: 'Regjimi',
    icon: Shield,
    rule: 'Long vetem kur SPY dhe QQQ jane mesataren 50-ditore dhe 200-ditore',
    color: 'text-emerald-400',
  },
  {
    element: 'Trend',
    icon: TrendingUp,
    rule: 'Aksioni mbi 50 SMA dhe 200 SMA; 50 SMA mbi 200 SMA',
    color: 'text-emerald-400',
  },
  {
    element: 'Relative Strength',
    icon: BarChart3,
    rule: 'Aksioni duhet te jete me i forte se SPY/QQQ ne 1-3 muaj',
    color: 'text-blue-400',
  },
  {
    element: 'Setup Hyrjeje',
    icon: Target,
    rule: 'Pullback 3-8 dite drejt 10/20 EMA ose breakout mbi rezistencen',
    color: 'text-amber-400',
  },
  {
    element: 'Konfirmimi',
    icon: CheckCircle2,
    rule: 'Volum mbi mesataren ne diten e kthimit/breakout; RSI aferesisht 45-65, jo ekstrem',
    color: 'text-emerald-400',
  },
  {
    element: 'Risku',
    icon: AlertTriangle,
    rule: 'Maksimum 0.5-1% e llogarise ne nje trade',
    color: 'text-red-400',
  },
  {
    element: 'Dalja',
    icon: Zap,
    rule: 'Stop nen swing-low/1-1.5 ATR; target fillestar te pakten 2R',
    color: 'text-amber-400',
  },
];

const ENTRY_RULES = [
  'Tregu i pergjithshem eshte bullish; mos detyro long trades kur indekset jane ne trend te dobet.',
  'Kompania ka raport te mirë earnings, rritje te te ardhurave/fitimit ose katalizator te qarte.',
  'Cmimi eshte mbi 50 SMA dhe 200 SMA.',
  'Ka bere pullback te kontrolluar me volum me te ulet, pastaj jep candle rikthimi me volum.',
  'Entry vendose mbi high-in e candle-it te konfirmimit, zakonisht me buy stop-limit ose limit ne pullback; mos e ndiq cmimin pas nje qiriu shume te zgjeruar.',
];

const DONT_RULES = [
  'Mos bej day trading te rastessishem vetem sepse IBKR e ben execution-in te lehte.',
  'Mos hy para earnings nese nuk je duke tregtuar qellimisht event risk; gap-i mund ta kaloje stop-in.',
  'Mos ble aksione qe jane 10-15% mbi 10/20 EMA pas nje rally te shpejte.',
  'Mos perdor leverage/margin derisa strategjia te jete e testuar me journal, paper trading dhe pozicione te vogla live.',
  'Mos u mbeshtet vetem te RSI ose MACD; keta jane filtra, jo edge i mjaftueshem me vete.',
];

const SYSTEM_GATES = [
  { gate: 'Market Regime', desc: 'SPY/QQQ mbi 50 dhe 200 SMA', icon: Shield },
  { gate: 'Sector Confirmation', desc: 'Sektori perkates (p.sh. SMH per NVDA/AMD) duhet te jete i forte', icon: Layers },
  { gate: 'Stock Trend + RS', desc: 'Mbi 50/200 SMA dhe outperform ndaj SPY', icon: TrendingUp },
  { gate: 'Pullback Quality', desc: 'ATR, volum, distance nga EMA dhe strukture support/resistance', icon: BarChart3 },
  { gate: 'Event-Risk Gate', desc: 'Earnings, CPI, FOMC, jobs report', icon: AlertTriangle },
  { gate: 'Position Sizing', desc: 'IBKR bracket order automatik', icon: DollarSign },
  { gate: 'Auto-Pause', desc: 'Nese slippage, drawdown ose performanca out-of-sample degradojne', icon: Clock },
];

// ── Section wrapper ──
function Section({ title, icon: Icon, children, color = 'text-emerald-400' }: {
  title: string; icon: any; children: React.ReactNode; color?: string;
}) {
  const [open, setOpen] = useState(true);
  return (
    <Card className="border-border/50 bg-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/5 transition-colors rounded-t-lg"
      >
        <Icon className={`w-5 h-5 ${color} flex-shrink-0`} />
        <span className="font-semibold text-[15px] text-foreground flex-1">{title}</span>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <CardContent className="pt-0 pb-4 px-4">{children}</CardContent>}
    </Card>
  );
}

// ── Main Component ──
export function IBKRStrategy() {
  return (
    <div className="space-y-4">
      {/* Strategy Overview */}
      <Card className="border-emerald-500/20 bg-emerald-500/5">
        <CardContent className="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="bg-emerald-500/15 rounded-lg p-2.5">
              <TrendingUp className="w-6 h-6 text-emerald-400" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-foreground">Strategjia: Trend Pullback Swing</h2>
              <p className="text-[13px] text-muted-foreground">Syno trade 5-20 ditore, jo day trading te vazhdueshme</p>
            </div>
          </div>
          <p className="text-[14px] text-muted-foreground leading-relaxed">
            Per ty, strategjia me e mire ne IBKR eshte <strong className="text-foreground">swing trading i rregulluar nga trendi</strong>, duke kombinuar
            <Badge variant="outline" className="mx-1 text-[12px] border-blue-500/30 text-blue-400 bg-blue-500/10">fundamentet</Badge> +
            <Badge variant="outline" className="mx-1 text-[12px] border-violet-500/30 text-violet-400 bg-violet-500/10">momentum/relative strength</Badge> +
            <Badge variant="outline" className="mx-1 text-[12px] border-red-500/30 text-red-400 bg-red-500/10">risk management strikt</Badge>.
            Kjo i pershtatet mire aksioneve likuide amerikane dhe mund te zbatohet paster me bracket orders ne IBKR.
          </p>
        </CardContent>
      </Card>

      {/* Rules Table */}
      <Section title="Tabela e Rregullave" icon={Calculator} color="text-blue-400">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-border/50">
                <th className="pb-2 text-[13px] font-semibold text-muted-foreground w-44">Elementi</th>
                <th className="pb-2 text-[13px] font-semibold text-muted-foreground">Rregulli Praktik</th>
              </tr>
            </thead>
            <tbody>
              {STRATEGY_RULES.map((r, i) => (
                <tr key={i} className="border-b border-border/30 last:border-0">
                  <td className="py-3 pr-4">
                    <div className="flex items-center gap-2">
                      <r.icon className={`w-4 h-4 ${r.color} flex-shrink-0`} />
                      <span className="font-semibold text-[13px] text-foreground">{r.element}</span>
                    </div>
                  </td>
                  <td className="py-3 text-[13px] text-muted-foreground leading-relaxed">{r.rule}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      {/* Entry Rules */}
      <Section title="Rregullat e Hyrjes" icon={Target} color="text-emerald-400">
        <p className="text-[13px] text-muted-foreground mb-3">Hyn vetem kur plotesohen keto kushte:</p>
        <ul className="space-y-2.5">
          {ENTRY_RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">{rule}</span>
            </li>
          ))}
        </ul>
        <div className="mt-4 rounded-lg bg-blue-500/5 border border-blue-500/15 p-4">
          <div className="flex items-start gap-2.5">
            <BarChart3 className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <p className="text-[13px] text-blue-300/90 leading-relaxed">
              <strong>Shembull:</strong> NVDA eshte mbi 50/200 SMA, SMH dhe QQQ jane bullish, NVDA bie 4 dite te 20 EMA me volum ne renie dhe pastaj mbyllet fort mbi high-in e dites paraprake. Hyrja mund te jete pak mbi at high; stop-i nen low-in e pullback-ut. Nese distanca deri te stop-i eshte 4%, targeti minimal duhet te jete rreth 8% per nje raport risk/reward 1:2.
            </p>
          </div>
        </div>
      </Section>

      {/* Position Sizing */}
      <Section title="Madhesia e Pozicionit" icon={DollarSign} color="text-amber-400">
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Mos zgjidh numrin e aksioneve sipas ndjenjes; llogarite nga rreziku:
          </p>
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-4 text-center">
            <p className="text-[14px] font-mono font-semibold text-amber-300">
              Shares = Risku ne dollar / (Entry - Stop)
            </p>
          </div>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Nese llogaria eshte $10,000 dhe rrezikon 0.75% per trade, rreziku maksimal eshte $75. Nese entry eshte $150 dhe stop $144, rreziku per aksion eshte $6, prandaj pozicioni maksimal eshte afersisht 12 aksione.
          </p>
          <ul className="space-y-2.5">
            <li className="flex items-start gap-2.5">
              <DollarSign className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Rrezik per trade:</strong> 0.5% ne fillim; maksimum 1% vetem pasi ke statistike te provuar.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 flex-shrink-0" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Ekspozim total:</strong> Mos i vendos 5 trade te gjitha ne semiconductors, sepse jane realisht nje bast i vetem sektorial.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">
                <strong className="text-foreground">Auto-pause:</strong> Ndal hyrjet e reja nese ke 3 humbje radhazi ose drawdown javor mbi 2-3%.
              </span>
            </li>
          </ul>
        </div>
      </Section>

      {/* How to use IBKR */}
      <Section title="Si ta Perdorosh IBKR" icon={Zap} color="text-violet-400">
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Per cdo trade perdor <strong className="text-foreground">Bracket Order</strong>: entry, take-profit dhe stop-loss te lidhur. Kur mbushet njerja dalje, tjetra anulohet automatikisht; kjo e ben disiplinen shume me te lehte.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-4">
              <p className="font-semibold text-[13px] text-violet-400 mb-1.5">Entry</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">Buy limit per pullback ose buy stop-limit per breakout.</p>
            </div>
            <div className="rounded-lg bg-violet-500/5 border border-violet-500/15 p-4">
              <p className="font-semibold text-[13px] text-violet-400 mb-1.5">Stop-Loss</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">Vendose sipas struktures se chart-it, jo nje perqindje arbitrare.</p>
            </div>
            <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/15 p-4">
              <p className="font-semibold text-[13px] text-emerald-400 mb-1.5">Take-Profit</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">Vendos target fillestar 2R; ne 1R mund te shesh 25-50% dhe stop-in e pjeses se mbetur ta cosh ne breakeven.</p>
            </div>
            <div className="rounded-lg bg-amber-500/5 border border-amber-500/15 p-4">
              <p className="font-semibold text-[13px] text-amber-400 mb-1.5">Trailing Stop</p>
              <p className="text-[13px] text-muted-foreground leading-relaxed">Perdore vetem kur trade-i eshte tashme ne fitim dhe trendi eshte i forte; IBKR e leviz stop-in lart me cmimin, por stop-i nuk leviz prapa kur cmimi bie.</p>
            </div>
          </div>
        </div>
      </Section>

      {/* What NOT to do */}
      <Section title="Cka te Mos Bejesh" icon={XCircle} color="text-red-400">
        <ul className="space-y-2.5">
          {DONT_RULES.map((rule, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <XCircle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <span className="text-[13px] text-muted-foreground leading-relaxed">{rule}</span>
            </li>
          ))}
        </ul>
      </Section>

      {/* System Version */}
      <Section title="Versioni per Sistemin tend (CMS Finance)" icon={Layers} color="text-emerald-400">
        <div className="space-y-4">
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Per CMS Finance, ktheje kete ne nje <strong className="text-foreground">NO_TRADE-first gate</strong>: sistemi vepron vetem kur tregu, sektori dhe setup-i jane ne harmoni.
          </p>
          <div className="space-y-2">
            {SYSTEM_GATES.map((g, i) => (
              <div key={i} className="flex items-start gap-3 rounded-lg bg-muted/5 p-3">
                <g.icon className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-[13px] text-foreground">{g.gate}</p>
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{g.desc}</p>
                </div>
                <ArrowRight className="w-4 h-4 text-emerald-400/50 mt-1 flex-shrink-0" />
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Footer disclaimer */}
      <div className="border border-amber-500/20 rounded-lg px-4 py-3 bg-amber-500/5">
        <p className="text-[12px] text-amber-400/70 leading-relaxed">
          <strong>Evidenca historike</strong> sugjeron se trend-following/time-series momentum ka funksionuar ne shume tregje dhe horizonte kohore, por nuk garanton fitim ne cdo periudhe. Kjo nuk permban keshille financiare.
        </p>
      </div>
    </div>
  );
}
