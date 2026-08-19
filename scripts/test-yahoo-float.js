// Test Yahoo Finance float API
const url1 = 'https://query2.finance.yahoo.com/v10/finance/quoteSummary/AAPL?modules=defaultKeyStatistics,summaryDetail,financialData&corsDomain=finance.yahoo.com';
const url2 = 'https://query1.finance.yahoo.com/v10/finance/quoteSummary/AAPL?modules=defaultKeyStatistics,summaryDetail,financialData&corsDomain=finance.yahoo.com';

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

async function test(label, url) {
  try {
    console.log(`\n--- ${label} ---`);
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
    console.log('Status:', res.status, res.statusText);
    console.log('Headers:', Object.fromEntries([...res.headers.entries()].slice(0, 10)));
    const text = await res.text();
    console.log('Response length:', text.length);
    console.log('First 300 chars:', text.substring(0, 300));
    
    if (text.includes('quoteSummary')) {
      const j = JSON.parse(text);
      const r = j.quoteSummary?.result?.[0];
      if (r) {
        const stats = r.defaultKeyStatistics || {};
        console.log('floatShares:', JSON.stringify(stats.floatShares));
        console.log('sharesOutstanding:', JSON.stringify(stats.sharesOutstanding));
        console.log('shortPercentOfFloat:', JSON.stringify(stats.shortPercentOfFloat));
      } else {
        console.log('No result in quoteSummary');
      }
    } else if (text.includes('Unauthorized') || res.status === 401) {
      console.log('UNAUTHORIZED - needs crumb/cookie');
    }
  } catch (e) {
    console.error('Error:', e.message);
  }
}

(async () => {
  await test('query2', url1);
  await test('query1', url2);
})();
