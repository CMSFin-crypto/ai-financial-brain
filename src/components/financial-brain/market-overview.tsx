'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Lightbulb, AlertTriangle, BarChart3, Target } from 'lucide-react';

interface MarketOverviewProps {
  overview: string;
  keyInsights: string[];
  riskFactors: string[];
}

export function MarketOverview({ overview, keyInsights, riskFactors }: MarketOverviewProps) {
  return (
    <div className="space-y-4">
      {/* Market Overview */}
      <Card className="bg-card/50 border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-emerald-500" />
            Përmbledhje e Tregut
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground leading-relaxed">{overview}</p>
        </CardContent>
      </Card>

      {/* Key Insights */}
      {keyInsights && keyInsights.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-amber-500" />
              Vëzhgime Kryesore
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {keyInsights.map((insight, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Target className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span className="leading-relaxed">{insight}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Risk Factors */}
      {riskFactors && riskFactors.length > 0 && (
        <Card className="bg-card/50 border-border/50">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-500" />
              Faktorët e Riskut
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {riskFactors.map((risk, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 mt-0.5 flex-shrink-0" />
                  <span className="leading-relaxed">{risk}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
