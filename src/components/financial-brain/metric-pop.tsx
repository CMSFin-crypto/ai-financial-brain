'use client';

// ═══════════════════════════════════════════════════════════════════
// INFOPOP — popup i përbashkët për ÇDO tregues
// ═══════════════════════════════════════════════════════════════════
// Kërkesë e userit: «popup te cdo tregues se cka eshte dhe si duhet
// te jete». Struktura e popup-it (3 seksione):
//   • Ç'është?        — definicioni, si llogaritet
//   • Si duhet të jetë — leximi ideal / vlerat referenca
//   • Kujdes (opsional) — gabimet e zakonshme të leximit
//
// Përdorim:
//   <TermPop term="r_mean">R mes.</TermPop>           — nga fjalori
//   <InfoPop info={{title, what, ideal, warn}}>...</InfoPop> — manual
// Punon me klik (Radix Popover) — edhe në desktop edhe në touch.
// ═══════════════════════════════════════════════════════════════════

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from 'lucide-react';
import type { ReactNode } from 'react';

export interface MetricInfoSpec {
  title: string;
  what: string;
  ideal: string;
  warn?: string;
}

export function InfoPop({
  info,
  children,
  iconClass = 'w-3 h-3',
  className = '',
}: {
  info: MetricInfoSpec;
  children: ReactNode;
  iconClass?: string;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex items-center gap-0.5 align-baseline cursor-pointer group text-left ${className}`}
        >
          {children}
          <Info
            className={`${iconClass} text-muted-foreground/40 group-hover:text-sky-400 group-hover:opacity-100 transition-colors flex-shrink-0`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent side="bottom" align="start" className="w-72 sm:w-80 p-0 overflow-hidden">
        <div className="bg-gradient-to-b from-primary/10 to-transparent px-4 pt-3 pb-2">
          <h3 className="text-sm font-bold text-foreground">{info.title}</h3>
        </div>
        <div className="px-4 pb-4 space-y-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Ç&rsquo;është?</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{info.what}</p>
          </div>
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-400 mb-1">Si duhet të jetë</p>
            <p className="text-[13px] leading-relaxed text-foreground/85">{info.ideal}</p>
          </div>
          {info.warn && (
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-amber-400 mb-1">Kujdes</p>
              <p className="text-[13px] leading-relaxed text-foreground/85">{info.warn}</p>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Variant për kokat e tabelave — ikonë më e vogël. */
export function ThInfoPop({ info, label }: { info: MetricInfoSpec; label?: string }) {
  return (
    <InfoPop info={info} iconClass="w-2.5 h-2.5">
      {label ?? info.title}
    </InfoPop>
  );
}

/** Lookup nga fjalori — nëse termi nuk gjendet, kthen fëmijët pa ndryshim. */
export function TermPop({
  term,
  children,
  iconClass = 'w-3 h-3',
  className = '',
}: {
  term: string;
  children: ReactNode;
  iconClass?: string;
  className?: string;
}) {
  const info = TERM_INFO[term];
  if (!info) return <>{children}</>;
  return (
    <InfoPop info={info} iconClass={iconClass} className={className}>
      {children}
    </InfoPop>
  );
}

// ═══════════════════════════════════════════════════════════════════
// FJALORI I TREGUEVE — shqip, sipas rregullave reale të aplikacionit
// ═══════════════════════════════════════════════════════════════════

export const TERM_INFO: Record<string, MetricInfoSpec> = {
  // ───── GJURMUESI — tabela e statistikave (4B) ─────
  n: {
    title: 'n — numri i sinjaleve',
    what: 'Sa sinjale janë përfshirë në këtë rresht statistike (kampioni). Çdo përqindje dhe mesatare e rreshtit llogaritet mbi këto sinjale.',
    ideal: 'Së paku 30 sinjale për lexim të besueshëm. Nën 30 shfaqet shënimi «kampion i vogël» — mos nxirr përfundime.',
    warn: 'Kampionet e vogla luhaten fort: 2 fitore nga 3 sinjale është «67%», por s\'do thotë asgjë.',
  },
  pct_target: {
    title: '% target',
    what: 'Përqindja KUMULATIVE e sinjaleve që kanë goditur target deri në atë ditë horizonti. Target goditet kur high-i i një dite arrin nivelin e target-it.',
    ideal: 'Sa më e lartë aq më mirë — por lexoje gjithmonë bashkë me % stop dhe PnL net. Duhet të jetë e afërt me rezultatet IS/OOS të Validation Lab.',
    warn: 'Ky ditar është deskriptiv: nuk përdoret për të rritur/ulur targetet — ndryshimet kalohen si hipotezë në Validation Lab.',
  },
  pct_stop: {
    title: '% stop',
    what: 'Përqindja kumulative që kanë goditur stop deri në atë ditë. Nëse e njëjta qiri prek edhe stop edhe target, numërohet STOP (hipotezë konservatore). Përfshin edhe GAP_STOP.',
    ideal: 'Nuk ka «ideal» absolut — e rëndësishme është sekuca me % target dhe R mesatare. Nëse % stop >> % target dhe R mesatare negative, rregullat nuk po punojnë në këto kushte.',
    warn: 'Shiko edhe GAP_STOP veç: humbjet e hapjes së gabuar inflatojnë këtë kolonë.',
  },
  pct_open: {
    title: '% open',
    what: 'Përqindja e sinjaleve ende të hapura (pa dalje) deri në atë ditë horizonti. Zvogëlohet ditë pas dite me daljet target/stop/time-stop.',
    ideal: 'Te CTC në ditën 5 dhe te REV në ditën 3 duhet të jetë ~0% — gjithçka mbyllet me time-stop. Mbi 0% atje = problem në vlerësim.',
  },
  r_mean: {
    title: 'R mes. (mesatarja e R)',
    what: 'Mesatarja e R-së në çmimin e mbylljes së ditës. 1R = distanca hyrje→stop: +1R = fitim sa rreziku i marrë, −1R = humbje sa rreziku.',
    ideal: 'Pozitive dhe e qëndrueshme mes ditëve. Te CTC rritja nga d1→d5 tregon se mbajtja deri te time-stop paguan; te REV kulmi pritet rreth d3.',
    warn: 'Mesatarja e të 5 ditëve NUK është rezultati final — rreshtat janë «foto» të asaj dite, daljet finale shihen te % target/% stop.',
  },
  r_median: {
    title: 'R med. (mediana e R)',
    what: 'Vlera e mesme e R-së kur sinjalet renditen nga më i vogli te më i madhi. E pandikuar nga skajet ekstreme — një fitim gjigant nuk e tërheq lart.',
    ideal: 'Afer mesatares. Nëse mediana << mesatarja, fitimet vijnë nga pak sinjale të rrallë ekstremë — mos i gjeneronalizo.',
  },
  mfe_mean: {
    title: 'MFE mes. (Maximum Favorable Excursion)',
    what: 'Lëvizja maksimale FAVORABE (në R) që ka arritur trade-i deri në atë ditë, pavarësisht ku doli. Sa lart ka shkuar çmimi në të mirë të trade-it para daljes.',
    ideal: 'Më e lartë se R e realizuar = ka pasur hapësirë që daljet nuk e kapën. Nëse MFE është shumë më e lartë se % target, targetet po goditen — verifiko te kolona % target.',
    warn: 'MFE i lartë NUK është arsye për të ngritur targetet — do të ishte tunim nga ditarja, që është e ndaluar.',
  },
  mae_mean: {
    title: 'MAE mes. (Maximum Adverse Excursion)',
    what: 'Lëvizja maksimale KUNDËRSHTARE (në R) që ka pësuar trade-i deri në atë ditë. Sa thellë ka rënë kundër teje para daljes.',
    ideal: 'E vogël dhe e qëndrueshme. MAE mesatare e lartë = stopet vendosen shpesh afër goditjes — informacion për vendndodhjen e stopeve, JO arsye për t\'i lëvizur pa test.',
  },
  pnl_net: {
    title: 'PnL net %',
    what: 'Fitimi/humbja mesatare në përqindje PAS kostos C (C = 0.20%, të dyja krahët). Këtu hyn rregulli GAP_STOP: hapja që kalon stopin llogaritet te çmimi i hapjes.',
    ideal: 'Pozitive pas kostosh në rreshtat me kampion të mjaftueshëm. Krahaso me paper trading dhe OOS të Validation Lab — duhet të përputhen në drejtim.',
    warn: 'Pa koston C, rezultatet duken më të mira se realja — prandaj kolona është «net».',
  },
  horizont: {
    title: 'Horizonti d1..d5',
    what: 'Ditët TREGTARE pas sinjalit: d1 = dita e parë tregtare pas hyrjes, d5 = e pesta. Fundjavat dhe pushimet e borsës nuk numërohen.',
    ideal: 'CTC: dalje jo më vonë se d5 (time-stop). REV: jo më vonë se d3. Rreshtat përtej horizontit mbeten «—».',
  },
  kamp_i_vogel: {
    title: 'Kampion i vogël',
    what: 'Rreshti ka NËN 30 sinjale — madhësia e kampionit është e pamjaftueshme për statistikë të qëndrueshme.',
    ideal: 'Prit derisa kampioni të arrijë 30+ sinjale. Ndërkohë rreshtin shiko vetëm si orientim, jo si provë.',
    warn: 'Rregull i spec-it: nën 30 = «mos nxirr përfundime».',
  },

  // ───── GJURMUESI — lista e ditës (4A) ─────
  status_target: {
    title: 'TARGET',
    what: 'Sinjali mbyll me FITIM: high-i i ndonjë dite arriti nivelin e target-it. Dalja regjistrohet te çmimi i target-it.',
    ideal: 'Normalisht pjesa më e madhe e daljeve fituese duhet të vijnë këtu.',
  },
  status_stop: {
    title: 'STOP',
    what: 'Sinjali mbyll me HUMBJE: low-i i ndonjë dite ra nën nivelin e stop-it. Nëse e njëjta qiri prek edhe stop edhe target, numërohet STOP — hipoteza konservatore.',
    ideal: 'Humbjet e kontrolluara ~1R janë pjesë normale e sistemit; problemi është vetëm raporti me targetet.',
  },
  status_gap_stop: {
    title: 'GAP_STOP',
    what: 'Hapja e ditës KALOI direkt poshtë stop-it (gap). Humbja llogaritet te ÇMIMI I HAPJES — realisht më keq se stopi i vendosur, sepse asnjeri nuk ta ekzekuton aty.',
    ideal: 'Raritet. Nëse shfaqet shpesh te aksionet e njëjta, informacion për riskun e gap-ve të atyre emërave — jo arsye për të ngushtuar stope pa test.',
  },
  status_time_stop: {
    title: 'TIME_STOP',
    what: 'Dalje me kohë: trade-i nuk preku as target as stop brenda horizontit dhe doli te çmimi i mbylljes së ditës së fundit — CTC dita 5, REV dita 3.',
    ideal: 'I pritshëm për një pjesë të sinjaleve. Nëse shumica dalin me time-stop me R negative, hype-i i strategjisë nuk po konfirmohet.',
  },
  status_open: {
    title: 'OPEN',
    what: 'Sinjali është ende i hapur — pa dalje deri tani. Rrathesti d1..d5 plotësohen ditë pas dite nga Job B (cron 22:00/22:45 UTC).',
    ideal: 'Normal gjatë ditëve të para; pas horizontit të plotë duhet të shndërrohet në status final.',
  },
  status_no_entry: {
    title: 'PA HYRJE',
    what: 'Sinjali u regjistrua, por nuk u ekzekutua (p.sh. konfirmimi mungoi te REV ose hyrja nuk u mbush). Regjistrohet që statistikat të mos varen nga rendi i ekzekutimit.',
    ideal: 'Te REV duhet të jetë i rrallë: konfirmimi jepet brenda T+1.',
  },
  pa_slot: {
    title: 'pa_slot',
    what: 'Sinjal i vlefshëm që s\'kishte slot të lirë (max 3 pozicione / 1 për sektor) dhe NUK u tregtua. Regjistrohet gjithsesi në ditar.',
    ideal: 'Kështu statistikat maten mbi TË GJITHË sinjalet — jo vetëm mbi ata që kapën slot. Mund të filtrosh «Vetëm në slot» për ekzekutimet reale.',
    warn: 'Statistikat e plota (me pa_slot) janë referenca e strategjisë; vetëm slot = ekzekutimi real.',
  },
  r_now: {
    title: 'R aktual',
    what: 'Fitimi/humbja momentale në njësi rreziku: (çmimi tani − hyrje) / (hyrje − stop). +1R = sa fitimi i një rreziku të plotë.',
    ideal: 'Pozitive ndërsa trade-i ecën drejt targetit; pas daljes mbetet e ngrirë te R finalja.',
  },
  pct_to_target: {
    title: '% e rrugës (drejt targetit)',
    what: 'Sa përqind e rrugës nga HYRJA drejt TARGETIT është bërë: (tani − hyrje) / (target − hyrje) × 100.',
    ideal: '0% = te hyrja, 100% = target goditur, mbi 100% = tejkoi targetin (zakonisht tashmë TARGET). Negativ = nën hyrjen, drejt stopit.',
    warn: 'Mund të jetë mbi 100% përkohësisht para se qiri të mbyllë — high-i që numërohet është ai i ditës.',
  },
  mosha: {
    title: 'Mosha (d)',
    what: 'Sa ditë TREGTARE ka kaluar që nga sinjali: 0 = sot (pa ditë tregtare të vlerësuar), 1 = dita e parë e vlerësuar, e kështu me radhë.',
    ideal: '0–5 ditë për CTC, 0–3 për REV. Më shumë = duhet tashmë të ketë status final.',
  },
  regjim: {
    title: 'Regjimi i tregut (TRENDING / TRANSITIONAL / CHOP)',
    what: 'Gjendja e tregut (matur me SPY) ditën e sinjalit: TRENDING = trend i qartë, TRANSITIONAL = ndërrim gjendjeje, CHOP = treg pa drejtim (sharrë).',
    ideal: 'Statistikat e ditarit ndahen sipas regjimit pikërisht sepse e njëjta strategji performon ndryshe në secilën gjendje. Krahaso rreshtat mes regjimeve — JO për të ndryshuar pragjet, por për të kuptuar kontekstin.',
    warn: 'Regjimi është kontekst deskriptiv — nuk përdoret për të ndezur/fikur strategjinë pa hipotezë të re dhe test.',
  },
  shiriti: {
    title: 'Shiriti stop → hyrje → target',
    what: 'Vizualizim i niveleve të tregtisë: vija e kuqe = stop, e bardha = hyrja, jeshilja = target. Pika e artë = çmimi aktual i sinjalit.',
    ideal: 'Pika e artë lëviz nga e bardhja (hyrja) drejt jeshiljes (target). Nëse bie poshtë te e kuqja, stopi po afrohet.',
  },
  kosto_c: {
    title: 'Kosto C',
    what: 'Kosto e përgjithshme e ekzekutimit (spread + komision + slippage) si përqindje — e zbatuar në të dy krahët e çdo trade-i statistikor. Vendi e vendos automatikisht (aktualisht 0.20%).',
    ideal: 'Vlerë konservatore fikse. PnL net % në tabelat e ditarit e ka të zbaticur — prandaj «net».',
  },

  // ───── REV v1 — karta e kandidatit ─────
  ret3d: {
    title: 'ret3d — rënia 3-ditore',
    what: 'Kthimi i çmimit gjatë 3 ditëve të fundit tregtare. Sa përqind ka rënë aksioni në tre ditë — ky është kanali që e sjell emrin në listën e reversaleve.',
    ideal: 'Rënie e thellë (p.sh. −8% ose më keq) e kualifikon si kandidat mbishitjeje afatshkurtër. Shënohet me kuq sa më e thellë — rënia e fortë është edhe mundësia edhe rreziku (falling knife).',
  },
  rsi2: {
    title: 'RSI2 — RSI 2-ditor',
    what: 'Relative Strength Index me periudhë 2 ditësh (stile Connors): mat mbishitjen EKSTREME afatshkurtër. Vlerat 0–10 = mbishitje e thellë, 90+ = mbiblerje.',
    ideal: 'Për REV kërkohet vlerë shumë e ulët (zona ~<10–15): paniku afatshkurtër ka ardhur në pikë ku rikthimi statistikisht është i shpeshtë.',
    warn: 'RSI2 i ulët mund të ulet edhe më tej — prandaj REV kërkon KONFIRMIM (green candle, higher low) përpara hyrjes.',
  },
  idio_vs_spy: {
    title: 'Idio vs SPY — spreadi idiosinkratik',
    what: 'Performanca e aksionit PASI hiqet lëvizja e tregut (SPY): sa ka rënë aksioni nga vetja, jo nga rrëzimi i përgjithshëm. Negativ = ka rënë më shumë se tregu për arsye të veta.',
    ideal: 'NEGATIV (jeshile) = rënia është specifike e aksionit — pikërisht reversali i pastër që kërkon strategjia. Pozitiv (kuq) = rënia kryesisht reflekton tregun, jo problem të aksionit.',
  },
  stop_rev: {
    title: 'Stop (1.3×ATR)',
    what: 'Niveli i daljes humbëse: vendoset 1.3 shumëfish të ATR-së poshtë pikës së hyrjes. Mbrojtja maksimale që lejon strategjia përpara se reversali të konsiderohet i dështuar.',
    ideal: 'I ngushtë mjaftueshëm që humbja mesatare të mbetet ~1R. Nuk lëviz kurrë më poshtë pas hyrjes — nuk «jepet hapësirë» falling knife-it.',
  },
  target_rev: {
    title: 'Target (1.2R)',
    what: 'Niveli i daljes fituese: 1.2 shumëfish i rrezikut. Reversalet afatshkurtër duhen të dalin shpejt — target modest, probabilitet më i lartë goditjeje.',
    ideal: 'Goditja brenda 1–3 ditëve. Nëse dita 3 kalon pa target/stop, vjen time-stop te close.',
  },
  atr_pct: {
    title: 'ATR% — volatiliteti ditor',
    what: 'Average True Range si përqindje e çmimit: sa lëviz mesatarisht aksioni në një ditë tregtare, relativisht. Baza për stop (1.3×ATR) dhe pritjet e rrugës.',
    ideal: 'Mjaftueshëm për rikthim të shpejtë (reversali jeton nga volatiliteti), por jo kaq i lartë sa që gap-et e natës të bëhen të përditshme.',
  },
  likuid_pct: {
    title: 'Likuid. pct — percentile e likuiditetit',
    what: 'Pozicioni i aksionit në renditjen e dollar-volumit 20-ditor brenda universit (0–100). Sa dollarra tregtohen në ditë, krahasuar me të tjerët.',
    ideal: 'Percentile e lartë (p.sh. 80+): ekzekutim pa slippage të madh. Percentile e ulët = kujdes me orderat market.',
  },
  cmimi: {
    title: 'Çmimi',
    what: 'Çmimi i fundit i aksionit në momentin e skanimit — baza për llogaritjen e stop/target/sizing.',
    ideal: 'Vetëm referencë: hyrja reale bëhet te close i T+1 vetëm pasi konfirmimi kalojë.',
  },
  green_candle: {
    title: 'Green candle — konfirmimi',
    what: 'Dita e konfirmimit (T+1) duhet të mbyllë me qiri JESHIL (close > open). Tregon se shitësit po humbin kontroll brenda ditës.',
    ideal: '✓ i gjelbër = konfirmim i kaluar. ✗ = reversali nuk konfirmohet — SINJALI REFUZOHET, asnjë hyrje.',
  },
  higher_low: {
    title: 'Higher low — konfirmimi',
    what: 'Low-i i ditës së konfirmimit duhet të jetë MË I LARTË se low-i i ditës së mëparshme. Struktura e rënies fillon të thyhet nga poshtë lart.',
    ideal: '✓ = struktura po kthehet. ✗ = rënia vazhdon me thellësi të reja — s\'ka reversali të vlefshëm.',
  },
  volum_renie: {
    title: 'Volum në rënie',
    what: 'Gjatë rënies 3-ditore, volumi ditor duhet të jetë në zbie (shitje pa panik të ri). Rënia me volum të lartë e vazhdueshëm = largim institucional, jo overreaction.',
    ideal: '✓ = shitës të dobët në fund të rënies — terren i mirë për rikthim. Amber ✗ = kujdes: volumi ende i fortë në rënie.',
  },
  low_i_ri: {
    title: 'LOW I RI — invalide',
    what: 'Nëse çdo ditë formohet low i ri, «thika po bie» ende — reversali INVALIDOHET menjëherë, pavarësisht RSI2 apo ret3d.',
    ideal: 'S\'duhet të shfaqet te kandidatët aktivë. Shfaqja = sinjal i refuzuar automatikisht nga rregulli i ngrirë.',
  },
  sizing_rev: {
    title: 'Sizing (0.5% rrezik)',
    what: 'Madhësia e pozicionit llogaritet që NËSE stopi goditet, humbja = 0.5% e kapitalit (referenca $25K). Aksione = rreziku $ / (hyrje − stop).',
    ideal: 'Po humbet gjithnjë e njëjtë: 0.5% kapital për trade. Notionali rregullohet nga distanca e stopit — jo anasjelltas.',
  },
  slot_ok: {
    title: 'SLOT OK',
    what: 'Ka vend të lirë në portofoll: nën kufirin max 3 pozicione dhe asnjë pozicion tjetër në këtë sektor. Sinjali mund të ekzekutohet.',
    ideal: 'Kusht i nevojshëm (por jo i mjaftueshëm) — konfirmimi duhet të kalojë edhe ai.',
  },
  sektori_plot: {
    title: 'SEKTORI PLOT',
    what: 'Tashmë ka një pozicion të hapur në të njëjtin sektor. Rregulli: maksimum 1 pozicion për sektor — kundër korrelacionit të fshehur.',
    ideal: 'Sinjali regjistrohet në ditar me pa_slot (statistikat mbeten të plota), por nuk tregtohet.',
  },
  max_pozicione: {
    title: 'MAX 3 POZICIONE',
    what: 'Kufiri i përgjithshëm i portofolit është mbushur (3 pozicione të hapura). Asnjë hyrje e re derisa të dalë një pozicion.',
    ideal: 'Kufiri ekziston që kosto të mos hanë fitimin: testi 10-vjeçar tregoi se pa kufi, kostot hëngrën mbi 100% të fitimit bruto.',
  },
  gate_8k: {
    title: '8-K material — bllokim',
    what: 'Aksioni ka 8-K të fundit (njoftim zyrtar SEC për ngjarje materiale: M&A, ndryshim drejtorie, hetim, rezultate të papritura). Rënia ka LAJM REAL pas saj.',
    ideal: 'Rënia pa lajm = overreaction (mundësi reversali). Rënia me lajm = refuzim: strategjia kërkon tepricë sentimenti, jo ndryshim themelor.',
  },
  edgar_gate: {
    title: 'Porta EDGAR',
    what: 'Verifikim fail-closed te SEC EDGAR: aksioni duhet të jetë filer i vlefshëm (10-K/10-Q aktual). Nëse EDGAR s\'përgjigjet ose statusi s\'verifikohet, sinjali REFUZOHET — jo «prit me shpresë».',
    ideal: 'Kaluar në heshtje. Refuzim i shfaqur = siguria ka parasysh: pa verifikim, pa tregti.',
  },
  spy_regjim: {
    title: 'Regjimi SPY (porta e tregut)',
    what: 'Gjendja e SPY (indeksi i tregut të gjerë): lëvizja e fundit dhe 3-ditore. Nëse SPY rrëzohet fort, reversalet individuale thuhen nga tregu — porta mbyllet.',
    ideal: 'SPY i qetë ose në rënie të moderuar. BLLOKUAR — SPY CRASH = rënie e fortë e tregut: asnjë hyrje REV atë ditë.',
  },

  // ───── CTC v2 — Delivery: peshat e score-it dhe portat ─────
  w_trend: {
    title: 'Trend — 15% e score-it',
    what: 'Forca dhe drejtimi i trendit të aksionit (mesataret eksponenciale EMA10/20, SMA50, ADX). Sa i rregullt është rruga lart pa thyerje strukturore.',
    ideal: 'Trend i forte dhe i plotë: çmimi mbi EMA10/20 dhe SMA50 në rritje. Pikët e plota = trend i pastër swing.',
  },
  w_rs: {
    title: 'RS (Relative Strength) — 25%, pesha më e lartë',
    what: 'Sa ka performuar aksioni krahas SPY-së (indeksit të tregut) në dritaren e matjes. Aksionet që rrëzojnë tregun preferohen — «udhëheqës».',
    ideal: 'RS pozitiv dhe i fortë (outperform i qëndrueshëm). Peshë 25% sepse RS është faktori më i qëndrueshëm i fitoreve në testet historike.',
  },
  w_momentum: {
    title: 'Momentum — 15% e score-it',
    what: 'Forca e lëvizjes së fundit (RSI, shpejtësia e kthimit). Mat nëse blerësit janë aktivë tani, jo vetëm historikisht.',
    ideal: 'Momentum i fortë por jo i mbivlerësuar — te pullback-et kërkohet RSI 40–65: energji e mbetur, jo zgjatim i lodhur.',
  },
  w_volum: {
    title: 'Volum — 15% e score-it',
    what: 'Konfirmimi me volum: si sillet tregtimi gjatë pullback-it dhe rikthimit. Volumi është «karburanti» — pa të lëvizjet s\'mbajnë.',
    ideal: 'Pullback me volum në rënie + rikthim me volum në rritje: model klasik i vazhdimit të trendit.',
  },
  w_setup: {
    title: 'Setup — 10% e score-it',
    what: 'Cilësia e tiparit specifik: TREND_CONT (vazhdim i qetë mbi SMA50), PULLBACK (rikthim te EMA) ose BREAKOUT (thyerje mbi high 20-ditor).',
    ideal: 'Nga testi 10-vjeçar vetëm TREND_CONT është fitues në net — prandaj llogaritet si i vetmi setup i tregtueshëm; të tjerët vetëm WATCHLIST.',
  },
  w_likuiditet: {
    title: 'Likuiditet — 10% e score-it',
    what: 'Dollar-volumi 20-ditor dhe spread-i bid-ask: sa lehtë mund të hysh e të dalësh pa lëvizur çmimin vetë.',
    ideal: 'DolVol mbi $50M/ditë dhe spread nën ~0.25%. Likuiditeti i ulët nënkupton slippage që ha R:R-në.',
  },
  w_risk: {
    title: 'Risk — 10% e score-it',
    what: 'Rreziku i tregtisë: distanca e stopit, volatiliteti (ATR), rezistenca ndaj gap-eve të natës dhe ndjeshmëria ndaj lajmeve.',
    ideal: 'Risk 2–4% për trade, ATR i moderuar, pa event të njohur para afatit. Mbi 6% = e papërshtatshme për swing.',
  },
  politika_setup: {
    title: 'Politika e setup-it (nga testi 10-vjeçar)',
    what: 'Vendim i para-regjistruar PARA rezultateve: cilët setup-e lejohen të tregtohen. TREND_CONT: +$2.7K në net; PULLBACK: −$12.3K; BREAKOUT: −$2.2K.',
    ideal: 'Vetëm TREND_CONT i tregtueshëm; PULLBACK/BREAKOUT shkojnë në WATCHLIST. Politikë e shkruar para testimit — jo tunim pasi u panë rezultatet.',
  },
  frekuenca: {
    title: 'Frekuenca — max 3 pozicione · 1/sektor · cooldown 10 ditë',
    what: 'Kufij të ngrira të ekzekutimit: më shumë se 3 pozicione të hapura s\'lejohen, një pozicion për sektor, dhe i njëjti simbol s\'rihyn për 10 ditë tregtare.',
    ideal: 'Respektuar gjithmonë. Arsyetimi: pa këto kufij, kostot e tepërta të tregtimit hanin 149% të fitimit bruto në testin historik.',
  },
  ready: {
    title: 'READY — kandidat delivery',
    what: 'Kandidati ka kaluar TË GJITHA portat e funnel-it (likuiditet, trend, setup, risk gate, event risk, kufij sektori) dhe ka bracket order të gatshëm (hyrje + stop + target).',
    ideal: 'Bracket-i ekzekutohet siç është — pa modifikime manuale te stop/target: rregullat e ngrira janë thelbi i disiplinës.',
  },
  watchlist: {
    title: 'WATCHLIST / EVENT RISK',
    what: 'Setup i pranueshëm por JO gati për hyrje: ose setup-i s\'është i tregtueshëm (PULLBACK/BREAKOUT), ose ka event para afatit (earnings, 8-K), ose portat e riskut s\'u kaluan.',
    ideal: 'Monitorim pa tregti. Eventi kalon → rifreskohet skanimi; setup-i bëhet TREND_CONT → mund të kalojë në READY.',
  },
  bracket_order: {
    title: 'Bracket Order',
    what: 'Paketo i vetëm me tre lega: hyrje (buy stop-limit), stop-loss dhe target. E njëja tregti mbrohet dhe mbyllet automatikisht.',
    ideal: 'Vendoset një herë, s\'preket më. Ndryshimet manuale të stop/target shkatërrojnë statistikat e rregullave të ngrira.',
  },
  funnel_faza: {
    title: 'Fazat e funnel-it',
    what: 'Rruga e kandidatit: Universe (bazë core US-domestic ~201) → Liquidity (top-kuintil dollar-vol) → Trend+RS → Setup → Risk Gate → Event Risk → Sector Limit → Top 1–5.',
    ideal: 'Çdo fazë largon kandidatë që s\'plotësojnë kushtin e saj. Numri bie në çdo hap — 201 → ~40 → Top 1–5 është sjellje normale.',
  },

  // [FJALORI_3 — metodologji]
};
