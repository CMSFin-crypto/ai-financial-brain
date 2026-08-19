// Test StockAnalysis.com for float data extraction
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function testTicker(ticker) {
  console.log(`\n=== ${ticker} ===`);
  try {
    const res = await fetch(`https://stockanalysis.com/stocks/${ticker.toLowerCase()}/statistics/`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(10000),
    });
    console.log('Status:', res.status);
    if (res.status !== 200) return;
    
    const html = await res.text();
    
    // Find all occurrences of 'float' in the HTML
    let idx = 0;
    let count = 0;
    while ((idx = html.toLowerCase().indexOf('float', idx)) !== -1 && count < 10) {
      console.log(`\nFloat match at ${idx}:`);
      console.log(html.substring(idx - 80, idx + 120).replace(/<[^>]*>/g, ' '));
      idx += 5;
      count++;
    }
    
    // Also try to find shares outstanding
    let sIdx = 0;
    let sCount = 0;
    while ((sIdx = html.toLowerCase().indexOf('shares outstanding', sIdx)) !== -1 && sCount < 3) {
      console.log(`\nSharesOut at ${sIdx}:`);
      console.log(html.substring(sIdx - 50, sIdx + 150).replace(/<[^>]*>/g, ' '));
      sIdx += 17;
      sCount++;
    }
    
    // Try short interest
    let shIdx = 0;
    let shCount = 0;
    while ((shIdx = html.toLowerCase().indexOf('short interest', shIdx)) !== -1 && shCount < 3) {
      console.log(`\nShortInt at ${shIdx}:`);
      console.log(html.substring(shIdx - 50, shIdx + 150).replace(/<[^>]*>/g, ' '));
      shIdx += 14;
      shCount++;
    }
  } catch(e) {
    console.error('Error:', e.message);
  }
}

(async () => {
  await testTicker('AAPL');
  await testTicker('TSLA');
  // Test a small cap stock
  await testTicker('SNDL');
})();
