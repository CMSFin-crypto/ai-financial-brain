"use client";

import { AlertCircle, Info, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type Pred = {
  rank: number;
  ticker: string;
  probability: number;
  today_return: number;
  volume_rel: number;
  rsi: number;
  is_top_pick: boolean;
};

type Payload = {
  as_of: string;
  generated_at: number;
  target: string;
  top_k: number;
  predictions: Pred[];
  disclaimer: string;
};

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

export default function NextDayTab() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetch("/nextday.json", { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(setData)
      .catch((e) => setError(String(e.message || e)));
  }, []);

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p>
          Nuk u ngarkuan parashikimet ({error}). Ekzekuto workflow-n
          &laquo;nextday-predictions&raquo; në GitHub Actions.
        </p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Duke ngarkuar...
      </div>
    );
  }

  const rows = showAll ? data.predictions : data.predictions.slice(0, data.top_k);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">
          Parashikimi për ditën tjetër
        </h2>
        <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
          Të dhëna deri më {data.as_of} &middot; Objektivi: {data.target}
        </p>
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Simboli</th>
              <th className="px-3 py-2.5 text-right font-medium">Prob.</th>
              <th className="px-3 py-2.5 text-right font-medium">Sot</th>
              <th className="px-3 py-2.5 text-right font-medium">Vol&times;</th>
              <th className="px-3 py-2.5 text-right font-medium">RSI</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => (
              <tr
                key={p.ticker}
                className={`border-t border-border/60 transition-colors hover:bg-muted/40 ${
                  p.is_top_pick ? "bg-emerald-500/10" : ""
                }`}
              >
                <td className="px-3 py-2.5 tabular-nums text-muted-foreground">
                  {p.rank}
                </td>
                <td className="px-3 py-2.5 font-semibold">
                  <span className="inline-flex items-center gap-2">
                    {p.ticker}
                    {p.is_top_pick && (
                      <Badge className="bg-emerald-600 px-1.5 py-0 text-[10px] text-white hover:bg-emerald-600">
                        TOP
                      </Badge>
                    )}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right font-medium tabular-nums">
                  {pct(p.probability)}
                </td>
                <td
                  className={`px-3 py-2.5 text-right tabular-nums ${
                    p.today_return >= 0
                      ? "text-emerald-600 dark:text-emerald-400"
                      : "text-red-600 dark:text-red-400"
                  }`}
                >
                  {p.today_return >= 0 ? "+" : ""}
                  {pct(p.today_return, 2)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {p.volume_rel.toFixed(1)}
                </td>
                <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                  {p.rsi.toFixed(0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Button variant="outline" size="sm" onClick={() => setShowAll((s) => !s)}>
          {showAll ? `Shfaq vetëm top ${data.top_k}` : "Shfaq të gjitha"}
        </Button>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <span
            className="inline-block h-2.5 w-2.5 rounded-sm bg-emerald-500/40"
            aria-hidden
          />
          Zgjedhjet kryesore (top {data.top_k})
        </span>
      </div>

      <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        {data.disclaimer}
      </p>
    </div>
  );
}
