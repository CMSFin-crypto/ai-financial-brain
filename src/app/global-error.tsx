'use client';

import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="sq">
      <body className="bg-background text-foreground antialiased">
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="max-w-md w-full space-y-4 text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-orange-500/10 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-orange-500" />
              </div>
            </div>
            <h2 className="text-xl font-semibold">Gabim i përgjithshëm</h2>
            <p className="text-sm text-muted-foreground">
              Një gabim i papritur u has. Kjo zakonisht ndodh kur shfletuesi ka ruajtur
              një version të vjetër të faqes. Kliko butonin më poshtë.
            </p>
            <Button
              onClick={() => {
                if ('serviceWorker' in navigator) {
                  navigator.serviceWorker.getRegistrations().then(regs =>
                    regs.forEach(r => r.unregister())
                  );
                }
                window.location.href = window.location.origin + '?t=' + Date.now();
              }}
              className="w-full"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Fshij cache dhe hap faqen
            </Button>
          </div>
        </div>
      </body>
    </html>
  );
}
