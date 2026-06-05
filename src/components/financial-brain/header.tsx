'use client';

import Image from 'next/image';
import { TrendingUp, Activity, Shield, Brain, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';

interface LearningStats {
  totalPredictions: number;
  evaluatedPredictions: number;
  correctPredictions: number;
  avgAccuracy: number;
  recentAccuracy: number;
  streakCorrect: number;
  streakWrong: number;
  lessonsLearned: number;
  improvement: number;
}

export function Header() {
  const [stats, setStats] = useState<LearningStats | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // Fetch AI learning stats
    const fetchStats = async () => {
      try {
        const res = await fetch('/api/ai-learn?type=stats');
        if (res.ok) {
          const data = await res.json();
          setStats(data.stats);
        }
      } catch {
        // Silently fail - learning stats are optional
      }
    };
    fetchStats();
    // Refresh every 60 seconds
    const interval = setInterval(fetchStats, 60000);
    return () => clearInterval(interval);
  }, []);

  const getAccuracyColor = (acc: number) => {
    if (acc >= 70) return 'text-emerald-400';
    if (acc >= 50) return 'text-amber-400';
    return 'text-red-400';
  };

  const getAccuracyBg = (acc: number) => {
    if (acc >= 70) return 'bg-emerald-500/10 border-emerald-500/30';
    if (acc >= 50) return 'bg-amber-500/10 border-amber-500/30';
    return 'bg-red-500/10 border-red-500/30';
  };

  const getStreakEmoji = () => {
    if (!stats) return '';
    if (stats.streakCorrect >= 3) return '🔥';
    if (stats.streakWrong >= 3) return '⚠️';
    return '📊';
  };

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
        <div className="flex items-center gap-3">
          {/* AI Learning Badge */}
          {stats && stats.totalPredictions > 0 && (
            <button
              onClick={() => setExpanded(!expanded)}
              className={`flex items-center gap-2 text-xs px-3 py-1.5 rounded-full border cursor-pointer transition-all hover:scale-105 ${getAccuracyBg(stats.recentAccuracy || stats.avgAccuracy)}`}
            >
              <Brain className="w-3.5 h-3.5 text-violet-400" />
              <span className={`font-semibold ${getAccuracyColor(stats.recentAccuracy || stats.avgAccuracy)}`}>
                {stats.recentAccuracy > 0 ? stats.recentAccuracy.toFixed(0) : stats.avgAccuracy.toFixed(0)}%
              </span>
              <Sparkles className="w-3 h-3 text-violet-400" />
              {stats.streakCorrect >= 2 && (
                <span className="text-xs">{getStreakEmoji()}</span>
              )}
            </button>
          )}

          {/* Learning Stats Expanded */}
          {expanded && stats && stats.totalPredictions > 0 && (
            <div className="absolute top-full right-4 mt-2 bg-card border border-border rounded-xl shadow-2xl p-4 w-80 z-50 animate-in slide-in-from-top-2">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Brain className="w-4 h-4 text-violet-400" />
                  <h3 className="text-sm font-bold">AI Learning Stats</h3>
                </div>
                <button onClick={() => setExpanded(false)} className="text-muted-foreground hover:text-foreground text-xs">
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase">Total Prediktime</div>
                  <div className="text-lg font-bold">{stats.totalPredictions}</div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase">Akuracia</div>
                  <div className={`text-lg font-bold ${getAccuracyColor(stats.avgAccuracy)}`}>
                    {stats.avgAccuracy.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase">Saktesë Fundit</div>
                  <div className={`text-lg font-bold ${getAccuracyColor(stats.recentAccuracy)}`}>
                    {stats.recentAccuracy.toFixed(1)}%
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-2.5">
                  <div className="text-[10px] text-muted-foreground uppercase">Mësime</div>
                  <div className="text-lg font-bold text-violet-400">{stats.lessonsLearned}</div>
                </div>
              </div>

              {/* Streak */}
              <div className="mt-3 flex items-center justify-between bg-muted/30 rounded-lg px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs">{getStreakEmoji()}</span>
                  <span className="text-xs text-muted-foreground">
                    {stats.streakCorrect > 0 ? (
                      <span className="text-emerald-400 font-medium">{stats.streakCorrect} fitore rresht!</span>
                    ) : stats.streakWrong > 0 ? (
                      <span className="text-red-400 font-medium">{stats.streakWrong} humbje rresht</span>
                    ) : (
                      'Fillim i analizave'
                    )}
                  </span>
                </div>
                {stats.improvement !== 0 && (
                  <span className={`text-xs font-medium ${stats.improvement > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {stats.improvement > 0 ? '↑' : '↓'} {Math.abs(stats.improvement).toFixed(1)}%
                  </span>
                )}
              </div>

              {/* Progress Bar */}
              <div className="mt-3">
                <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
                  <span>Përmirësimi i akuracisë</span>
                  <span>{Math.min(stats.avgAccuracy, 100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-1000 ${
                      stats.avgAccuracy >= 70 ? 'bg-emerald-500' :
                      stats.avgAccuracy >= 50 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min(stats.avgAccuracy, 100)}%` }}
                  />
                </div>
              </div>
            </div>
          )}

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
