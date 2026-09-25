// ═══════════════════════════════════════════════════════════════
// FUNDAMENTAL METRIC INFO — Baza e njohurive për popup-ët
// Për secilin tregues: Çfarë është / Si është tani / A është mirë / Si duhet të jetë
// ═══════════════════════════════════════════════════════════════

export type MetricVerdict = 'MIRË' | 'NË RREGULL' | 'KUJDES' | 'KEQ' | 'VARION';

export interface MetricAssessment {
  verdict: MetricVerdict;
  text: string;
}

export interface AssessmentContext {
  currentPrice?: number;
  analysis?: {
    valuation?: { peRatio?: number; marketCap?: string };
    earnings?: { eps?: string; forwardEps?: string };
    profitability?: { netMargin?: string };
  };
}

export interface MetricInfo {
  title: string;
  what: string;
  ideal: string;
  assess: (parsed: number, raw: string | number, ctx?: AssessmentContext) => MetricAssessment;
}

/** Parser universal për vlerat — "47.9%", "$4.95T", "$107.7B", 41, "0.38%", "328.22" */
export function parseMetricNum(v: string | number): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v !== 'string') return null;
  const m = v.replace(/[$,\s]/g, '').match(/^(-?\d+(?:\.\d+)?)\s*([TBM])?/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  if (m[2] === 'T') n *= 1e12;
  else if (m[2] === 'B') n *= 1e9;
  else if (m[2] === 'M') n *= 1e6;
  return Number.isFinite(n) ? n : null;
}

const asPct = (n: number) => `${n.toFixed(1)}%`;

