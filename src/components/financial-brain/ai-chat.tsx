'use client';

import { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2, Send, Bot, User, Sparkles, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: number;
}

const CHAT_STORAGE_KEY = 'ai-brain-chat-messages';
const MAX_MESSAGES = 50;

const WELCOME_MESSAGE: Message = {
  role: 'assistant',
  content: 'Përshëndetje! Jam AI Financial Brain. Mund t\'ju ndihmoj me analiza stoqesh, tregje, tendencë, dhe koncepte financiare. Çfarë dëshironi të dini?',
  timestamp: Date.now(),
};

function loadChatMessages(): Message[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(CHAT_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveChatMessages(messages: Message[]) {
  if (typeof window === 'undefined') return;
  try {
    const trimmed = messages.length > MAX_MESSAGES ? messages.slice(-MAX_MESSAGES) : messages;
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // storage full
  }
}

export function AIChat() {
  const [messages, setMessages] = useState<Message[]>(() => {
    const saved = loadChatMessages();
    return saved.length > 0 ? saved : [WELCOME_MESSAGE];
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [ticker, setTicker] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-save messages to localStorage
  useEffect(() => {
    saveChatMessages(messages);
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    const userMsg: Message = { role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const res = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
          ticker: ticker.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.response) {
        setMessages(prev => [...prev, { role: 'assistant', content: data.response, timestamp: Date.now() }]);
      } else if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Gabim: ${data.error}`, timestamp: Date.now() }]);
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Gabim rrjeti. Provo përsëri.', timestamp: Date.now() }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    const fresh = [{ ...WELCOME_MESSAGE, timestamp: Date.now() }];
    setMessages(fresh);
  };

  // Quick suggestion buttons
  const suggestions = [
    { label: 'Analizo AAPL', msg: 'Bëj një analizë të shpejtë të Apple (AAPL)', ticker: 'AAPL' },
    { label: 'Tregu sot', msg: 'Si duket tregu sot? Çfarë sektoresh janë në tendencë positive?' },
    { label: 'NVDA vs AMD', msg: 'Krahaso NVIDIA me AMD - cila është më e mirë për investim afatgjatë?' },
    { label: 'P/E ratio', msg: 'Shpjego çfarë është P/E ratio dhe si ta përdor për analizë' },
  ];

  return (
    <div className="space-y-4">
      {/* Header with ticker input */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Input
            placeholder="Opsionale: Vendos ticker (p.sh. AAPL, NVDA)..."
            value={ticker}
            onChange={(e) => setTicker(e.target.value.toUpperCase())}
            className="h-9 text-xs max-w-[200px]"
          />
        </div>
        <Button variant="outline" size="sm" onClick={handleClear} className="text-xs h-9">
          <Trash2 className="w-3.5 h-3.5 mr-1" /> Fshi
        </Button>
      </div>

      {/* Chat area */}
      <Card className="border-border/50 bg-card/50">
        <CardContent className="p-0">
          <div ref={scrollRef} className="h-[450px] overflow-y-auto p-4 space-y-3">
            <AnimatePresence mode="popLayout">
              {messages.map((msg, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2 }}
                  className={`flex gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  {/* Avatar */}
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === 'assistant' ? 'bg-emerald-500/10 border border-emerald-500/20' : 'bg-blue-500/10 border border-blue-500/20'
                  }`}>
                    {msg.role === 'assistant' ? <Bot className="w-3.5 h-3.5 text-emerald-500" /> : <User className="w-3.5 h-3.5 text-blue-500" />}
                  </div>

                  {/* Message bubble */}
                  <div className={`max-w-[80%] rounded-xl px-3 py-2.5 text-xs leading-relaxed ${
                    msg.role === 'assistant'
                      ? 'bg-muted/50 border border-border/30'
                      : 'bg-emerald-500/10 border border-emerald-500/20'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            {isLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex gap-2.5"
              >
                <div className="w-7 h-7 rounded-full flex items-center justify-center bg-emerald-500/10 border border-emerald-500/20">
                  <Bot className="w-3.5 h-3.5 text-emerald-500" />
                </div>
                <div className="bg-muted/50 border border-border/30 rounded-xl px-3 py-2.5">
                  <div className="flex items-center gap-1.5">
                    <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                    <span className="text-xs text-muted-foreground">Duke menduar...</span>
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Suggestions (show only when few messages) */}
          {messages.length <= 2 && (
            <div className="px-4 pb-2">
              <div className="flex flex-wrap gap-1.5">
                {suggestions.map((s, i) => (
                  <Button
                    key={i}
                    variant="outline"
                    size="sm"
                    className="text-[10px] h-7 border-border/30"
                    onClick={() => {
                      setTicker(s.ticker || '');
                      setInput(s.msg);
                    }}
                  >
                    <Sparkles className="w-2.5 h-2.5 mr-1 text-emerald-500" />
                    {s.label}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {/* Input area */}
          <div className="p-3 border-t border-border/30">
            <div className="flex gap-2">
              <Input
                placeholder="Shkruaj pyetjen tënde..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
                className="text-xs h-9"
              />
              <Button
                size="sm"
                onClick={handleSend}
                disabled={isLoading || !input.trim()}
                className="h-9 px-3"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
