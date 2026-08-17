import { NextResponse } from 'next/server';
import { getRealPrices } from '@/lib/alpha-vantage';
import { getAllStocks } from '@/lib/market-data';
import { analyzeFivePillarsBatch, type FivePillarsCandidate } from '@/lib/five-pillars-engine';

export const maxDuration = 120;

// Cache for 8 minutes
let cachedResult: { data: FivePillarsCandidate[]; summary: ScanSummary; fetchedAt: number } | null = null;
const CACHE_TTL = 8 * 60 * 1000;

interface ScanSummary {
  totalAnalyzed: number;
  eligible: number;
  watch: number;
  rejected: number;
  floatReview: number;
  strongMomentum: number;
  highMomentum: number;
  pillarPassRates: {
    rvol: number;
    momentum: number;
    catalyst: number;
    price: number;
    float: number;
  };
}

// ═══════════════════════════════════════════════════════════════
// SMALL-CAP MOMENTUM UNIVERSE — focused for Ross Cameron 5 Pillars
// These are stocks that CAN satisfy float <10M and price $1-$20
// Organized by category for targeted scanning
// ═══════════════════════════════════════════════════════════════

const SMALL_CAP_UNIVERSE: string[] = [
  // ──── Biotech / Pharma (FDA catalysts, earnings surprises) ────
  'NVAX', 'MRNA', 'AKBA', 'ARDX', 'AYTU', 'BIOX', 'BPMC', 'CARV', 'CASM', 'CMTX',
  'CTMX', 'DTIL', 'FSTAR', 'GLMD', 'GNS', 'HROW', 'IDYA', 'IMUX', 'INZY', 'IRTC',
  'KOD', 'KRTX', 'LGVN', 'LCTX', 'MRTX', 'NKTR', 'NTRA', 'OCGN', 'PRAX', 'PROG',
  'RDY', 'RLMD', 'RGNX', 'RYTM', 'SANA', 'SEEL', 'SLGC', 'SNDA', 'SNDL',
  'TBIO', 'TMDX', 'TXMD', 'URGN', 'VKTX', 'VSTM', 'XERS', 'ZIOP',
  'ANVS', 'CRBP', 'DRNA', 'EYES', 'FHTX', 'GOSS', 'HIMS', 'INMD', 'JNJ',
  'LLY', 'MRK', 'NBIX', 'NVAX', 'OSCR', 'PTCT', 'RGEM', 'RGLS', 'RVNC',
  'SMMT', 'TBIO', 'VERV', 'VIR', 'XENE',

  // ──── Tech / AI / Software (momentum plays, contract wins) ────
  'AAOI', 'AMRS', 'AYX', 'BAND', 'BIGC', 'BL', 'CARG', 'CHGG', 'CLSK', 'CORE',
  'COWN', 'CRSP', 'DDOG', 'DIOD', 'EBON', 'EIGR', 'ENFN', 'EVGO', 'FATH', 'FUBO',
  'GFAI', 'GTCH', 'HIMS', 'IDEX', 'IIIV', 'INMD', 'INTZ', 'IONQ', 'JFU',
  'KINV', 'LAZR', 'LPSN', 'MARA', 'MI', 'NAKD', 'NAVI', 'NOVA',
  'ONDS', 'OPRA', 'PATH', 'PLBY', 'PRPL', 'QMCO', 'RGTI', 'RIGL', 'ROOT', 'SABR',
  'SAVA', 'SFT', 'SKLZ', 'SLNO', 'SMCI', 'SND', 'SOGO', 'SOUN', 'SPRT', 'SSTK',
  'TBLT', 'TENB', 'TUYA', 'UPST', 'VERI', 'VLDR', 'WIMI', 'WKC', 'WRAP',
  'XPEL', 'YALA', 'ZETA', 'AI', 'PATH', 'SOUN', 'VERI', 'IONQ', 'RGTI',

  // ──── Energy / EV / Green (catalysts: subsidies, partnerships) ────
  'ACHR', 'AEVA', 'ALGM', 'ARVL', 'BLNK', 'BTBT', 'CHPT',
  'FCEL', 'FFIE', 'GCT', 'GMFI', 'HYLN', 'LCID', 'LUNR',
  'NNE', 'NKLA', 'PLUG', 'QLGN', 'RIVN', 'RUN',
  'SBSW', 'SOL', 'VLTA', 'WB', 'XPEV', 'ZEV', 'MARA',

  // ──── Consumer / Retail / Meme (high volatility, social catalysts) ────
  'AMC', 'BBIG', 'BKE', 'BLMN', 'BURL', 'CC', 'CHWY', 'CLOV', 'DKNG',
  'EXEL', 'FIZZ', 'FOSL', 'GME', 'GPRO', 'GPS', 'GRAB', 'HOOD', 'JWN', 'KSS',
  'MNSO', 'NWL', 'ODP', 'ONON', 'PLCE', 'POSH', 'RKT', 'SEAS',
  'SFIX', 'SHOO', 'TUP', 'W', 'WBA', 'WOOF', 'WRBY', 'PLAY',

  // ──── Mining / Metals (commodity catalysts) ────
  'AG', 'AU', 'AUY', 'BVN', 'CDE', 'CLF', 'EGO', 'EXK',
  'GSS', 'HL', 'HMY', 'KGC', 'MAG', 'MUX', 'NEM', 'NGD', 'PAAS',
  'RGLD', 'SAND', 'SCCO', 'SILJ', 'SLV', 'SSRI', 'SVM', 'WPM',

  // ──── Fintech / Finance ────
  'AFRM', 'BKUT', 'CACC', 'CASH', 'COIN', 'CRTO',
  'FND', 'FUTU', 'HMNF', 'HOPE', 'IBKR', 'LC', 'LOAN', 'LPRO',
  'MC', 'MDB', 'ML', 'MOGO', 'NYCB', 'OFG', 'OSBC', 'OZK',
  'PIPR', 'SBCF', 'SEIC', 'SHBI', 'SLQT', 'TCBI', 'TSCO',
  'UCBI', 'UMBF', 'UBSI', 'VIRT', 'WABC', 'WBS', 'ZION',

  // ──── China / ADR (policy catalysts, earnings) ────
  'BABA', 'BIDU', 'EDU', 'JD', 'LI', 'NIO', 'PDD', 'TAL', 'XPEV',

  // ──── Industrials / Manufacturing ────
  'AA', 'ACHC', 'AGCO', 'AIR', 'ALE', 'AMAT', 'AME', 'ATKR', 'AXON',
  'BLDR', 'BWA', 'CARR', 'CE', 'CIR', 'DE', 'DOV', 'EMR',
  'ETN', 'FICO', 'FLR', 'FLT', 'FMX', 'GE', 'GFF', 'GWW',
  'HI', 'HUBG', 'IEX', 'IR', 'J', 'JJ', 'KMT', 'LII', 'LUV', 'MAS',
  'MKSI', 'MMI', 'MRC', 'NDSN', 'NUE', 'ODFL', 'OTIS', 'PCAR', 'PH', 'PNR',
  'POOL', 'PWR', 'RBC', 'ROK', 'ROP', 'RS', 'RSG', 'SHW', 'SITE',
  'SRCL', 'SYY', 'TDY', 'TGI', 'TMO', 'TRN', 'TT', 'TXT', 'URI',
  'VRSK', 'WCN', 'WDS', 'XYL',

  // ──── Additional small-cap / high-volatility ────
  'AAL', 'ABNB', 'ADMA', 'ADTN', 'ADTX', 'AEHR', 'AEIS', 'AGEN', 'AGIL',
  'AHPI', 'AIM', 'AKAN', 'AKBA', 'AKRO', 'ALBO', 'ALGM', 'ALNA', 'ALSN',
  'AMBP', 'AMCI', 'AMKR', 'AMPH', 'AMRS', 'ANIP', 'ANTX', 'APLS', 'APPS',
  'AQB', 'ARAY', 'ARCT', 'ARGX', 'ARQT', 'ASAN', 'ASLN', 'ASTE', 'ATAI',
  'ATNF', 'ATNM', 'ATOM', 'AVCT', 'AVDL', 'AVNS', 'AVRO', 'AXSM', 'AZN',
  'BBAI', 'BBAR', 'BCAB', 'BCHE', 'BCTX', 'BEAM', 'BFI', 'BFLY', 'BGB',
  'BGEN', 'BGS', 'BH', 'BHLB', 'BHRX', 'BIMI', 'BION', 'BITF', 'BJ',
  'BKTI', 'BLFY', 'BLNK', 'BMEA', 'BNRG', 'BOCH', 'BOM', 'BOWL', 'BRBS',
  'BRR', 'BSET', 'BSGM', 'BTT', 'BTBT', 'BTRN', 'BTWN', 'BVXV', 'BW',
  'BYND', 'CABA', 'CAMP', 'CAN', 'CARA', 'CASH', 'CASS', 'CASY', 'CBAY',
  'CCO', 'CDE', 'CDMO', 'CEI', 'CENN', 'CERE', 'CGC', 'CHAI', 'CHK',
  'CHRM', 'CHRS', 'CIFI', 'CIX', 'CLAR', 'CLDX', 'CLFD', 'CLGN', 'CLNE',
  'CLSN', 'CLVR', 'CMPS', 'CNL', 'CNMD', 'CNSP', 'COCP', 'CODI', 'CODX',
  'COGT', 'COLL', 'COWN', 'CPAH', 'CPRX', 'CRBU', 'CRCL', 'CRDO', 'CRKR',
  'CRMD', 'CRNT', 'CRON', 'CROX', 'CRVL', 'CRVS', 'CRYM', 'CRYX', 'CSBR',
  'CSE', 'CSGP', 'CSII', 'CSTL', 'CSWI', 'CTRN', 'CTSO', 'CTXR', 'CUI',
  'CVNA', 'CVV', 'CWBR', 'CYBN', 'CYTH', 'DAIO', 'DBRG', 'DCBO', 'DCGO',
  'DDOG', 'DEA', 'DENN', 'DEST', 'DFNS', 'DGHI', 'DGLY', 'DHC', 'DLTH',
  'DM', 'DMRC', 'DNA', 'DNMR', 'DOGZ', 'DOYU', 'DPCM', 'DPZ', 'DRCT',
  'DRMA', 'DRTS', 'DS', 'DSP', 'DSS', 'DTSS', 'DUB', 'DV', 'DXCM',
  'DYAI', 'ECOM', 'EIGR', 'EIRL', 'ELF', 'ELY', 'EMBC', 'EMKR', 'ENFN',
  'ENOB', 'ENVB', 'EPHY', 'ERAS', 'ERJ', 'ESMT', 'ESPR', 'ETNB', 'EVCM',
  'EVGO', 'EVH', 'EVLV', 'EVOK', 'EVTC', 'EVTX', 'EXEL', 'EXFO', 'EXPI',
  'EXTR', 'EYE', 'F', 'FARM', 'FATH', 'FBIZ', 'FCEL', 'FEMS', 'FEYE',
  'FFIE', 'FHTX', 'FIBK', 'FINV', 'FIZZ', 'FL', 'FLGC', 'FLMN', 'FLNT',
  'FLT', 'FLUX', 'FMCI', 'FNCH', 'FNKO', 'FONR', 'FORA', 'FORD', 'FREY',
  'FRHC', 'FRSH', 'FRTA', 'FSI', 'FSTR', 'FUL', 'FULT', 'FUSB', 'FUSN',
  'FUV', 'FXLV', 'FYBR', 'GAIN', 'GAIA', 'GAL', 'GBLI', 'GBOX', 'GDS',
  'GECC', 'GENE', 'GERN', 'GFN', 'GFF', 'GGAL', 'GH', 'GHL', 'GIFI',
  'GILT', 'GIX', 'GLBE', 'GLG', 'GLMD', 'GLPI', 'GLO', 'GLYC', 'GMBL',
  'GMDA', 'GMED', 'GNTX', 'GOC', 'GOGO', 'GPRE', 'GRCL', 'GRFS', 'GRIL',
  'GRWG', 'GSEV', 'GSHD', 'GSS', 'GST', 'GTBP', 'GTII', 'GTY', 'GWH',
  'HAIN', 'HAQC', 'HBCP', 'HBNC', 'HCC', 'HCKT', 'HDGE', 'HEAR', 'HEES',
  'HEPA', 'HFFG', 'HIBB', 'HIIT', 'HIMS', 'HMN', 'HMNF', 'HNST', 'HOFV',
  'HOVR', 'HRTX', 'HSAQ', 'HSCS', 'HSDT', 'HSTX', 'HTCR', 'HTGC', 'HTZ',
  'HURN', 'HWWI', 'HX', 'HYLN', 'HYT', 'IDAI', 'IDEX', 'IDT', 'IESC',
  'IGIC', 'IIII', 'IIIV', 'IMAB', 'IMCR', 'IMGN', 'IMKTA', 'IMMR', 'IMNM',
  'IMRA', 'IMTX', 'INBK', 'INCY', 'INFI', 'INGN', 'INMD', 'INO', 'INOD',
  'INSP', 'INSW', 'INT', 'INVA', 'INVE', 'INZT', 'IO', 'IONM', 'IPDN',
  'IPWR', 'IRDM', 'ISEE', 'ISIG', 'ISNS', 'ISP', 'JAKK', 'JAMF', 'JBI',
  'JFU', 'JILL', 'JMP', 'JNJ', 'JOE', 'JPC', 'JPM', 'JRN', 'JWN',
  'KALA', 'KALV', 'KAPL', 'KARS', 'KAVL', 'KBSF', 'KD', 'KDP', 'KERX',
  'KFRC', 'KIDS', 'KIN', 'KIRK', 'KISS', 'KITT', 'KLR', 'KMT', 'KN',
  'KNBW', 'KNOP', 'KOOL', 'KOPN', 'KPLT', 'KRBP', 'KRON', 'KROS', 'KRTX',
  'KRUS', 'KSCP', 'KSPN', 'KTTA', 'KUDA', 'KURA', 'KVSC', 'KW', 'KWAR',
  'KYN', 'LAES', 'LAZR', 'LCTX', 'LECO', 'LEGN', 'LEVL', 'LGVN', 'LH',
  'LIVK', 'LIZI', 'LLAP', 'LMAT', 'LMND', 'LND', 'LOAN', 'LOGC', 'LOMA',
  'LOPE', 'LPSN', 'LQDA', 'LRCX', 'LSEA', 'LSTR', 'LTRN', 'LTRPA', 'LXEH',
  'LYRA', 'LYTS', 'MASS', 'MCHP', 'MCRB', 'MCW', 'MDB', 'MDGS', 'MDGL',
  'MDWD', 'MDXH', 'MEDP', 'MEDS', 'MEI', 'MELI', 'MEOH', 'META', 'MFG',
  'MFH', 'MFW', 'MGIC', 'MGLN', 'MGNI', 'MGP', 'MGTA', 'MHO', 'MIND',
  'MIST', 'MITE', 'MJN', 'MKFG', 'MKSI', 'MLAB', 'MLCO', 'MLHR', 'MLM',
  'MLNK', 'MMAT', 'MMC', 'MMD', 'MMI', 'MMM', 'MMP', 'MMS', 'MNDY',
  'MNSO', 'MNSTR', 'MOD', 'MODD', 'MOGO', 'MOGZ', 'MOMO', 'MORF', 'MOTR',
  'MOV', 'MP', 'MPLN', 'MPS', 'MPW', 'MRAC', 'MRC', 'MRK', 'MRSN',
  'MRTX', 'MRTX', 'MSA', 'MSBI', 'MSGE', 'MSTR', 'MTBC', 'MTDR', 'MTEM',
  'MTEN', 'MTEX', 'MTL', 'MTSL', 'MTTR', 'MTZ', 'MUA', 'MUB', 'MUI',
  'MUST', 'MVIS', 'MVST', 'MWK', 'MX', 'MYFW', 'MYMD', 'NABL', 'NAKD',
  'NAKX', 'NARI', 'NAT', 'NATH', 'NAVI', 'NB', 'NBIS', 'NBRV', 'NC',
  'NCA', 'NCNO', 'NCTY', 'NDA', 'NEX', 'NEXI', 'NFBK', 'NFH', 'NFLX',
  'NGM', 'NGMS', 'NGRA', 'NHC', 'NICE', 'NINE', 'NISN', 'NIT', 'NKS',
  'NKTX', 'NL', 'NLOK', 'NMFC', 'NMI', 'NMTR', 'NNDM', 'NNOX', 'NNX',
  'NOCT', 'NODK', 'NOVA', 'NOVT', 'NPCE', 'NPO', 'NRP', 'NRSC', 'NSA',
  'NSIT', 'NSP', 'NSSC', 'NTAP', 'NTCO', 'NTGR', 'NTNX', 'NTST', 'NUZE',
  'NVCN', 'NVCR', 'NVCT', 'NVDA', 'NVNG', 'NVST', 'NVO', 'NVTX', 'NWBI',
  'NWE', 'NWL', 'NWPX', 'NWTN', 'NWS', 'NYCB', 'NYMT', 'NZ', 'OAC',
  'OBSV', 'OCC', 'OCFC', 'OCGN', 'OCUL', 'ODC', 'ODFL', 'OESX', 'OFED',
  'OFG', 'OGI', 'OGN', 'OII', 'OIS', 'OLB', 'OLLI', 'OLMA', 'OM',
  'OMEX', 'ONCR', 'ONCS', 'ONCY', 'ONDS', 'ONEM', 'OPCH', 'OPK', 'OPRA',
  'OPT', 'OPY', 'ORCC', 'ORGS', 'ORMP', 'ORRF', 'OSBC', 'OSMT', 'OSPN',
  'OSTK', 'OSUR', 'OTEL', 'OTIC', 'OTLK', 'OXLC', 'OXSQ', 'OZK', 'PAGP',
  'PAYS', 'PB', 'PBF', 'PBFS', 'PBI', 'PBT', 'PCSB', 'PCYG', 'PDCE',
  'PDNI', 'PDS', 'PEBK', 'PEG', 'PEGR', 'PEP', 'PERI', 'PETQ', 'PFAI',
  'PFBC', 'PFE', 'PFG', 'PFI', 'PFIN', 'PG', 'PGC', 'PGNY', 'PGR',
  'PHAR', 'PHAT', 'PHI', 'PHR', 'PHUN', 'PICO', 'PIRS', 'PIRS', 'PIRS',
  'PL', 'PLAB', 'PLCE', 'PLRX', 'PLTR', 'PLUG', 'PLXS', 'PLYA', 'PM',
  'PMT', 'PNFP', 'PNRG', 'PNW', 'PODD', 'POL', 'POLA', 'POSH', 'PPBI',
  'PPC', 'PRAA', 'PRAX', 'PRCH', 'PRCT', 'PRDO', 'PRFT', 'PRGS', 'PRIM',
  'PRK', 'PRO', 'PROG', 'PROV', 'PRPL', 'PRPO', 'PRST', 'PRTA', 'PRTS',
  'PRVA', 'PRVL', 'PS', 'PSNL', 'PSTG', 'PSTX', 'PTCT', 'PTIN', 'PTMN',
  'PTPI', 'PTRS', 'PUBM', 'PUCK', 'PULM', 'PV', 'PWFL', 'PWSC', 'PX',
  'PXS', 'PYPL', 'QABA', 'QELL', 'QFIN', 'QLGN', 'QQQ', 'QRTEA', 'QTWO',
  'QUAD', 'QUBT', 'QUOT', 'QYLD', 'RACA', 'RAAS', 'RAD', 'RAIL', 'RALS',
  'RAMP', 'RARE', 'RAYS', 'RBAI', 'RBC', 'RBLX', 'RCUS', 'RDVT', 'RDY',
  'REAI', 'REES', 'REGN', 'REI', 'REKR', 'REPL', 'REPL', 'RESN', 'REV',
  'REVG', 'REXI', 'REYN', 'RF', 'RFLD', 'RG', 'RGA', 'RGEN', 'RGLD',
  'RGLS', 'RGNX', 'RGTI', 'RGRX', 'RHI', 'RHMD', 'RIGL', 'RILY', 'RMAX',
  'RMBS', 'RMNF', 'RMO', 'RMTI', 'RNDB', 'RNWK', 'ROAD', 'ROCK', 'ROIV',
  'RPAY', 'RPD', 'RPLA', 'RPRX', 'RPTX', 'RRD', 'RRGB', 'RRR', 'RST',
  'RSI', 'RSPR', 'RSST', 'RTE', 'RTLR', 'RTNB', 'RTTR', 'RUBY', 'RUSHB',
  'RUSHA', 'RUTH', 'RVMD', 'RVNC', 'RVSN', 'RXST', 'RYAAY', 'RYTM', 'RYTM',
  'SABR', 'SACH', 'SAFT', 'SAIC', 'SAVA', 'SAVB', 'SAVA', 'SAXX', 'SBBP',
  'SBCF', 'SBE', 'SBFM', 'SBFY', 'SBGI', 'SBLK', 'SBSW', 'SC', 'SCAI',
  'SCCO', 'SCHL', 'SCHN', 'SCIL', 'SCLE', 'SCLO', 'SCOK', 'SCOR', 'SCPH',
  'SCPL', 'SCS', 'SCSE', 'SCT', 'SCU', 'SCWX', 'SD', 'SDC', 'SDD',
  'SDE', 'SDIG', 'SDLB', 'SDOW', 'SDOV', 'SDPI', 'SDRL', 'SDS', 'SDYG',
  'SEAC', 'SEAS', 'SECO', 'SEED', 'SEEL', 'SEIC', 'SEM', 'SEMR', 'SENS',
  'SFBS', 'SFE', 'SFG', 'SFIX', 'SFL', 'SFNC', 'SFT', 'SFTW', 'SG',
  'SGA', 'SGH', 'SGMO', 'SGRP', 'SGRY', 'SHAK', 'SHBI', 'SHC', 'SHCO',
  'SHCR', 'SHOO', 'SHSE', 'SHTC', 'SHYF', 'SIGA', 'SILC', 'SILJ', 'SIMO',
  'SINT', 'SIRI', 'SITM', 'SIX', 'SJI', 'SKIN', 'SKLZ', 'SKYX', 'SLAB',
  'SLAM', 'SLDB', 'SLGC', 'SLGD', 'SLGL', 'SLGN', 'SLIM', 'SLLN', 'SLNO',
  'SLRN', 'SLRX', 'SLS', 'SM', 'SMAR', 'SMBK', 'SMCI', 'SMFG', 'SMHI',
  'SMMF', 'SMMT', 'SMPL', 'SMSI', 'SMTC', 'SNAK', 'SNBR', 'SNCR', 'SND',
  'SNDL', 'SNE', 'SNEX', 'SNFCA', 'SNPS', 'SNRA', 'SNSS', 'SNT', 'SNTG',
  'SNV', 'SNW', 'SNX', 'SOFO', 'SOGO', 'SOL', 'SOND', 'SONM', 'SOON',
  'SOPA', 'SOS', 'SOUN', 'SP', 'SPB', 'SPCB', 'SPCE', 'SPFI', 'SPHR',
  'SPI', 'SPKB', 'SPNT', 'SPOK', 'SPPI', 'SPR', 'SPRB', 'SPRC', 'SPRT',
  'SPSC', 'SPT', 'SPWH', 'SPXL', 'SPY', 'SQ', 'SQM', 'SQNS', 'SR',
  'SRAX', 'SRCE', 'SRCL', 'SREV', 'SRG', 'SRNE', 'SRRK', 'SRS', 'SRSA',
  'SRT', 'SRY', 'SSAA', 'SSNC', 'SSNT', 'SSP', 'SSRM', 'SSRI', 'SSSS',
  'SSTK', 'STAA', 'STAF', 'STAG', 'STAY', 'STCN', 'STE', 'STFC', 'STGL',
  'STIM', 'STKD', 'STKL', 'STLC', 'STLN', 'STM', 'STMD', 'STMP', 'STNG',
  'STOK', 'STRA', 'STRO', 'STRR', 'STRS', 'STRW', 'STSA', 'STTK', 'STWO',
  'STXS', 'SUB', 'SUI', 'SUM', 'SUN', 'SUPN', 'SVC', 'SVFA', 'SVFB',
  'SVV', 'SWAV', 'SWBI', 'SWCH', 'SWIM', 'SWM', 'SWN', 'SXC', 'SXI',
  'SXTC', 'SY', 'SYBX', 'SYF', 'SYK', 'SYNA', 'SYND', 'SYNL', 'SYRS',
  'TACO', 'TAA', 'TAL', 'TANH', 'TARA', 'TARS', 'TAST', 'TATT', 'TBBK',
  'TBK', 'TC', 'TCBK', 'TCCO', 'TCK', 'TCMD', 'TCOA', 'TCPC', 'TCRD',
  'TCTM', 'TDDX', 'TDF', 'TDOC', 'TDOM', 'TDUP', 'TENB', 'TEO', 'TEVV',
  'TEX', 'TFII', 'TFIN', 'TFSL', 'TG', 'TGA', 'TGAA', 'TGH', 'TGI',
  'TGTX', 'TH', 'THCA', 'THMO', 'THR', 'THRM', 'THTX', 'TIG', 'TIPT',
  'TIRX', 'TISI', 'TIXT', 'TJX', 'TK', 'TKNO', 'TKOM', 'TLIS', 'TLL',
  'TLYS', 'TMCI', 'TMFC', 'TMKR', 'TMO', 'TMPM', 'TMTS', 'TNK', 'TNXP',
  'TNYA', 'TOCK', 'TOL', 'TONR', 'TOPT', 'TPB', 'TPC', 'TPEX', 'TPET',
  'TPLY', 'TPX', 'TQQQ', 'TR', 'TRCB', 'TRCH', 'TREB', 'TREX', 'TRI',
  'TRIL', 'TRMB', 'TRMD', 'TRMK', 'TRNK', 'TRNO', 'TRON', 'TROV', 'TRQ',
  'TRRN', 'TRST', 'TRT', 'TRUE', 'TRUP', 'TRVG', 'TRVN', 'TRVT', 'TRWH',
  'TSC', 'TSCL', 'TSDD', 'TSEM', 'TSFT', 'TSG', 'TSIA', 'TSLL', 'TSLY',
  'TSLZ', 'TSP', 'TSPQ', 'TSSI', 'TST', 'TTCF', 'TTD', 'TTEC', 'TTEK',
  'TTL', 'TTMI', 'TTNP', 'TTOO', 'TTP', 'TTS', 'TTWO', 'TUES', 'TUG',
  'TUP', 'TUSK', 'TVAX', 'TVC', 'TWKS', 'TWLO', 'TWNK', 'TWO', 'TWOU',
  'TWST', 'TXMD', 'TXN', 'TXRH', 'TY', 'TYRA', 'TYRA', 'TZOO', 'UA',
  'UAA', 'UAMY', 'UAN', 'UBCP', 'UBER', 'UBSI', 'UBX', 'UCC', 'UCBI',
  'UDMY', 'UE', 'UFS', 'UG', 'UL', 'ULTA', 'UMBF', 'UMBX', 'UMH',
  'UNAM', 'UND', 'UNF', 'UNFI', 'UNH', 'UNIT', 'UNTY', 'UONE', 'UPLD',
  'UPST', 'URBN', 'URGN', 'URI', 'USAT', 'USEG', 'USLM', 'USMC', 'USPH',
  'UTF', 'UTHR', 'UTMD', 'UUNN', 'UWMC', 'VACE', 'VALE', 'VALN', 'VBTX',
  'VC', 'VCEL', 'VCIG', 'VCTR', 'VCV', 'VEEV', 'VEON', 'VERA', 'VERI',
  'VERV', 'VET', 'VFC', 'VG', 'VGI', 'VIAV', 'VIB', 'VICI', 'VIEW',
  'VINO', 'VIOO', 'VIOT', 'VIR', 'VIRC', 'VIRT', 'VIST', 'VIVK', 'VJET',
  'VKTX', 'VLDR', 'VLEO', 'VLGEA', 'VLRS', 'VLT', 'VLTA', 'VMAR', 'VMD',
  'VNCE', 'VNDA', 'VNE', 'VNOM', 'VOO', 'VOS', 'VOXX', 'VPV', 'VRAX',
  'VRDN', 'VRE', 'VRME', 'VRSK', 'VRSN', 'VRT', 'VRTV', 'VSEC', 'VST',
  'VSTM', 'VTAC', 'VTEB', 'VTEC', 'VTK', 'VTN', 'VTNR', 'VTOL', 'VTRS',
  'VTVT', 'VUZI', 'VVOS', 'VVPR', 'VYGR', 'VZIO', 'WABC', 'WAFD', 'WASH',
  'WATR', 'WB', 'WBD', 'WCN', 'WD', 'WDFC', 'WDR', 'WEBR', 'WEC',
  'WEL', 'WERN', 'WEX', 'WFG', 'WF', 'WFC', 'WFW', 'WGO', 'WH',
  'WHD', 'WHG', 'WIMI', 'WINA', 'WINGS', 'WIRE', 'WISA', 'WIT', 'WK',
  'WKHS', 'WLDS', 'WLDN', 'WLFC', 'WLL', 'WLY', 'WMC', 'WMS', 'WMXI',
  'WNC', 'WNEB', 'WOLF', 'WOOF', 'WOVE', 'WPC', 'WPM', 'WPP', 'WPX',
  'WR', 'WRAC', 'WRAP', 'WRB', 'WRE', 'WRK', 'WRLD', 'WSBC', 'WSBF',
  'WSCR', 'WSFS', 'WSM', 'WST', 'WT', 'WTBA', 'WTFC', 'WTI', 'WTRH',
  'WVVI', 'WW', 'WWD', 'WWE', 'WWW', 'WY', 'WYNN', 'XAIR', 'XBIT',
  'XBI', 'XEL', 'XENE', 'XERS', 'XFOR', 'XGPS', 'XHR', 'XIN', 'XLAB',
  'XLRN', 'XM', 'XOM', 'XONE', 'XPEL', 'XPER', 'XPO', 'XPP', 'XRAY',
  'XRDC', 'XRX', 'XS', 'XSPA', 'XSPR', 'XTLB', 'XTNT', 'XWWW', 'XYF',
  'XYL', 'YALA', 'YEXT', 'YIN', 'YJ', 'YMM', 'YORW', 'YOSH', 'YQ',
  'YSG', 'YTEN', 'YTRA', 'YUMC', 'YUMX', 'YY', 'ZACK', 'ZAL', 'ZAR',
  'ZBM', 'ZDGE', 'ZEAL', 'ZENA', 'ZEO', 'ZETA', 'ZEV', 'ZFOX', 'ZG',
  'ZI', 'ZIM', 'ZING', 'ZION', 'ZIP', 'ZIOP', 'ZIXI', 'ZKIN', 'ZLAB',
  'ZLDP', 'ZLT', 'ZM', 'ZNGA', 'ZNTE', 'ZOAN', 'ZOM', 'ZOSH', 'ZS',
  'ZTEK', 'ZTEK', 'ZTHO', 'ZTO', 'ZTR', 'ZTS', 'ZURA', 'ZVRA', 'ZWEI',
  'ZY', 'ZYME', 'ZYXI',
];

