'use client';

import { Card, CardContent } from '@/components/ui/card';
import { SecFilings } from '@/components/financial-brain/sec-filings';
import { ArrowLeft, FileText } from 'lucide-react';
import Link from 'next/link';

export default function SecQPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* Back link */}
        <Link href="/" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Kthehu te faqja kryesore
        </Link>

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="bg-amber-600/20 border border-amber-500/40 rounded-lg p-2.5">
            <FileText className="w-6 h-6 text-amber-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Raportet 10-Q (SEC EDGAR)</h1>
            <p className="text-sm text-muted-foreground">Të dhëna financiare tremujore direkt nga SEC</p>
          </div>
        </div>

        <Card className="border-amber-500/20 bg-amber-500/5">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Shkruaj një ticker (AAPL, MSFT, NVDA, TSLA...) për të parë 12 kuartalet e fundit: Income Statement, Balance Sheet, Cash Flow.
            </p>
          </CardContent>
        </Card>

        {/* SEC Filings Component */}
        <SecFilings />
      </div>
    </div>
  );
}
