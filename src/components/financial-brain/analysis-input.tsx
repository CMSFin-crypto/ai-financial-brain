'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Newspaper, Loader2, Sparkles, Search,
  TrendingUp, ExternalLink, RefreshCw, AlertTriangle,
  ArrowUpRight, Clock,
} from 'lucide-react';

interface AnalysisInputProps {
  onAnalyze: (text: string, sourceType: 'news' | 'policy' | 'tweet' | 'mixed') => void;
  isLoading: boolean;
}

interface NewsItem {
  title: string;
  snippet: string;
  source: string;
  url: string;
  publishedAt: string;
  impactLevel: 'HIGH' | 'MEDIUM' | 'LOW';
  impactReasons: string[];
  affectedTickers: string[];
}

const EXAMPLE_INPUTS = [
  {
    type: 'news' as const,
    label: 'Lajm Teknologji',
    text: 'Apple announces breakthrough in AI chip technology with M5 processors that are 3x faster than competitors. The new chips will power the next generation of MacBooks and data centers. Analysts expect this to significantly boost Apple\'s market share in the enterprise AI sector. NVIDIA shares dropped 4% on the news as investors worry about increased competition.',
  },
  {
    type: 'policy' as const,
    label: 'Politika Qeveritare',
    text: 'The Federal Reserve held interest rates steady, signaling a cautious approach amid inflation at 2.4%. The Chair noted the economy remains strong with stable job growth, and markets are pricing in potential rate cuts later this year. Banking stocks showed mixed reactions, with major banks up on better-than-expected net interest income.',
  },
  {
    type: 'tweet' as const,
    label: 'Tweet nga Elon Musk',
    text: 'Tesla is developing a revolutionary new battery technology that could double the range of electric vehicles. We\'re talking about a breakthrough in solid-state batteries that will change everything. Production starts next year. This is going to disrupt the entire automotive industry. $TSLA to the moon!',
  },
  {
    type: 'mixed' as const,
    label: 'I Perzier',
    text: 'Mixed market signals today: Tech stocks rally on strong earnings from Microsoft and Google, while energy stocks drop as oil prices fall below $70. Geopolitical tensions in the Middle East are causing safe-haven flows into gold. The dollar index is flat. Analysts are divided on whether this is a market rotation or a temporary blip.',
  },
];

