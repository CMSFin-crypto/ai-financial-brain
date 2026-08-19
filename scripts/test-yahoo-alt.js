// Test alternative Yahoo endpoints that might not need crumb

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

async function test(label, url) {
  try {
    console.log(`\n=== ${label} ===`);
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept': 'application/json' },
      signal: AbortSignal.timeout(10000),
    });
    console.log('Status:', res.status);
    const t = await res.text();
    console.log('Length:', t.length);
    console.log('First 400:', t.substring(0, 400));
  } catch(e) {
    console.error('Error:', e.message);
  }
}

(async () => {
  // 1. Yahoo v8 chart (sometimes includes quote data)
  await test('v8 chart', 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?range=1d&interval=1d&includePrePost=false');

  // 2. Yahoo quoteSummary with crumb fetch first
  await test('v10 quoteSummary query2', 'https://query2.finance.yahoo.com/v10/finance/quoteSummary/AAPL?modules=defaultKeyStatistics&crumb=test&corsDomain=finance.yahoo.com');

  // 3. Yahoo spark endpoint
  await test('spark', 'https://query1.finance.yahoo.com/v8/finance/spark?symbols=AAPL&range=1d&interval=5m');

  // 4. Try getting crumb first
  console.log('\n=== CRUMB FETCH ===');
  try {
    const crumbRes = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10000),
    });
    console.log('Crumb status:', crumbRes.status);
    const crumb = await crumbRes.text();
    console.log('Crumb value:', crumb);
    
    if (crumb && crumb.length > 0 && crumb.length < 100) {
      // Now try with crumb
      const cookieRes = await fetch('https://query2.finance.yahoo.com/v10/finance/quoteSummary/AAPL?modules=defaultKeyStatistics,summaryDetail&crumb=' + encodeURIComponent(crumb) + '&corsDomain=finance.yahoo.com', {
        headers: { 'User-Agent': UA, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10000),
      });
      console.log('With crumb status:', cookieRes.status);
      const data = await cookieRes.text();
      console.log('With crumb length:', data.length);
      if (data.includes('quoteSummary')) {
        const j = JSON.parse(data);
        const stats = j.quoteSummary?.result?.[0]?.defaultKeyStatistics || {};
        console.log('SUCCESS! floatShares:', JSON.stringify(stats.floatShares));
        console.log('sharesOutstanding:', JSON.stringify(stats.sharesOutstanding));
      } else {
        console.log('Response:', data.substring(0, 300));
      }
    }
  } catch(e) {
    console.error('Crumb error:', e.message);
  }
})();
