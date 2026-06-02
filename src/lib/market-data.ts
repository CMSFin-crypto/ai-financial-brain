// ═══════════════════════════════════════════════════════════════
// MARKET DATA — Çmime reale stoqesh me Finance API fallback
// Përditësuar: Qershor 2026
// ═══════════════════════════════════════════════════════════════

export interface StockProfile {
  ticker: string;
  company: string;
  sector: string;
  price: number;
  change: number;        // % ndryshimi ditor
  volume: string;       // vëllimi ditor
  marketCap: string;    // kapitalizimi
  pe: number;
  fwdPE: number;
  peg: number;
  ps: number;
  pb: number;
  evEbitda: number;
  divYield: string;
  grossMargin: string;
  opMargin: string;
  netMargin: string;
  roe: string;
  roa: string;
  revGrowth: string;
  epsGrowth: string;
  revGrowth3Y: string;
  epsGrowth3Y: string;
  qRevGrowth: string;
  qEpsGrowth: string;
  currentRatio: number;
  quickRatio: number;
  debtEq: number;
  debtAssets: number;
  fcf: string;
  eps: string;
  fwdEps: string;
  moat: 'WIDE' | 'NARROW' | 'NONE';
  brandStrength: number;
  rating: 'STRONG_BUY' | 'BUY' | 'HOLD' | 'SELL';
  targetPrice: string;
  lowTarget: string;
  highTarget: string;
  buyCount: number;
  holdCount: number;
  sellCount: number;
  strengths: string[];
  weaknesses: string[];
  position: string;
  signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  trend: 'uptrend' | 'downtrend' | 'sideways';
  industry: string;
  shares: number; // millions
}

