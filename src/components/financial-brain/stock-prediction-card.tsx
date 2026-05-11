'use client';

import {
  ArrowUpCircle,
  ArrowDownCircle,
  MinusCircle,
  ShieldAlert,
  ShieldCheck,
  ShieldQuestion,
  Building2,
  TrendingUp,
  ChevronUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface StockPrediction {
  ticker: string;
  company: string;
  sector: string;
  description: string;
  signal: string;
  confidence: number;
  reasoning: string;
  priceTargetDirection: string;
  riskLevel: string;
  impactLevel: string;
}

interface StockPredictionCardProps {
  prediction: StockPrediction;
}

function SignalIcon({ signal }: { signal: string }) {
  if (signal === 'BUY')
    return <ArrowUpCircle className="w-5 h-5 text-emerald-400" />;
  if (signal === 'SELL')
    return <ArrowDownCircle className="w-5 h-5 text-red-400" />;
  return <MinusCircle className="w-5 h-5 text-amber-400" />;
}

function RiskIcon({ risk }: { risk: string }) {
  if (risk === 'LOW')
    return <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />;
  if (risk === 'HIGH')
    return <ShieldAlert className="w-3.5 h-3.5 text-red-400" />;
  return <ShieldQuestion className="w-3.5 h-3.5 text-amber-400" />;
}

function getSignalColor(signal: string) {
  if (signal === 'BUY') return 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400';
  if (signal === 'SELL') return 'bg-red-500/10 border-red-500/30 text-red-400';
  return 'bg-amber-500/10 border-amber-500/30 text-amber-400';
}

function getConfidenceColor(confidence: number) {
  if (confidence >= 75) return 'text-emerald-400';
  if (confidence >= 50) return 'text-amber-400';
  return 'text-red-400';
}

function getProgressColor(confidence: number) {
  if (confidence >= 75) return '[&>div]:bg-emerald-500';
  if (confidence >= 50) return '[&>div]:bg-amber-500';
  return '[&>div]:bg-red-500';
}

function getDirectionIcon(direction: string) {
  if (direction === 'UP') return <ChevronUp className="w-4 h-4 text-emerald-400" />;
  if (direction === 'DOWN') return <ChevronUp className="w-4 h-4 text-red-400 rotate-180" />;
  return <MinusCircle className="w-4 h-4 text-amber-400" />;
}

export function StockPredictionCard({ prediction }: StockPredictionCardProps) {
  return (
    <TooltipProvider>
      <div
        className={`border rounded-xl p-4 bg-card/50 hover:bg-card/80 transition-all duration-300 hover:shadow-lg hover:shadow-emerald-500/5 hover:-translate-y-0.5 ${getSignalColor(prediction.signal)}`}
      >
        {/* Header: Ticker + Signal */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <SignalIcon signal={prediction.signal} />
            <div>
              <h3 className="font-bold text-lg">{prediction.ticker}</h3>
              <p className="text-xs text-muted-foreground line-clamp-1 max-w-[160px]">
                {prediction.company}
              </p>
            </div>
          </div>
          <Badge
            className={
              prediction.signal === 'BUY'
                ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                : prediction.signal === 'SELL'
                  ? 'bg-red-500 text-white hover:bg-red-600'
                  : 'bg-amber-500 text-white hover:bg-amber-600'
            }
          >
            {prediction.signal}
          </Badge>
        </div>

        {/* Sector + Company Description */}
        <div className="flex items-center gap-1.5 mb-3">
          <Building2 className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{prediction.sector}</span>
        </div>

        <p className="text-xs text-muted-foreground mb-3 line-clamp-2 leading-relaxed">
          {prediction.description}
        </p>

        {/* Confidence Bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted-foreground">Besueshmëria</span>
            <span className={`text-xs font-semibold ${getConfidenceColor(prediction.confidence)}`}>
              {prediction.confidence}%
            </span>
          </div>
          <Progress value={prediction.confidence} className={`h-1.5 ${getProgressColor(prediction.confidence)}`} />
        </div>

        {/* Price Direction + Risk + Impact */}
        <div className="flex items-center gap-2 mb-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 bg-muted/50 rounded-md px-2 py-1">
                {getDirectionIcon(prediction.priceTargetDirection)}
                <span className="text-xs font-medium">{prediction.priceTargetDirection}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p> drejtimi i çmimit të synuar</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 bg-muted/50 rounded-md px-2 py-1">
                <RiskIcon risk={prediction.riskLevel} />
                <span className="text-xs font-medium">{prediction.riskLevel}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Niveli i riskut</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 bg-muted/50 rounded-md px-2 py-1">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">{prediction.impactLevel}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              <p>Niveli i ndikimit</p>
            </TooltipContent>
          </Tooltip>
        </div>

        {/* Reasoning */}
        <div className="border-t border-border/50 pt-3 mt-auto">
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-4">
            {prediction.reasoning}
          </p>
        </div>
      </div>
    </TooltipProvider>
  );
}