export async function GET() {
  try {
    // Return cached if fresh
    if (cachedResult && Date.now() - cachedResult.fetchedAt < CACHE_TTL) {
      return NextResponse.json({
        candidates: cachedResult.data,
        summary: cachedResult.summary,
        cached: true,
      });
    }

    console.log('[5-PILLARS-MOMENTUM] Starting scan...');

    const allStocks = getAllStocks();
    const mainTickers = Object.keys(allStocks);

    // Combine: main watchlist + small-cap universe (deduplicated)
    const tickerSet = new Set([...SMALL_CAP_UNIVERSE, ...mainTickers]);
    const allTickers = Array.from(tickerSet);
    console.log(`[5-PILLARS-MOMENTUM] Universe: ${allTickers.length} tickers`);

    // ═══ STEP 1: Fetch real prices ═══
    let realPrices: Record<string, { price: number; change: number }> = {};
    try {
      realPrices = await getRealPrices(allTickers);
      console.log(`[5-PILLARS-MOMENTUM] Got ${Object.keys(realPrices).length} prices`);
    } catch {
      console.log('[5-PILLARS-MOMENTUM] Price fetch failed, trying fallback...');
    }

    // ═══ STEP 2: Smart pre-filter ═══
    // Ross Cameron criteria: price $0.5-$25, any positive change, focus on movers
    const candidates = allTickers.filter(t => {
      const p = realPrices[t];
      if (!p || p.price <= 0) return false;
      // Must be in plausible price range ($0.5-$25 to have any chance)
      if (p.price < 0.5 || p.price > 25) return false;
      // Must have some positive momentum
      return p.change >= 2;
    });

    // Sort by change descending, take top candidates
    candidates.sort((a, b) => (realPrices[b]?.change || 0) - (realPrices[a]?.change || 0));
    const toAnalyze = candidates.slice(0, 80);
    console.log(`[5-PILLARS-MOMENTUM] Pre-filtered to ${toAnalyze.length} candidates (from ${allTickers.length})`);

    // ═══ STEP 3: Build float map ═══
    const floatMap: Record<string, number | null> = {};
    for (const ticker of toAnalyze) {
      const profile = allStocks[ticker];
      if (profile?.shares && profile.shares > 0) {
        floatMap[ticker] = profile.shares; // already in millions
      } else {
        floatMap[ticker] = null; // unknown
      }
    }

    // ═══ STEP 4: Run 5 Pillars analysis ═══
    const results = await analyzeFivePillarsBatch(
      toAnalyze,
      realPrices,
      floatMap,
      6
    );

    console.log(`[5-PILLARS-MOMENTUM] Analysis complete: ${Object.keys(results).length} results`);

    // ═══ STEP 5: Enrich and sort ═══
    const enriched: FivePillarsCandidate[] = Object.values(results).map(r => {
      const profile = allStocks[r.symbol];
      return {
        ...r,
        company: profile?.company || r.symbol,
        sector: profile?.sector || 'Momentum',
      };
    });

    // Sort: ELIGIBLE first, then WATCH, then FLOAT_REVIEW, then REJECTED
    // Within each group: high momentum first, then pillar count, then score
    const statusOrder: Record<string, number> = { ELIGIBLE: 0, WATCH: 1, FLOAT_REVIEW: 2, REJECTED: 3 };
    enriched.sort((a, b) => {
      if (statusOrder[a.status] !== statusOrder[b.status]) return statusOrder[a.status] - statusOrder[b.status];
      if (a.highMomentum !== b.highMomentum) return a.highMomentum ? -1 : 1;
      if (b.pillarCount !== a.pillarCount) return b.pillarCount - a.pillarCount;
      return b.momentumScore - a.momentumScore;
    });

    // ═══ STEP 6: Compute summary ═══
    const total = enriched.length;
    const summary: ScanSummary = {
      totalAnalyzed: toAnalyze.length,
      eligible: enriched.filter(r => r.status === 'ELIGIBLE').length,
      watch: enriched.filter(r => r.status === 'WATCH').length,
      rejected: enriched.filter(r => r.status === 'REJECTED').length,
      floatReview: enriched.filter(r => r.status === 'FLOAT_REVIEW').length,
      strongMomentum: enriched.filter(r => r.strongMomentum).length,
      highMomentum: enriched.filter(r => r.highMomentum).length,
      pillarPassRates: {
        rvol: total ? (enriched.filter(r => r.passesRvol).length / total) * 100 : 0,
        momentum: total ? (enriched.filter(r => r.passesMomentum).length / total) * 100 : 0,
        catalyst: total ? (enriched.filter(r => r.passesCatalyst).length / total) * 100 : 0,
        price: total ? (enriched.filter(r => r.passesPrice).length / total) * 100 : 0,
        float: total ? (enriched.filter(r => r.passesFloat).length / total) * 100 : 0,
      },
    };

    cachedResult = {
      data: enriched,
      summary,
      fetchedAt: Date.now(),
    };

    console.log(`[5-PILLARS-MOMENTUM] ELIGIBLE: ${summary.eligible}, WATCH: ${summary.watch}, REJECTED: ${summary.rejected}, FLOAT_REVIEW: ${summary.floatReview}`);

    return NextResponse.json({
      candidates: enriched,
      summary,
      timestamp: new Date().toISOString(),
      cached: false,
    });
  } catch (error) {
    console.error('[5-PILLARS-MOMENTUM] Error:', error);

    if (cachedResult) {
      return NextResponse.json({
        candidates: cachedResult.data,
        summary: cachedResult.summary,
        cached: true,
        stale: true,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json({ error: 'Gabim ne analizën e 5 Pillars Momentum' }, { status: 502 });
  }
}