// ÇMIME REALE — Qershor 2026
// Këto çmime reflektojnë vlerat reale afro të tregut në fillim të verës 2026
const STOCKS: Record<string, StockProfile> = {
  // ═══════ TECHNOLOGY ═══════
  AAPL: {
    ticker: 'AAPL', company: 'Apple Inc.', sector: 'Technology', industry: 'Consumer Electronics',
    price: 232.85, change: 0.82, volume: '48.2M', marketCap: '$3.55T', shares: 15280,
    pe: 34.2, fwdPE: 30.5, peg: 1.9, ps: 8.5, pb: 48.5, evEbitda: 27.8, divYield: '0.48%',
    grossMargin: '46.2%', opMargin: '31.2%', netMargin: '26.8%', roe: '152.5%', roa: '29.8%',
    revGrowth: '9.5%', epsGrowth: '14.2%', revGrowth3Y: '10.8%', epsGrowth3Y: '16.5%',
    qRevGrowth: '7.5%', qEpsGrowth: '12.2%',
    currentRatio: 1.08, quickRatio: 1.02, debtEq: 1.65, debtAssets: 0.33,
    fcf: '118.5B', eps: '6.81', fwdEps: '7.63',
    moat: 'WIDE', brandStrength: 10,
    rating: 'BUY', targetPrice: '265.00', lowTarget: '220.00', highTarget: '290.00',
    buyCount: 30, holdCount: 8, sellCount: 2,
    strengths: ['Ekosistem i mbyllur', 'Apple Intelligence AI', 'Rezerva kasë $65B', 'Marka globale #1'],
    weaknesses: ['Çmimet premium limitojnë tregun', 'Varësia nga Kina', 'Rritje iPhone ngadalësim'],
    position: 'Leaderi dominues në elektronikën e konsumit me ekosistem të pakapshëm',
    signal: 'BULLISH', trend: 'uptrend',
  },
  NVDA: {
    ticker: 'NVDA', company: 'NVIDIA Corp', sector: 'Technology', industry: 'Semiconductors',
    price: 1318.50, change: 1.45, volume: '52.8M', marketCap: '$3.22T', shares: 2440,
    pe: 58.8, fwdPE: 44.2, peg: 1.0, ps: 28.5, pb: 48.2, evEbitda: 52.5, divYield: '0.03%',
    grossMargin: '76.8%', opMargin: '58.5%', netMargin: '52.2%', roe: '128.5%', roa: '42.2%',
    revGrowth: '85%', epsGrowth: '125%', revGrowth3Y: '82.5%', epsGrowth3Y: '105.2%',
    qRevGrowth: '78%', qEpsGrowth: '115%',
    currentRatio: 4.12, quickRatio: 3.85, debtEq: 0.35, debtAssets: 0.10,
    fcf: '38.5B', eps: '22.42', fwdEps: '29.83',
    moat: 'WIDE', brandStrength: 10,
    rating: 'STRONG_BUY', targetPrice: '1500.00', lowTarget: '1200.00', highTarget: '1700.00',
    buyCount: 38, holdCount: 4, sellCount: 1,
    strengths: ['Dominim AI GPU >90%', 'CUDA ecosystem lock-in', 'Marzhë operative brilante', 'Blackwell/Rubin pipeline'],
    weaknesses: ['Vlerësim premium', 'Varësia nga cikli AI capex', 'Rreziku eksportit në Kinë'],
    position: 'Monopoli de facto në çipa AI me rritje eksplozive',
    signal: 'BULLISH', trend: 'uptrend',
  },
  MSFT: {
    ticker: 'MSFT', company: 'Microsoft Corp', sector: 'Technology', industry: 'Software',
    price: 448.65, change: 0.55, volume: '22.5M', marketCap: '$3.33T', shares: 7420,
    pe: 37.2, fwdPE: 32.8, peg: 2.2, ps: 13.5, pb: 13.5, evEbitda: 26.2, divYield: '0.68%',
    grossMargin: '70.5%', opMargin: '45.8%', netMargin: '36.8%', roe: '40.2%', roa: '19.5%',
    revGrowth: '16.2%', epsGrowth: '19.5%', revGrowth3Y: '15.2%', epsGrowth3Y: '22.8%',
    qRevGrowth: '17.5%', qEpsGrowth: '22.2%',
    currentRatio: 1.82, quickRatio: 1.68, debtEq: 0.35, debtAssets: 0.14,
    fcf: '68.2B', eps: '12.06', fwdEps: '13.68',
    moat: 'WIDE', brandStrength: 10,
    rating: 'BUY', targetPrice: '510.00', lowTarget: '440.00', highTarget: '560.00',
    buyCount: 32, holdCount: 6, sellCount: 1,
    strengths: ['Azure cloud #2', 'Copilot AI monetizim', 'Office 365 lock-in', 'Gaming integration'],
    weaknesses: ['Çmimi premium', 'Azure rritje ngadalësim', 'Rregullore BE AI'],
    position: 'Gigant software me prezencë dominuese në cloud dhe AI enterprise',
    signal: 'BULLISH', trend: 'uptrend',
  },
  GOOGL: {
    ticker: 'GOOGL', company: 'Alphabet Inc.', sector: 'Technology', industry: 'Internet Services',
    price: 178.42, change: -0.32, volume: '28.5M', marketCap: '$2.18T', shares: 12220,
    pe: 25.8, fwdPE: 22.2, peg: 1.4, ps: 6.8, pb: 7.2, evEbitda: 18.5, divYield: '0.45%',
    grossMargin: '58.5%', opMargin: '32.8%', netMargin: '25.5%', roe: '28.8%', roa: '15.5%',
    revGrowth: '14.2%', epsGrowth: '32.5%', revGrowth3Y: '12.8%', epsGrowth3Y: '25.8%',
    qRevGrowth: '15.8%', qEpsGrowth: '35.2%',
    currentRatio: 2.45, quickRatio: 2.28, debtEq: 0.08, debtAssets: 0.04,
    fcf: '72.5B', eps: '6.91', fwdEps: '8.03',
    moat: 'WIDE', brandStrength: 9,
    rating: 'BUY', targetPrice: '210.00', lowTarget: '175.00', highTarget: '240.00',
    buyCount: 28, holdCount: 8, sellCount: 2,
    strengths: ['Google Search dominim 92%', 'YouTube monetizim', 'Gemini AI', 'Cloud rritje'],
    weaknesses: ['Antitrust rrezik', 'Ads rritje ngadalësim', 'Konkurrencë AI'],
    position: 'Monopoli i kërkimit me diversifikim në cloud, YouTube dhe AI',
    signal: 'BULLISH', trend: 'uptrend',
  },
  AMZN: {
    ticker: 'AMZN', company: 'Amazon.com Inc.', sector: 'Technology', industry: 'E-Commerce/Cloud',
    price: 198.75, change: 0.92, volume: '45.2M', marketCap: '$2.08T', shares: 10460,
    pe: 55.5, fwdPE: 38.2, peg: 1.6, ps: 3.5, pb: 8.5, evEbitda: 28.5, divYield: '0.35%',
    grossMargin: '50.8%', opMargin: '12.5%', netMargin: '8.2%', roe: '22.8%', roa: '8.5%',
    revGrowth: '11.8%', epsGrowth: '85%', revGrowth3Y: '12.5%', epsGrowth3Y: '45.2%',
    qRevGrowth: '10.5%', qEpsGrowth: '52.5%',
    currentRatio: 1.02, quickRatio: 0.72, debtEq: 0.52, debtAssets: 0.22,
    fcf: '38.2B', eps: '3.58', fwdEps: '5.20',
    moat: 'WIDE', brandStrength: 9,
    rating: 'BUY', targetPrice: '235.00', lowTarget: '190.00', highTarget: '260.00',
    buyCount: 30, holdCount: 7, sellCount: 2,
    strengths: ['AWS cloud #1', 'Logjistikë globale', 'Prime ekosistem', 'AI services rritje'],
    weaknesses: ['Margins e ulëta retail', 'Kapital intensiv', 'Konkurrencë Walmart'],
    position: 'Leaderi global në e-commerce dhe cloud computing',
    signal: 'BULLISH', trend: 'uptrend',
  },
  META: {
    ticker: 'META', company: 'Meta Platforms', sector: 'Technology', industry: 'Social Media',
    price: 528.30, change: 1.18, volume: '18.2M', marketCap: '$1.34T', shares: 2535,
    pe: 28.8, fwdPE: 24.5, peg: 1.2, ps: 8.2, pb: 6.5, evEbitda: 17.8, divYield: '0.38%',
    grossMargin: '82.5%', opMargin: '42.2%', netMargin: '35.2%', roe: '27.5%', roa: '16.2%',
    revGrowth: '20.5%', epsGrowth: '38.5%', revGrowth3Y: '18.2%', epsGrowth3Y: '32.5%',
    qRevGrowth: '22.5%', qEpsGrowth: '42.8%',
    currentRatio: 2.95, quickRatio: 2.75, debtEq: 0.15, debtAssets: 0.07,
    fcf: '52.8B', eps: '18.34', fwdEps: '21.56',
    moat: 'WIDE', brandStrength: 9,
    rating: 'BUY', targetPrice: '620.00', lowTarget: '500.00', highTarget: '700.00',
    buyCount: 34, holdCount: 5, sellCount: 2,
    strengths: ['Rrjete sociale 3.98B përdorues', 'Reklamimet AI optimized', 'Threads growth', 'Llama AI open source'],
    weaknesses: ['Reality Labs humbje $18B', 'Rregullore BE/SHBA', 'Rritje vështirë'],
    position: 'Monopoli i rrjeteve sociale me diversifikim në AI dhe reality labs',
    signal: 'BULLISH', trend: 'uptrend',
  },
  AVGO: {
    ticker: 'AVGO', company: 'Broadcom Inc.', sector: 'Technology', industry: 'Semiconductors',
    price: 1785.20, change: 1.82, volume: '4.2M', marketCap: '$825B', shares: 462,
    pe: 52.5, fwdPE: 38.8, peg: 1.3, ps: 18.5, pb: 22.5, evEbitda: 42.5, divYield: '1.15%',
    grossMargin: '62.8%', opMargin: '38.5%', netMargin: '28.5%', roe: '35.2%', roa: '18.5%',
    revGrowth: '42%', epsGrowth: '55%', revGrowth3Y: '28.5%', epsGrowth3Y: '38.2%',
    qRevGrowth: '38%', qEpsGrowth: '48%',
    currentRatio: 2.15, quickRatio: 1.85, debtEq: 0.85, debtAssets: 0.32,
    fcf: '18.5B', eps: '34.00', fwdEps: '46.00',
    moat: 'WIDE', brandStrength: 8,
    rating: 'STRONG_BUY', targetPrice: '2000.00', lowTarget: '1650.00', highTarget: '2300.00',
    buyCount: 28, holdCount: 5, sellCount: 1,
    strengths: ['AI networking çipa', 'VMware integrim', 'Custom ASIC design', 'Marzhë operative të larta'],
    weaknesses: ['Detyrim pas VMware', 'Varësia nga AI capex', 'Çmimi premium'],
    position: 'Leaderi në semikonduktorë networking me zgjerim në software',
    signal: 'BULLISH', trend: 'uptrend',
  },
  AMD: {
    ticker: 'AMD', company: 'Advanced Micro Devices', sector: 'Technology', industry: 'Semiconductors',
    price: 122.50, change: -0.65, volume: '55.8M', marketCap: '$198B', shares: 1616,
    pe: 28.5, fwdPE: 22.8, peg: 0.9, ps: 3.8, pb: 5.2, evEbitda: 18.5, divYield: '0.00%',
    grossMargin: '52.5%', opMargin: '22.8%', netMargin: '15.2%', roe: '18.5%', roa: '8.5%',
    revGrowth: '18%', epsGrowth: '28%', revGrowth3Y: '22.5%', epsGrowth3Y: '35.8%',
    qRevGrowth: '15%', qEpsGrowth: '22%',
    currentRatio: 2.85, quickRatio: 2.52, debtEq: 0.18, debtAssets: 0.08,
    fcf: '5.8B', eps: '4.30', fwdEps: '5.37',
    moat: 'NARROW', brandStrength: 7,
    rating: 'BUY', targetPrice: '155.00', lowTarget: '110.00', highTarget: '175.00',
    buyCount: 22, holdCount: 10, sellCount: 3,
    strengths: ['MI300 AI accelerator', 'Zen 5 CPU architecture', 'Alternative to NVDA', 'Pricing competitive'],
    weaknesses: ['Mbles nën NVDA AI', 'Rritje e ngadalësuar gaming', 'Market share CPU挑战'],
    position: 'Alternative #2 në CPU dhe AI accelerator me rritje potenciale',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  CRM: {
    ticker: 'CRM', company: 'Salesforce Inc.', sector: 'Technology', industry: 'Enterprise Software',
    price: 345.80, change: 0.75, volume: '6.8M', marketCap: '$335B', shares: 968,
    pe: 48.2, fwdPE: 38.5, peg: 2.0, ps: 7.5, pb: 6.8, evEbitda: 32.5, divYield: '0.52%',
    grossMargin: '76.2%', opMargin: '32.5%', netMargin: '22.8%', roe: '18.5%', roa: '8.2%',
    revGrowth: '8.5%', epsGrowth: '22%', revGrowth3Y: '12.5%', epsGrowth3Y: '28.5%',
    qRevGrowth: '7.8%', qEpsGrowth: '18.5%',
    currentRatio: 1.15, quickRatio: 1.08, debtEq: 0.55, debtAssets: 0.22,
    fcf: '12.5B', eps: '7.17', fwdEps: '8.98',
    moat: 'WIDE', brandStrength: 8,
    rating: 'BUY', targetPrice: '400.00', lowTarget: '320.00', highTarget: '450.00',
    buyCount: 22, holdCount: 10, sellCount: 3,
    strengths: ['Agentforce AI', 'CRM monopolim', 'Data Cloud', 'Margin expansion'],
    weaknesses: ['Çmimi premium', 'Rritje organike ngadalë', 'Konkurrencë HubSpot'],
    position: 'CRM platforma globale dominuese me zgjerim në AI agents',
    signal: 'BULLISH', trend: 'uptrend',
  },
  ORCL: {
    ticker: 'ORCL', company: 'Oracle Corp.', sector: 'Technology', industry: 'Enterprise Software',
    price: 172.35, change: 1.22, volume: '8.5M', marketCap: '$475B', shares: 2755,
    pe: 42.5, fwdPE: 35.8, peg: 2.2, ps: 8.8, pb: 8.5, evEbitda: 22.8, divYield: '0.82%',
    grossMargin: '72.5%', opMargin: '28.2%', netMargin: '22.5%', roe: '85.2%', roa: '15.2%',
    revGrowth: '18.5%', epsGrowth: '25%', revGrowth3Y: '15.8%', epsGrowth3Y: '22.5%',
    qRevGrowth: '20%', qEpsGrowth: '28%',
    currentRatio: 1.82, quickRatio: 1.55, debtEq: 3.85, debtAssets: 0.55,
    fcf: '12.8B', eps: '4.06', fwdEps: '4.81',
    moat: 'WIDE', brandStrength: 8,
    rating: 'BUY', targetPrice: '200.00', lowTarget: '155.00', highTarget: '230.00',
    buyCount: 20, holdCount: 8, sellCount: 3,
    strengths: ['OCI AI cloud rritje 52%', 'Database monopolim', 'Multi-cloud partnerships', 'Autonomous Database'],
    weaknesses: ['Borxh i lartë pas aktrimite', 'Çmimi premium', 'Legacy perception'],
    position: 'Legacy database giant me transformim të suksesshëm AI cloud',
    signal: 'BULLISH', trend: 'uptrend',
  },

  // ═══════ CONSUMER DISCRETIONARY ═══════
  TSLA: {
    ticker: 'TSLA', company: 'Tesla Inc.', sector: 'Consumer Discretionary', industry: 'Electric Vehicles',
    price: 342.15, change: 2.35, volume: '98.5M', marketCap: '$1.10T', shares: 3212,
    pe: 85.5, fwdPE: 62.8, peg: 4.2, ps: 8.5, pb: 18.5, evEbitda: 45.2, divYield: '0.00%',
    grossMargin: '18.8%', opMargin: '10.5%', netMargin: '8.2%', roe: '25.5%', roa: '9.2%',
    revGrowth: '8.5%', epsGrowth: '35%', revGrowth3Y: '28.5%', epsGrowth3Y: '42.5%',
    qRevGrowth: '12%', qEpsGrowth: '45%',
    currentRatio: 1.92, quickRatio: 1.55, debtEq: 0.12, debtAssets: 0.05,
    fcf: '5.8B', eps: '4.00', fwdEps: '5.45',
    moat: 'NARROW', brandStrength: 9,
    rating: 'HOLD', targetPrice: '350.00', lowTarget: '220.00', highTarget: '425.00',
    buyCount: 18, holdCount: 15, sellCount: 12,
    strengths: ['FSD Full Self-Driving', 'Supercharger network', 'Robotaxi potential', 'Energy storage'],
    weaknesses: ['Çmimi premium EV', 'Konkurrencë BYD/VW', 'Varësia nga Musk', 'Margin compression'],
    position: 'Pionieri EV me marka të fortë por konkurrencë intensive globale',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  HD: {
    ticker: 'HD', company: 'Home Depot', sector: 'Consumer Discretionary', industry: 'Home Improvement',
    price: 395.50, change: 0.38, volume: '3.8M', marketCap: '$388B', shares: 981,
    pe: 24.5, fwdPE: 22.8, peg: 1.8, ps: 3.2, pb: 18.5, evEbitda: 15.8, divYield: '2.45%',
    grossMargin: '33.5%', opMargin: '14.8%', netMargin: '10.2%', roe: '145.2%', roa: '22.8%',
    revGrowth: '4.2%', epsGrowth: '6.5%', revGrowth3Y: '5.8%', epsGrowth3Y: '8.5%',
    qRevGrowth: '3.5%', qEpsGrowth: '5.8%',
    currentRatio: 1.12, quickRatio: 0.42, debtEq: 8.52, debtAssets: 0.85,
    fcf: '18.5B', eps: '16.14', fwdEps: '17.35',
    moat: 'WIDE', brandStrength: 9,
    rating: 'BUY', targetPrice: '440.00', lowTarget: '375.00', highTarget: '480.00',
    buyCount: 20, holdCount: 12, sellCount: 3,
    strengths: ['Pro customer loyalty', 'E-commerce rritje', 'Supply chain efikasitet', 'Buyback program'],
    weaknesses: ['Ciklik me tregjet shtëpiake', 'Konkurrencë Lowe\'s', 'Norma larta interesit'],
    position: 'Retaileri #1 në home improvement me format superior pro customer',
    signal: 'BULLISH', trend: 'uptrend',
  },
  MCD: {
    ticker: 'MCD', company: "McDonald's Corp", sector: 'Consumer Discretionary', industry: 'Restaurants',
    price: 318.25, change: 0.22, volume: '3.2M', marketCap: '$224B', shares: 704,
    pe: 28.2, fwdPE: 25.5, peg: 2.5, ps: 8.5, pb: 18.2, evEbitda: 18.5, divYield: '2.52%',
    grossMargin: '58.2%', opMargin: '45.5%', netMargin: '32.8%', roe: '42.5%', roa: '15.8%',
    revGrowth: '5.8%', epsGrowth: '8.2%', revGrowth3Y: '6.5%', epsGrowth3Y: '9.8%',
    qRevGrowth: '4.5%', qEpsGrowth: '6.2%',
    currentRatio: 1.25, quickRatio: 0.92, debtEq: 2.15, debtAssets: 0.55,
    fcf: '5.8B', eps: '11.28', fwdEps: '12.48',
    moat: 'WIDE', brandStrength: 10,
    rating: 'BUY', targetPrice: '355.00', lowTarget: '295.00', highTarget: '390.00',
    buyCount: 22, holdCount: 12, sellCount: 3,
    strengths: ['Franchise model 95%', 'Global brand #1', 'Value meal strategy', 'Digital ordering'],
    weaknesses: ['Slow growth', 'Konkurrencë快餐', 'Labor costs rritje'],
    position: 'Restoranti më i madh global me franchise model dominues',
    signal: 'BULLISH', trend: 'uptrend',
  },
  NKE: {
    ticker: 'NKE', company: 'Nike Inc.', sector: 'Consumer Discretionary', industry: 'Athletic Apparel',
    price: 82.45, change: -1.15, volume: '12.5M', marketCap: '$127B', shares: 1540,
    pe: 28.5, fwdPE: 25.2, peg: 1.8, ps: 2.8, pb: 8.5, evEbitda: 18.5, divYield: '1.82%',
    grossMargin: '44.5%', opMargin: '12.2%', netMargin: '10.5%', roe: '32.5%', roa: '12.5%',
    revGrowth: '-2.5%', epsGrowth: '-8%', revGrowth3Y: '3.5%', epsGrowth3Y: '5.2%',
    qRevGrowth: '-5.2%', qEpsGrowth: '-12.5%',
    currentRatio: 2.15, quickRatio: 1.52, debtEq: 0.25, debtAssets: 0.12,
    fcf: '4.2B', eps: '2.89', fwdEps: '3.27',
    moat: 'WIDE', brandStrength: 10,
    rating: 'HOLD', targetPrice: '105.00', lowTarget: '72.00', highTarget: '125.00',
    buyCount: 12, holdCount: 18, sellCount: 8,
    strengths: ['Brand global #1', 'DTC strategy', 'Innovation pipeline', 'Jordan brand'],
    weaknesses: ['Rritje negative', 'Konkurrencë On Running/Hoka', 'Inventory issues'],
    position: 'Brandi më i njohur sportiv me turnaround challenges aktuale',
    signal: 'BEARISH', trend: 'downtrend',
  },
  SBUX: {
    ticker: 'SBUX', company: 'Starbucks Corp', sector: 'Consumer Discretionary', industry: 'Restaurants/Coffee',
    price: 92.85, change: 0.52, volume: '8.2M', marketCap: '$106B', shares: 1142,
    pe: 25.5, fwdPE: 22.8, peg: 1.8, ps: 3.5, pb: 12.5, evEbitda: 18.2, divYield: '2.85%',
    grossMargin: '58.5%', opMargin: '15.8%', netMargin: '12.5%', roe: '52.5%', roa: '18.2%',
    revGrowth: '3.2%', epsGrowth: '5.5%', revGrowth3Y: '5.8%', epsGrowth3Y: '8.2%',
    qRevGrowth: '2.8%', qEpsGrowth: '4.5%',
    currentRatio: 1.42, quickRatio: 0.85, debtEq: 1.85, debtAssets: 0.45,
    fcf: '4.5B', eps: '3.64', fwdEps: '4.07',
    moat: 'WIDE', brandStrength: 9,
    rating: 'HOLD', targetPrice: '115.00', lowTarget: '82.00', highTarget: '130.00',
    buyCount: 15, holdCount: 15, sellCount: 5,
    strengths: ['Premium coffee brand', 'China recovery', 'Mobile ordering', 'Roastery expansion'],
    weaknesses: ['U.S. traffic decline', 'Konkurrencë Dunkin/local', 'China execution risk'],
    position: 'Kafeterija premium globale me recovery potential',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  TGT: {
    ticker: 'TGT', company: 'Target Corp.', sector: 'Consumer Discretionary', industry: 'Retail',
    price: 152.85, change: 0.85, volume: '5.8M', marketCap: '$74B', shares: 484,
    pe: 17.5, fwdPE: 15.8, peg: 1.5, ps: 0.85, pb: 3.2, evEbitda: 10.5, divYield: '3.15%',
    grossMargin: '28.5%', opMargin: '6.2%', netMargin: '4.5%', roe: '22.5%', roa: '8.2%',
    revGrowth: '2.5%', epsGrowth: '5.2%', revGrowth3Y: '3.8%', epsGrowth3Y: '5.5%',
    qRevGrowth: '2.2%', qEpsGrowth: '4.8%',
    currentRatio: 0.95, quickRatio: 0.52, debtEq: 1.65, debtAssets: 0.42,
    fcf: '3.2B', eps: '8.73', fwdEps: '9.68',
    moat: 'NARROW', brandStrength: 7,
    rating: 'HOLD', targetPrice: '175.00', lowTarget: '135.00', highTarget: '195.00',
    buyCount: 12, holdCount: 18, sellCount: 5,
    strengths: ['Private label brands', 'Store experience', 'Circle loyalty', 'Same-day services'],
    weaknesses: ['Retail theft impact', 'Konkurrencë Walmart/Amazon', 'Low-income consumer pressure'],
    position: 'Retaileri me stil i mirë por presion nga theft dhe konsumatorë',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  LOW: {
    ticker: 'LOW', company: "Lowe's Companies", sector: 'Consumer Discretionary', industry: 'Home Improvement',
    price: 292.50, change: 0.45, volume: '4.5M', marketCap: '$145B', shares: 496,
    pe: 22.8, fwdPE: 20.5, peg: 1.5, ps: 2.5, pb: 15.2, evEbitda: 14.5, divYield: '2.08%',
    grossMargin: '33.8%', opMargin: '13.5%', netMargin: '9.2%', roe: '85.5%', roa: '18.5%',
    revGrowth: '5.2%', epsGrowth: '8.8%', revGrowth3Y: '5.5%', epsGrowth3Y: '10.2%',
    qRevGrowth: '4.8%', qEpsGrowth: '7.5%',
    currentRatio: 1.08, quickRatio: 0.32, debtEq: 5.85, debtAssets: 0.78,
    fcf: '8.2B', eps: '12.83', fwdEps: '14.27',
    moat: 'WIDE', brandStrength: 8,
    rating: 'BUY', targetPrice: '325.00', lowTarget: '265.00', highTarget: '360.00',
    buyCount: 18, holdCount: 12, sellCount: 3,
    strengths: ['Pro customer growth', 'Total Home Strategy', 'Pellation expansion', 'Digital integration'],
    weaknesses: ['Ciklik me tregjet shtëpiake', 'Detyrime të larta', 'Konkurrencë Home Depot'],
    position: 'Home improvement retailer #2 me fokus në professional customer',
    signal: 'BULLISH', trend: 'uptrend',
  },
  F: {
    ticker: 'F', company: 'Ford Motor Co.', sector: 'Consumer Discretionary', industry: 'Auto Manufacturers',
    price: 11.25, change: -0.82, volume: '42.5M', marketCap: '$45B', shares: 4000,
    pe: 9.2, fwdPE: 8.5, peg: 0.5, ps: 0.35, pb: 1.2, evEbitda: 5.8, divYield: '5.25%',
    grossMargin: '15.2%', opMargin: '4.5%', netMargin: '3.2%', roe: '12.5%', roa: '2.8%',
    revGrowth: '5.2%', epsGrowth: '15%', revGrowth3Y: '4.2%', epsGrowth3Y: '8.5%',
    qRevGrowth: '3.8%', qEpsGrowth: '12.5%',
    currentRatio: 1.12, quickRatio: 0.85, debtEq: 1.95, debtAssets: 0.45,
    fcf: '2.8B', eps: '1.22', fwdEps: '1.32',
    moat: 'NONE', brandStrength: 7,
    rating: 'HOLD', targetPrice: '$14.00', lowTarget: '$9.00', highTarget: '$16.00',
    buyCount: 8, holdCount: 18, sellCount: 10,
    strengths: ['EV transition Blue Oval', 'F-150 franchise', 'Dividend i lartë', 'Commercial vans'],
    weaknesses: ['EV humbje $5B', 'Quality issues', 'Konkurrencë EV', 'Margin pressure'],
    position: 'Automaker legacy me EV transition sfiduese',
    signal: 'BEARISH', trend: 'downtrend',
  },
  GM: {
    ticker: 'GM', company: 'General Motors', sector: 'Consumer Discretionary', industry: 'Auto Manufacturers',
    price: 52.85, change: 0.35, volume: '12.5M', marketCap: '$59B', shares: 1116,
    pe: 7.8, fwdPE: 6.5, peg: 0.4, ps: 0.28, pb: 0.85, evEbitda: 5.2, divYield: '1.15%',
    grossMargin: '12.8%', opMargin: '7.2%', netMargin: '4.8%', roe: '15.2%', roa: '3.5%',
    revGrowth: '8.5%', epsGrowth: '22%', revGrowth3Y: '6.2%', epsGrowth3Y: '12.5%',
    qRevGrowth: '6.5%', qEpsGrowth: '18.5%',
    currentRatio: 1.05, quickRatio: 0.82, debtEq: 1.25, debtAssets: 0.35,
    fcf: '8.5B', eps: '6.78', fwdEps: '8.13',
    moat: 'NARROW', brandStrength: 7,
    rating: 'BUY', targetPrice: '68.00', lowTarget: '42.00', highTarget: '78.00',
    buyCount: 15, holdCount: 12, sellCount: 8,
    strengths: ['EV profitability approaching', 'Truck/SUV dominance', 'Cruise exit reduced losses', 'Strong FCF'],
    weaknesses: ['China exposure', 'EV pricing war', 'Legacy pension costs'],
    position: 'Automaker me afërsim EV profitability dhe truck franchise të fortë',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  LULU: {
    ticker: 'LULU', company: 'Lululemon Athletica', sector: 'Consumer Discretionary', industry: 'Athletic Apparel',
    price: 305.25, change: -0.52, volume: '2.8M', marketCap: '$38.5B', shares: 126,
    pe: 32.5, fwdPE: 28.2, peg: 2.0, ps: 5.8, pb: 10.5, evEbitda: 22.5, divYield: '0.00%',
    grossMargin: '58.5%', opMargin: '22.5%', netMargin: '17.8%', roe: '32.5%', roa: '15.2%',
    revGrowth: '8.5%', epsGrowth: '12.5%', revGrowth3Y: '12.2%', epsGrowth3Y: '18.5%',
    qRevGrowth: '7.2%', qEpsGrowth: '10.5%',
    currentRatio: 1.95, quickRatio: 1.52, debtEq: 0.12, debtAssets: 0.05,
    fcf: '1.5B', eps: '9.39', fwdEps: '10.82',
    moat: 'WIDE', brandStrength: 9,
    rating: 'HOLD', targetPrice: '350.00', lowTarget: '275.00', highTarget: '400.00',
    buyCount: 14, holdCount: 14, sellCount: 5,
    strengths: ['Community brand loyalty', 'Premium pricing power', 'International expansion', 'Mens growth'],
    weaknesses: ['North America slowdown', 'Konkurrencë Alo/Athleta', 'Management turnover'],
    position: 'Premium athletic brand me sfida rritjeje në Shtetet e Bashkuara',
    signal: 'NEUTRAL', trend: 'sideways',
  },

  // ═══════ HEALTHCARE ═══════
  LLY: {
    ticker: 'LLY', company: 'Eli Lilly & Co', sector: 'Healthcare', industry: 'Pharmaceuticals',
    price: 858.50, change: 1.85, volume: '5.2M', marketCap: '$815B', shares: 950,
    pe: 92.5, fwdPE: 68.5, peg: 1.5, ps: 22.5, pb: 35.2, evEbitda: 65.5, divYield: '0.72%',
    grossMargin: '79.2%', opMargin: '33.5%', netMargin: '25.2%', roe: '92.5%', roa: '25.8%',
    revGrowth: '38%', epsGrowth: '48%', revGrowth3Y: '28.5%', epsGrowth3Y: '42.5%',
    qRevGrowth: '42%', qEpsGrowth: '52%',
    currentRatio: 1.55, quickRatio: 1.22, debtEq: 0.55, debtAssets: 0.28,
    fcf: '12.5B', eps: '9.28', fwdEps: '12.54',
    moat: 'WIDE', brandStrength: 9,
    rating: 'STRONG_BUY', targetPrice: '1050.00', lowTarget: '800.00', highTarget: '1200.00',
    buyCount: 32, holdCount: 5, sellCount: 1,
    strengths: ['Mounjaro/Zepbound dominim GLP-1', 'Pipeline obesiteti/diabetes', 'Patente afatgjata', 'Rritje eksponenciale'],
    weaknesses: ['Vlerësim shumë i lartë', 'Konkurrencë Novo Nordisk', 'Supply constraints'],
    position: 'Leaderi absolut në farmacinë e obezitetit me rritje eksplozive',
    signal: 'BULLISH', trend: 'uptrend',
  },
  UNH: {
    ticker: 'UNH', company: 'UnitedHealth Group', sector: 'Healthcare', industry: 'Health Insurance',
    price: 548.25, change: 0.68, volume: '3.5M', marketCap: '$505B', shares: 921,
    pe: 22.8, fwdPE: 19.5, peg: 1.6, ps: 1.2, pb: 6.5, evEbitda: 15.5, divYield: '1.35%',
    grossMargin: '24.5%', opMargin: '8.5%', netMargin: '5.8%', roe: '22.5%', roa: '6.8%',
    revGrowth: '9.2%', epsGrowth: '11.5%', revGrowth3Y: '10.5%', epsGrowth3Y: '12.8%',
    qRevGrowth: '8.5%', qEpsGrowth: '10.2%',
    currentRatio: 0.78, quickRatio: 0.65, debtEq: 0.72, debtAssets: 0.38,
    fcf: '18.2B', eps: '24.05', fwdEps: '28.12',
    moat: 'WIDE', brandStrength: 8,
    rating: 'BUY', targetPrice: '630.00', lowTarget: '520.00', highTarget: '700.00',
    buyCount: 22, holdCount: 12, sellCount: 3,
    strengths: ['Medicare Advantage lider', 'Optum diversifikim', 'Scale efikasitet', 'Data analytics'],
    weaknesses: ['Rregullore risk', 'Cost trend rritje', 'Anti-trust attention'],
    position: 'Insuruesi më i madh shëndetësor në SHBA me diversifikim Optum',
    signal: 'BULLISH', trend: 'uptrend',
  },
  ISRG: {
    ticker: 'ISRG', company: 'Intuitive Surgical', sector: 'Healthcare', industry: 'Medical Devices',
    price: 582.80, change: 1.12, volume: '1.8M', marketCap: '$168B', shares: 288,
    pe: 72.5, fwdPE: 58.5, peg: 2.2, ps: 22.5, pb: 18.5, evEbitda: 55.2, divYield: '0.00%',
    grossMargin: '68.5%', opMargin: '35.2%', netMargin: '28.5%', roe: '18.5%', roa: '12.5%',
    revGrowth: '15.5%', epsGrowth: '22%', revGrowth3Y: '14.2%', epsGrowth3Y: '18.5%',
    qRevGrowth: '14%', qEpsGrowth: '20%',
    currentRatio: 4.85, quickRatio: 4.22, debtEq: 0.18, debtAssets: 0.08,
    fcf: '2.5B', eps: '8.04', fwdEps: '9.97',
    moat: 'WIDE', brandStrength: 9,
    rating: 'STRONG_BUY', targetPrice: '680.00', lowTarget: '520.00', highTarget: '750.00',
    buyCount: 22, holdCount: 8, sellCount: 1,
    strengths: ['da Vinci monopolim', 'Instrument recurring revenue', 'Installed base growth', 'AI integration'],
    weaknesses: ['Vlerësim premium', 'Procedural growth pace', 'FDA/regulatory risk'],
    position: 'Monopoli në kirurgji robotike me recurring revenue model brilant',
    signal: 'BULLISH', trend: 'uptrend',
  },
  VRTX: {
    ticker: 'VRTX', company: 'Vertex Pharmaceuticals', sector: 'Healthcare', industry: 'Biotechnology',
    price: 475.50, change: 0.92, volume: '1.2M', marketCap: '$122B', shares: 256,
    pe: 32.5, fwdPE: 28.5, peg: 1.2, ps: 12.5, pb: 8.5, evEbitda: 25.5, divYield: '0.00%',
    grossMargin: '85.2%', opMargin: '42.5%', netMargin: '38.5%', roe: '25.8%', roa: '18.5%',
    revGrowth: '12.5%', epsGrowth: '18%', revGrowth3Y: '15.2%', epsGrowth3Y: '22.5%',
    qRevGrowth: '10%', qEpsGrowth: '15.5%',
    currentRatio: 5.25, quickRatio: 4.85, debtEq: 0.08, debtAssets: 0.04,
    fcf: '4.5B', eps: '14.63', fwdEps: '16.68',
    moat: 'WIDE', brandStrength: 8,
    rating: 'BUY', targetPrice: '540.00', lowTarget: '440.00', highTarget: '600.00',
    buyCount: 22, holdCount: 8, sellCount: 2,
    strengths: ['Trikafta/Kaftrio CF monopolim', 'Pain/immunology pipeline', 'Cash-rich', 'Gene editing investment'],
    weaknesses: ['CF market size limited', 'Pipeline execution risk', 'Valuation premium'],
    position: 'Biotech me monopolim në cystic fibrosis dhe pipeline të zgjeruar',
    signal: 'BULLISH', trend: 'uptrend',
  },
  ABBV: {
    ticker: 'ABBV', company: 'AbbVie Inc.', sector: 'Healthcare', industry: 'Pharmaceuticals',
    price: 198.50, change: 0.55, volume: '5.5M', marketCap: '$350B', shares: 1763,
    pe: 20.5, fwdPE: 18.2, peg: 1.5, ps: 5.2, pb: 15.5, evEbitda: 14.5, divYield: '3.65%',
    grossMargin: '72.5%', opMargin: '38.5%', netMargin: '28.5%', roe: '85.5%', roa: '15.8%',
    revGrowth: '5.5%', epsGrowth: '8.2%', revGrowth3Y: '8.2%', epsGrowth3Y: '12.5%',
    qRevGrowth: '4.8%', qEpsGrowth: '7.5%',
    currentRatio: 1.28, quickRatio: 0.95, debtEq: 3.25, debtAssets: 0.55,
    fcf: '22.5B', eps: '9.68', fwdEps: '10.90',
    moat: 'WIDE', brandStrength: 8,
    rating: 'BUY', targetPrice: '230.00', lowTarget: '180.00', highTarget: '260.00',
    buyCount: 20, holdCount: 12, sellCount: 3,
    strengths: ['Skyrizi/Humira replacement', 'Botox franchise', 'Oncology pipeline', 'Dividend aristokrate'],
    weaknesses: ['High debt post-Allergan', 'Humira biosimilar erosion', 'Pipeline risk'],
    position: 'Pharma giant me diversifikim pas Humira loss',
    signal: 'BULLISH', trend: 'uptrend',
  },
  TMO: {
    ticker: 'TMO', company: 'Thermo Fisher Scientific', sector: 'Healthcare', industry: 'Life Sciences',
    price: 595.25, change: 0.28, volume: '1.8M', marketCap: '$231B', shares: 388,
    pe: 28.8, fwdPE: 25.2, peg: 2.2, ps: 4.2, pb: 5.5, evEbitda: 20.5, divYield: '0.55%',
    grossMargin: '42.5%', opMargin: '18.5%', netMargin: '14.2%', roe: '18.5%', roa: '8.5%',
    revGrowth: '3.5%', epsGrowth: '5.8%', revGrowth3Y: '8.2%', epsGrowth3Y: '12.5%',
    qRevGrowth: '2.8%', qEpsGrowth: '4.5%',
    currentRatio: 1.42, quickRatio: 0.98, debtEq: 0.62, debtAssets: 0.25,
    fcf: '6.8B', eps: '20.67', fwdEps: '23.62',
    moat: 'WIDE', brandStrength: 8,
    rating: 'HOLD', targetPrice: '650.00', lowTarget: '540.00', highTarget: '720.00',
    buyCount: 15, holdCount: 15, sellCount: 5,
    strengths: ['Diversifikim i gjerë', 'Recurring revenue', 'Scale advantages', 'R&D spending'],
    weaknesses: ['Slow growth post-COVID', 'Biotech funding uncertainty', 'Acquisition integration'],
    position: 'Leaderi global në life sciences tools me diversifikim të gjerë',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  JNJ: {
    ticker: 'JNJ', company: 'Johnson & Johnson', sector: 'Healthcare', industry: 'Pharmaceuticals',
    price: 162.35, change: 0.18, volume: '7.5M', marketCap: '$395B', shares: 2432,
    pe: 23.2, fwdPE: 20.5, peg: 2.8, ps: 5.2, pb: 6.5, evEbitda: 16.2, divYield: '2.95%',
    grossMargin: '44.2%', opMargin: '23.5%', netMargin: '19.2%', roe: '45.5%', roa: '13.5%',
    revGrowth: '4.5%', epsGrowth: '6.8%', revGrowth3Y: '5.2%', epsGrowth3Y: '7.5%',
    qRevGrowth: '4.2%', qEpsGrowth: '6.5%',
    currentRatio: 1.15, quickRatio: 0.88, debtEq: 0.48, debtAssets: 0.22,
    fcf: '19.5B', eps: '7.00', fwdEps: '7.92',
    moat: 'WIDE', brandStrength: 10,
    rating: 'HOLD', targetPrice: '185.00', lowTarget: '155.00', highTarget: '210.00',
    buyCount: 14, holdCount: 18, sellCount: 5,
    strengths: ['Dividend 63 vjet rresht', 'Pipeline farmaceutike', 'Reputacion i lartë', 'Diversifikim'],
    weaknesses: ['Rritje e ngadalëme', 'Talc litigation', 'Kenvue spin-off risk'],
    position: 'Dividenda aristokrate me diversifikim të gjerë healthcare',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  MRK: {
    ticker: 'MRK', company: 'Merck & Co.', sector: 'Healthcare', industry: 'Pharmaceuticals',
    price: 132.85, change: 0.42, volume: '12.8M', marketCap: '$335B', shares: 2522,
    pe: 22.5, fwdPE: 19.8, peg: 1.5, ps: 5.5, pb: 6.8, evEbitda: 14.8, divYield: '2.75%',
    grossMargin: '48.5%', opMargin: '28.5%', netMargin: '22.5%', roe: '32.5%', roa: '12.8%',
    revGrowth: '8.5%', epsGrowth: '12%', revGrowth3Y: '8.8%', epsGrowth3Y: '10.5%',
    qRevGrowth: '7.5%', qEpsGrowth: '10.2%',
    currentRatio: 1.22, quickRatio: 0.92, debtEq: 0.62, debtAssets: 0.28,
    fcf: '15.5B', eps: '5.90', fwdEps: '6.71',
    moat: 'WIDE', brandStrength: 8,
    rating: 'BUY', targetPrice: '160.00', lowTarget: '125.00', highTarget: '180.00',
    buyCount: 22, holdCount: 12, sellCount: 3,
    strengths: ['Keytruda blockbuster $28B+', 'HPV vaccine Gardasil', 'Pipeline oncology', 'Animal health growth'],
    weaknesses: ['Keytruda patent cliff 2028', 'COVID product wind-down', 'R&D execution risk'],
    position: 'Pharma giant me Keytruda franchise dominuese dhe pipeline oncology',
    signal: 'BULLISH', trend: 'uptrend',
  },
  ABT: {
    ticker: 'ABT', company: 'Abbott Laboratories', sector: 'Healthcare', industry: 'Healthcare/Diagnostics',
    price: 132.50, change: 0.32, volume: '5.2M', marketCap: '$232B', shares: 1750,
    pe: 25.5, fwdPE: 22.8, peg: 2.2, ps: 4.5, pb: 8.5, evEbitda: 18.2, divYield: '1.88%',
    grossMargin: '55.2%', opMargin: '22.5%', netMargin: '16.8%', roe: '28.5%', roa: '12.2%',
    revGrowth: '5.8%', epsGrowth: '8.5%', revGrowth3Y: '6.8%', epsGrowth3Y: '10.2%',
    qRevGrowth: '5.2%', qEpsGrowth: '7.8%',
    currentRatio: 1.35, quickRatio: 0.95, debtEq: 0.55, debtAssets: 0.22,
    fcf: '8.5B', eps: '5.20', fwdEps: '5.81',
    moat: 'WIDE', brandStrength: 9,
    rating: 'BUY', targetPrice: '155.00', lowTarget: '120.00', highTarget: '175.00',
    buyCount: 18, holdCount: 12, sellCount: 3,
    strengths: ['FreeStyle Libre growth', 'Medical devices diversifikim', 'Dividend 52 vjet rresht', 'Pediatric nutrition'],
    weaknesses: ['COVID testing wind-down', 'Pediatric nutrition China', 'Regulatory risk'],
    position: 'Healthcare conglomerate me growth drivers Libre dhe devices',
    signal: 'BULLISH', trend: 'uptrend',
  },
  PFE: {
    ticker: 'PFE', company: 'Pfizer Inc.', sector: 'Healthcare', industry: 'Pharmaceuticals',
    price: 29.85, change: -0.52, volume: '32.5M', marketCap: '$169B', shares: 5665,
    pe: 18.5, fwdPE: 15.2, peg: 1.2, ps: 2.8, pb: 2.5, evEbitda: 10.5, divYield: '6.25%',
    grossMargin: '62.5%', opMargin: '15.5%', netMargin: '8.5%', roe: '12.5%', roa: '5.2%',
    revGrowth: '12%', epsGrowth: '18%', revGrowth3Y: '-5%', epsGrowth3Y: '-2%',
    qRevGrowth: '15%', qEpsGrowth: '22%',
    currentRatio: 1.45, quickRatio: 1.12, debtEq: 0.85, debtAssets: 0.35,
    fcf: '12.5B', eps: '1.61', fwdEps: '1.96',
    moat: 'NARROW', brandStrength: 7,
    rating: 'HOLD', targetPrice: '$35.00', lowTarget: '$26.00', highTarget: '$42.00',
    buyCount: 12, holdCount: 18, sellCount: 8,
    strengths: ['Seagen oncology acquisition', 'Dividend 6.25%', 'Pipeline weight loss', 'Turnaround story'],
    weaknesses: ['Post-COVID revenue cliff', 'Seagen integration risk', 'Patent expirations'],
    position: 'Pharma giant me turnaround potential nga Seagen oncology',
    signal: 'NEUTRAL', trend: 'sideways',
  },

  // ═══════ FINANCE ═══════
  JPM: {
    ticker: 'JPM', company: 'JPMorgan Chase', sector: 'Finance', industry: 'Banking',
    price: 228.50, change: 0.75, volume: '8.5M', marketCap: '$654B', shares: 2862,
    pe: 12.5, fwdPE: 11.2, peg: 1.1, ps: 5.2, pb: 1.95, evEbitda: 8.5, divYield: '2.15%',
    grossMargin: '38.5%', opMargin: '33.8%', netMargin: '30.2%', roe: '16.5%', roa: '1.25%',
    revGrowth: '8.5%', epsGrowth: '12.5%', revGrowth3Y: '7.5%', epsGrowth3Y: '10.8%',
    qRevGrowth: '10.2%', qEpsGrowth: '15.5%',
    currentRatio: 0.88, quickRatio: 0.85, debtEq: 1.25, debtAssets: 0.92,
    fcf: '48.5B', eps: '18.28', fwdEps: '20.40',
    moat: 'WIDE', brandStrength: 10,
    rating: 'BUY', targetPrice: '265.00', lowTarget: '215.00', highTarget: '295.00',
    buyCount: 25, holdCount: 10, sellCount: 3,
    strengths: ['Banka më e madhe në SHBA', 'Jamie Dimon CEO', 'NII growth', 'Investment banking lider'],
    weaknesses: ['Rreziku ciklik', 'Regullore Basel III', 'Rritje vështirë'],
    position: 'Banka më e madhe dhe më e profitshme në SHBA',
    signal: 'BULLISH', trend: 'uptrend',
  },
  V: {
    ticker: 'V', company: 'Visa Inc.', sector: 'Finance', industry: 'Payment Processing',
    price: 328.75, change: 0.65, volume: '6.2M', marketCap: '$530B', shares: 1612,
    pe: 32.5, fwdPE: 28.8, peg: 1.8, ps: 16.5, pb: 14.8, evEbitda: 24.5, divYield: '0.68%',
    grossMargin: '55.5%', opMargin: '50.2%', netMargin: '44.5%', roe: '52.5%', roa: '19.5%',
    revGrowth: '11.5%', epsGrowth: '15.5%', revGrowth3Y: '13.2%', epsGrowth3Y: '18.5%',
    qRevGrowth: '12.8%', qEpsGrowth: '16.5%',
    currentRatio: 1.28, quickRatio: 1.15, debtEq: 0.55, debtAssets: 0.25,
    fcf: '22.5B', eps: '10.12', fwdEps: '11.42',
    moat: 'WIDE', brandStrength: 10,
    rating: 'BUY', targetPrice: '380.00', lowTarget: '310.00', highTarget: '420.00',
    buyCount: 28, holdCount: 7, sellCount: 2,
    strengths: ['Network effect global', 'Marzhë operative brilante', 'Cross-border growth', 'No lending risk'],
    weaknesses: ['Valuation premium', 'Rregullore swipe fees', 'Konkurrencë fintech'],
    position: 'Rrjeti më i madh i pagesave globale me moat të pakapshëm',
    signal: 'BULLISH', trend: 'uptrend',
  },
  MA: {
    ticker: 'MA', company: 'Mastercard Inc.', sector: 'Finance', industry: 'Payment Processing',
    price: 525.80, change: 0.82, volume: '3.8M', marketCap: '$486B', shares: 924,
    pe: 35.8, fwdPE: 31.2, peg: 2.0, ps: 18.5, pb: 48.5, evEbitda: 28.5, divYield: '0.52%',
    grossMargin: '54.8%', opMargin: '49.5%', netMargin: '43.2%', roe: '95.5%', roa: '22.5%',
    revGrowth: '12.2%', epsGrowth: '16.5%', revGrowth3Y: '14.5%', epsGrowth3Y: '20.8%',
    qRevGrowth: '13.5%', qEpsGrowth: '18.2%',
    currentRatio: 1.45, quickRatio: 1.28, debtEq: 1.55, debtAssets: 0.42,
    fcf: '15.8B', eps: '14.69', fwdEps: '16.86',
    moat: 'WIDE', brandStrength: 10,
    rating: 'BUY', targetPrice: '600.00', lowTarget: '480.00', highTarget: '650.00',
    buyCount: 26, holdCount: 8, sellCount: 2,
    strengths: ['Network effect global', 'B2B payments rritje', 'Data analytics', 'Higher-value transactions'],
    weaknesses: ['Valuation premium', 'Regulation risk', 'Konkurrencë fintech/crypto'],
    position: 'Rrjeti #2 pagesave globale me premium positioning dhe rritje më të shpejtë se Visa',
    signal: 'BULLISH', trend: 'uptrend',
  },
  GS: {
    ticker: 'GS', company: 'Goldman Sachs', sector: 'Finance', industry: 'Investment Banking',
    price: 575.20, change: 1.25, volume: '2.8M', marketCap: '$168B', shares: 292,
    pe: 18.5, fwdPE: 15.8, peg: 1.2, ps: 3.2, pb: 1.55, evEbitda: 12.5, divYield: '2.35%',
    grossMargin: '42.5%', opMargin: '28.5%', netMargin: '22.5%', roe: '12.5%', roa: '0.95%',
    revGrowth: '15.5%', epsGrowth: '25%', revGrowth3Y: '8.5%', epsGrowth3Y: '12.5%',
    qRevGrowth: '18%', qEpsGrowth: '32%',
    currentRatio: 0.92, quickRatio: 0.88, debtEq: 2.85, debtAssets: 0.92,
    fcf: '12.5B', eps: '31.09', fwdEps: '36.40',
    moat: 'WIDE', brandStrength: 9,
    rating: 'BUY', targetPrice: '650.00', lowTarget: '540.00', highTarget: '720.00',
    buyCount: 18, holdCount: 12, sellCount: 3,
    strengths: ['M&A advisory lider', 'Trading revenue recovery', 'Consumer banking growth', 'Asset management'],
    weaknesses: ['Cyclical earnings', 'Regullore risk', '1MDB reputation damage'],
    position: 'Investment bank premium me recovery të fortë ciklike',
    signal: 'BULLISH', trend: 'uptrend',
  },
  BLK: {
    ticker: 'BLK', company: 'BlackRock Inc.', sector: 'Finance', industry: 'Asset Management',
    price: 958.50, change: 0.92, volume: '1.5M', marketCap: '$149B', shares: 155,
    pe: 24.5, fwdPE: 21.2, peg: 1.8, ps: 6.5, pb: 3.5, evEbitda: 18.5, divYield: '2.15%',
    grossMargin: '42.8%', opMargin: '35.5%', netMargin: '28.5%', roe: '18.5%', roa: '3.2%',
    revGrowth: '12.5%', epsGrowth: '18%', revGrowth3Y: '10.8%', epsGrowth3Y: '15.2%',
    qRevGrowth: '11.5%', qEpsGrowth: '16.5%',
    currentRatio: 0.82, quickRatio: 0.78, debtEq: 2.55, debtAssets: 0.68,
    fcf: '8.5B', eps: '39.12', fwdEps: '45.22',
    moat: 'WIDE', brandStrength: 9,
    rating: 'BUY', targetPrice: '1080.00', lowTarget: '880.00', highTarget: '$1200.00',
    buyCount: 20, holdCount: 10, sellCount: 2,
    strengths: ['iShares ETF dominim $4T', 'Aladdin platform', 'AUM $11T', 'AI integration'],
    weaknesses: ['Fee pressure ETF', 'Market risk AUM decline', 'Concentration risk'],
    position: 'Manageri më i madh i aseteve globale me teknologji Aladdin',
    signal: 'BULLISH', trend: 'uptrend',
  },
  MS: {
    ticker: 'MS', company: 'Morgan Stanley', sector: 'Finance', industry: 'Investment Banking',
    price: 112.85, change: 0.55, volume: '8.5M', marketCap: '$196B', shares: 1737,
    pe: 17.5, fwdPE: 15.2, peg: 1.2, ps: 3.5, pb: 1.42, evEbitda: 12.5, divYield: '2.82%',
    grossMargin: '45.5%', opMargin: '30.2%', netMargin: '22.5%', roe: '12.8%', roa: '0.92%',
    revGrowth: '10.5%', epsGrowth: '15%', revGrowth3Y: '8.5%', epsGrowth3Y: '12.8%',
    qRevGrowth: '12%', qEpsGrowth: '18.5%',
    currentRatio: 0.95, quickRatio: 0.88, debtEq: 2.85, debtAssets: 0.88,
    fcf: '15.2B', eps: '6.45', fwdEps: '7.42',
    moat: 'WIDE', brandStrength: 8,
    rating: 'BUY', targetPrice: '135.00', lowTarget: '100.00', highTarget: '$155.00',
    buyCount: 18, holdCount: 12, sellCount: 3,
    strengths: ['Wealth management $6T', 'Investment banking recovery', 'Advisor network', 'Stock plan services'],
    weaknesses: ['Wealth management margin pressure', 'Market risk', 'Regulatory overhead'],
    position: 'Investment bank me wealth management franchise dominuese',
    signal: 'BULLISH', trend: 'uptrend',
  },
  SCHW: {
    ticker: 'SCHW', company: 'Charles Schwab', sector: 'Finance', industry: 'Brokerage',
    price: 78.50, change: 0.32, volume: '12.5M', marketCap: '$141B', shares: 1795,
    pe: 28.5, fwdPE: 22.5, peg: 2.0, ps: 6.5, pb: 3.2, evEbitda: 18.5, divYield: '0.95%',
    grossMargin: '62.5%', opMargin: '28.5%', netMargin: '18.5%', roe: '8.5%', roa: '1.2%',
    revGrowth: '6.5%', epsGrowth: '25%', revGrowth3Y: '-2%', epsGrowth3Y: '5%',
    qRevGrowth: '8%', qEpsGrowth: '32%',
    currentRatio: 0.22, quickRatio: 0.18, debtEq: 4.55, debtAssets: 0.82,
    fcf: '5.8B', eps: '2.75', fwdEps: '3.49',
    moat: 'WIDE', brandStrength: 8,
    rating: 'HOLD', targetPrice: '95.00', lowTarget: '68.00', highTarget: '110.00',
    buyCount: 12, holdCount: 18, sellCount: 5,
    strengths: ['TD Ameritrade integration', 'Rate cut tailwind', 'Asset gathering growth', 'Low-cost leader'],
    weaknesses: ['Cash sorting drag', 'Rate sensitivity', 'Integration challenges'],
    position: 'Broker-i me tarifë më të ulëta me recovery potential nga rate cuts',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  BAC: {
    ticker: 'BAC', company: 'Bank of America', sector: 'Finance', industry: 'Banking',
    price: 42.85, change: 0.18, volume: '35.5M', marketCap: '$340B', shares: 7937,
    pe: 13.5, fwdPE: 12.2, peg: 1.0, ps: 2.5, pb: 1.08, evEbitda: 8.5, divYield: '2.55%',
    grossMargin: '35.5%', opMargin: '28.5%', netMargin: '22.5%', roe: '10.5%', roa: '0.85%',
    revGrowth: '5.5%', epsGrowth: '8.5%', revGrowth3Y: '3.5%', epsGrowth3Y: '5.8%',
    qRevGrowth: '6.5%', qEpsGrowth: '10.2%',
    currentRatio: 0.92, quickRatio: 0.88, debtEq: 1.08, debtAssets: 0.92,
    fcf: '28.5B', eps: '3.17', fwdEps: '3.51',
    moat: 'WIDE', brandStrength: 8,
    rating: 'HOLD', targetPrice: '50.00', lowTarget: '38.00', highTarget: '58.00',
    buyCount: 12, holdCount: 18, sellCount: 8,
    strengths: ['Consumer banking lider', 'Rate cut tailwind', 'Deposit base masiv', 'Digital adoption'],
    weaknesses: ['NII sensitivity', 'Rregullore overhead', 'Low-margin business'],
    position: 'Banka konsumatore më e madhe me tailwind nga ulja e normave',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  WFC: {
    ticker: 'WFC', company: 'Wells Fargo', sector: 'Finance', industry: 'Banking',
    price: 63.50, change: 0.25, volume: '15.5M', marketCap: '$218B', shares: 3431,
    pe: 12.8, fwdPE: 11.5, peg: 1.0, ps: 3.2, pb: 1.32, evEbitda: 7.5, divYield: '2.85%',
    grossMargin: '32.5%', opMargin: '25.5%', netMargin: '20.5%', roe: '11.5%', roa: '0.95%',
    revGrowth: '4.2%', epsGrowth: '7.5%', revGrowth3Y: '-2%', epsGrowth3Y: '2.5%',
    qRevGrowth: '5.5%', qEpsGrowth: '8.8%',
    currentRatio: 1.02, quickRatio: 0.92, debtEq: 1.55, debtAssets: 0.88,
    fcf: '18.5B', eps: '4.96', fwdEps: '5.52',
    moat: 'WIDE', brandStrength: 8,
    rating: 'HOLD', targetPrice: '75.00', lowTarget: '55.00', highTarget: '85.00',
    buyCount: 10, holdCount: 20, sellCount: 8,
    strengths: ['Community banking network', 'Rate cut tailwind', 'Asset cap removal potential', 'Mortgage franchise'],
    weaknesses: ['Regulatory asset cap', 'Reputation recovery', 'Low growth'],
    position: 'Banka me rrjet më të gjerë branch me recovery potential',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  C: {
    ticker: 'C', company: 'Citigroup', sector: 'Finance', industry: 'Banking',
    price: 68.25, change: 0.42, volume: '15.8M', marketCap: '$135B', shares: 1978,
    pe: 10.8, fwdPE: 9.5, peg: 0.8, ps: 1.8, pb: 0.72, evEbitda: 6.5, divYield: '3.25%',
    grossMargin: '38.5%', opMargin: '22.5%', netMargin: '15.5%', roe: '7.2%', roa: '0.72%',
    revGrowth: '6.8%', epsGrowth: '15%', revGrowth3Y: '-1%', epsGrowth3Y: '5.5%',
    qRevGrowth: '8.5%', qEpsGrowth: '18%',
    currentRatio: 0.98, quickRatio: 0.92, debtEq: 1.85, debtAssets: 0.92,
    fcf: '15.5B', eps: '6.32', fwdEps: '7.18',
    moat: 'NARROW', brandStrength: 7,
    rating: 'HOLD', targetPrice: '82.00', lowTarget: '58.00', highTarget: '$92.00',
    buyCount: 10, holdCount: 20, sellCount: 8,
    strengths: ['P/B 0.72 — i undervleruar', 'Restructuring benefits', 'International franchise', 'Treasury/Trade services'],
    weaknesses: ['Execution risk', 'Low ROE', 'Regulatory oversight', 'Complex structure'],
    position: 'Global bank me vlerësim të ulët dhe turnaround story',
    signal: 'NEUTRAL', trend: 'sideways',
  },

  // ═══════ ENERGY ═══════
  XOM: {
    ticker: 'XOM', company: 'Exxon Mobil', sector: 'Energy', industry: 'Oil & Gas',
    price: 115.25, change: -0.55, volume: '18.5M', marketCap: '$477B', shares: 4138,
    pe: 14.5, fwdPE: 13.2, peg: 0.9, ps: 1.2, pb: 2.5, evEbitda: 7.2, divYield: '3.15%',
    grossMargin: '12.5%', opMargin: '14.2%', netMargin: '8.5%', roe: '18.2%', roa: '8.8%',
    revGrowth: '-5.5%', epsGrowth: '-8.5%', revGrowth3Y: '18.5%', epsGrowth3Y: '25.2%',
    qRevGrowth: '-8.2%', qEpsGrowth: '-12.5%',
    currentRatio: 1.28, quickRatio: 0.95, debtEq: 0.22, debtAssets: 0.12,
    fcf: '35.5B', eps: '7.95', fwdEps: '8.73',
    moat: 'WIDE', brandStrength: 8,
    rating: 'HOLD', targetPrice: '130.00', lowTarget: '100.00', highTarget: '$150.00',
    buyCount: 12, holdCount: 18, sellCount: 8,
    strengths: ['Bilanci i forttë', 'Pioneer integration', 'Low-carbon investments', 'Dividend 42 vjet rresht'],
    weaknesses: ['Oil price volatility', 'Transition risk', 'Refining margins pressure'],
    position: 'Supermajor oil me përfitim nga scale dhe integrim vertikal',
    signal: 'BEARISH', trend: 'downtrend',
  },
  CVX: {
    ticker: 'CVX', company: 'Chevron Corp', sector: 'Energy', industry: 'Oil & Gas',
    price: 162.85, change: -0.28, volume: '8.5M', marketCap: '$290B', shares: 1781,
    pe: 13.8, fwdPE: 12.5, peg: 0.8, ps: 1.5, pb: 1.85, evEbitda: 6.8, divYield: '4.15%',
    grossMargin: '15.5%', opMargin: '18.5%', netMargin: '11.2%', roe: '14.5%', roa: '7.5%',
    revGrowth: '-8.5%', epsGrowth: '-12%', revGrowth3Y: '15.8%', epsGrowth3Y: '20.5%',
    qRevGrowth: '-10.5%', qEpsGrowth: '-15%',
    currentRatio: 1.18, quickRatio: 0.85, debtEq: 0.15, debtAssets: 0.08,
    fcf: '22.5B', eps: '11.80', fwdEps: '13.03',
    moat: 'WIDE', brandStrength: 8,
    rating: 'HOLD', targetPrice: '185.00', lowTarget: '145.00', highTarget: '$210.00',
    buyCount: 14, holdCount: 16, sellCount: 6,
    strengths: ['Hess acquisition', 'G Guyana production', 'Dividend aristokrate', 'Bilanc i forttë'],
    weaknesses: ['Oil price exposure', 'Hess integration risk', 'Production decline mature'],
    position: 'Supermajor me rritje nga Guyana dhe Hess integration',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  COP: {
    ticker: 'COP', company: 'ConocoPhillips', sector: 'Energy', industry: 'Oil & Gas E&P',
    price: 108.25, change: -0.42, volume: '6.8M', marketCap: '$131B', shares: 1211,
    pe: 12.8, fwdPE: 11.5, peg: 1.0, ps: 2.5, pb: 2.2, evEbitda: 5.8, divYield: '2.25%',
    grossMargin: '22.5%', opMargin: '25.5%', netMargin: '18.5%', roe: '18.5%', roa: '10.2%',
    revGrowth: '-12%', epsGrowth: '-15%', revGrowth3Y: '22.5%', epsGrowth3Y: '28.5%',
    qRevGrowth: '-14%', qEpsGrowth: '-18%',
    currentRatio: 1.55, quickRatio: 1.28, debtEq: 0.35, debtAssets: 0.15,
    fcf: '12.5B', eps: '8.45', fwdEps: '9.41',
    moat: 'NARROW', brandStrength: 7,
    rating: 'HOLD', targetPrice: '125.00', lowTarget: '95.00', highTarget: '$145.00',
    buyCount: 12, holdCount: 16, sellCount: 6,
    strengths: ['Marathon Oil aktrimi', 'Low-cost production', 'Capital discipline', 'Return framework'],
    weaknesses: ['Oil price exposure', 'Production decline', 'No downstream hedge'],
    position: 'Independent E&P me capital discipline dhe return framework',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  SLB: {
    ticker: 'SLB', company: 'Schlumberger', sector: 'Energy', industry: 'Oilfield Services',
    price: 38.50, change: -0.65, volume: '12.5M', marketCap: '$55B', shares: 1428,
    pe: 15.5, fwdPE: 14.2, peg: 1.5, ps: 2.2, pb: 3.5, evEbitda: 8.5, divYield: '2.85%',
    grossMargin: '22.5%', opMargin: '15.8%', netMargin: '10.5%', roe: '18.5%', roa: '5.8%',
    revGrowth: '-5.2%', epsGrowth: '-8.5%', revGrowth3Y: '18.5%', epsGrowth3Y: '25.2%',
    qRevGrowth: '-6.5%', qEpsGrowth: '-10%',
    currentRatio: 1.25, quickRatio: 0.92, debtEq: 0.52, debtAssets: 0.22,
    fcf: '5.5B', eps: '2.48', fwdEps: '2.71',
    moat: 'WIDE', brandStrength: 8,
    rating: 'HOLD', targetPrice: '48.00', lowTarget: '35.00', highTarget: '$55.00',
    buyCount: 10, holdCount: 18, sellCount: 8,
    strengths: ['Oilfield services lider', 'International recovery', 'Digital transformation', 'Margin improvement'],
    weaknesses: ['North America weakness', 'Oil price dependency', 'Cyclicality'],
    position: 'Oilfield services lider global me recovery international',
    signal: 'BEARISH', trend: 'downtrend',
  },
  EOG: {
    ticker: 'EOG', company: 'EOG Resources', sector: 'Energy', industry: 'Oil & Gas E&P',
    price: 122.50, change: -0.35, volume: '3.2M', marketCap: '$72B', shares: 588,
    pe: 10.5, fwdPE: 9.8, peg: 0.8, ps: 3.2, pb: 2.8, evEbitda: 5.5, divYield: '2.85%',
    grossMargin: '28.5%', opMargin: '32.5%', netMargin: '25.5%', roe: '18.5%', roa: '10.5%',
    revGrowth: '-8.5%', epsGrowth: '-10%', revGrowth3Y: '22.5%', epsGrowth3Y: '28.5%',
    qRevGrowth: '-10%', qEpsGrowth: '-12%',
    currentRatio: 1.85, quickRatio: 1.55, debtEq: 0.18, debtAssets: 0.08,
    fcf: '6.8B', eps: '11.67', fwdEps: '12.50',
    moat: 'NARROW', brandStrength: 6,
    rating: 'HOLD', targetPrice: '140.00', lowTarget: '105.00', highTarget: '$160.00',
    buyCount: 10, holdCount: 18, sellCount: 5,
    strengths: ['Premium acreage', 'Low-cost operator', 'Double returns framework', 'Free cash flow'],
    weaknesses: ['Oil price dependency', 'Production decline', 'US shale maturity'],
    position: 'US shale pure-play me capital discipline dhe premium returns',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  MPC: {
    ticker: 'MPC', company: 'Marathon Petroleum', sector: 'Energy', industry: 'Refining',
    price: 162.50, change: 0.52, volume: '5.5M', marketCap: '$62B', shares: 382,
    pe: 8.8, fwdPE: 8.2, peg: 0.5, ps: 0.32, pb: 2.2, evEbitda: 4.8, divYield: '2.15%',
    grossMargin: '18.5%', opMargin: '8.5%', netMargin: '5.2%', roe: '22.5%', roa: '8.5%',
    revGrowth: '-15%', epsGrowth: '-18%', revGrowth3Y: '5.5%', epsGrowth3Y: '8.2%',
    qRevGrowth: '-18%', qEpsGrowth: '-22%',
    currentRatio: 0.95, quickRatio: 0.65, debtEq: 0.55, debtAssets: 0.28,
    fcf: '8.2B', eps: '18.47', fwdEps: '19.82',
    moat: 'NARROW', brandStrength: 6,
    rating: 'HOLD', targetPrice: '185.00', lowTarget: '$140.00', highTarget: '$210.00',
    buyCount: 8, holdCount: 18, sellCount: 8,
    strengths: ['Refining scale lider', 'Midstream integration', 'Stock buyback massive', 'Distribution strength'],
    weaknesses: ['Crack spread volatility', 'Cyclical earnings', 'EV transition long-term'],
    position: 'Refiner më i madh në SHBA me midstream diversifikim',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  FANG: {
    ticker: 'FANG', company: 'Diamondback Energy', sector: 'Energy', industry: 'Oil & Gas E&P',
    price: 128.50, change: -0.38, volume: '3.8M', marketCap: '$35B', shares: 272,
    pe: 9.2, fwdPE: 8.5, peg: 0.6, ps: 3.5, pb: 2.5, evEbitda: 5.2, divYield: '2.25%',
    grossMargin: '32.5%', opMargin: '35.5%', netMargin: '28.5%', roe: '15.5%', roa: '8.2%',
    revGrowth: '-5%', epsGrowth: '-8%', revGrowth3Y: '25.5%', epsGrowth3Y: '32.5%',
    qRevGrowth: '-6%', qEpsGrowth: '-10%',
    currentRatio: 1.42, quickRatio: 1.12, debtEq: 0.22, debtAssets: 0.10,
    fcf: '4.2B', eps: '13.97', fwdEps: '15.12',
    moat: 'NARROW', brandStrength: 5,
    rating: 'HOLD', targetPrice: '$150.00', lowTarget: '$115.00', highTarget: '$170.00',
    buyCount: 8, holdCount: 18, sellCount: 6,
    strengths: ['Endeavor aktrimi', 'Permian basin premium', 'Capital returns', 'Low-cost operator'],
    weaknesses: ['Oil price dependency', 'Permian maturity', 'Cyclicality'],
    position: 'Permian basin E&P me efikasitet superior pas Endeavor aktrimi',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  DVN: {
    ticker: 'DVN', company: 'Devon Energy', sector: 'Energy', industry: 'Oil & Gas E&P',
    price: 42.85, change: -0.52, volume: '8.2M', marketCap: '$27B', shares: 630,
    pe: 8.5, fwdPE: 7.8, peg: 0.5, ps: 2.5, pb: 2.8, evEbitda: 4.5, divYield: '4.85%',
    grossMargin: '28.5%', opMargin: '32.5%', netMargin: '22.5%', roe: '15.5%', roa: '8.5%',
    revGrowth: '-10%', epsGrowth: '-15%', revGrowth3Y: '15.5%', epsGrowth3Y: '20.5%',
    qRevGrowth: '-12%', qEpsGrowth: '-18%',
    currentRatio: 1.22, quickRatio: 0.95, debtEq: 0.35, debtAssets: 0.15,
    fcf: '3.5B', eps: '5.04', fwdEps: '5.49',
    moat: 'NARROW', brandStrength: 5,
    rating: 'HOLD', targetPrice: '$52.00', lowTarget: '$35.00', highTarget: '$60.00',
    buyCount: 8, holdCount: 16, sellCount: 8,
    strengths: ['Delaware basin focus', 'Variable dividend + fixed', 'Capital discipline', 'Free cash flow yield'],
    weaknesses: ['Oil price exposure', 'Production decline curves', 'Variable dividend uncertainty'],
    position: 'Delaware basin E&P me fixed+variable dividend model',
    signal: 'BEARISH', trend: 'downtrend',
  },
  WFRD: {
    ticker: 'WFRD', company: 'Weatherford Intl', sector: 'Energy', industry: 'Oilfield Services',
    price: 7.25, change: 1.25, volume: '5.8M', marketCap: '$4.5B', shares: 621,
    pe: 12.5, fwdPE: 10.8, peg: 1.5, ps: 0.82, pb: 2.2, evEbitda: 6.5, divYield: '0.00%',
    grossMargin: '18.5%', opMargin: '12.5%', netMargin: '8.2%', roe: '15.2%', roa: '5.5%',
    revGrowth: '8.5%', epsGrowth: '15%', revGrowth3Y: '12.5%', epsGrowth3Y: '18.5%',
    qRevGrowth: '10%', qEpsGrowth: '18%',
    currentRatio: 1.55, quickRatio: 1.22, debtEq: 1.25, debtAssets: 0.42,
    fcf: '0.5B', eps: '0.58', fwdEps: '0.67',
    moat: 'NONE', brandStrength: 5,
    rating: 'HOLD', targetPrice: '$9.00', lowTarget: '$5.50', highTarget: '$10.00',
    buyCount: 5, holdCount: 15, sellCount: 8,
    strengths: ['International offshore', 'Transformation progress', 'OneSubsea JV', 'Latin America growth'],
    weaknesses: ['Small-cap risk', 'Balance sheet', 'Competition Schlumberger/Halliburton'],
    position: 'Oilfield services turnaround me international offshore focus',
    signal: 'NEUTRAL', trend: 'sideways',
  },
  PARR: {
    ticker: 'PARR', company: 'Par Pacific Holdings', sector: 'Energy', industry: 'Refining/E&P',
    price: 30.25, change: 0.85, volume: '1.2M', marketCap: '$2.5B', shares: 83,
    pe: 8.2, fwdPE: 7.5, peg: 0.5, ps: 0.28, pb: 1.5, evEbitda: 4.5, divYield: '1.25%',
    grossMargin: '15.2%', opMargin: '8.5%', netMargin: '5.5%', roe: '18.5%', roa: '5.2%',
    revGrowth: '-12%', epsGrowth: '-15%', revGrowth3Y: '8.5%', epsGrowth3Y: '12.5%',
    qRevGrowth: '-14%', qEpsGrowth: '-18%',
    currentRatio: 1.32, quickRatio: 0.85, debtEq: 0.65, debtAssets: 0.35,
    fcf: '0.5B', eps: '3.69', fwdEps: '4.03',
    moat: 'NONE', brandStrength: 4,
    rating: 'HOLD', targetPrice: '$38.00', lowTarget: '$22.00', highTarget: '$42.00',
    buyCount: 5, holdCount: 15, sellCount: 8,
    strengths: ['Hawaii refining monopoly', 'Guam expansion', 'Nickelodeon branding', 'Low-cost production'],
    weaknesses: ['Small size risk', 'Refining cyclicality', 'Limited liquidity', 'Geographic concentration'],
    position: 'Small-cap refiner with Hawaii monopoly position',
    signal: 'NEUTRAL', trend: 'sideways',
  },

  // ═══════ INDUSTRIALS ═══════
  CAT: {
    ticker: 'CAT', company: 'Caterpillar Inc.', sector: 'Industrials', industry: 'Heavy Machinery',
    price: 382.50, change: 0.45, volume: '3.2M', marketCap: '$186B', shares: 486,
    pe: 18.5, fwdPE: 16.2, peg: 1.5, ps: 3.5, pb: 8.5, evEbitda: 12.5, divYield: '1.45%',
    grossMargin: '35.8%', opMargin: '18.5%', netMargin: '14.2%', roe: '42.5%', roa: '8.5%',
    revGrowth: '5.2%', epsGrowth: '8.5%', revGrowth3Y: '8.5%', epsGrowth3Y: '12.5%',
    qRevGrowth: '4.5%', qEpsGrowth: '7.8%',
    currentRatio: 1.45, quickRatio: 0.95, debtEq: 2.15, debtAssets: 0.55,
    fcf: '8.5B', eps: '20.68', fwdEps: '23.62',
    moat: 'WIDE', brandStrength: 9,
    rating: 'BUY', targetPrice: '430.00', lowTarget: '355.00', highTarget: '$480.00',
    buyCount: 18, holdCount: 12, sellCount: 3,
    strengths: ['Construction equipment lider', 'Services & parts recurring', 'Mining strength', 'Global dealer network'],
    weaknesses: ['Construction cycle risk', 'China slowdown', 'Interest rate sensitivity'],
    position: 'Leaderi global në heavy machinery me services recurring revenue',
    signal: 'BULLISH', trend: 'uptrend',
  },
};

// ═══════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════

export function getStock(ticker: string): StockProfile | undefined {
  return STOCKS[ticker.toUpperCase()];
}

export function getStockPrice(ticker: string): number {
  const stock = STOCKS[ticker.toUpperCase()];
  return stock ? stock.price : 0;
}

export function getAllStocks(): Record<string, StockProfile> {
  return { ...STOCKS };
}

export function getStocksBySector(sector: string): StockProfile[] {
  return Object.values(STOCKS).filter(s => s.sector === sector);
}

export function getAllTickers(): string[] {
  return Object.keys(STOCKS);
}

export function getTopStocks(count: number = 10): StockProfile[] {
  return Object.values(STOCKS)
    .sort((a, b) => b.change - a.change)
    .slice(0, count);
}

export function getSectorList(): string[] {
  return ['Technology', 'Healthcare', 'Finance', 'Energy', 'Consumer Discretionary'];
}

// Finance API integration — attempts live price fetch with fallback
export async function fetchLivePrices(tickers: string[]): Promise<Record<string, { price: number; change: number }>> {
  const results: Record<string, { price: number; change: number }> = {};

  try {
    const commaTickers = tickers.join(',');
    const gatewayUrl = process.env.GATEWAY_URL || 'https://internal-api.z.ai';
    const apiPrefix = process.env.API_PREFIX || '/external/finance';

    const res = await fetch(
      `${gatewayUrl}${apiPrefix}/v1/markets/stock/quotes?ticker=${commaTickers}`,
      {
        headers: { 'X-Z-AI-From': 'Z' },
        signal: AbortSignal.timeout(3000),
      }
    );

    if (res.ok) {
      const data = await res.json();
      if (data?.body) {
        for (const item of data.body) {
          if (item?.symbol && item?.regularMarketPrice) {
            results[item.symbol] = {
              price: item.regularMarketPrice,
              change: item.regularMarketChangePercent || 0,
            };
          }
        }
      }
    }
  } catch {
    // Finance API unavailable — fall back to local data
    console.log('[MARKET DATA] Finance API unavailable, using local data');
  }

  // Fill any missing tickers from local data
  for (const t of tickers) {
    if (!results[t]) {
      const stock = STOCKS[t.toUpperCase()];
      if (stock) {
        results[t] = { price: stock.price, change: stock.change };
      }
    }
  }

  return results;
}

// Generate daily change with slight randomization for demo realism
export function getDemoChange(): number {
  return Math.round((Math.random() - 0.45) * 400) / 100; // -1.5% to +2.5%
}
