'use client';

import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface SentimentGaugeProps {
  sentiment: string;
  score: number;
}

export function SentimentGauge({ sentiment, score }: SentimentGaugeProps) {
  const getColor = () => {
    if (sentiment === 'bullish') return 'from-emerald-400 to-green-500';
    if (sentiment === 'bearish') return 'from-red-400 to-rose-500';
    return 'from-amber-400 to-yellow-500';
  };

  const getBgColor = () => {
    if (sentiment === 'bullish') return 'bg-emerald-500/10 border-emerald-500/20';
    if (sentiment === 'bearish') return 'bg-red-500/10 border-red-500/20';
    return 'bg-amber-500/10 border-amber-500/20';
  };

  const getTextColor = () => {
    if (sentiment === 'bullish') return 'text-emerald-400';
    if (sentiment === 'bearish') return 'text-red-400';
    return 'text-amber-400';
  };

  const getIcon = () => {
    if (sentiment === 'bullish') return TrendingUp;
    if (sentiment === 'bearish') return TrendingDown;
    return Minus;
  };

  const getLabel = () => {
    if (sentiment === 'bullish') return 'Bullish / Pozitiv';
    if (sentiment === 'bearish') return 'Bearish / Negativ';
    return 'Neutral / Asnjanse';
  };

  const Icon = getIcon();

  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className={`${getBgColor()} border rounded-2xl p-6 flex flex-col items-center gap-4`}>
      <div className="relative w-28 h-28">
        <svg className="w-28 h-28 -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-muted/30"
          />
          <circle
            cx="50"
            cy="50"
            r="45"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            className={`${getTextColor()} transition-all duration-1000 ease-out`}
            style={{ filter: `drop-shadow(0 0 6px currentColor)` }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-2xl font-bold ${getTextColor()}`}>{score}</span>
          <span className="text-[10px] text-muted-foreground">/ 100</span>
        </div>
      </div>
      <div className="text-center space-y-1">
        <div className="flex items-center justify-center gap-1.5">
          <Icon className={`w-4 h-4 ${getTextColor()}`} />
          <span className={`text-sm font-semibold ${getTextColor()}`}>{getLabel()}</span>
        </div>
        <p className="text-xs text-muted-foreground">Sentimenti i Përgjithshëm i Tregut</p>
      </div>
    </div>
  );
}
