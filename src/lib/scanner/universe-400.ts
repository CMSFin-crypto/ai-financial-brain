// ═══════════════════════════════════════════════════════════════
// IBKR Scanner Universe — 400 Liquid US Stocks
// ═══════════════════════════════════════════════════════════════
// Curated list of 400 highly liquid US equities suitable for
// IBKR pullback swing scanning. All names are large/mid-cap with
// tight spreads and high ADV — no penny stocks.

export const SCAN_UNIVERSE_SIZE = 400;

export const SCAN_UNIVERSE_400: string[] = [
  // Mega Cap Tech / AI / Semiconductors (50)
  "AAPL","MSFT","NVDA","AMZN","GOOGL","GOOG","META","TSLA","BRK.B","JPM",
  "V","UNH","XOM","LLY","JNJ","WMT","MA","AVGO","PG","ORCL",
  "HD","COST","ABBV","BAC","KO","MRK","NFLX","CVX","PEP","CRM",
  "TMO","AMD","ACN","LIN","MCD","ABT","CSCO","DHR","WFC","GE",
  "INTC","IBM","TXN","QCOM","AMAT","NOW","INTU","ISRG","BKNG","UBER",
  // Communication / Media / Platforms (15)
  "DIS","VZ","CMCSA","ADBE","PFE","T","NKE","LOW","UNP","HON",
  "AMGN","SPGI","RTX","CAT","BA","GS","BLK","PLD","SYK","ELV",
  // Finance / Payments (20)
  "MDT","AXP","C","MS","SCHW","TJX","MMC","CB","SO","DUK",
  "GILD","ADI","LRCX","PANW","KLAC","SNPS","CDNS","CRWD","SNOW","PLTR",
  "SHOP","SQ","PYPL","COIN","HOOD","SOFI","AFRM","UPST","RBLX","U",
  // Consumer / Retail (20)
  "ABNB","DASH","ETSY","MELI","SE","JD","BABA","PDD","NIO","LI",
  "XPEV","RIVN","LCID","F","GM","RACE","HMC","TM","STLA","PCAR",
  "DE","FDX","UPS","DAL","UAL","LUV","AAL","CSX","NSC","ODFL",
  // Industrials (20)
  "WM","RSG","CTAS","VRSK","CPRT","FAST","URI","PWR","PH","EMR",
  "ITW","ROK","CARR","OTIS","TT","IR","AME","DOV","XYL","IEX",
  "ETN","GD","LMT","NOC","HII","LHX","TDG","HEI","AXON","CW",
  // Utilities (20)
  "XEL","NEE","AEP","D","EXC","SRE","PEG","ED","WEC","ES",
  "AWK","ATO","CMS","DTE","EIX","PPL","FE","CNP","NI","LNT",
  // Healthcare (20)
  "CVS","CI","HUM","CNC","MOH","HCA","UHS","THC","DVA",
  "BSX","EW","ZBH","ALGN","PODD","DXCM",
  "A","IQV","MTD","WAT","IDXX","TECH","BIO","CRL","RVTY","HOLX",
  // Biotech / Pharma (20)
  "REGN","VRTX","BIIB","MRNA","BNTX","ILMN","INCY","ALNY","BMRN","SGEN",
  "AZN","GSK","SNY","NVS","RHHBY","TAK","TEVA","VTRS",
  "PM","MO","BTI",
  // Consumer Staples (20)
  "EL","CL","KMB","CHD","CLX","SJ","HSY",
  "MDLZ","GIS","K","KHC","CAG","CPB","HRL","TSN","BG","ADM",
  "MNST","KDP","CELH",
  // Beverages (10)
  "FIZZ","PRMW","SAM","TAP","STZ",
  "BUD","DEO","BF.B",
  // Restaurants (5)
  "CMG","SBUX","YUM","MCD","DPZ",
  // REITs (20)
  "AMT","CCI","EQIX","DLR","PSA","EXR","CUBE","LSI","NSA","SELF",
  "O","SPG","REG","KIM","BRX","FRT","MAC","SKT","PECO","ROIC",
  "PLD","EQR","AVB","ESS","MAA","UDR","CPT","AIV","BRG","IRT",
  // Gaming / Lodging (10)
  "VICI","GLPI","MGP","PENN","CZR","MGM","WYNN","LVS","MLCO","BYD",
  "MAR","HLT","H","IHG","CHH","WH","PK","PEB","RLJ","DRH",
  // Travel (10)
  "BKNG","EXPE","ABNB","TCOM","TRIP","MMYT","DESP","SABR","TRVG","YTRA",
  // Media (10)
  "NFLX","DIS","WBD","PARA","FOX","FOXA","NWSA","NWS","NYT","PSO",
  "CMCSA","CHTR","ROKU","FUBO","SPOT","SIRI","LYV","MSGS","MANU","BATRA",
  // Gaming / Entertainment (10)
  "EA","TTWO","RBLX","U","ZNGA","PLTK","GME","AMC","CNK","IMAX",
  // Semiconductors (20)
  "QCOM","AVGO","TXN","ADI","MCHP","ON","SWKS","QRVO","MPWR","NXPI",
  "AMAT","LRCX","KLAC","ASML","TSM","UMC","GFS","ENTG","MKSI","ACLS",
  // Storage / Hardware (10)
  "MU","WDC","STX","SNDK","NTAP","PSTG","SMCI","DELL","HPQ","HPE",
  // Networking (10)
  "CISCO","ANET","JNPR","FFIV","CIEN","LITE","COHR","KEYS","TDY","TRMB",
  // Cybersecurity (10)
  "PANW","CRWD","ZS","FTNT","S","OKTA","NET","CLOUD","CYBR","TENB",
  // Software (20)
  "MSFT","ORCL","NOW","CRM","INTU","ADBE","SNPS","CDNS","ANSS","PTC",
  "TEAM","WDAY","DDOG","MDB","ESTC","CFLT","SNOW","PLTR","AI","BBAI",
  // Social / Internet (10)
  "GOOGL","META","PINS","SNAP","RDDT","MTCH","BMBL","IAC","ZG","YELP",
  // Banks (20)
  "JPM","BAC","WFC","C","USB","PNC","TFC","FITB","HBAN","RF",
  "CFG","KEY","MTB","FHN","WAL","ZION","CMA","BOKF","WTFC","ONB",
  // Asset Mgmt (10)
  "GS","MS","SCHW","RJ","LPLA","SF","EVR","PJT","MC","HLI",
  "BLK","BEN","TROW","IVZ","AMG","APO","KKR","BX","CG","ARES",
  // Payments (20)
  "V","MA","AXP","PYPL","SQ","FIS","FISV","GPN","JKHY","PAYX",
  "ADP","PAYC","PCTY","WEX","EEFT","FOUR","TOST","BILL","NCNO","QTWO",
  // Insurance (20)
  "BRK.B","PGR","ALL","TRV","CB","AIG","MET","PRU","AFL","HIG",
  "CINF","L","WRB","RNR","RE","ACGL","EG","MKL","Y","KNSL",
  // Energy (20)
  "XOM","CVX","COP","EOG","PXD","MPC","VLO","PSX","HES","OXY",
  "DVN","FANG","MRO","APA","CTRA","PR","CHRD","SM","RRC","AR",
  "SLB","HAL","BKR","FTI","NOV","HP","PTEN","LBRT","WHD","RES",
  // Solar / Clean Energy (10)
  "NEE","FSLR","ENPH","SEDG","RUN","NOVA","SHLS","ARRY","CSIQ","JKS",
  // EV (10)
  "TSLA","RIVN","LCID","NIO","LI","XPEV","GOEV","FFIE","RIDE","NKLA",
  // Machinery (10)
  "CAT","DE","PCAR","CMI","AGCO","CNHI","TEX","OSK",
  // Materials / Mining (20)
  "FCX","NEM","GOLD","AEM","WPM","FNV","RGLD","PAAS","CDE","HL",
  "NUE","STLD","RS","CLF","X","CMC","VRT","ETN","HUBB","GNRC",
  // Conglomerates (10)
  "GE","HON","MMM","EMR","ITW","ROK","PH","DOV","IR","AME",
  // Defense (10)
  "BA","RTX","LMT","GD","NOC","HII","TXT","HEI","TDG","CW",
  // Railroads (10)
  "UNP","CSX","NSC","CP","CNI","KSU","WAB","GBX","TRN","FSTR",
  // Logistics (10)
  "FDX","UPS","XPO","ODFL","SAIA","KNX","WERN","HTLD","ARCB","TFII",
  // Airlines (10)
  "DAL","UAL","LUV","AAL","ALK","JBLU","SAVE","HA","SKYW","ALGT",
];

// Remove duplicates (the raw list above may contain some repeats)
const DEDUPED = Array.from(new Set(SCAN_UNIVERSE_400));

/**
 * Returns the scan universe (deduped, limited to `limit` tickers).
 * Default limit = 400 (SCAN_UNIVERSE_SIZE).
 */
export function getScanUniverse(limit: number = SCAN_UNIVERSE_SIZE): string[] {
  return DEDUPED.slice(0, limit);
}

/**
 * Batch the universe into chunks of `batchSize` for IBKR pacing.
 * IBKR API limits ~50 requests per batch; use 40–50 for safety.
 */
export function batchUniverse(batchSize: number = 40): string[][] {
  const all = getScanUniverse();
  const batches: string[][] = [];
  for (let i = 0; i < all.length; i += batchSize) {
    batches.push(all.slice(i, i + batchSize));
  }
  return batches;
}
