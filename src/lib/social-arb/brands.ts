// ═══════════════════════════════════════════════════════════════
// SOCIAL ARB — fjalori markë/produkt → kompani/ticker
//
// Ky është "klasifikuesi": një term nga Google Trends bëhet kandidat
// vetëm nëse përputhet me një markë të listuar këtu (kontroll në kufij
// fjalësh, jo nënstring). materiality/promo_risk/event_risk janë
// VLERËSIME MANUALE 0–1 (ashtu si në skemën CSV) dhe `cap` është
// kova e kapitalizimit që kufizon materialitetin — rregulli Camillo:
// një trend shoqëror rrallë lëviz një mega-cap.
// ═══════════════════════════════════════════════════════════════

export type CapBucket = 'mega' | 'large' | 'mid' | 'small';

export interface BrandEntry {
  aliases: string[];
  ticker: string;
  company: string;
  product: string;
  materiality: number; // 0–1 — pesha e markës në biznesin e kompanisë
  promoRisk: number;   // 0–1 — rrezik promovimi artificial / influencer
  eventRisk: number;   // 0–1 — rrezik se trendi është event i pambaruar
  cap: CapBucket;
  gdeltQuery?: string; // pyetja GDELT (default: alias-i kryesor)
  /** Artikulli Wikipedia për markën (titulli kanonik) — ushqen gate-in e burimeve
   *  dhe atë të qëndrueshmërisë. Kur mungon, provohet alias-i kryesor i kapitalizuar. */
  wikiArticle?: string;
  /** Lloji i lidhjes markë → kompani e listuar (default: direct). */
  linkType?: 'direct' | 'parent' | 'supplier' | 'retailer';
  dossier?: { confirm: string; kill: string; risk: string };
}

// Materialiteti efektiv = min(materiality, tavani i kap-it) — Camillo:
// mega-cap strukturalisht nuk lëviz nga një trend konsumi.
export const CAP_CEILING: Record<CapBucket, number> = {
  mega: 0.35,
  large: 0.55,
  mid: 0.85,
  small: 1.0,
};

export function effectiveMateriality(b: BrandEntry): number {
  return Math.min(b.materiality, CAP_CEILING[b.cap]);
}

