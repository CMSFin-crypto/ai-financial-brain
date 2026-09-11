// ═══════════════════════════════════════════════════════════════
// TICKER → COMPANY NAMES — për universe-in e skanerit IBKR (400)
// Përdoret nga sector breadth popup (Task 16) për të shfaqur
// emrin e kompanisë pranë simbolit. Vetëm statike, pa fetch.
// ═══════════════════════════════════════════════════════════════

export const TICKER_NAMES: Record<string, string> = {
  // Mega cap tech / AI
  AAPL: 'Apple', MSFT: 'Microsoft', NVDA: 'NVIDIA', AMZN: 'Amazon', GOOGL: 'Alphabet',
  GOOG: 'Alphabet', META: 'Meta Platforms', TSLA: 'Tesla', 'BRK.B': 'Berkshire Hathaway',
  JPM: 'JPMorgan Chase', V: 'Visa', UNH: 'UnitedHealth', XOM: 'Exxon Mobil', LLY: 'Eli Lilly',
  JNJ: 'Johnson & Johnson', WMT: 'Walmart', MA: 'Mastercard', AVGO: 'Broadcom', PG: 'Procter & Gamble',
  ORCL: 'Oracle', HD: 'Home Depot', COST: 'Costco', ABBV: 'AbbVie', BAC: 'Bank of America',
  KO: 'Coca-Cola', MRK: 'Merck', NFLX: 'Netflix', CVX: 'Chevron', PEP: 'PepsiCo',
  CRM: 'Salesforce', TMO: 'Thermo Fisher', AMD: 'AMD', ACN: 'Accenture', LIN: 'Linde',
  MCD: "McDonald's", ABT: 'Abbott', CSCO: 'Cisco', DHR: 'Danaher', WFC: 'Wells Fargo',
  GE: 'GE Aerospace', INTC: 'Intel', IBM: 'IBM', TXN: 'Texas Instruments', QCOM: 'Qualcomm',
  AMAT: 'Applied Materials', NOW: 'ServiceNow', INTU: 'Intuit', ISRG: 'Intuitive Surgical',
  BKNG: 'Booking Holdings', UBER: 'Uber',
  // Communication / media
  DIS: 'Walt Disney', VZ: 'Verizon', CMCSA: 'Comcast', ADBE: 'Adobe', PFE: 'Pfizer',
  T: 'AT&T', NKE: 'Nike', LOW: "Lowe's", UNP: 'Union Pacific', HON: 'Honeywell',
  AMGN: 'Amgen', SPGI: 'S&P Global', RTX: 'RTX Corp', CAT: 'Caterpillar', BA: 'Boeing',
  GS: 'Goldman Sachs', BLK: 'BlackRock', PLD: 'Prologis', SYK: 'Stryker', ELV: 'Elevance',
  // Finance / payments
  MDT: 'Medtronic', AXP: 'American Express', C: 'Citigroup', MS: 'Morgan Stanley',
  SCHW: 'Charles Schwab', TJX: 'TJX Companies', MMC: 'Marsh McLennan', CB: 'Chubb',
  SO: 'Southern Co', DUK: 'Duke Energy', GILD: 'Gilead', ADI: 'Analog Devices',
  LRCX: 'Lam Research', PANW: 'Palo Alto Networks', KLAC: 'KLA Corp', SNPS: 'Synopsys',
  CDNS: 'Cadence Design', CRWD: 'CrowdStrike', SNOW: 'Snowflake', PLTR: 'Palantir',
  SHOP: 'Shopify', SQ: 'Block', PYPL: 'PayPal', COIN: 'Coinbase', HOOD: 'Robinhood',
  SOFI: 'SoFi Technologies', AFRM: 'Affirm', UPST: 'Upstart', RBLX: 'Roblox', U: 'Unity',
  // Consumer / retail / international
  ABNB: 'Airbnb', DASH: 'DoorDash', ETSY: 'Etsy', MELI: 'MercadoLibre', SE: 'Sea Limited',
  JD: 'JD.com', BABA: 'Alibaba', PDD: 'PDD Holdings', NIO: 'NIO', LI: 'Li Auto',
  XPEV: 'XPeng', RIVN: 'Rivian', LCID: 'Lucid', F: 'Ford', GM: 'General Motors',
  RACE: 'Ferrari', HMC: 'Honda', TM: 'Toyota', STLA: 'Stellantis', PCAR: 'Paccar',
  DE: 'Deere', FDX: 'FedEx', UPS: 'UPS', DAL: 'Delta Air Lines', UAL: 'United Airlines',
  LUV: 'Southwest Airlines', AAL: 'American Airlines', CSX: 'CSX', NSC: 'Norfolk Southern',
  ODFL: 'Old Dominion', WM: 'Waste Management', RSG: 'Republic Services', CTAS: 'Cintas',
  VRSK: 'Verisk', CPRT: 'Copart', FAST: 'Fastenal', URI: 'United Rentals', PWR: 'Quanta Services',
  // Industrials
  PH: 'Parker Hannifin', EMR: 'Emerson', ITW: 'Illinois Tool Works', ROK: 'Rockwell Automation',
  CARR: 'Carrier', OTIS: 'Otis', TT: 'Trane', IR: 'Ingersoll Rand', AME: 'AMETEK',
  DOV: 'Dover', XYL: 'Xylem', IEX: 'IDEX', ETN: 'Eaton', GD: 'General Dynamics',
  LMT: 'Lockheed Martin', NOC: 'Northrop Grumman', HII: 'Huntington Ingalls', LHX: 'L3Harris',
  TDG: 'TransDigm', HEI: 'HEICO', AXON: 'Axon Enterprise', CW: 'Curtiss-Wright',
  // Utilities
  XEL: 'Xcel Energy', NEE: 'NextEra Energy', AEP: 'American Electric Power', D: 'Dominion Energy',
  EXC: 'Exelon', SRE: 'Sempra', PEG: 'PSEG', ED: 'Consolidated Edison', WEC: 'WEC Energy',
  ES: 'Eversource', AWK: 'American Water Works', ATO: 'Atmos Energy', CMS: 'CMS Energy',
  DTE: 'DTE Energy', EIX: 'Edison Intl', PPL: 'PPL', FE: 'FirstEnergy', CNP: 'CenterPoint',
  NI: 'NiSource', LNT: 'Alliant Energy',
  // Healthcare
  CVS: 'CVS Health', CI: 'Cigna', HUM: 'Humana', CNC: 'Centene', MOH: 'Molina Healthcare',
  HCA: 'HCA Healthcare', UHS: 'Universal Health', THC: 'Tenet Healthcare', DVA: 'DaVita',
  BSX: 'Boston Scientific', EW: 'Edwards Lifesciences', ZBH: 'Zimmer Biomet', ALGN: 'Align Tech',
  PODD: 'Insulet', DXCM: 'DexCom', A: 'Agilent', IQV: 'IQVIA', MTD: 'Mettler-Toledo',
  WAT: 'Waters Corp', IDXX: 'IDEXX Labs', TECH: 'Bio-Techne', BIO: 'Bio-Rad', CRL: 'Charles River',
  RVTY: 'Revvity', HOLX: 'Hologic',
  // Biotech / pharma
  REGN: 'Regeneron', VRTX: 'Vertex Pharma', BIIB: 'Biogen', MRNA: 'Moderna', BNTX: 'BioNTech',
  ILMN: 'Illumina', INCY: 'Incyte', ALNY: 'Alnylam', BMRN: 'BioMarin', SGEN: 'Seagen',
  AZN: 'AstraZeneca', GSK: 'GSK', SNY: 'Sanofi', NVS: 'Novartis', RHHBY: 'Roche',
  TAK: 'Takeda', TEVA: 'Teva Pharma', VTRS: 'Viatris',
  // Staples / beverages
  PM: 'Philip Morris', MO: 'Altria', BTI: 'British American Tobacco', EL: 'Estée Lauder',
  CL: 'Colgate-Palmolive', KMB: 'Kimberly-Clark', CHD: 'Church & Dwight', CLX: 'Clorox',
  SJ: 'Simply Good Foods', HSY: 'Hershey', MDLZ: 'Mondelez', GIS: 'General Mills',
  K: 'Kellanova', KHC: 'Kraft Heinz', CAG: 'Conagra', CPB: 'Campbell Soup', HRL: 'Hormel',
  TSN: 'Tyson Foods', BG: 'Bunge', ADM: 'Archer-Daniels', MNST: 'Monster Beverage',
  KDP: 'Keurig Dr Pepper', CELH: 'Celsius', FIZZ: 'National Beverage', PRMW: 'Primo Brands',
  SAM: 'Boston Beer', TAP: 'Molson Coors', STZ: 'Constellation Brands', BUD: 'AB InBev',
  DEO: 'Diageo', 'BF.B': 'Brown-Forman', CMG: 'Chipotle', SBUX: 'Starbucks', YUM: 'Yum! Brands',
  DPZ: "Domino's Pizza",
  // REITs
  AMT: 'American Tower', CCI: 'Crown Castle', EQIX: 'Equinix', DLR: 'Digital Realty',
  PSA: 'Public Storage', EXR: 'Extra Space', CUBE: 'CubeSmart', LSI: 'Life Storage',
  NSA: 'National Storage', SELF: 'Global Self Storage', O: 'Realty Income', SPG: 'Simon Property',
  REG: 'Regency Centers', KIM: 'Kimco Realty', BRX: 'Brixmor', FRT: 'Federal Realty',
  MAC: 'Macerich', SKT: 'SmartStop', PECO: 'Phillips Edison', ROIC: 'Retail Opportunity',
  EQR: 'Equity Residential', AVB: 'AvalonBay', ESS: 'Essex Property', MAA: 'Mid-America',
  UDR: 'UDR', CPT: 'Camden Property', AIV: 'Apartment Inv', BRG: 'Brixmor', IRT: 'IRT Realty',
  VICI: 'VICI Properties', GLPI: 'Gaming & Leisure', MGP: 'MGM Growth', PENN: 'PENN Entertainment',
  CZR: 'Caesars', MGM: 'MGM Resorts', WYNN: 'Wynn Resorts', LVS: 'Las Vegas Sands',
  MLCO: 'Melco Resorts', BYD: 'Boyd Gaming', MAR: 'Marriott', HLT: 'Hilton', H: 'Hyatt',
  IHG: 'IHG Hotels', CHH: 'Choice Hotels', WH: 'Wyndham', PK: 'Park Hotels', PEB: 'PEB Hotels',
  RLJ: 'RLJ Lodging', DRH: 'DiamondRock', EXPE: 'Expedia', TCOM: 'Trip.com', TRIP: 'Tripadvisor',
  MMYT: 'MakeMyTrip', DESP: 'Despegar', SABR: 'Sabre', TRVG: 'Trivago', YTRA: 'Yatra',
  // Media / entertainment
  WBD: 'Warner Bros Discovery', PARA: 'Paramount', FOX: 'Fox Corp', FOXA: 'Fox Corp',
  NWSA: 'News Corp', NWS: 'News Corp', NYT: 'New York Times', PSO: 'Pearson',
  CHTR: 'Charter Comm', ROKU: 'Roku', FUBO: 'fuboTV', SPOT: 'Spotify', SIRI: 'SiriusXM',
  LYV: 'Live Nation', MSGS: 'Madison Square Garden', MANU: 'Manchester United',
  BATRA: 'Braves Holdings', EA: 'Electronic Arts', TTWO: 'Take-Two', ZNGA: 'Zynga',
  PLTK: 'Playtika', GME: 'GameStop', AMC: 'AMC Entertainment', CNK: 'Cinemark',
  IMAX: 'IMAX',
  // Semiconductors & tech hardware
  MCHP: 'Microchip', ON: 'ON Semiconductor', SWKS: 'Skyworks', QRVO: 'Qorvo',
  MPWR: 'Monolithic Power', NXPI: 'NXP Semiconductors', ASML: 'ASML', TSM: 'Taiwan Semi',
  UMC: 'United Microelectronics', GFS: 'GlobalFoundries', ENTG: 'Entegris', MKSI: 'MKS Instruments',
  ACLS: 'Axcelis', MU: 'Micron', WDC: 'Western Digital', STX: 'Seagate', SNDK: 'Sandisk',
  NTAP: 'NetApp', PSTG: 'Pure Storage', SMCI: 'Super Micro', DELL: 'Dell', HPQ: 'HP Inc',
  HPE: 'HPE', CISCO: 'Cisco', ANET: 'Arista Networks', JNPR: 'Juniper', FFIV: 'F5 Networks',
  CIEN: 'Ciena', LITE: 'Lumentum', COHR: 'Coherent', KEYS: 'Keysight', TDY: 'Teledyne',
  TRMB: 'Trimble', ZS: 'Zscaler', FTNT: 'Fortinet', S: 'SentinelOne', OKTA: 'Okta',
  NET: 'Cloudflare', CLOUD: 'Fastly', CYBR: 'CyberArk', TENB: 'Tenable', ANSS: 'Ansys',
  PTC: 'PTC Inc', TEAM: 'Atlassian', WDAY: 'Workday', DDOG: 'Datadog', MDB: 'MongoDB',
  ESTC: 'Elastic', CFLT: 'Confluent', AI: 'C3.ai', BBAI: 'BigBear.ai', PINS: 'Pinterest',
  SNAP: 'Snap Inc', RDDT: 'Reddit', MTCH: 'Match Group', BMBL: 'Bumble', IAC: 'IAC',
  ZG: 'Zillow', YELP: 'Yelp', USB: 'US Bancorp',
};

/** Emri i kompanisë për një ticker (fallback: undefined) */
export function getCompanyName(ticker: string): string | undefined {
  return TICKER_NAMES[ticker.toUpperCase()];
}