function timeAgo(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Tani';
    if (diffMin < 60) return `${diffMin} min me pare`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr} ore me pare`;
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) return `${diffDay} dite me pare`;
    return date.toLocaleDateString('sq-AL', { day: 'numeric', month: 'short' });
  } catch {
    return '';
  }
}

function ImpactBadge({ level }: { level: string }) {
  if (level === 'HIGH') return <Badge className="bg-red-500/10 text-red-500 border-red-500/30 text-[9px] font-medium">Impact i Larte</Badge>;
  if (level === 'MEDIUM') return <Badge className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[9px] font-medium">Impact Mesatar</Badge>;
  return <Badge className="bg-emerald-500/10 text-emerald-500 border-emerald-500/30 text-[9px] font-medium">Impact i Ulet</Badge>;
}

function NewsCard({ item, onAnalyze }: { item: NewsItem; onAnalyze: () => void }) {
  const isHigh = item.impactLevel === 'HIGH';

  return (
    <Card
      className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
        isHigh
          ? 'border-red-500/20 bg-red-500/[0.03] hover:bg-red-500/[0.06]'
          : 'border-border/50 bg-card/50 hover:bg-muted/30'
      }`}
      onClick={onAnalyze}
    >
      <CardContent className="py-2.5 px-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium leading-relaxed line-clamp-2">{item.title}</p>
            <div className="flex items-center gap-2 mt-1.5 flex-wrap">
              <span className="text-[9px] text-muted-foreground font-medium">{item.source}</span>
              <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                <Clock className="w-2.5 h-2.5" />
                {timeAgo(item.publishedAt)}
              </span>
              {item.affectedTickers.length > 0 && (
                <div className="flex gap-0.5">
                  {item.affectedTickers.slice(0, 3).map(t => (
                    <Badge key={t} variant="outline" className="text-[8px] px-1 py-0 border-emerald-500/30 text-emerald-500 font-mono">
                      {t}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <ImpactBadge level={item.impactLevel} />
            <ArrowUpRight className="w-3 h-3 text-muted-foreground/50" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function AnalysisInput({ onAnalyze, isLoading }: AnalysisInputProps) {
  const [text, setText] = useState('');
  const [sourceType, setSourceType] = useState<'news' | 'policy' | 'tweet' | 'mixed'>('news');
  const [news, setNews] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsError, setNewsError] = useState<string | null>(null);

  const fetchNews = useCallback(async () => {
    setNewsLoading(true);
    setNewsError(null);
    try {
      const res = await fetch('/api/news');
      const data = await res.json();
      if (!res.ok) {
        setNewsError(data.error || 'Lajmet nuk u ngarkuan');
        return;
      }
      setNews(data.news || []);
    } catch {
      setNewsError('Gabim rrjeti. Lajmet nuk u ngarkuan.');
    } finally {
      setNewsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNews();
  }, [fetchNews]);

  const handleAnalyze = () => {
    if (text.trim().length >= 20) {
      onAnalyze(text.trim(), sourceType);
    }
  };

  const handleExample = (example: (typeof EXAMPLE_INPUTS)[number]) => {
    setText(example.text);
    setSourceType(example.type);
    setTimeout(() => {
      onAnalyze(example.text.trim(), example.type);
    }, 100);
  };

  const handleNewsClick = (item: NewsItem) => {
    const fullText = `${item.title}. ${item.snippet}`;
    setText(fullText);
    setSourceType('mixed');
    setTimeout(() => {
      onAnalyze(fullText, 'mixed');
    }, 100);
  };

  const highImpact = news.filter(n => n.impactLevel === 'HIGH');
  const mediumImpact = news.filter(n => n.impactLevel === 'MEDIUM');
  const lowImpact = news.filter(n => n.impactLevel === 'LOW');

  return (
    <div className="space-y-4">
      {/* ═══ REAL NEWS — One unified section ═══ */}
      <div className="space-y-2.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <p className="text-xs font-semibold">
              Lajme Reale me Impact ne Stoqe
            </p>
            {news.length > 0 && (
              <div className="flex gap-1.5 ml-1">
                {highImpact.length > 0 && (
                  <Badge className="text-[9px] bg-red-500/10 text-red-500 border-0 px-1.5">
                    {highImpact.length} larte
                  </Badge>
                )}
                {mediumImpact.length > 0 && (
                  <Badge className="text-[9px] bg-amber-500/10 text-amber-500 border-0 px-1.5">
                    {mediumImpact.length} mesatar
                  </Badge>
                )}
                <Badge className="text-[9px] bg-muted/50 text-muted-foreground border-0 px-1.5">
                  {news.length} total
                </Badge>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchNews}
            disabled={newsLoading}
            className="h-7 text-xs"
          >
            <RefreshCw className={`w-3 h-3 mr-1 ${newsLoading ? 'animate-spin' : ''}`} />
            Rifresko
          </Button>
        </div>

        {newsLoading && (
          <div className="space-y-2">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-16 bg-muted/30 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {newsError && (
          <div className="flex items-center gap-2 text-xs text-amber-500 bg-amber-500/10 rounded-lg p-3">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
            <span>{newsError}</span>
            <Button variant="ghost" size="sm" onClick={fetchNews} className="h-6 text-xs ml-auto">
              Provo perseri
            </Button>
          </div>
        )}

        {!newsLoading && !newsError && news.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">
            <Newspaper className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-xs">Asnje lajm nuk u gjet. Provo rifreskimin.</p>
          </div>
        )}

        {!newsLoading && !newsError && news.length > 0 && (
          <div className="space-y-2">
            {/* High Impact — Red highlight */}
            {highImpact.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <p className="text-[10px] font-semibold text-red-500 uppercase tracking-wide">
                    Lajme me Impact te Larte
                  </p>
                </div>
                {highImpact.slice(0, 5).map((item, i) => (
                  <NewsCard key={`h-${i}`} item={item} onAnalyze={() => handleNewsClick(item)} />
                ))}
              </div>
            )}

            {/* Medium Impact — Amber */}
            {mediumImpact.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-amber-500 rounded-full" />
                  <p className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">
                    Lajme me Impact Mesatar
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {mediumImpact.slice(0, 6).map((item, i) => (
                    <NewsCard key={`m-${i}`} item={item} onAnalyze={() => handleNewsClick(item)} />
                  ))}
                </div>
              </div>
            )}

            {/* Low Impact — Subtle */}
            {lowImpact.length > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                    Lajme te tjera
                  </p>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {lowImpact.slice(0, 6).map((item, i) => (
                    <NewsCard key={`l-${i}`} item={item} onAnalyze={() => handleNewsClick(item)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ═══ Divider ═══ */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[10px] text-muted-foreground">ose shkruaj manualisht</span>
        <div className="flex-1 h-px bg-border/50" />
      </div>

      {/* ═══ Manual Input ═══ */}
      <div className="relative">
        <Textarea
          placeholder="Shkruaj lajmin, politikat, apo tweet-in qe deshiron te analizosh..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[100px] text-sm leading-relaxed resize-none border-border/50 focus:border-emerald-500/50 focus:ring-emerald-500/20 bg-card/50"
        />
        <div className="absolute bottom-3 right-3">
          <span className={`text-xs ${text.length >= 20 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
            {text.length} chars {text.length < 20 && '(min. 20)'}
          </span>
        </div>
      </div>

      <Button
        onClick={handleAnalyze}
        disabled={isLoading || text.trim().length < 20}
        className="w-full bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20 font-medium"
        size="lg"
      >
        {isLoading ? (
          <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Duke analizuar me AI...</>
        ) : (
          <><Sparkles className="w-4 h-4 mr-2" /> Analizo me AI Brain</>
        )}
      </Button>

      {/* Example Inputs */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Search className="w-3 h-3" />
          Shembuj demo (kliko per te analizuar automatikisht):
        </p>
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_INPUTS.map((example, index) => (
            <Badge
              key={index}
              variant="outline"
              className="cursor-pointer hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300 transition-all duration-200 text-xs"
              onClick={() => handleExample(example)}
            >
              {example.label}
            </Badge>
          ))}
        </div>
      </div>
    </div>
  );
}
