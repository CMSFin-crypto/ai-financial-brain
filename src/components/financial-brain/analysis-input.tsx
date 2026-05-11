'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Newspaper, ScrollText, MessageCircle, Layers, Loader2, Sparkles, Search } from 'lucide-react';

interface AnalysisInputProps {
  onAnalyze: (text: string, sourceType: 'news' | 'policy' | 'tweet' | 'mixed') => void;
  isLoading: boolean;
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
    text: 'The US Federal Reserve signals potential interest rate cuts in Q3 2025, citing cooling inflation and stable employment data. The Fed Chair highlighted that monetary policy is well-positioned to support continued economic expansion. Banking stocks rallied on the news, with JPMorgan and Goldman Sachs leading gains.',
  },
  {
    type: 'tweet' as const,
    label: 'Tweet nga Elon Musk',
    text: 'Tesla is developing a revolutionary new battery technology that could double the range of electric vehicles. We\'re talking about a breakthrough in solid-state batteries that will change everything. Production starts next year. This is going to disrupt the entire automotive industry. $TSLA to the moon!',
  },
];

const sourceTypes = [
  { value: 'news', label: 'Lajm / News', icon: Newspaper },
  { value: 'policy', label: 'Politika / Policy', icon: ScrollText },
  { value: 'tweet', label: 'Tweet / Social Media', icon: MessageCircle },
  { value: 'mixed', label: 'I Përzier / Mixed', icon: Layers },
];

export function AnalysisInput({ onAnalyze, isLoading }: AnalysisInputProps) {
  const [text, setText] = useState('');
  const [sourceType, setSourceType] = useState<'news' | 'policy' | 'tweet' | 'mixed'>('news');

  const handleAnalyze = () => {
    if (text.trim().length >= 20) {
      onAnalyze(text.trim(), sourceType);
    }
  };

  const handleExample = (example: (typeof EXAMPLE_INPUTS)[number]) => {
    setText(example.text);
    setSourceType(example.type);
  };

  return (
    <div className="space-y-4">
      {/* Source Type Selector */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
        <span className="text-sm font-medium text-muted-foreground whitespace-nowrap">
          Burimi i të Dhënave:
        </span>
        <div className="flex flex-wrap gap-2">
          {sourceTypes.map((type) => (
            <Badge
              key={type.value}
              variant={sourceType === type.value ? 'default' : 'outline'}
              className={`cursor-pointer transition-all duration-200 ${
                sourceType === type.value
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-sm'
                  : 'hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-300'
              }`}
              onClick={() => setSourceType(type.value as typeof sourceType)}
            >
              <type.icon className="w-3 h-3 mr-1" />
              {type.label}
            </Badge>
          ))}
        </div>
      </div>

      {/* Text Input */}
      <div className="relative">
        <Textarea
          placeholder="Hape këtu lajmin, politikat, apo tweet-in që dëshiron të analizosh...&#10;&#10;Shembull: 'Apple announces new AI chip...'&#10;Shembull: 'Fed signals rate cuts...'"
          value={text}
          onChange={(e) => setText(e.target.value)}
          className="min-h-[160px] text-sm leading-relaxed resize-none border-border/50 focus:border-emerald-500/50 focus:ring-emerald-500/20 bg-card/50"
        />
        <div className="absolute bottom-3 right-3">
          <span className={`text-xs ${text.length >= 20 ? 'text-emerald-500' : 'text-muted-foreground'}`}>
            {text.length} chars {text.length < 20 && '(min. 20)'}
          </span>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Button
          onClick={handleAnalyze}
          disabled={isLoading || text.trim().length < 20}
          className="flex-1 sm:flex-none bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white shadow-lg shadow-emerald-500/20 transition-all duration-300 font-medium"
          size="lg"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Duke analizuar me AI...
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Analizo me AI Brain
            </>
          )}
        </Button>
      </div>

      {/* Example Inputs */}
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Search className="w-3 h-3" />
          Provo shembujt e gatshëm:
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