// ── Fjalori ──────────────────────────────────────────────────────
// I renditur sipas sektorëve konsumerë që Camillo ndjek.
export const BRANDS: BrandEntry[] = [
  // ── Pije energjike / pije ──
  {
    aliases: ['celsius', 'celsius drink', 'celsius energy', 'celsius energy drink', 'celsius vibe', 'celsius stock'],
    ticker: 'CELH', company: 'Celsius Holdings', product: 'CELSIUS (pije energjike)',
    wikiArticle: 'Celsius (energy drink)',
    materiality: 0.95, promoRisk: 0.5, eventRisk: 0.3, cap: 'small', gdeltQuery: 'celsius drink',
    dossier: {
      confirm: 'Interesi për CELSIUS rritet me të paktën 25% në dy burime (Google Trends + GDELT këtu) ndërsa aksioni nuk ka reaguar më shumë se +3% ndaj indeksit — divergjenca interes-vs-çmim është thelbi i Social Arb.',
      kill: 'Interesi rritet por shitjet dhe zgjerimi i shpërndarjes nuk e ndjekin, ose rritja vjen kryesisht nga një fushatë e paguar me kode promovimi.',
      risk: 'Pijet energjike promovohen fort nga influencer-t: një spik i sponsorizuar mund të duket si kërkesë organike. Verifiko përmbajtjen për kode zbritjesh para se ta lexosh si sinjal.',
    },
  },
  {
    aliases: ['monster energy', 'monster drink', 'monster ultra', 'monster beverage'],
    ticker: 'MNST', company: 'Monster Beverage', product: 'Monster Energy',
    wikiArticle: 'Monster Energy',
    materiality: 0.85, promoRisk: 0.3, eventRisk: 0.2, cap: 'mid',
  },
  {
    aliases: ['gatorade', 'powerade'],
    ticker: 'PEP', company: 'PepsiCo', product: 'Gatorade / Powerade',
    wikiArticle: 'Gatorade', linkType: 'parent',
    materiality: 0.1, promoRisk: 0.2, eventRisk: 0.2, cap: 'mega',
  },
  {
    aliases: ['poppi soda', 'poppi drink', 'poppi prebiotic'],
    ticker: 'PEP', company: 'PepsiCo', product: 'Poppi (sodë prebiotike)',
    materiality: 0.05, promoRisk: 0.4, eventRisk: 0.2, cap: 'mega',
  },
  {
    aliases: ['sprite', 'fanta', 'coca cola', 'coca-cola', 'coke zero', 'coke', 'smartwater', 'fairlife'],
    ticker: 'KO', company: 'The Coca-Cola Company', product: 'Pije Coca-Cola',
    wikiArticle: 'Coca-Cola',
    materiality: 0.9, promoRisk: 0.1, eventRisk: 0.2, cap: 'mega', gdeltQuery: 'coca-cola',
  },
  {
    aliases: ['dr pepper', 'canada dry', '7up', 'snapple', 'mtn dew', 'mountain dew'],
    ticker: 'KDP', company: 'Keurig Dr Pepper', product: 'Pije KDP',
    materiality: 0.3, promoRisk: 0.1, eventRisk: 0.2, cap: 'large',
  },
  {
    aliases: ['starbucks', 'starbucks drink', 'starbucks menu'],
    ticker: 'SBUX', company: 'Starbucks', product: 'Starbucks (kafenetë)',
    wikiArticle: 'Starbucks',
    materiality: 0.95, promoRisk: 0.15, eventRisk: 0.35, cap: 'large',
  },
  {
    aliases: ['dutch bros', 'dutch brothers'],
    ticker: 'BROS', company: 'Dutch Bros', product: 'Dutch Bros (kafenetë)',
    wikiArticle: 'Dutch Bros',
    materiality: 0.95, promoRisk: 0.2, eventRisk: 0.25, cap: 'small',
  },

  // ── Ushqim / snaks ──
  {
    aliases: ['mcdonalds', "mcdonald's", 'mc donalds', 'big mac', 'mcflurry', 'mcdonalds menu'],
    ticker: 'MCD', company: "McDonald's", product: "McDonald's (restorante)",
    wikiArticle: "McDonald's",
    materiality: 0.95, promoRisk: 0.15, eventRisk: 0.4, cap: 'mega', gdeltQuery: 'mcdonalds',
  },
  {
    aliases: ['wendys', "wendy's", 'wendy burger'],
    ticker: 'WEN', company: "The Wendy's Company", product: "Wendy's (restorante)",
    wikiArticle: "Wendy's",
    materiality: 0.95, promoRisk: 0.15, eventRisk: 0.35, cap: 'small',
  },
  {
    aliases: ['chipotle', 'chipotle menu', 'chipotle bowl'],
    ticker: 'CMG', company: 'Chipotle Mexican Grill', product: 'Chipotle (restorante)',
    wikiArticle: 'Chipotle Mexican Grill',
    materiality: 0.95, promoRisk: 0.15, eventRisk: 0.3, cap: 'large',
  },
  {
    aliases: ['cava', 'cava bowl', 'cava sauce', 'cava restaurant', 'cava grill'],
    ticker: 'CAVA', company: 'Cava Group', product: 'Cava (restorante mesdhetare)',
    materiality: 0.95, promoRisk: 0.2, eventRisk: 0.3, cap: 'small', gdeltQuery: 'cava restaurant',
    dossier: {
      confirm: 'Përmbajtja ushqimore në rritje (Google Trends + GDELT) e konfirmuar nga të dhëna trafiku ose shitjeve të restoranteve.',
      kill: 'Një video e vetme ushqimore e virale — virale në rrjet, bosh në dyqane.',
      risk: 'Trendet ushqimore në rrjete sociale kanë gjysmë-jetë javësh: dritarja e Social Arb mbyllet shpejt.',
    },
  },
  {
    aliases: ['sweetgreen', 'sweet green'],
    ticker: 'SG', company: 'Sweetgreen', product: 'Sweetgreen (sallata)',
    wikiArticle: 'Sweetgreen',
    materiality: 0.95, promoRisk: 0.15, eventRisk: 0.3, cap: 'small',
  },
  {
    aliases: ['wingstop', 'wing stop', 'wingstop fries'],
    ticker: 'WING', company: 'Wingstop', product: 'Wingstop (krahë pule)',
    wikiArticle: 'Wingstop',
    materiality: 0.95, promoRisk: 0.2, eventRisk: 0.25, cap: 'small',
  },
  {
    aliases: ['shake shack', 'shack burger'],
    ticker: 'SHAK', company: 'Shake Shack', product: 'Shake Shack (restorante)',
    wikiArticle: 'Shake Shack',
    materiality: 0.95, promoRisk: 0.15, eventRisk: 0.3, cap: 'small',
  },
  {
    aliases: ['dominos', "domino's pizza", 'dominos pizza'],
    ticker: 'DPZ', company: "Domino's Pizza", product: "Domino's (pizza)",
    wikiArticle: "Domino's Pizza",
    materiality: 0.9, promoRisk: 0.15, eventRisk: 0.3, cap: 'mid', gdeltQuery: 'dominos pizza',
  },
  {
    aliases: ['papa johns', "papa john's"],
    ticker: 'PZZA', company: "Papa John's", product: "Papa John's (pizza)",
    materiality: 0.9, promoRisk: 0.15, eventRisk: 0.3, cap: 'small', gdeltQuery: 'papa johns',
  },
  {
    aliases: ['popeyes', 'popeyes chicken'],
    ticker: 'QSR', company: 'Restaurant Brands Int.', product: 'Popeyes (restorante)',
    wikiArticle: 'Popeyes', linkType: 'parent',
    materiality: 0.15, promoRisk: 0.15, eventRisk: 0.3, cap: 'large',
  },
  {
    aliases: ['burger king'],
    ticker: 'QSR', company: 'Restaurant Brands Int.', product: 'Burger King',
    wikiArticle: 'Burger King', linkType: 'parent',
    materiality: 0.2, promoRisk: 0.15, eventRisk: 0.3, cap: 'large',
  },
  {
    aliases: ['taco bell', 'kfc'],
    ticker: 'YUM', company: 'Yum! Brands', product: 'Taco Bell / KFC',
    wikiArticle: 'Taco Bell', linkType: 'parent',
    materiality: 0.2, promoRisk: 0.15, eventRisk: 0.3, cap: 'large',
  },
  {
    aliases: ['krispy kreme', 'krispy kreme donuts'],
    ticker: 'DNUT', company: 'Krispy Kreme', product: 'Krispy Kreme (donuts)',
    wikiArticle: 'Krispy Kreme',
    materiality: 0.9, promoRisk: 0.2, eventRisk: 0.3, cap: 'small',
  },
  {
    aliases: ['oreo', 'oreos'],
    ticker: 'MDLZ', company: 'Mondelez International', product: 'Oreo',
    wikiArticle: 'Oreo', linkType: 'parent',
    materiality: 0.1, promoRisk: 0.15, eventRisk: 0.2, cap: 'large',
  },
  {
    aliases: ['lays', 'lay chips', 'doritos', 'cheetos', 'flamin hot', 'flamin hot cheetos'],
    ticker: 'PEP', company: 'PepsiCo', product: 'Snacks Frito-Lay',
    wikiArticle: 'Frito-Lay', linkType: 'parent',
    materiality: 0.1, promoRisk: 0.2, eventRisk: 0.2, cap: 'mega', gdeltQuery: 'doritos',
  },
  {
    aliases: ['kit kat', 'kitkat'],
    ticker: 'HSY', company: 'The Hershey Company', product: 'Kit Kat',
    wikiArticle: 'Kit Kat', linkType: 'parent',
    materiality: 0.1, promoRisk: 0.15, eventRisk: 0.2, cap: 'large',
  },
  {
    aliases: ['hershey', 'hersheys', "hershey's", 'reeses', "reese's"],
    ticker: 'HSY', company: 'The Hershey Company', product: 'Very Hershey',
    materiality: 0.9, promoRisk: 0.15, eventRisk: 0.2, cap: 'large', gdeltQuery: 'hershey',
  },

  // ── Kozmetikë / kujdesi ──
  {
    aliases: ['elf cosmetics', 'e.l.f.', 'elf makeup', 'elf beauty', 'elf skin', 'elf cosmetics dupe', 'elf dupe'],
    ticker: 'ELF', company: 'e.l.f. Beauty', product: 'e.l.f. (kozmetikë)',
    wikiArticle: 'E.l.f. Cosmetics',
    materiality: 0.95, promoRisk: 0.4, eventRisk: 0.25, cap: 'mid', gdeltQuery: 'elf cosmetics',
    dossier: {
      confirm: 'Përmbajtja «dupe» (alternativa e lirë e produkteve të shtrenjta) rritet njëkohësisht në kërkime dhe lajme, ndërsa aksioni mbetet pa reagim të madh.',
      kill: 'Rritja shfaqet vetëm në periudha festash ose vjen nga një video e vetme virale pa ndikim në shitje.',
      risk: 'Ciklet e bujës në kozmetikë janë të shkurtra: ajo që duket si momentum mund të jetë thjesht rotacion i përmbajtjes së influencer-ve.',
    },
  },
  {
    aliases: ['rhode skin', 'rhode beauty', 'rhode peptide', 'rhode lipstick'],
    ticker: 'ELF', company: 'e.l.f. Beauty', product: 'rhode (kozmetikë, blerë 2025)',
    wikiArticle: 'Rhode (brand)', linkType: 'parent',
    materiality: 0.06, promoRisk: 0.55, eventRisk: 0.3, cap: 'mid', gdeltQuery: 'rhode skin',
  },
  {
    aliases: ['olaplex'],
    ticker: 'OLPX', company: 'Olaplex', product: 'Olaplex (kujdesi i flokëve)',
    wikiArticle: 'Olaplex',
    materiality: 0.9, promoRisk: 0.45, eventRisk: 0.3, cap: 'small',
  },
  {
    aliases: ['maybelline', 'garnier'],
    ticker: 'LRLCY', company: "L'Oréal (ADR)", product: 'Maybelline / Garnier',
    wikiArticle: 'Maybelline', linkType: 'parent',
    materiality: 0.1, promoRisk: 0.25, eventRisk: 0.2, cap: 'large',
  },
  {
    aliases: ['mac cosmetics'],
    ticker: 'EL', company: 'Estée Lauder', product: 'MAC Cosmetics',
    wikiArticle: 'MAC Cosmetics', linkType: 'parent',
    materiality: 0.1, promoRisk: 0.25, eventRisk: 0.25, cap: 'mid',
  },
  {
    aliases: ['bath and body works', 'bath & body works'],
    ticker: 'BBWI', company: 'Bath & Body Works', product: 'Bath & Body Works',
    wikiArticle: 'Bath & Body Works',
    materiality: 0.9, promoRisk: 0.3, eventRisk: 0.25, cap: 'mid', gdeltQuery: 'bath and body works',
  },
  {
    aliases: ['ulta', 'ulta beauty'],
    ticker: 'ULTA', company: 'Ulta Beauty', product: 'Ulta (dyqane bukurie)',
    wikiArticle: 'Ulta Beauty', linkType: 'retailer',
    materiality: 0.9, promoRisk: 0.2, eventRisk: 0.25, cap: 'mid',
  },

  // ── Këpucë / veshje ──
  {
    aliases: ['crocs', 'crocs shoes', 'crocs sale'],
    ticker: 'CROX', company: 'Crocs Inc', product: 'Crocs / HEYDUDE',
    wikiArticle: 'Crocs',
    materiality: 0.9, promoRisk: 0.25, eventRisk: 0.3, cap: 'small',
    dossier: {
      confirm: 'Të dyja markat (Crocs dhe HEYDUDE) tregojnë rritje interesi njëkohësisht, ndërsa çmimi i aksionit nuk ka reaguar ende.',
      kill: 'Interesi sezonal i verës që bie sërish në vjeshtë, ose HEYDUDE në rënie ndërsa vetëm Crocs rritet.',
      risk: 'Crocs ka kaluar cikle të plota mode: rritja pas majës së modës shpesh është rikthim mesatar, jo moment i ri.',
    },
  },
  {
    aliases: ['hey dude', 'hey dude shoes', 'heydude'],
    ticker: 'CROX', company: 'Crocs Inc', product: 'HEYDUDE (këpucë)',
    materiality: 0.3, promoRisk: 0.25, eventRisk: 0.3, cap: 'small', gdeltQuery: 'hey dude shoes',
  },
  {
    aliases: ['hoka', 'hoka shoes', 'hoka one one', 'hoka clifton'],
    ticker: 'DECK', company: 'Deckers Outdoor', product: 'HOKA (këpucë vrapimi)',
    materiality: 0.4, promoRisk: 0.2, eventRisk: 0.25, cap: 'mid', gdeltQuery: 'hoka shoes',
    dossier: {
      confirm: 'Rritje interesi për HOKA në të paktën dy burime, e shoqëruar me zgjerim të shitjes me pakicë, ndërsa çmimi nuk ka reaguar.',
      kill: 'Zgjimi i UGG në vjeshtë është sezonikalitet normal, jo sinjal; rritja e vetme sezonale e UGG pa mbështetje nga HOKA.',
      risk: 'Dy marka me sezonikalitet të kundërt (HOKA — vera, UGG — dimri): mos i matësh të dyja si një trend të vetëm.',
    },
  },
  {
    aliases: ['ugg', 'uggs', 'ugg boots', 'ugg slippers'],
    ticker: 'DECK', company: 'Deckers Outdoor', product: 'UGG (këpucë)',
    wikiArticle: 'UGG (brand)', linkType: 'parent',
    materiality: 0.35, promoRisk: 0.2, eventRisk: 0.3, cap: 'mid',
  },
  {
    aliases: ['nike', 'air jordan', 'jordans', 'jordan shoes', 'nike air force', 'air max', 'nike dunks', 'dunks'],
    ticker: 'NKE', company: 'Nike Inc', product: 'Nike / Air Jordan',
    wikiArticle: 'Nike, Inc.',
    materiality: 0.9, promoRisk: 0.35, eventRisk: 0.35, cap: 'large',
  },
  {
    aliases: ['converse', 'chuck taylor'],
    ticker: 'NKE', company: 'Nike Inc', product: 'Converse',
    wikiArticle: 'Converse (brand)', linkType: 'parent',
    materiality: 0.08, promoRisk: 0.25, eventRisk: 0.25, cap: 'large',
  },
  {
    aliases: ['lululemon', 'lulu lemon', 'define jacket', 'lululemon leggings', 'lulu leggings'],
    ticker: 'LULU', company: 'Lululemon Athletica', product: 'Lululemon (athleisure)',
    wikiArticle: 'Lululemon Athletica',
    materiality: 0.9, promoRisk: 0.3, eventRisk: 0.3, cap: 'mid',
    dossier: {
      confirm: 'Rritje interesi për një produkt specifik (jo vetëm markën), me çmim aksioni pa reaguar dhe pa probleme furnizimi.',
      kill: 'Rritja vjen pas një mungese furnizimi (scarcity) ose fryhet nga tregu resale — kërkesë e shtirur.',
      risk: 'Komunitetet resale rrisin kërkimet pa shtuar shitje me çmim të plotë.',
    },
  },
  {
    aliases: ['birkenstock', 'birkenstocks', 'birkenstock boston', 'birk'],
    ticker: 'BIRK', company: 'Birkenstock', product: 'Birkenstock (sandale)',
    wikiArticle: 'Birkenstock',
    materiality: 0.95, promoRisk: 0.2, eventRisk: 0.3, cap: 'mid',
    dossier: {
      confirm: 'Rritje interesi në pranverë, para sezonit të sandaleve, e verifikuar me krahasim vit-më-viti e jo javë-më-javë.',
      kill: 'Spike-t e mëdha qershor–korrik janë sezonikalitet i pritshëm, jo sinjal.',
      risk: 'Sezonikaliteti i fortë: pa normalizim sezonal, çdo verë duket si trend.',
    },
  },
  {
    aliases: ['on cloud shoes', 'on running', 'on running shoes', 'on clouds'],
    ticker: 'ONON', company: 'On Holding', product: 'On / Cloud (këpucë vrapimi)',
    wikiArticle: 'On (company)',
    materiality: 0.95, promoRisk: 0.25, eventRisk: 0.25, cap: 'mid', gdeltQuery: 'on running shoes',
    dossier: {
      confirm: 'Rritje interesi që përputhet me hapje dyqanesh të reja dhe rritje shitjesh me pakicë, me çmim aksioni ende pa reaguar.',
      kill: 'Rritja vjen kryesisht nga sportistët e sponsorizuar dhe eventet e markës — ekspozim i paguar, jo kërkesë organike.',
      risk: 'Markë në modë: kërkimet mund të reflektojnë kuriozitet, jo qëllim blerjeje.',
    },
  },
  {
    aliases: ['vans', 'vans shoes', 'vans sneakers'],
    ticker: 'VFC', company: 'VF Corporation', product: 'Vans',
    wikiArticle: 'Vans', linkType: 'parent',
    materiality: 0.25, promoRisk: 0.25, eventRisk: 0.3, cap: 'small',
  },
  {
    aliases: ['the north face', 'north face jacket', 'north face puffer'],
    ticker: 'VFC', company: 'VF Corporation', product: 'The North Face',
    wikiArticle: 'The North Face', linkType: 'parent',
    materiality: 0.25, promoRisk: 0.2, eventRisk: 0.3, cap: 'small', gdeltQuery: 'north face',
  },
  {
    aliases: ['timberland', 'timberland boots'],
    ticker: 'VFC', company: 'VF Corporation', product: 'Timberland',
    materiality: 0.1, promoRisk: 0.2, eventRisk: 0.3, cap: 'small',
  },
  {
    aliases: ['american eagle', 'american eagle jeans', 'aerie'],
    ticker: 'AEO', company: 'American Eagle Outfitters', product: 'American Eagle / Aerie',
    wikiArticle: 'American Eagle Outfitters',
    materiality: 0.9, promoRisk: 0.2, eventRisk: 0.25, cap: 'small',
  },
  {
    aliases: ['abercrombie', 'abercrombie and fitch', 'abercrombie & fitch', 'hollister'],
    ticker: 'ANF', company: 'Abercrombie & Fitch', product: 'Abercrombie / Hollister',
    wikiArticle: 'Abercrombie & Fitch',
    materiality: 0.9, promoRisk: 0.2, eventRisk: 0.25, cap: 'small', gdeltQuery: 'abercrombie',
  },
  {
    aliases: ['old navy', 'gap inc', 'banana republic'],
    ticker: 'GAP', company: 'Gap Inc', product: 'Old Navy / Gap',
    wikiArticle: 'Old Navy', linkType: 'parent',
    materiality: 0.6, promoRisk: 0.15, eventRisk: 0.25, cap: 'small',
  },
  {
    aliases: ['urban outfitters', 'free people', 'anthropologie'],
    ticker: 'URBN', company: 'Urban Outfitters Inc', product: 'URBN (dyqane)',
    wikiArticle: 'Urban Outfitters',
    materiality: 0.9, promoRisk: 0.2, eventRisk: 0.25, cap: 'small', gdeltQuery: 'urban outfitters',
  },
  {
    aliases: ['revolve', 'revolve dress'],
    ticker: 'RVLV', company: 'Revolve Group', product: 'Revolve (e-commerce modë)',
    materiality: 0.9, promoRisk: 0.35, eventRisk: 0.3, cap: 'small',
  },
  {
    aliases: ['louis vuitton', 'lvmh'],
    ticker: 'LVMUY', company: 'LVMH (ADR)', product: 'Louis Vuitton',
    wikiArticle: 'Louis Vuitton', linkType: 'parent',
    materiality: 0.15, promoRisk: 0.2, eventRisk: 0.25, cap: 'large', gdeltQuery: 'louis vuitton',
  },
  {
    aliases: ['figs scrubs'],
    ticker: 'FIGS', company: 'FIGS Inc', product: 'FIGS (përparëse medicale)',
    materiality: 0.95, promoRisk: 0.3, eventRisk: 0.3, cap: 'small',
  },
  {
    aliases: ['yeti cooler', 'yeti cup', 'yeti tumbler'],
    ticker: 'YETI', company: 'YETI Holdings', product: 'YETI (frižiderë/termo)',
    materiality: 0.9, promoRisk: 0.25, eventRisk: 0.25, cap: 'small',
  },

  // ── Retail / e-commerce ──
  {
    aliases: ['amazon', 'amazon prime day', 'prime day', 'amazon sale', 'prime big deal days'],
    ticker: 'AMZN', company: 'Amazon.com', product: 'Amazon / Prime',
    wikiArticle: 'Amazon (company)', linkType: 'retailer',
    materiality: 0.95, promoRisk: 0.1, eventRisk: 0.3, cap: 'mega', gdeltQuery: 'amazon',
  },
  {
    aliases: ['walmart', 'walmart sale'],
    ticker: 'WMT', company: 'Walmart Inc', product: 'Walmart',
    wikiArticle: 'Walmart', linkType: 'retailer',
    materiality: 0.95, promoRisk: 0.1, eventRisk: 0.25, cap: 'mega',
  },
  {
    aliases: ['target', 'target sale', 'target circle'],
    ticker: 'TGT', company: 'Target Corporation', product: 'Target (dyqane)',
    wikiArticle: 'Target Corporation', linkType: 'retailer',
    materiality: 0.95, promoRisk: 0.1, eventRisk: 0.45, cap: 'large',
  },
  {
    aliases: ['costco', 'costco sale'],
    ticker: 'COST', company: 'Costco Wholesale', product: 'Costco',
    wikiArticle: 'Costco', linkType: 'retailer',
    materiality: 0.95, promoRisk: 0.1, eventRisk: 0.25, cap: 'mega',
  },
  {
    aliases: ['temu'],
    ticker: 'PDD', company: 'PDD Holdings', product: 'Temu',
    wikiArticle: 'Temu', linkType: 'retailer',
    materiality: 0.3, promoRisk: 0.3, eventRisk: 0.55, cap: 'large',
  },
  {
    aliases: ['tj maxx', 'tjmaxx', 'marshalls'],
    ticker: 'TJX', company: 'TJX Companies', product: 'TJ Maxx / Marshalls',
    materiality: 0.3, promoRisk: 0.1, eventRisk: 0.25, cap: 'large',
  },
  {
    aliases: ['five below', '5 below'],
    ticker: 'FIVE', company: 'Five Below', product: 'Five Below (dyqane)',
    wikiArticle: 'Five Below', linkType: 'retailer',
    materiality: 0.95, promoRisk: 0.15, eventRisk: 0.3, cap: 'small',
  },
  {
    aliases: ['dollar tree', 'dollar general'],
    ticker: 'DLTR', company: 'Dollar Tree', product: 'Dollar Tree',
    wikiArticle: 'Dollar Tree', linkType: 'retailer',
    materiality: 0.8, promoRisk: 0.1, eventRisk: 0.3, cap: 'small', gdeltQuery: 'dollar tree',
  },
  {
    aliases: ['best buy'],
    ticker: 'BBY', company: 'Best Buy', product: 'Best Buy (elektronikë)',
    wikiArticle: 'Best Buy', linkType: 'retailer',
    materiality: 0.95, promoRisk: 0.1, eventRisk: 0.3, cap: 'mid',
  },
  {
    aliases: ['home depot', 'lowes'],
    ticker: 'HD', company: "The Home Depot", product: 'Home Depot',
    wikiArticle: 'The Home Depot', linkType: 'retailer',
    materiality: 0.95, promoRisk: 0.1, eventRisk: 0.25, cap: 'mega', gdeltQuery: 'home depot',
  },
  {
    aliases: ['wayfair'],
    ticker: 'W', company: 'Wayfair', product: 'Wayfair (e-commerce shtëpie)',
    wikiArticle: 'Wayfair',
    materiality: 0.95, promoRisk: 0.2, eventRisk: 0.3, cap: 'small',
  },

  // ── Lojëra / aplikacione / platformë ──
  {
    aliases: ['roblox', 'roblox game', 'new roblox game', 'roblox update'],
    ticker: 'RBLX', company: 'Roblox Corporation', product: 'Roblox (platformë lojërash)',
    wikiArticle: 'Roblox',
    materiality: 0.95, promoRisk: 0.3, eventRisk: 0.35, cap: 'large',
    dossier: {
      confirm: 'Rritje interesi e shoqëruar me përvoja (experiences) të reja virale brenda platformës që mbajnë përdoruesit, ndërsa çmimi nuk ka reaguar.',
      kill: 'Lojërat virale janë të paqëndrueshme: spike-i bie brenda javësh pa efekt në të ardhura.',
      risk: 'Audienca kryesore është nën 18 vjeç: interesi i matshëm nuk përkthehet drejtpërdrejt në fuqi blerjeje.',
    },
  },
  {
    aliases: ['playstation', 'ps5', 'playstation 5', 'ps5 pro'],
    ticker: 'SONY', company: 'Sony Group', product: 'PlayStation',
    wikiArticle: 'PlayStation',
    materiality: 0.3, promoRisk: 0.15, eventRisk: 0.35, cap: 'large', gdeltQuery: 'playstation',
  },
  {
    aliases: ['nintendo', 'nintendo switch', 'switch 2', 'mario kart', 'super mario', 'zelda', 'legend of zelda'],
    ticker: 'NTDOY', company: 'Nintendo (ADR)', product: 'Nintendo Switch / lojëra',
    wikiArticle: 'Nintendo Switch',
    materiality: 0.6, promoRisk: 0.15, eventRisk: 0.35, cap: 'large', gdeltQuery: 'nintendo',
  },
  {
    aliases: ['xbox', 'call of duty', 'minecraft'],
    ticker: 'MSFT', company: 'Microsoft', product: 'Xbox / Activision Blizzard',
    wikiArticle: 'Xbox', linkType: 'parent',
    materiality: 0.03, promoRisk: 0.15, eventRisk: 0.35, cap: 'mega', gdeltQuery: 'xbox',
  },
  {
    aliases: ['gta 6', 'gta vi', 'grand theft auto 6', 'gta 5', 'grand theft auto'],
    ticker: 'TTWO', company: 'Take-Two Interactive', product: 'Grand Theft Auto',
    wikiArticle: 'Grand Theft Auto', linkType: 'parent',
    materiality: 0.5, promoRisk: 0.2, eventRisk: 0.4, cap: 'large', gdeltQuery: 'gta 6',
  },
  {
    aliases: ['ea sports', 'ea fc', 'ea fc 26', 'fifa game'],
    ticker: 'EA', company: 'Electronic Arts', product: 'EA Sports FC',
    materiality: 0.4, promoRisk: 0.2, eventRisk: 0.3, cap: 'mid', gdeltQuery: 'ea sports',
  },
  {
    aliases: ['duolingo', 'duolingo streak', 'duolingo owl'],
    ticker: 'DUOL', company: 'Duolingo', product: 'Duolingo (aplikacion gjuhësh)',
    wikiArticle: 'Duolingo',
    materiality: 0.95, promoRisk: 0.5, eventRisk: 0.3, cap: 'mid',
    dossier: {
      confirm: 'Rritje e qëndrueshme e interesit për dy javë e më shumë (jo një spike i vetëm meme), e shoqëruar me rritje shkarkimesh të aplikacionit.',
      kill: 'Një moment viral i maskotës që bie brenda dy javësh pa lënë gjurmë në përdorim.',
      risk: 'Duolingo prodhon vetë marketing viral: ekspozimi i prodhuar nga kompania mund të ngatërrohet me kërkesë organike — promo_risk i lartë si parazgjedhje.',
    },
  },
  {
    aliases: ['peloton', 'peloton bike', 'peloton tread'],
    ticker: 'PTON', company: 'Peloton Interactive', product: 'Peloton (fitnes)',
    wikiArticle: 'Peloton Interactive',
    materiality: 0.95, promoRisk: 0.3, eventRisk: 0.35, cap: 'small',
  },
  {
    aliases: ['planet fitness'],
    ticker: 'PLNT', company: 'Planet Fitness', product: 'Planet Fitness (palestra)',
    wikiArticle: 'Planet Fitness',
    materiality: 0.95, promoRisk: 0.15, eventRisk: 0.25, cap: 'mid',
  },
  {
    aliases: ['coinbase'],
    ticker: 'COIN', company: 'Coinbase Global', product: 'Coinbase (kripto)',
    wikiArticle: 'Coinbase',
    materiality: 0.9, promoRisk: 0.3, eventRisk: 0.6, cap: 'large',
  },
  {
    aliases: ['paypal', 'venmo'],
    ticker: 'PYPL', company: 'PayPal Holdings', product: 'PayPal / Venmo',
    wikiArticle: 'PayPal',
    materiality: 0.85, promoRisk: 0.15, eventRisk: 0.3, cap: 'large', gdeltQuery: 'paypal',
  },

  // ── Tech / media / streaming ──
  {
    aliases: ['iphone', 'iphone 17', 'iphone 18', 'ipad', 'macbook', 'airpods', 'apple watch', 'vision pro', 'apple vision pro', 'app store', 'apple music', 'apple tv', 'icloud'],
    ticker: 'AAPL', company: 'Apple Inc', product: 'Produkte Apple',
    wikiArticle: 'Apple Inc.',
    materiality: 0.4, promoRisk: 0.1, eventRisk: 0.4, cap: 'mega', gdeltQuery: 'iphone',
  },
  {
    aliases: ['google', 'youtube', 'gmail', 'android', 'google pixel'],
    ticker: 'GOOGL', company: 'Alphabet Inc', product: 'Google / YouTube',
    materiality: 0.5, promoRisk: 0.1, eventRisk: 0.35, cap: 'mega', gdeltQuery: 'google',
  },
  {
    aliases: ['instagram', 'whatsapp', 'threads app', 'meta quest', 'facebook'],
    ticker: 'META', company: 'Meta Platforms', product: 'Instagram / WhatsApp / Threads',
    wikiArticle: 'Instagram', linkType: 'parent',
    materiality: 0.35, promoRisk: 0.15, eventRisk: 0.35, cap: 'mega', gdeltQuery: 'instagram',
  },
  {
    aliases: ['snapchat', 'snap map', 'snap inc'],
    ticker: 'SNAP', company: 'Snap Inc', product: 'Snapchat',
    wikiArticle: 'Snapchat',
    materiality: 0.95, promoRisk: 0.25, eventRisk: 0.35, cap: 'mid', gdeltQuery: 'snapchat',
  },
  {
    aliases: ['netflix', 'netflix series', 'netflix show', 'netflix movie'],
    ticker: 'NFLX', company: 'Netflix Inc', product: 'Netflix',
    wikiArticle: 'Netflix',
    materiality: 0.95, promoRisk: 0.15, eventRisk: 0.45, cap: 'mega', gdeltQuery: 'netflix',
  },
  {
    aliases: ['disney plus', 'disney+', 'hulu', 'espn', 'disney', 'disney movie'],
    ticker: 'DIS', company: 'The Walt Disney Company', product: 'Disney+ / ESPN',
    wikiArticle: 'Disney+', linkType: 'parent',
    materiality: 0.35, promoRisk: 0.15, eventRisk: 0.4, cap: 'large', gdeltQuery: 'disney',
  },
  {
    aliases: ['hbo max', 'hbo', 'max streaming'],
    ticker: 'WBD', company: 'Warner Bros. Discovery', product: 'HBO Max',
    wikiArticle: 'HBO Max', linkType: 'parent',
    materiality: 0.35, promoRisk: 0.15, eventRisk: 0.4, cap: 'mid', gdeltQuery: 'hbo max',
  },
  {
    aliases: ['paramount plus', 'paramount+'],
    ticker: 'PARA', company: 'Paramount Global', product: 'Paramount+',
    wikiArticle: 'Paramount+',
    materiality: 0.3, promoRisk: 0.15, eventRisk: 0.4, cap: 'small', gdeltQuery: 'paramount plus',
  },
  {
    aliases: ['peacock', 'peacock streaming'],
    ticker: 'CMCSA', company: 'Comcast', product: 'Peacock',
    wikiArticle: 'Peacock (streaming service)', linkType: 'parent',
    materiality: 0.1, promoRisk: 0.15, eventRisk: 0.4, cap: 'large', gdeltQuery: 'peacock streaming',
  },
  {
    aliases: ['spotify', 'spotify wrapped', 'spotify podcast'],
    ticker: 'SPOT', company: 'Spotify Technology', product: 'Spotify',
    wikiArticle: 'Spotify',
    materiality: 0.95, promoRisk: 0.2, eventRisk: 0.3, cap: 'large', gdeltQuery: 'spotify',
  },
  {
    aliases: ['twitch', 'prime video', 'alexa'],
    ticker: 'AMZN', company: 'Amazon.com', product: 'Twitch / Prime Video',
    wikiArticle: 'Twitch (service)', linkType: 'parent',
    materiality: 0.05, promoRisk: 0.15, eventRisk: 0.35, cap: 'mega', gdeltQuery: 'twitch',
  },
  {
    aliases: ['tesla', 'cybertruck', 'model y', 'model 3', 'tesla robotaxi'],
    ticker: 'TSLA', company: 'Tesla Inc', product: 'Tesla (automjete/robotaxi)',
    wikiArticle: 'Tesla, Inc.',
    materiality: 0.95, promoRisk: 0.4, eventRisk: 0.55, cap: 'mega', gdeltQuery: 'tesla',
  },
  {
    aliases: ['rivian', 'rivian truck'],
    ticker: 'RIVN', company: 'Rivian Automotive', product: 'Rivian (automjete)',
    wikiArticle: 'Rivian',
    materiality: 0.95, promoRisk: 0.2, eventRisk: 0.55, cap: 'small',
  },
  {
    aliases: ['lucid motors', 'lucid air'],
    ticker: 'LCID', company: 'Lucid Group', product: 'Lucid (automjete)',
    materiality: 0.95, promoRisk: 0.2, eventRisk: 0.55, cap: 'small',
  },

  // ── Shëndet / farmaci ──
  {
    aliases: ['ozempic', 'wegovy'],
    ticker: 'NVO', company: 'Novo Nordisk (ADR)', product: 'Ozempic / Wegovy',
    wikiArticle: 'Ozempic',
    materiality: 0.35, promoRisk: 0.2, eventRisk: 0.5, cap: 'large', gdeltQuery: 'ozempic',
  },
  {
    aliases: ['zepbound', 'mounjaro'],
    ticker: 'LLY', company: 'Eli Lilly', product: 'Zepbound / Mounjaro',
    materiality: 0.15, promoRisk: 0.2, eventRisk: 0.5, cap: 'mega', gdeltQuery: 'zepbound',
  },
  {
    aliases: ['weight watchers', 'ww weight watchers'],
    ticker: 'WW', company: 'WW International', product: 'Weight Watchers',
    wikiArticle: 'Weight Watchers',
    materiality: 0.9, promoRisk: 0.3, eventRisk: 0.4, cap: 'small',
  },

  // ── Lojëra fëmijësh / lodra ──
  {
    aliases: ['barbie', 'barbie movie', 'hot wheels', 'american girl'],
    ticker: 'MAT', company: 'Mattel Inc', product: 'Barbie / Hot Wheels',
    wikiArticle: 'Barbie', linkType: 'parent',
    materiality: 0.3, promoRisk: 0.2, eventRisk: 0.35, cap: 'small', gdeltQuery: 'barbie',
  },
  {
    aliases: ['nerf', 'nerf gun', 'hasbro'],
    ticker: 'HAS', company: 'Hasbro', product: 'NERF / Hasbro',
    materiality: 0.25, promoRisk: 0.2, eventRisk: 0.35, cap: 'small', gdeltQuery: 'nerf',
  },
  {
    aliases: ['pokemon', 'pokemon cards', 'pokemon go', 'pokemon tcg'],
    ticker: 'NTDOY', company: 'Nintendo (ADR)', product: 'Pokémon (~32% Nintendo)',
    wikiArticle: 'Pokémon', linkType: 'parent',
    materiality: 0.3, promoRisk: 0.3, eventRisk: 0.35, cap: 'large', gdeltQuery: 'pokemon',
  },

  // ── Automjete ──
  {
    aliases: ['ford', 'ford bronco', 'ford f-150', 'ford mustang'],
    ticker: 'F', company: 'Ford Motor Company', product: 'Ford',
    wikiArticle: 'Ford Motor Company',
    materiality: 0.95, promoRisk: 0.1, eventRisk: 0.45, cap: 'mid', gdeltQuery: 'ford',
  },
  {
    aliases: ['chevy', 'chevrolet', 'gmc', 'cadillac', 'chevy silverado', 'corvette'],
    ticker: 'GM', company: 'General Motors', product: 'Chevrolet / GMC / Cadillac',
    materiality: 0.9, promoRisk: 0.1, eventRisk: 0.45, cap: 'mid', gdeltQuery: 'chevrolet',
  },
  {
    aliases: ['jeep', 'dodge', 'ram truck', 'dodge charger'],
    ticker: 'STLA', company: 'Stellantis', product: 'Jeep / Dodge / Ram',
    materiality: 0.3, promoRisk: 0.1, eventRisk: 0.45, cap: 'mid', gdeltQuery: 'jeep',
  },
  {
    aliases: ['toyota', 'toyota tacoma', 'toyota camry'],
    ticker: 'TM', company: 'Toyota Motor (ADR)', product: 'Toyota',
    wikiArticle: 'Toyota',
    materiality: 0.9, promoRisk: 0.1, eventRisk: 0.4, cap: 'large', gdeltQuery: 'toyota',
  },
  {
    aliases: ['honda', 'honda civic', 'honda accord'],
    ticker: 'HMC', company: 'Honda Motor (ADR)', product: 'Honda',
    wikiArticle: 'Honda',
    materiality: 0.9, promoRisk: 0.1, eventRisk: 0.4, cap: 'mid', gdeltQuery: 'honda',
  },
  {
    aliases: ['ferrari', 'lamborghini', 'porsche'],
    ticker: 'RACE', company: 'Ferrari N.V.', product: 'Ferrari',
    wikiArticle: 'Ferrari',
    materiality: 0.95, promoRisk: 0.2, eventRisk: 0.4, cap: 'large', gdeltQuery: 'ferrari',
  },

  // ── Ajrore / udhëtime (event-risk i lartë) ──
  {
    aliases: ['southwest airlines', 'southwest flights'],
    ticker: 'LUV', company: 'Southwest Airlines', product: 'Southwest (fluturime)',
    wikiArticle: 'Southwest Airlines',
    materiality: 0.95, promoRisk: 0.05, eventRisk: 0.75, cap: 'mid', gdeltQuery: 'southwest airlines',
  },
  {
    aliases: ['delta airlines', 'delta flights'],
    ticker: 'DAL', company: 'Delta Air Lines', product: 'Delta (fluturime)',
    wikiArticle: 'Delta Air Lines',
    materiality: 0.95, promoRisk: 0.05, eventRisk: 0.75, cap: 'mid', gdeltQuery: 'delta airlines',
  },
  {
    aliases: ['united airlines', 'united flights'],
    ticker: 'UAL', company: 'United Airlines', product: 'United (fluturime)',
    wikiArticle: 'United Airlines',
    materiality: 0.95, promoRisk: 0.05, eventRisk: 0.75, cap: 'mid', gdeltQuery: 'united airlines',
  },
  {
    aliases: ['jetblue'],
    ticker: 'JBLU', company: 'JetBlue Airways', product: 'JetBlue (fluturime)',
    wikiArticle: 'JetBlue',
    materiality: 0.95, promoRisk: 0.05, eventRisk: 0.75, cap: 'small',
  },
  {
    aliases: ['airbnb'],
    ticker: 'ABNB', company: 'Airbnb Inc', product: 'Airbnb',
    wikiArticle: 'Airbnb',
    materiality: 0.95, promoRisk: 0.15, eventRisk: 0.4, cap: 'large',
  },
  {
    aliases: ['expedia'],
    ticker: 'EXPE', company: 'Expedia Group', product: 'Expedia',
    wikiArticle: 'Expedia',
    materiality: 0.95, promoRisk: 0.15, eventRisk: 0.35, cap: 'mid',
  },

  // ── Konsumer staples ──
  {
    aliases: ['tylenol'],
    ticker: 'KVUE', company: 'Kenvue Inc', product: 'Tylenol',
    wikiArticle: 'Tylenol',
    materiality: 0.15, promoRisk: 0.1, eventRisk: 0.4, cap: 'large',
  },
  {
    aliases: ['crest', 'tide', 'gillette', 'pampers', 'bounty', 'old spice'],
    ticker: 'PG', company: 'Procter & Gamble', product: 'PG (konsumer staples)',
    materiality: 0.05, promoRisk: 0.15, eventRisk: 0.25, cap: 'mega', gdeltQuery: 'procter gamble',
  },
  {
    aliases: ['dove', 'axe'],
    ticker: 'UL', company: 'Unilever (ADR)', product: 'Dove / Axe',
    wikiArticle: 'Dove (toiletries)', linkType: 'parent',
    materiality: 0.05, promoRisk: 0.2, eventRisk: 0.25, cap: 'large',
  },
];