export const METRIC_INFO: Record<string, MetricInfo> = {
  // ═══════════════ VLERËSIMI ═══════════════
  marketCap: {
    title: 'Market Cap (Vlera e Tregut)',
    what: 'Vlera totale e kompanisë në treg, e llogaritur si çmimi i aksionit × numri i aksioneve në qarkullim. Tregon sa e madhe dhe e vendosur është kompania.',
    ideal: 'Nuk ka vlerë "ideale" — varet nga strategjia jote: mbi $10B (large-cap) ofron stabilitet dhe dividend; $2-10B (mid-cap) balancion rritje me rrezik; nën $2B (small-cap) ka potencial rritjeje më të lartë, por edhe rrezik më të madh.',
    assess: (v) => {
      if (v >= 1e12) return { verdict: 'MIRË', text: `Kompani gjigante ($${(v / 1e12).toFixed(2)}T) — stabilite e lartë, likuiditet i madh, por rritja zakonisht më e ngadaltë.` };
      if (v >= 2e10) return { verdict: 'MIRË', text: `Kompani e madhe ($${(v / 1e9).toFixed(0)}B) — e vendosur në treg me burime të konsoliduara.` };
      if (v >= 2e9) return { verdict: 'VARION', text: `Mid-cap ($${(v / 1e9).toFixed(1)}B) — potencial rritjeje i mirë, por më e ndjeshme ndaj recesioneve.` };
      return { verdict: 'KUJDES', text: `Small-cap ($${(v / 1e9).toFixed(1)}B) — vullnet i lartë, likuiditet i kufizuar dhe rrezik më i madh.` };
    },
  },
  peRatio: {
    title: 'P/E Ratio (Çmim/Fitim)',
    what: 'Sa paguan tregu për $1 fitim vjetor të kompanisë. Matësi më i përdorur i vlerësimit: një P/E i ulët mund të thotë "e lirë", një i lartë mund të thotë "e shtrenjtë" ose pritje rritjeje të madhe.',
    ideal: 'Si rregull i përgjithshëm: nën 15 = e lirë, 15-25 = e drejtë, mbi 30 = e shtrenjtë. Krahasoni gjithmonë me mesataren e sektorit — teknologjia toleron P/E më të lartë se bankat.',
    assess: (v) => {
      if (v <= 0) return { verdict: 'KUJDES', text: 'Kompania ka humbje — P/E negativ. Vlerësoni me P/S dhe rrugën drejt fitimit.' };
      if (v < 15) return { verdict: 'MIRË', text: `P/E ${v.toFixed(1)} është i ulët — aksioni duket i lirë. Kontrollo edhe rritjen: mos të jetë "cheap për një arsye".` };
      if (v < 25) return { verdict: 'NË RREGULL', text: `P/E ${v.toFixed(1)} është brenda rangut normal — vlerësim i arsyeshëm.` };
      if (v < 35) return { verdict: 'KUJDES', text: `P/E ${v.toFixed(1)} është mbi mesataren — vlerësim premium. Vetëm rritja e fortë e justifikon.` };
      return { verdict: 'KEQ', text: `P/E ${v.toFixed(1)} është shumë i lartë — risk komprimimi të madh nëse rritja zhgënjehet.` };
    },
  },
  forwardPE: {
    title: 'Forward P/E (P/E i Pritur)',
    what: 'P/E i llogaritur me fitimet e parashikuara të vitit të ardhshëm — jo me ato historike. Parashikon sa do të duket vlerësimi nesër.',
    ideal: 'Nën 15 = lirë, 15-22 = e drejtë, mbi 28 = e shtrenjtë. Nëse Forward P/E < P/E historik, tregu pret përmirësim fitimesh.',
    assess: (v) => {
      if (v <= 0) return { verdict: 'KUJDES', text: 'Priten humbje vitin e ardhshëm — Forward P/E negativ.' };
      if (v < 15) return { verdict: 'MIRË', text: `Forward P/E ${v.toFixed(1)} — vlerësim tërheqës bazuar në fitimet e ardhshme.` };
      if (v < 22) return { verdict: 'NË RREGULL', text: `Forward P/E ${v.toFixed(1)} — normal për tregun aktual.` };
      return { verdict: 'KUJDES', text: `Forward P/E ${v.toFixed(1)} i lartë — po paguan premium për fitime që ende nuk kanë ndodhur.` };
    },
  },
  pegRatio: {
    title: 'PEG Ratio (P/E i rregulluar me rritje)',
    what: 'P/E pjesëtuar me ritmin e rritjes së fitimeve — ndëshkon P/E-në e lartë me rritjen. Zgjidh problemin "e shtrenjtë por po rritet shpejt".',
    ideal: 'Nën 1 = nënvlerësuar (rrritja "lirë"), rreth 1 = e balancuar, mbi 2 = e shtrenjtë edhe me rritje. Është nga matësit më të mirë për growth stocks.',
    assess: (v) => {
      if (v <= 0) return { verdict: 'KUJDES', text: 'Nuk ka rritje fitimesh për ta mbështetur vlerësimin.' };
      if (v < 1) return { verdict: 'MIRË', text: `PEG ${v.toFixed(2)} — po paguan më pak se çmimi i rritjes: nënvlerësim i potencialit.` };
      if (v < 2) return { verdict: 'NË RREGULL', text: `PEG ${v.toFixed(2)} — balancë e shëndetshme mes çmimit dhe rritjes.` };
      return { verdict: 'KEQ', text: `PEG ${v.toFixed(2)} — rritja nuk e justifikon çmimin aktual të aksionit.` };
    },
  },
  priceToSales: {
    title: 'P/S Ratio (Çmimi/Të Ardhura)',
    what: 'Vlera e tregut pjesëtuar me të ardhurat vjetore — sa paguan për $1 shitjesh. I dobishëm kur kompania nuk ka fitim (p.sh. startup-e në rritje).',
    ideal: 'Nën 1.5 = shumë lirë, 1.5-3 = normale, mbi 8 = premium i lartë (vetëm marzha shumë të larta e justifikojnë).',
    assess: (v) => {
      if (v < 1.5) return { verdict: 'MIRË', text: `P/S ${v.toFixed(1)} — e ardhura po blihet lirë.` };
      if (v < 3) return { verdict: 'NË RREGULL', text: `P/S ${v.toFixed(1)} — në linjë me tregun.` };
      if (v < 8) return { verdict: 'KUJDES', text: `P/S ${v.toFixed(1)} mbi mesataren — kërkon marzha dhe rritje të fortë.` };
      return { verdict: 'KEQ', text: `P/S ${v.toFixed(1)} shumë i lartë — çdo zhgënjim shitjesh godet rëndë çmimin.` };
    },
  },
  priceToBook: {
    title: 'P/B Ratio (Çmimi/Kapitali Libror)',
    what: 'Çmimi i aksionit krahasuar me vlerën kontabile të pasurive të kompanisë (çfarë do mbetej po të shitte gjithçka dhe paguante borxhet).',
    ideal: 'Nën 1 = tregtohet nën vlerën librore (potencial i lirë), 1-3 = normale, mbi 5 = premium — normal për biznese me pak aktive fizike (software, brand-e).',
    assess: (v) => {
      if (v < 1) return { verdict: 'MIRË', text: `P/B ${v.toFixed(1)} — nën vlerën librore. Kontrollo pse: vlerë e fshehur ose probleme strukturore.` };
      if (v < 3) return { verdict: 'NË RREGULL', text: `P/B ${v.toFixed(1)} — brenda rangut normal.` };
      if (v < 5) return { verdict: 'KUJDES', text: `P/B ${v.toFixed(1)} i lartë — justifikohet vetëm nga aktive jofizike të vlefshme.` };
      return { verdict: 'VARION', text: `P/B ${v.toFixed(1)} shumë i lartë — tipik për tech (Apple, Microsoft), i pavarur për industri të rënda.` };
    },
  },
  evToEbitda: {
    title: 'EV/EBITDA',
    what: 'Vlera e plotë e ndërmarrjes (Enterprise Value = kapitalizimi + borxhi - para në dorë) pjesëtuar me fitimin operativ para amortizimit. Matësi i preferuar për krahasime ndërkombëtare.',
    ideal: 'Nën 10 = tërheqëse, 10-15 = e drejtë, mbi 20 = e shtrenjtë. I njëjti nivel për fitim para taksave, interesave dhe amortizimit në çdo vend.',
    assess: (v) => {
      if (v < 10) return { verdict: 'MIRË', text: `EV/EBITDA ${v.toFixed(1)} — vlerësim tërheqës edhe duke përfshirë borxhin.` };
      if (v < 15) return { verdict: 'NË RREGULL', text: `EV/EBITDA ${v.toFixed(1)} — nivel i drejtë për tregun.` };
      return { verdict: 'KUJDES', text: `EV/EBITDA ${v.toFixed(1)} i lartë — po paguan shumë për çdo dollar fitimi operativ.` };
    },
  },
  dividendYield: {
    title: 'Dividend Yield (Rendimenti i Dividendit)',
    what: 'Dividenti vjetor pjesëtuar me çmimin e aksionit — sa të kthen kompania në para çdo vit vetëm për faktin se je aksioner.',
    ideal: '2-6% = zona e ëmbël e qëndrueshme. Mbi 8% shpesh është "dividend trap" (çmimi ka rënë aq shumë sa rendimenti duket i madh). 0% nuk është keq — kompania po reinveston për rritje.',
    assess: (v) => {
      if (v <= 0.01) return { verdict: 'VARION', text: 'Ska dividend (ose shumë i vogël) — kompania rritjeje që reinveston fitimet. Nëse të duhet të ardhurë mujore, kjo nuk është për ty.' };
      if (v < 2) return { verdict: 'NË RREGULL', text: `Rendiment ${asPct(v)} — i ulët, tipik për growth stocks.` };
      if (v <= 6) return { verdict: 'MIRË', text: `Rendiment ${asPct(v)} — zonë e shëndetshme, e qëndrueshme për kompani të pjekura.` };
      return { verdict: 'KUJDES', text: `Rendiment ${asPct(v)} i lartë — verifiko payout ratio: mund të jetë kurth dividendesh përpara një prerjeje.` };
    },
  },

  // ═══════════════ FITUESHMËRIA ═══════════════
  grossMargin: {
    title: 'Gross Margin (Marzha Bruto)',
    what: 'Përqindja e të ardhurave që mbetet pas kostos direkte të produkteve/shërbimeve. Mat fuqinë e çmimit — sa fort mund ta "ngre" çmimin pa humbur klientë.',
    ideal: 'Mbi 40% = e shkëlqyer (pricing power i fortë, si Apple apo Microsoft), 20-40% = normale, nën 20% = e dobët (konkurrencë me çmim).',
    assess: (v) => {
      if (v >= 40) return { verdict: 'MIRË', text: `Marzha bruto ${asPct(v)} — fuqi e rrallë vendosjes çmimi. Klientët paguajnë premium vullnetarisht.` };
      if (v >= 20) return { verdict: 'NË RREGULL', text: `Marzha bruto ${asPct(v)} — tipike për industri konkurruese.` };
      return { verdict: 'KUJDES', text: `Marzha bruto ${asPct(v)} — e hollë: biznesi varet nga volumi dhe është i ndjeshëm ndaj inflacionit të kostos.` };
    },
  },
  operatingMargin: {
    title: 'Operating Margin (Marzha Operative)',
    what: 'Fitimi operativ pjesëtuar me të ardhurat — efikasiteti real i biznesit duke përfshirë pagat, marketingun, R&D-në. Marzha që kontrollon menaxhmenti.',
    ideal: 'Mbi 20% = e shkëlqyer, 8-20% = e mirë, nën 5% = e dobët. Krahaso gjithmonë me konkurrentët e drejtpërdrejtë.',
    assess: (v) => {
      if (v >= 20) return { verdict: 'MIRË', text: `Marzha operative ${asPct(v)} — biznes shumë efikas, çdo shitje gjeneron shumë fitim.` };
      if (v >= 8) return { verdict: 'NË RREGULL', text: `Marzha operative ${asPct(v)} — e pranueshme për shumicën e industrive.` };
      return { verdict: 'KUJDES', text: `Marzha operative ${asPct(v)} — e ulët: kosto fikse të larta apo presion konkurrence.` };
    },
  },
  netMargin: {
    title: 'Net Margin (Marzha Neto)',
    what: 'Fitimi final pjesëtuar me të ardhurat — çfarë mbetet vërtet për aksionerët pas çdo kostoje, takse dhe interesi.',
    ideal: 'Mbi 20% = elitë, 10-20% = e mirë, 5-10% = mesatare, nën 5% = e dobët. Marzha neto e qëndrueshme >10% është shenjë cilësie.',
    assess: (v) => {
      if (v >= 20) return { verdict: 'MIRË', text: `Marzha neto ${asPct(v)} — kompania kthen mbi 20 centë fitim për çdo dollar shitjeje.` };
      if (v >= 10) return { verdict: 'MIRË', text: `Marzha neto ${asPct(v)} — mbi mesataren e tregut.` };
      if (v >= 5) return { verdict: 'NË RREGULL', text: `Marzha neto ${asPct(v)} — mesatare; ndjeshme ndaj ciklit ekonomik.` };
      return { verdict: 'KUJDES', text: `Marzha neto ${asPct(v)} — e ulët: pak hapësirë për gabime menaxhimi.` };
    },
  },
  returnOnEquity: {
    title: 'ROE (Kthimi mbi Kapitalin)',
    what: 'Fitimi i gjeneruar për çdo dollar kapitali të aksionerëve — sa mirë menaxhmenti përdor paratë e pronarëve.',
    ideal: 'Mbi 15-20% = e shkëlqyer (Buffett e do >20% të qëndrueshme), 10-15% = e mirë, nën 10% = e dobët. Kujdes: borxhi i lartë e fryn ROE-në artificialisht.',
    assess: (v) => {
      if (v >= 20) return { verdict: 'MIRË', text: `ROE ${asPct(v)} — kapitali po punësohet me efikasitet të lartë. Verifiko edhe borxhin.` };
      if (v >= 10) return { verdict: 'NË RREGULL', text: `ROE ${asPct(v)} — e pranueshme, por jo elitare.` };
      return { verdict: 'KUJDES', text: `ROE ${asPct(v)} — kapitali nuk po gjeneron mjaftueshëm. Kontrollo nëse vjen nga borxhi apo jo.` };
    },
  },
  returnOnAssets: {
    title: 'ROA (Kthimi mbi Aktivet)',
    what: 'Fitimi pjesëtuar me totalin e aktiveve — sa prodhon çdo dollar i pasurisë së kompanisë. Më i vështirë për t\'u fryrë me borxh se ROE.',
    ideal: 'Mbi 10% = e shkëlqyer, 5-10% = e mirë, nën 2% = e dobët. Bizneset "e lehta" në aktive (software) kanë ROA më të lartë se ato industriale.',
    assess: (v) => {
      if (v >= 10) return { verdict: 'MIRË', text: `ROA ${asPct(v)} — aktivet po gjenerojnë fitim në mënyrë të shkëlqyer.` };
      if (v >= 5) return { verdict: 'NË RREGULL', text: `ROA ${asPct(v)} — normal për biznese me aktive të konsiderueshme.` };
      return { verdict: 'KUJDES', text: `ROA ${asPct(v)} — aktivet nuk po punojnë mjaftueshëm për aq para sa kanë.` };
    },
  },
  returnOnInvestment: {
    title: 'ROI (Kthimi mbi Investimin)',
    what: 'Kthimi i përgjithshëm i kapitalit të investuar (ekuitet + borxh) — mat nëse kompania krijon vlerë mbi koston e kapitalit të saj.',
    ideal: 'Mbi 15% = krijon vlerë të qartë, mbi 20% = e shkëlqyer, nën 8% = vlera po shkatërrohet (nuk e mbulon koston e kapitalit).',
    assess: (v) => {
      if (v >= 20) return { verdict: 'MIRË', text: `ROI ${asPct(v)} — investimet po kthehen me teprim të madh.` };
      if (v >= 12) return { verdict: 'NË RREGULL', text: `ROI ${asPct(v)} — mbi koston tipike të kapitalit.` };
      return { verdict: 'KUJDES', text: `ROI ${asPct(v)} — afër ose nën koston e kapitalit: zgjerimi s'po shton vlerë reale.` };
    },
  },

  // ═══════════════ RRITJA ═══════════════
  revenueGrowth: {
    title: 'Rritja e të Ardhurave (YoY)',
    what: 'Sa kanë rritur shitjet krahasuar me të njëjtën periudhë vitin e kaluar — motori kryesor i çdo historie rritjeje.',
    ideal: 'Mbi 20% = e fortë (growth stock), 5-15% = e shëndetshme për kompani të pjekura, 0-5% = e ngadaltë, negative = kontrakim.',
    assess: (v) => {
      if (v >= 20) return { verdict: 'MIRË', text: `Rritje ${asPct(v)} — e fortë; tregu po e vlerëson këtë momentum.` };
      if (v >= 5) return { verdict: 'NË RREGULL', text: `Rritje ${asPct(v)} — e shëndetshme për një kompani në pjekje.` };
      if (v >= 0) return { verdict: 'KUJDES', text: `Rritje ${asPct(v)} — pothuajse ngecje; kërkon katalizator të re.` };
      return { verdict: 'KEQ', text: `Rritje ${asPct(v)} — shitjet po bien. Rrezik real për kompresion të vlerësimit.` };
    },
  },
  earningsGrowth: {
    title: 'Rritja e Fitimeve (YoY)',
    what: 'Rritja e fitimit neto nga viti në vit. Fitimet — jo shitjet — janë çfarë në fund i paguan aksionerët.',
    ideal: 'Idealja: rritja e fitimeve ≥ rritja e të ardhurave (efekti levë pozitiv). Mbi 15% = e fortë, nën 5% = e dobët.',
    assess: (v) => {
      if (v >= 15) return { verdict: 'MIRË', text: `Rritje fitimesh ${asPct(v)} — fitimet po rriten më shpejt se ekonomia.` };
      if (v >= 5) return { verdict: 'NË RREGULL', text: `Rritje fitimesh ${asPct(v)} — e pranueshme; kontrollo nëse e mbulon inflacionin.` };
      if (v >= 0) return { verdict: 'KUJDES', text: `Rritje fitimesh vetëm ${asPct(v)} — marzhat po kompresohen.` };
      return { verdict: 'KEQ', text: `Fitimet në rënie ${asPct(v)} — trend negative që kërkon shpjegim urgjent.` };
    },
  },
  revenueGrowth3Y: {
    title: 'Rritja 3-vjeçare e të Ardhurave',
    what: 'Ritmi mesatar vjetor (CAGR) i shitjeve gjatë 3 viteve të fundit — tregon nëse rritja është trend i qëndrueshëm apo rastësi e një viti të mirë.',
    ideal: 'Mbi 10% e qëndrueshme = motor i besueshëm. Krahasoje me 1-vjeçaren: nëse 3Y > 1Y, rritja po përshpejtohet.',
    assess: (v) => {
      if (v >= 10) return { verdict: 'MIRË', text: `CAGR 3-vjeçar ${asPct(v)} — rritje e qëndrueshme afatgjatë, jo flakë e kaluar.` };
      if (v >= 4) return { verdict: 'NË RREGULL', text: `CAGR 3-vjeçar ${asPct(v)} — rritje graduale e stabil.` };
      if (v >= 0) return { verdict: 'KUJDES', text: `CAGR 3-vjeçar ${asPct(v)} — gati ngecje afatgjatë.` };
      return { verdict: 'KEQ', text: `CAGR 3-vjeçar ${asPct(v)} — biznesi po tkurret vit pas viti.` };
    },
  },
  earningsGrowth3Y: {
    title: 'Rritja 3-vjeçare e Fitimeve',
    what: 'CAGR i fitimit neto gjatë 3 viteve — qëndrueshmëria e motorit të fitimit përgjatë një cikli të plotë ekonomik.',
    ideal: 'Mbi 12% = e shkëlqyer, 5-12% = e mirë, negative = struktura e fitimit e thyer.',
    assess: (v) => {
      if (v >= 12) return { verdict: 'MIRË', text: `Fitimet me CAGR ${asPct(v)} për 3 vite — makinë fitimi e provuar.` };
      if (v >= 5) return { verdict: 'NË RREGULL', text: `CAGR fitimi ${asPct(v)} — e mirë, por jo eksplozive.` };
      if (v >= 0) return { verdict: 'KUJDES', text: `CAGR fitimi ${asPct(v)} — fitimet po gnjehen ngadalë.` };
      return { verdict: 'KEQ', text: `CAGR fitimi ${asPct(v)} — tre vite me fitime në rënie kumulative.` };
    },
  },
  quarterlyRevenueGrowth: {
    title: 'Rritja Kuartale e të Ardhurave',
    what: 'Rritja e shitjeve të kuartalit të fundit krahasuar me të njëjtin kuartal vitin e kaluar — pulsi më i freskët i biznesit.',
    ideal: 'Të përputhet me trendin vjetor. Kur kuartali tejkalon ndjeshëm 1Y, mund të jetë përshpejtim; kur bie nën, sinjal i hershëm përkeqësimi.',
    assess: (v) => {
      if (v >= 15) return { verdict: 'MIRË', text: `Kuartali i fundit +${asPct(v)} — momentum i freskët blerës.` };
      if (v >= 5) return { verdict: 'NË RREGULL', text: `Kuartali i fundit +${asPct(v)} — në linjë me trendin.` };
      if (v >= 0) return { verdict: 'KUJDES', text: `Kuartali +${asPct(v)} — po fiket; krahaso me kuartalët e mëparshëm.` };
      return { verdict: 'KEQ', text: `Kuartali ${asPct(v)} — shitjet ranë realisht vit më vit.` };
    },
  },
  quarterlyEarningsGrowth: {
    title: 'Rritja Kuartale e Fitimeve',
    what: 'Rritja e fitimit të kuartalit të fundit YoY — verifikimi i fundit që marzhat po përkthehen në fitim.',
    ideal: 'Pozitive dhe në rritje. Fitimet kuartare duhet të ndjekin (ose tejkalojnë) të ardhurat për efekt levë.',
    assess: (v) => {
      if (v >= 15) return { verdict: 'MIRË', text: `Fitimi kuartalor +${asPct(v)} — kompania po godet përpara pritjeve.` };
      if (v >= 0) return { verdict: 'NË RREGULL', text: `Fitimi kuartalor +${asPct(v)} — pozitiv por pa surprizë.` };
      return { verdict: 'KEQ', text: `Fitimi kuartalor ${asPct(v)} — humbje afërsisht e garantuar e besimit të tregut.` };
    },
  },

  // ═══════════════ SHËNDETI FINANCIAR ═══════════════
  currentRatio: {
    title: 'Current Ratio (Raporti i Likuiditetit)',
    what: 'Aktivet afatshkurtra pjesëtuar me detyrimet afatshkurtra — a mund kompania të paguajë faturat e vitit në vijim pa huajtur.',
    ideal: '1.5 - 3.0 = zona e shëndetshme. Nën 1 = rrezik likuiditeti. Mbi 3 = para që po flejnë pa u përdorur.',
    assess: (v) => {
      if (v >= 1.5 && v <= 3) return { verdict: 'MIRË', text: `Current Ratio ${v.toFixed(2)} — bilanc i balancuar, detyrimet e afërta të mbuluara mirë.` };
      if (v >= 1) return { verdict: 'KUJDES', text: `Current Ratio ${v.toFixed(2)} — ngushtë: ndonjë vonesë pagese mund të krijojë presion.` };
      if (v > 3) return { verdict: 'NË RREGULL', text: `Current Ratio ${v.toFixed(2)} — i lartë: i sigurt, por kapitali mund të punësohet më mirë.` };
      return { verdict: 'KEQ', text: `Current Ratio ${v.toFixed(2)} — nën 1: detyrimet e afërta tejkalojnë likuiditetin.` };
    },
  },
  quickRatio: {
    title: 'Quick Ratio (Raporti i Testit Acid)',
    what: 'Si Current Ratio, por pa përfshirë inventarin — a mbijeton kompania po ta shitte vetëm keshën dhe të arkëtueshmen. Testi më i ashpër i likuiditetit.',
    ideal: 'Mbi 1.0 = e sigurt, 0.8-1.0 = e pranueshme, nën 0.7 = e varur nga shitja e inventarit për të paguar.',
    assess: (v) => {
      if (v >= 1) return { verdict: 'MIRË', text: `Quick Ratio ${v.toFixed(2)} — paguan çdo detyrim të afërt pa prekur inventarin.` };
      if (v >= 0.8) return { verdict: 'NË RREGULL', text: `Quick Ratio ${v.toFixed(2)} — ngushtë por e menaxhueshme.` };
      return { verdict: 'KUJDES', text: `Quick Ratio ${v.toFixed(2)} — mbijetesa varet nga shitja e shpejtë e inventarit.` };
    },
  },
  debtToEquity: {
    title: 'Debt/Equity (Borxhi mbi Kapitalin)',
    what: 'Borxhi total pjesëtuar me kapitalin e aksionerëve — sa e mbështetur biznesi mbi para të huazuara. Leva e dyfishtë: e forcon rritjen, thellon rëniet.',
    ideal: 'Nën 0.5 = i fortë, 0.5-1.5 = e moderuar (normale), mbi 2 = e rrezikshme. Bankat dhe Sigurimet kanë natyrërisht D/E të lartë.',
    assess: (v) => {
      if (v < 0.5) return { verdict: 'MIRË', text: `D/E ${v.toFixed(2)} — pothuajse pa borxh: hapësirë e madhe huajeje për rritje.` };
      if (v <= 1.5) return { verdict: 'NË RREGULL', text: `D/E ${v.toFixed(2)} — borxh i moderuar dhe i menaxhueshëm.` };
      return { verdict: 'KUJDES', text: `D/E ${v.toFixed(2)} — levë e lartë: norma e interesit bëhet faktor i rrezikut real.` };
    },
  },
  debtToAssets: {
    title: 'Debt/Assets (Borxhi mbi Aktivet)',
    what: 'Përqindja e pasurisë së kompanisë e financuar me borxh — nga çdo dollar aktive, sa i përket bankave dhe sa aksionerëve.',
    ideal: 'Nën 0.4 = e shëndetshme, 0.4-0.6 = e moderuar, mbi 0.6 = e rënduar.',
    assess: (v) => {
      if (v < 0.4) return { verdict: 'MIRË', text: `Vetëm ${(v * 100).toFixed(0)}% e aktiveve me borxh — pronarët kontrollojnë pjesën kryesore.` };
      if (v <= 0.6) return { verdict: 'NË RREGULL', text: `${(v * 100).toFixed(0)}% e aktiveve me borxh — brenda normës.` };
      return { verdict: 'KUJDES', text: `${(v * 100).toFixed(0)}% e aktiveve me borxh — kapitali i kreditorëve dominon.` };
    },
  },
  freeCashFlow: {
    title: 'Free Cash Flow (Cash Flow i Lirë)',
    what: 'Paratë e gjeneruara nga operacionet pasi paguhen investimet (CAPEX) — paratë "e vërteta" që mund të shpërndahen si dividend, blerje aksionesh apo rritje.',
    ideal: 'Pozitiv dhe në rritje. FCF Yield (FCF/MCap) mbi 5% = tërheqëse. FCF negativ te kompanitë e pjekura = sinjal i keq.',
    assess: (v) => {
      if (v > 0) return { verdict: 'MIRË', text: `FCF pozitiv ($${(v / 1e9).toFixed(1)}B) — makina e parave po punon: dividendet dhe blerjet e aksioneve financohen vetë.` };
      return { verdict: 'KUJDES', text: `FCF negativ — biznesi konsumon para çdo vit. Qëndrueshmëria varet nga kashja në bankë.` };
    },
  },

  // ═══════════════ FITIMI (EPS) ═══════════════
  eps: {
    title: 'EPS (Fitimi për Aksion)',
    what: 'Fitimi neto i ndarë për numrin e aksioneve — fitimi që i takon çdo aksioni që ke. Baza e P/E dhe e dividendit.',
    ideal: 'Nuk ka "vlerë ideale" absolute — krahasohet me çmimin (përmes P/E) dhe me historikun: EPS duhet të rritet vit pas viti.',
    assess: (v, _raw, ctx) => {
      const fwd = ctx?.analysis?.earnings?.forwardEps ? parseMetricNum(ctx.analysis.earnings.forwardEps) : null;
      if (fwd !== null && v > 0) {
        if (fwd > v) return { verdict: 'MIRË', text: `EPS ${v.toFixed(2)} me pritje rritjeje drejt $${fwd.toFixed(2)} — trajektorë pozitive.` };
        return { verdict: 'KUJDES', text: `EPS ${v.toFixed(2)} pritet të bjerë në $${fwd.toFixed(2)} — analistët shohin dobësim.` };
      }
      return { verdict: 'VARION', text: `EPS ${v.toFixed(2)} — vlerësoje përmes P/E (çmimi/fitimi) dhe trendit vjetor.` };
    },
  },
  epsGrowth: {
    title: 'EPS Growth (Rritja e Fitimit për Aksion)',
    what: 'Rritja vjetore e fitimit për aksion. Kombinon rritjen e fitimit me blerjet e aksioneve (që e rrisin EPS edhe pa rritje fitimi).',
    ideal: 'Mbi 10% = e mirë, mbi 20% = e shkëlqyer. Rritja e qëndrueshme e EPS-it është motori afatgjatë i çmimit.',
    assess: (v) => {
      if (v >= 10) return { verdict: 'MIRË', text: `EPS +${asPct(v)} — fitimi për aksion po rritet shëndetshëm.` };
      if (v >= 0) return { verdict: 'NË RREGULL', text: `EPS +${asPct(v)} — rritje modeste.` };
      return { verdict: 'KEQ', text: `EPS ${asPct(v)} — çdo aksion po fiton më pak se vitin e kaluar.` };
    },
  },
  forwardEps: {
    title: 'Forward EPS (EPS i Pritur)',
    what: 'Parashikimi i analistëve për fitimin për aksion të vitit në vijim — drejtimi ku po ecën kompania.',
    ideal: 'Më i lartë se EPS aktual (ritje e pritshme). Diferenca në % tregon optimizmin e analistëve.',
    assess: (v, _raw, ctx) => {
      const eps = ctx?.analysis?.earnings?.eps ? parseMetricNum(ctx.analysis.earnings.eps) : null;
      if (eps !== null && eps > 0) {
        const growth = ((v - eps) / eps) * 100;
        if (growth > 5) return { verdict: 'MIRË', text: `Pritet $${v.toFixed(2)} (+${growth.toFixed(1)}% ndaj aktualit) — analistët shohin përshpejtim.` };
        if (growth >= 0) return { verdict: 'NË RREGULL', text: `Pritet $${v.toFixed(2)} (+${growth.toFixed(1)}%) — rritje graduale.` };
        return { verdict: 'KUJDES', text: `Pritet $${v.toFixed(2)} (${growth.toFixed(1)}%) — pritet kontrakim fitimi.` };
      }
      return { verdict: 'VARION', text: `Forward EPS $${v.toFixed(2)} — krahasoje me EPS-in aktual për drejtimin.` };
    },
  },
  nextEarningsDate: {
    title: 'Data e Ardhshme e Raportimit',
    what: 'Dita kur kompania do raportojë fitimet e kuartalit të ardhshëm — momenti më i paqëndrueshëm i çmimit (lëvizje tipike ±5-10%).',
    ideal: 'Përdore si kalendar menaxhimi rreziku: para datës, pozicionet e mëdha rritin rrezikun e "surprizave".',
    assess: () => ({ verdict: 'VARION', text: 'Event katalizator: çmimi mund të lëvizë fort në të dy drejtimet. Disa investitorë pritin raportimin para se të pozicionohen; të tjerë e luajnë vetë surprizën.' }),
  },

  // ═══════════════ KONSENSUSI I ANALISTËVE ═══════════════
  targetPrice: {
    title: 'Target Price (Çmimi Objektiv i Analistëve)',
    what: 'Mesatarja e objektivave të çmimit nga të gjithë analistët që mbulojnë aksionin — përfshin edhe të pesimistët edhe të optimistët.',
    ideal: 'Krahasoje gjithmonë me çmimin aktual: upside i lartë pa arsye = i dyshimtë. Rangji Low-High tregon mospajatimin mes analistëve.',
    assess: (v, _raw, ctx) => {
      const price = ctx?.currentPrice;
      if (price && price > 0) {
        const upside = ((v - price) / price) * 100;
        if (upside > 15) return { verdict: 'MIRË', text: `Objektivi $${v.toFixed(2)} është +${upside.toFixed(1)}% mbi çmimin aktual ($${price.toFixed(2)}) — analistët shohin vlerë të palejuar.` };
        if (upside > 3) return { verdict: 'NË RREGULL', text: `Objektivi $${v.toFixed(2)} është +${upside.toFixed(1)}% mbi çmimin aktual — pritje mesatare.` };
        if (upside > -5) return { verdict: 'KUJDES', text: `Objektivi $${v.toFixed(2)} është vetëm ${upside.toFixed(1)}% mbi çmimin — aksioni tashmë po tregtohet afër vlerësimit të plotë.` };
        return { verdict: 'KEQ', text: `Objektivi $${v.toFixed(2)} është NËN çmimin aktual — analistët shohin rrezik rënieje ${upside.toFixed(1)}%.` };
      }
      return { verdict: 'VARION', text: `Objektivi mesatar $${v.toFixed(2)}. Krahasoje me çmimin aktual për upside/downside.` };
    },
  },
};
