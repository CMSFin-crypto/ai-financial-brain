'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('App error:', error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="max-w-md w-full space-y-4 text-center">
        <div className="flex justify-center">
          <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center">
            <AlertTriangle className="w-8 h-8 text-orange-500" />
          </div>
        </div>
        <h2 className="text-xl font-semibold">Gabim gjatë ngarkimit</h2>
        <p className="text-sm text-muted-foreground">
          Një gabim u has gjatë ngarkimit të faqes. Kjo mund të shkaktohet nga
          cache i vjetër i shfletuesit. Provo të rifreskosh faqen.
        </p>
        {error.digest && (
          <p className="text-xs text-muted-foreground/50 font-mono">
            Debug: {error.digest}
          </p>
        )}
        <div className="flex flex-col gap-2 pt-2">
          <Button
            onClick={() => reset()}
            className="w-full"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Provo përsëri
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              // Force hard refresh — clears cache
              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.getRegistrations().then(regs =>
                  regs.forEach(r => r.unregister())
                );
              }
              window.location.href = window.location.href.split('?')[0] + '?t=' + Date.now();
            }}
            className="w-full"
          >
            Fshij cache dhe rifresko
          </Button>
        </div>
      </div>
    </div>
  );
}