// ── Klasifikimi: term → markë ────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// indeksi: alias i normalizuar → entry (i ndërtuar një herë)
const ALIAS_INDEX: Map<string, BrandEntry> = (() => {
  const m = new Map<string, BrandEntry>();
  for (const b of BRANDS) for (const a of b.aliases) m.set(a, b);
  return m;
})();

// kufij fjalësh për alias-e shumëfjalëshe, përgatitur një herë
const ALIAS_REGEXPS: { re: RegExp; entry: BrandEntry }[] = (() => {
  return BRANDS.flatMap(b =>
    b.aliases.map(a => ({
      re: new RegExp(`(^|[^a-z0-9])${escapeRegex(a)}([^a-z0-9]|$)`, 'i'),
      entry: b,
    })),
  );
})();

export function normalizeTerm(t: string): string {
  return t
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}+#.\s-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Gjen markën brenda një termi trending.
 * - përputhje e plotë me alias-in (më e saktë), ose
 * - alias si frazë në kufij fjalësh brenda termi.
 * Kthen null nëse termi s'është produkt/markë e njohur.
 */
export function classifyTerm(rawTerm: string): { entry: BrandEntry; matchedAlias: string } | null {
  const norm = normalizeTerm(rawTerm);
  if (!norm || norm.length < 2) return null;
  // 1) përputhje e plotë
  const exact = ALIAS_INDEX.get(norm);
  if (exact) return { entry: exact, matchedAlias: norm };
  // 2) përmbajtje në kufij fjalësh — alias-i më i gjatë fiton (më specifik)
  let best: { entry: BrandEntry; matchedAlias: string } | null = null;
  for (const { re, entry } of ALIAS_REGEXPS) {
    if (re.test(norm)) {
      if (!best || entryLongestAlias(best.entry) < entryLongestAlias(entry)) {
        best = { entry, matchedAlias: entry.aliases[0] };
      }
    }
  }
  return best;
}

function entryLongestAlias(b: BrandEntry): number {
  return Math.max(...b.aliases.map(a => a.length));
}

/** Hyrjet e markave sipas ticker-it (për dosje në UI). */
export function brandsByTicker(ticker: string): BrandEntry[] {
  return BRANDS.filter(b => b.ticker === ticker.toUpperCase());
}

/**
 * Artikulli Wikipedia i kuruar për hyrjen — VETËM titujt e eksplicituar.
 * S'bahet derivim i verbër nga alias-i: API i pageviews është case-sensitive
 * dhe s'njek redirect-et — një «Celsius» do të ngjitej te artikulli i
 * shkallës së temperaturës, «Cava» te vera, «Target» te faqja e
 * disambiguimit. Të pamatshmen > të maturit keq. Hyrjet pa wikiArticle
 * mbeten me gate null (fail-closed) deri në kurimin manual.
 */
export function wikiArticleFor(b: BrandEntry): string | null {
  return b.wikiArticle ?? null;
}
