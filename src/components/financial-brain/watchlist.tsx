'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Eye,
  Plus,
  Trash2,
  Bell,
  BellOff,
  AlertTriangle,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  StickyNote,
  X,
  Loader2,
} from 'lucide-react';
import { StockSearch } from './stock-search';
import { getStock } from '@/lib/market-data';

const STORAGE_KEY = 'ai-brain-watchlist';

interface WatchlistItemData {
  id: string;
  ticker: string;
  company: string;
  sector: string;
  note?: string;
  price: number;
  change: number;
  alertAbove?: number;
  alertBelow?: number;
  alertActive: boolean;
  alertedAt?: string;
  createdAt: string;
  triggered: boolean;
}

function loadFromStorage(): WatchlistItemData[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveToStorage(items: WatchlistItemData[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // storage full
  }
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function Watchlist() {
  const [items, setItems] = useState<WatchlistItemData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedTicker, setSelectedTicker] = useState('');
  const [addNote, setAddNote] = useState('');
  const [addAlertAbove, setAddAlertAbove] = useState('');
  const [addAlertBelow, setAddAlertBelow] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [deletingTicker, setDeletingTicker] = useState<string | null>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadFromStorage();
    setItems(stored);
    setIsLoading(false);
  }, []);

  // Fetch live prices for all tickers
  const fetchPrices = useCallback(async () => {
    const current = loadFromStorage();
    if (current.length === 0) return;

    setIsRefreshing(true);
    try {
      const tickers = current.map((i) => i.ticker).join(',');
      const res = await fetch(`/api/market-prices?tickers=${tickers}`);
      const data = await res.json();

      const prices = data.prices || {};
      const updated = current.map((item) => {
        const live = prices[item.ticker];
        const newPrice = live?.price || item.price;
        const newChange = live?.change || item.change;

        // Check alerts
        let triggered = false;
        if (item.alertActive && !item.alertedAt) {
          if (item.alertAbove && newPrice >= item.alertAbove) triggered = true;
          if (item.alertBelow && newPrice <= item.alertBelow) triggered = true;
        }

        return {
          ...item,
          price: newPrice,
          change: newChange,
          triggered,
          alertedAt: triggered ? new Date().toISOString() : item.alertedAt,
        };
      });

      setItems(updated);
      saveToStorage(updated);
    } catch {
      // silent fail
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  // Auto-refresh every 30s
  useEffect(() => {
    const stored = loadFromStorage();
    if (stored.length === 0) return;
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  const handleAdd = () => {
    if (!selectedTicker.trim()) return;
    setIsAdding(true);

    const upperTicker = selectedTicker.trim().toUpperCase();

    // Check if already exists
    if (items.some((i) => i.ticker === upperTicker)) {
      setShowAddForm(false);
      setSelectedTicker('');
      setIsAdding(false);
      return;
    }

    // Get stock info from local data
    const stock = getStock(upperTicker);
    const newItem: WatchlistItemData = {
      id: generateId(),
      ticker: upperTicker,
      company: stock?.company || upperTicker,
      sector: stock?.sector || '',
      note: addNote.trim() || undefined,
      price: stock?.price || 0,
      change: stock?.change || 0,
      alertAbove: addAlertAbove.trim() ? parseFloat(addAlertAbove) : undefined,
      alertBelow: addAlertBelow.trim() ? parseFloat(addAlertBelow) : undefined,
      alertActive: !!(addAlertAbove.trim() || addAlertBelow.trim()),
      createdAt: new Date().toISOString(),
      triggered: false,
    };

    const updated = [newItem, ...items];
    setItems(updated);
    saveToStorage(updated);
    setShowAddForm(false);
    setSelectedTicker('');
    setAddNote('');
    setAddAlertAbove('');
    setAddAlertBelow('');
    setIsAdding(false);

    // Fetch live price immediately
    setTimeout(() => fetchPrices(), 500);
  };

  const handleDelete = (ticker: string) => {
    setDeletingTicker(ticker);
    setTimeout(() => {
      const updated = items.filter((i) => i.ticker !== ticker);
      setItems(updated);
      saveToStorage(updated);
      setDeletingTicker(null);
    }, 200);
  };

  const toggleAlert = (ticker: string) => {
    const updated = items.map((i) =>
      i.ticker === ticker ? { ...i, alertActive: !i.alertActive, alertedAt: undefined, triggered: false } : i
    );
    setItems(updated);
    saveToStorage(updated);
  };

  const alerts = items.filter((i) => i.triggered).length;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-[120px] rounded-xl bg-muted/20 animate-pulse" />
        <div className="h-[300px] rounded-xl bg-muted/20 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-500" />
              <h3 className="text-sm font-semibold">Watchlist</h3>
              <Badge variant="secondary" className="text-[10px]">{items.length} aksione</Badge>
              {alerts > 0 && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  className="flex items-center gap-1 bg-red-500/10 border border-red-500/30 rounded-full px-2 py-0.5"
                >
                  <AlertTriangle className="w-3 h-3 text-red-500" />
                  <span className="text-[10px] text-red-500 font-medium">{alerts} sinjal</span>
                </motion.div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchPrices}
                disabled={isRefreshing}
                className="h-8 text-xs"
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1 ${isRefreshing ? 'animate-spin' : ''}`} />
                Rifresko
              </Button>
              <Button
                onClick={() => setShowAddForm(true)}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white h-8"
              >
                <Plus className="w-3.5 h-3.5 mr-1" />
                Shto
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Add Form */}
      <AnimatePresence>
        {showAddForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-500" />
                    Shto Aksion ne Watchlist
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setShowAddForm(false)} className="h-7 w-7 p-0">
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Ticker *</label>
                  <StockSearch
                    onSelect={setSelectedTicker}
                    placeholder="Kerko ticker-in..."
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                    <StickyNote className="w-3 h-3" /> Shenime (opsionale)
                  </label>
                  <Input
                    value={addNote}
                    onChange={(e) => setAddNote(e.target.value)}
                    placeholder="p.sh. Duke pritur raportimin e fitimeve..."
                    className="h-9 text-xs"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3 text-emerald-500" /> Alert me siper ($)
                    </label>
                    <Input
                      type="number"
                      value={addAlertAbove}
                      onChange={(e) => setAddAlertAbove(e.target.value)}
                      placeholder="p.sh. 200"
                      className="h-9 text-xs"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                      <TrendingDown className="w-3 h-3 text-red-500" /> Alert me poshte ($)
                    </label>
                    <Input
                      type="number"
                      value={addAlertBelow}
                      onChange={(e) => setAddAlertBelow(e.target.value)}
                      placeholder="p.sh. 150"
                      className="h-9 text-xs"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleAdd}
                  disabled={isAdding || !selectedTicker.trim()}
                  className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-9"
                >
                  {isAdding ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
                  {isAdding ? 'Duke shtuar...' : 'Shto ne Watchlist'}
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Watchlist Items */}
      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center py-12"
        >
          <Eye className="w-12 h-12 mx-auto mb-3 text-muted-foreground/20" />
          <p className="text-sm text-muted-foreground">Watchlist eshte bosh</p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Shto aksione per t&apos;i monitoruar me cmime live dhe sinjale alerti
          </p>
        </motion.div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {items.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20, height: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                <Card className={`border-border/50 bg-card/50 transition-all ${
                  item.triggered
                    ? 'border-red-500/50 bg-red-500/5 shadow-[0_0_12px_rgba(239,68,68,0.15)]'
                    : ''
                }`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-3">
                      {/* Left: Ticker info */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold">{item.ticker}</span>
                            {item.triggered && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                className="flex items-center gap-1 bg-red-500/20 rounded-full px-1.5 py-0.5"
                              >
                                <AlertTriangle className="w-2.5 h-2.5 text-red-500" />
                                <span className="text-[9px] text-red-500 font-medium">ALERT</span>
                              </motion.div>
                            )}
                            {item.alertActive && !item.triggered && (
                              <Badge variant="outline" className="text-[9px] border-amber-500/30 text-amber-500 px-1.5 py-0">
                                <Bell className="w-2.5 h-2.5 mr-0.5" />
                                Alert
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground truncate max-w-[200px]">
                            {item.company}
                          </p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <Badge variant="secondary" className="text-[9px] px-1.5 py-0">
                              {item.sector}
                            </Badge>
                            {item.note && (
                              <span className="text-[9px] text-muted-foreground/70 truncate max-w-[120px]">
                                {item.note}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Center: Price & Change */}
                      <div className="text-right shrink-0">
                        <p className="text-sm font-bold tabular-nums">
                          ${item.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </p>
                        <p className={`text-[11px] font-medium tabular-nums ${
                          item.change >= 0 ? 'text-emerald-500' : 'text-red-500'
                        }`}>
                          {item.change >= 0 ? '▲' : '▼'} {item.change >= 0 ? '+' : ''}{item.change.toFixed(2)}%
                        </p>
                      </div>

                      {/* Right: Alerts & Actions */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        {/* Alert thresholds */}
                        {(item.alertAbove || item.alertBelow) && (
                          <div className="flex flex-col items-end gap-0.5 mr-1">
                            {item.alertAbove && (
                              <span className="text-[9px] text-emerald-500/70">
                                ↑ ${item.alertAbove}
                              </span>
                            )}
                            {item.alertBelow && (
                              <span className="text-[9px] text-red-500/70">
                                ↓ ${item.alertBelow}
                              </span>
                            )}
                          </div>
                        )}

                        {/* Toggle alert */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleAlert(item.ticker)}
                          className={`h-7 w-7 p-0 ${
                            item.alertActive ? 'text-amber-500 hover:text-amber-600' : 'text-muted-foreground'
                          }`}
                          title={item.alertActive ? 'C\'aktivizo alertin' : 'Aktivizo alertin'}
                        >
                          {item.alertActive ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
                        </Button>

                        {/* Delete */}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(item.ticker)}
                          disabled={deletingTicker === item.ticker}
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-red-500"
                          title="Fshi nga watchlist"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Footer note */}
      {items.length > 0 && (
        <p className="text-[10px] text-muted-foreground/50 text-center">
          Cmimet rifreskohen cdo 30 sekonda. Te dhena ruhen ne browserin tuaj.
        </p>
      )}
    </div>
  );
}
