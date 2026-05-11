'use client';

import Image from 'next/image';
import { TrendingUp, Activity, Shield } from 'lucide-react';

export function Header() {
  return (
    <header className="border-b border-border bg-card/50 backdrop-blur-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-lg shadow-emerald-500/20">
            <Image
              src="/brain-logo.png"
              alt="AI Financial Brain"
              width={40}
              height={40}
              className="object-cover"
            />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">
              AI Financial Brain
            </h1>
            <p className="text-xs text-muted-foreground hidden sm:block">
              Lajme → Sinjale Tregu → Parashikime Aksionesh
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            <Activity className="w-3.5 h-3.5 text-emerald-500" />
            <span>Powers by AI</span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            <Shield className="w-3.5 h-3.5 text-amber-500" />
            <span>Analiza Në Kohë Reale</span>
          </div>
          <div className="hidden md:flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-500" />
            <span>Parashikime</span>
          </div>
        </div>
      </div>
    </header>
  );
}
