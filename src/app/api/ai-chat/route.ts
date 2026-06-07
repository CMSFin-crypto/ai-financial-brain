import { NextRequest, NextResponse } from 'next/server';
import { callAI } from '@/lib/ai';
import { getStock, getOrCreateStock } from '@/lib/market-data';
import { getRealPrices } from '@/lib/alpha-vantage';

export const maxDuration = 60;

const SYSTEM_PROMPT = `You are an expert financial analyst AI assistant. You have access to real-time stock data, technical analysis, fundamental analysis, and market news.

Your capabilities:
- Analyze any stock with technical + fundamental analysis
- Explain market trends, sectors, macro factors
- Compare stocks and sectors
- Explain financial concepts (P/E, RSI, MACD, etc.)
- Give balanced opinions with risks

Rules:
- ALWAYS respond in Albanian language
- Be concise but informative (2-4 paragraphs max)
- Use bullet points for lists
- Always mention risks alongside opportunities
- If asked about a specific stock, give a balanced view
- Never give definitive buy/sell recommendations without caveats`;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { messages, ticker } = body as {
      messages: Array<{ role: 'user' | 'assistant'; content: string }>;
      ticker?: string;
    };

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'Asnjë mesazh nuk u dërgua.' }, { status: 400 });
    }

    // Build context from stock data if ticker provided
    let stockContext = '';
    if (ticker) {
      // First try static database, then dynamically create profile if needed
      const stock = getStock(ticker.toUpperCase()) || await getOrCreateStock(ticker.toUpperCase());
      if (stock) {
        const isDynamic = !getStock(ticker.toUpperCase());
        stockContext = `\n\n═══ STOCK DATA for ${stock.ticker}: ${stock.company} ═══\n` +
          `Sector: ${stock.sector} | Industry: ${stock.industry}\n` +
          `Price: $${stock.price} | Change: ${stock.change >= 0 ? '+' : ''}${stock.change}%\n` +
          `Market Cap: ${stock.marketCap} | Volume: ${stock.volume}\n` +
          (isDynamic ? `⏳ Ky aksion nuk është në bazën tonë të plotë të dhënash. Çmimet janë live nga Yahoo Finance.\n` : '') +
          `P/E: ${stock.pe} | Forward P/E: ${stock.fwdPE} | PEG: ${stock.peg}\n` +
          `Gross Margin: ${stock.grossMargin} | Operating Margin: ${stock.opMargin} | Net Margin: ${stock.netMargin}\n` +
          `ROE: ${stock.roe} | ROA: ${stock.roa}\n` +
          `EPS: ${stock.eps} | Forward EPS: ${stock.fwdEps}\n` +
          `Revenue Growth: ${stock.revGrowth} | EPS Growth: ${stock.epsGrowth}\n` +
          `Dividend Yield: ${stock.divYield}\n` +
          `FCF: ${stock.fcf}\n` +
          `Signal: ${stock.signal} | Trend: ${stock.trend}\n` +
          `Strengths: ${stock.strengths.join(', ')}\n` +
          `Weaknesses: ${stock.weaknesses.join(', ')}\n` +
          `Position: ${stock.position}`;
      } else {
        // Even if we can't get any data, tell the AI so it can use its knowledge
        stockContext = `\n\n═══ STOCK LOOKUP for ${ticker.toUpperCase()} ═══\n` +
          `Ky aksion nuk u gjet në bazën tonë të dhënash dhe Yahoo Finance nuk u arrit të kontaktohej.\n` +
          `Përdor njohuritë e tua të përgjithshme për të dhënë një analizë sa më të mirë.`;
      }
    }

    // Fetch real-time prices for major tickers
    let priceContext = '';
    try {
      const majorTickers = ['AAPL', 'NVDA', 'MSFT', 'GOOGL', 'AMZN', 'META', 'TSLA', 'SPY', 'QQQ'];
      const prices = await getRealPrices(majorTickers);
      const priceEntries = Object.entries(prices);
      if (priceEntries.length > 0) {
        priceContext = '\n\n═══ CURRENT MARKET PRICES ═══\n' +
          priceEntries.map(([t, p]) => `${t}: $${p.price.toFixed(2)} (${p.change >= 0 ? '+' : ''}${p.change.toFixed(2)}%)`).join('\n');
      }
    } catch {
      // Price fetching is best-effort
    }

    // Build conversation history as a single user message
    const conversationHistory = messages
      .map(m => `${m.role === 'user' ? 'Përdoruesi' : 'Asistenti'}: ${m.content}`)
      .join('\n\n');

    const latestUserMessage = messages[messages.length - 1].content;

    const userMessage = `Conversation history:\n${conversationHistory}\n\nLatest question: ${latestUserMessage}${stockContext}${priceContext}\n\nRespond to the latest question in Albanian.`;

    const response = await callAI({
      systemPrompt: SYSTEM_PROMPT,
      userMessage,
      temperature: 0.7,
      maxTokens: 2000,
      timeoutMs: 25000,
    });

    return NextResponse.json({ response });
  } catch (error) {
    console.error('[AI-CHAT] Error:', error);
    const message = error instanceof Error ? error.message : 'Gabim i panjohur';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
