// Test multiple free float data sources
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function test(label, url, extraHeaders = {}) {
  try {
    console.log(`\n=== ${label} ===`);
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json', ...extraHeaders },
      signal: AbortSignal.timeout(10000),
    });
    console.log('Status:', res.status);
    const t = await res.text();
    console.log('Length:', t.length);
    if (t.length < 1000) {
      console.log('Body:', t.substring(0, 500));
    } else {
      // Search for float
      const floatMatch = t.match(/floatShares|float_shares|"float"/i);
      console.log('Contains float ref:', !!floatMatch);
      // Print structure hints
      const keys = t.match(/"[a-zA-Z]+":/g);
      if (keys) console.log('Top keys:', [...new Set(keys)].slice(0, 20).join(', '));
    }
  } catch(e) {
    console.error('Error:', e.message);
  }
}

(async () => {
  // 1. Finnhub (free demo key)
  await test('Finnhub fundamental', 'https://finnhub.io/api/v1/stock/fundamental?symbol=AAPL&token=demo');
  
  // 2. Finnhub stock basic
  await test('Finnhub quote', 'https://finnhub.io/api/v1/quote?symbol=AAPL&token=demo');

  // 3. FMP (Financial Modeling Prep)
  await test('FMP shares float', 'https://financialmodelingprep.com/api/v3/shares_float/AAPL?apikey=demo');
  
  // 4. FMP stock profile
  await test('FMP profile', 'https://financialmodelingprep.com/api/v3/profile/AAPL?apikey=demo');

  // 5. Yahoo Finance quote page scrape (HTML contains float data)
  console.log('\n=== Yahoo HTML scrape ===');
  try {
    const res = await fetch('https://finance.yahoo.com/quote/AAPL/key-statistics/', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(10000),
    });
    console.log('Status:', res.status);
    const html = await res.text();
    console.log('HTML length:', html.length);
    // Look for float in HTML
    const floatIdx = html.indexOf('floatShares');
    if (floatIdx > -1) {
      console.log('Found floatShares at index', floatIdx);
      console.log('Context:', html.substring(floatIdx - 50, floatIdx + 100));
    } else {
      // Try to find float in data
      const fIdx = html.indexOf('"Float"');
      if (fIdx > -1) {
        console.log('Found Float string at', fIdx);
        console.log('Context:', html.substring(fIdx - 20, fIdx + 200));
      } else {
        console.log('Float not found in HTML');
        // Check if it's a login page or blocked
        if (html.includes('consent') || html.includes('cookie')) {
          console.log('Appears to be cookie/consent wall');
        }
      }
    }
  } catch(e) {
    console.error('Scrape error:', e.message);
  }

  // 6. StockAnalysis.com
  console.log('\n=== StockAnalysis.com ===');
  try {
    const res = await fetch('https://stockanalysis.com/stocks/aapl/statistics/', {
      headers: { 'User-Agent': UA, 'Accept': 'text/html' },
      signal: AbortSignal.timeout(10000),
    });
    console.log('Status:', res.status);
    const html = await res.text();
    console.log('HTML length:', html.length);
    const fIdx = html.toLowerCase().indexOf('float');
    if (fIdx > -1) {
      console.log('Found float at', fIdx);
      console.log('Context:', html.substring(fIdx - 30, fIdx + 150));
    }
  } catch(e) {
    console.error('Error:', e.message);
  }
})();
