// Test the new StockAnalysis fetcher
const { fetchYahooFloat, fetchYahooFloatBatch } = require('../src/lib/yahoo-float-fetcher.ts');

// Can't import TS directly, so test the logic inline
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function parseShareValue(str) {
  if (!str || str === 'n/a') return null;
  const cleaned = str.replace(/,/g, '').trim();
  const bMatch = cleaned.match(/^([\d.]+)\s*B$/i);
  if (bMatch) return parseFloat(bMatch[1]) * 1e9;
  const mMatch = cleaned.match(/^([\d.]+)\s*M$/i);
  if (mMatch) return parseFloat(mMatch[1]) * 1e6;
  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}

async function fetchFloat(ticker) {
  const url = `https://stockanalysis.com/stocks/${ticker.toLowerCase()}/statistics/`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': BROWSER_UA, 'Accept': 'text/html' },
  });
  if (!res.ok) return null;
  const html = await res.text();
  
  const dataMap = new Map();
  const regex = /\{id:"([^"]+)",title:"[^"]*",value:"([^"]*)",hover:"([^"]*)"\}/g;
  let match;
  while ((match = regex.exec(html)) !== null) {
    dataMap.set(match[1], { value: match[2], hover: match[3] });
  }

  const floatObj = dataMap.get('float');
  const sharesObj = dataMap.get('sharesOutClass');
  const shortFloatObj = dataMap.get('shortFloat');
  const shortRatioObj = dataMap.get('shortRatio');

  const floatShares = floatObj ? (parseShareValue(floatObj.hover) || parseShareValue(floatObj.value)) : null;
  const sharesOutstanding = sharesObj ? (parseShareValue(sharesObj.hover) || parseShareValue(sharesObj.value)) : null;
  const shortPct = shortFloatObj && shortFloatObj.value !== 'n/a' ? parseFloat(shortFloatObj.hover) : null;
  const shortRatio = shortRatioObj && shortRatioObj.value !== 'n/a' ? parseFloat(shortRatioObj.hover) : null;

  return {
    ticker,
    floatShares,
    floatM: floatShares ? (floatShares / 1e6).toFixed(2) + 'M' : null,
    sharesOutM: sharesOutstanding ? (sharesOutstanding / 1e6).toFixed(2) + 'M' : null,
    shortPctOfFloat: shortPct,
    shortRatio,
  };
}

(async () => {
  const tickers = ['AAPL', 'TSLA', 'SNDL', 'GME', 'CLSK', 'FUBO', 'NVAX'];
  for (const t of tickers) {
    const r = await fetchFloat(t);
    console.log(r ? `${r.ticker}: Float=${r.floatM}, Out=${r.sharesOutM}, Short%=${r.shortPctOfFloat}, DTC=${r.shortRatio}` : `${t}: FAILED`);
    await new Promise(r => setTimeout(r, 300));
  }
})();
