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
    ideal: 'Nuk ka «ideal» absolut — e rëndësishme është ekuilibri me % target dhe R mesatare. Nëse % stop >> % target dhe R mesatare negative, rregullat nuk po punojnë në këto kushte.',
    warn: 'Shiko edhe GAP_STOP veç: humbjet nga gap-et e hapjes e rrisin këtë kolonë.',
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
    warn: 'MFE i lartë NUK është arsye për të ngritur targetet — do të ishte tunim nga ditari, që është e ndaluar.',
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
    ideal: 'I pritshëm për një pjesë të sinjaleve. Nëse shumica dalin me time-stop me R negative, thelbi i strategjisë nuk po konfirmohet.',
  },
  status_open: {
    title: 'OPEN',
    what: 'Sinjali është ende i hapur — pa dalje deri tani. Rreshtat d1..d5 plotësohen ditë pas dite nga Job B (cron 22:00/22:45 UTC).',
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
    ideal: 'Humbja është gjithnjë e njëjtë: 0.5% kapital për trade. Notionali rregullohet nga distanca e stopit — jo anasjelltas.',
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
    ideal: 'Kaluar në heshtje. Refuzim i shfaqur = rregulli fail-closed ka parasysh: pa verifikim, pa tregti.',
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
    what: 'Sa ka performuar aksioni krahas SPY-së (indeksit të tregut) në dritaren e matjes. Aksionet që e tejkalojnë tregun preferohen — «udhëheqës».',
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

  // ───── TREGU — market-dashboard ─────
  indekset_baze: {
    title: 'Indeksat kryesorë (SPY · QQQ · DIA)',
    what: 'Fondet indeks (ETF) që ndjekin tregun e gjerë: SPY = S&P 500 (500 kompani të mëdha), QQQ = NASDAQ 100 (e peshuar me teknologji), DIA = Dow 30 (industriale klasike). Përqindja e kartës është ndryshimi nga mbyllja e ditës së mëparshme.',
    ideal: 'Të tre në të njëjtin drejtim = trend i pastër i tregut. Kur QQQ ndahet fort nga DIA, tregu është i ndarë (rotacion sektorial) — kontekst, jo sinjal.',
  },
  vix: {
    title: 'VIX — indeksi i volatilitetit të pritshëm',
    what: 'Mat sa lëvizje pritet nga tregu në 30 ditët e ardhshme, nxjerrë nga çmimet e opsioneve të S&P 500, si përqind e lëvizjes vjetore të pritshme. Ndonjëherë quhet «indeksi i frikës».',
    ideal: 'Nën 20 = treg i qetë. 20–30 = kujdes, lëvizje të mëdha të pritshme. Mbi 30 = panik/krizë. Prandaj karta e VIX kthehet kuq kur ngjitet: VIX në rritje zakonisht shoqëron treg në rënie.',
    warn: 'VIX shumë i ulët për shumë kohë = kompresim volatiliteti; kompresimet historikisht mbarojnë me shpërthim lëvizjeje.',
  },
  harta_sektoreve: {
    title: 'Hartë e Sektoreve (ETF sektorësh)',
    what: 'Ndryshimi ditor i ETF-ve të sektorëve: XLK teknologji, SMH gjysmëpërçues, XLV shëndetësi, XLF financa, XLE energji, XLI industri, XLY konsum i diskrecionit, ITA mbrojtje/aerospace, BOTZ AI & robotikë. Fortësia e ngjyrës tregon madhësinë e lëvizjes.',
    ideal: 'Shumë sektorë lehtë gjelbër = treg i gjerë i shëndetshëm. Kur vetëm 1–2 sektorë mbajnë tregun, thesia është e ngushtë — sinjalet teknike dështojnë më shpesh në kushte të tilla.',
  },
  gjendja_tregut: {
    title: 'Tregu tani: Bullish / Bearish / Neutral',
    what: 'Vlerësim përshkrues i ditës: llogaritet ndryshimi mesatar i 4 indekseve të kartave (SPY, QQQ, DIA dhe VIX). Mbi +0.5% me 3+ indekse në rritje lexohet Bullish, nën −0.5% me 3+ në rënie Bearish, ndryshe Neutral / Lehtë.',
    ideal: 'Përdore vetëm si kontekst të ditës: strategjitë (CTC/REV) kanë portat e veta të regjimit dhe NUK ndizen/fiken nga ky shënim.',
  },
  fg_local: {
    title: 'Indeksi Frikë & Lakmi (i brendshëm)',
    what: 'Versioni i brendshëm i indeksit Frikë & Lakmi: nis nga 50 dhe lëviz me ndryshimin mesatar të indekseve kryesorë (score ≈ 50 + mesatarja% × 10, i kufizuar 0–100). NUK është indeksi zyrtar i CNN — për versionin e plotë me 7 faktorë shiko tab-in F&G.',
    ideal: '0–25 frikë ekstreme · 25–45 frikë · 45–55 neutral · 55–75 lakmi · 75–100 lakmi ekstreme. Historikisht frika ekstreme ka qenë zonë interesi për blerje dhe lakmia ekstreme zonë kujdesi — lexoje si temperaturë tregu, jo si sinjal hyrjeje.',
  },

  // ───── PIKAT DITORE — daily-picks ─────
  konfid_enca: {
    title: 'Konfidenca % (AI)',
    what: 'Vlerësim subjektiv i modelit AI se sa e qëndrueshme është ideja: arsyet teknike, themelore dhe katalizatori përzihen në një shifër 0–100.',
    ideal: 'Mbi 70% = ide e fortë SIPAS MODELIT. NUK është probabilitet fitimi i matur historikisht — është vetëvlerësim i modelit.',
    warn: 'Kartat e Pikave janë sugjerime eksploruese të AI, jo rregulla të testuara si CTC/REV — nuk zëvendësojnë strategjitë e portave të ngrira.',
  },
  objektivi_pick: {
    title: 'Objektivi (target)',
    what: 'Niveli i çmimit ku modeli sugjeron daljen me fitim — zakonisht te apo pak përpara rezistencës së identifikuar.',
    ideal: 'Krahaso gjithmonë me Stop Loss dhe R/R: target i largët me stop të afërt në dukje «vlen», por R/R i tregon të vërtetën.',
  },
  stop_loss_pick: {
    title: 'Stop Loss',
    what: 'Niveli ku ideja konsiderohet e gabuar dhe dalja bëhet automatikisht — zakonisht nën suportin e fundit ose një ATR nën hyrjen.',
    ideal: 'I përcaktuar PARA hyrjes dhe i pavarur nga emocionet. Distanca Tani → Stop është rreziku real i idesë (1R).',
  },
  potenciali_pick: {
    title: 'Potenciali %',
    what: '(Objektivi − Tani) / Tani × 100 — sa përqind rritje duhet nga çmimi aktual deri te targeti.',
    ideal: 'Kuptimplor vetëm kundrejt rrezikut: +10% potencial me stop −5% (R/R 2:1) është më i fortë se +8% me stop −8% (R/R 1:1).',
  },
  rr_ratio: {
    title: 'R/R — raporti rrezik/fitim',
    what: 'Sa fitim potencial ofron ideja për çdo njësi rreziku: (target − hyrje) / (hyrje − stop). R/R 2.0 = 2$ fitim të pritshëm për 1$ rrezik.',
    ideal: 'Mbi 1.5–2.0 i shëndetshëm për swing; nën 1.0 ideja s\u2019paguan edhe me probabilitet të mirë goditjeje.',
  },
  nivelet_kryesore: {
    title: 'Suport · Pivot · Rezistencë',
    what: 'Nivele horizontale klasike: Suport = zonë ku blerësit kanë ndaluar rënien më parë; Rezistencë = ku shitësit kanë ndaluar rritjen; Pivot = pika e mesme e referencës (zakonisht (Max+Min+Mbyllje)/3 e ditës së mëparshme).',
    ideal: 'Stop logjik pak nën suportin; target logjik te/pak nën rezistencën. Nëse çmimi tashmë i është ngjitur rezistencës, hapësira e mbetur deri te targeti është e vogël.',
  },
  katalizatori_pick: {
    title: 'Katalizatori',
    what: 'Ngjarja konkrete që mund ta lëvizë aksionin: rezultate tremujore, produkt i ri, lajm sektorial, rishikim i estimimeve nga analistët.',
    ideal: 'Katalizatori me datë dhe natyrë të qartë është më i verifikueshëm. VERIFIKOJE VETË para se të veprosh — kjo është sugjerim AI, jo fakte të konfirmuara.',
  },
  afati_pick: {
    title: 'Timeframe — horizonti i mbajtjes',
    what: 'Koha e sugjeruar që ideja ka nevojë për të luajtur (p.sh. 1–2 javë, 1–3 muaj) sipas natyrës së setup-it.',
    ideal: 'Përpara afatit: ose target goditur, ose stop goditur, ose ide e rikonsideruar — jo mbajtje pa plan «se shpresoj».',
  },
  gjendja_ai: {
    title: 'Tregu: Bullish / Bearish / Neutral (AI)',
    what: 'Përmbledhja e gjendjes së tregut e shkruar nga modeli AI për ditën — bazuar në indekset kryesore dhe kontekstin e përgjithshëm të tregut.',
    ideal: 'Kontekst, jo sinjal: në treg të dobët idetë BUY kanë rënie dështimi më të lartë — por ky është vërejtje e përgjithshme, jo rregull i testuar si portat e strategjive.',
  },

  // ───── F&G — fear-greed-index (CNN) ─────
  fg_cnn: {
    title: 'Indeksi i Frikës & Grykesisë (CNN)',
    what: 'Indeksi zyrtar i CNN Fear & Greed: kombinon 7 tregues (momentumi i S&P 500, fuqia e aksioneve 52-javore, gjerësia e tregut, raporti Put/Call, VIX, kërkesa për siguri, junk bond) në një shifrë 0–100.',
    ideal: '0 = frikë ekstreme, 100 = grykësi ekstreme. Historikisht frika ekstreme ka korresponduar me periudha mundësish dhe grykësia me majat e tregut — lexoje si temperaturë tregu, jo si sinjal hyrjeje/daljeje.',
  },
  fg_krahasimet: {
    title: 'Krahasimet historike',
    what: 'Vlera e sotme e indeksit kundrejt mbylljes së kaluar, 1 javë, 1 muaj dhe 1 vit më parë — me diferencën në pikë nën çdo kartë.',
    ideal: 'Rënia e shpejtë (sot shumë nën javën e kaluar) = tregu po ftohet shpejt; ngjitja e qëndrueshme drejt 75+ = grykësi që grumbullohet. Kontekst për mjedisin — jo timing.',
  },

  // ───── FITIMET — earnings-calendar ─────
  bmo_amc: {
    title: 'BMO / AMC — koha e raportimit',
    what: 'BMO (Before Market Open) = raporti del PËRPARA hapjes së borsës — reaksioni i çmimit ndodh atë ditë në hapje. AMC (After Market Close) = raporti del PAS mbylljes — reaksioni ndodh atë natë ose ditën tjetër në hapje.',
    ideal: 'Nëse mban pozicion në aksion që raporton, VENDOSOJE para raportit: gap-et pas fitimeve kalojnë stope pa ekzekutim aty (GAP_STOP) — rreziku i natës së earnings nuk mbrohet me stop.',
  },
  eps_est: {
    title: 'EPS Est. — estimimi i fitimit për aksion',
    what: 'Konsensusi i analistëve: sa fitim për aksion (EPS = fitimi neto / numri i aksioneve) pritet të raportojë kompania për këtë tremujor.',
    ideal: 'Krahaso me të njëjtin tremujor të vitit të kaluar dhe me pritshmërinë e rritjes. Çmimi s’lëviz aq nga numri vetë sa nga SURPRIZA kundrejt këtij estimimi.',
    warn: 'Datat dhe estimimet janë parashikime të furnitorëve të të dhënave — mund të ndryshojnë ose të shtyhen.',
  },

  // ───── DITARI JAVOR — weekly-journal ─────
  ret_nd: {
    title: '5d / 10d / 20d — kthimet pas javës',
    what: 'Kthimi i çmimit nga çmimi i skanimit te mbyllja 5, 10 dhe 20 ditë tregtare më vonë — si ecën kandidati i javës me kalimin e kohës.',
    ideal: 'Pozitive dhe në rritje me ditët = kandidatët e asaj jave kanë pasur gjurmë. Lexoje për GJITHË Top 10 si grumbull — jo për një emër të vetëm.',
    warn: 'Deskriptiv: çdo kandidat kalon vetëm një herë — kjo s’është backtest i përsëritshëm dhe nuk përdoret për të rregulluar skanerin.',
  },
  verdict_week: {
    title: 'U RIT / RA / PA QEJE — verdikti 20-ditor',
    what: 'Verdikti pas 20 ditëve tregtare: U RIT = mbyllja 20-ditore mbi çmimin e skanimit; RA = nën të; PA QEJE = ndryshim i vogël; PA DATA = çmimet e ditëve 20 ende s’janë mbledhur.',
    ideal: 'Shpërndarja U RIT / RA për gjithë listën tregon cilësinë e javës; krahaso mes javëve dhe mes strategjive (CAMS/IBKR).',
  },
  tier_week: {
    title: 'Tier — A / W / M / NT / RDY',
    what: 'Klasa e kandidatit në momentin e skanimit: A = kandidat i fortë, W = watchlist, M = monitorim, NT = no trade, RDY = gati për delivery me të gjitha rregullat e plota.',
    ideal: 'Tier-i reflekton portat e strategjisë asaj jave. Pyetja e saktë për ditarin: a performuan A-të ndryshe nga W-të pas 20 ditëve?',
  },
  cams_score_journal: {
    title: 'CAMS score',
    what: 'Pikët e përbashkëta të skanerit CAMS (katalizator, accelerator, strukturë, momentum, likuiditet…) në momentin e skanimit të javës.',
    ideal: 'Score më i lartë = më shumë faktorë të rreshtuar. Merr grumbullin e kandidatëve me score të ngjashëm dhe shiko çfarë ndodhi mesatarisht — jo një rast të vetëm.',
  },
  sub_cams: {
    title: 'Sub-score-t e CAMS',
    what: 'Katalizatori (ngjarja e re), Accelerimi (shpejtësia e lëvizjes së fundit), Struktura (pastërtia e trendit/bazës) — peshat kryesore të skanerit CAMS të ngrira në momentin e sinjalit.',
    ideal: 'Tri të larta = kandidat i plotë; një e dobët të tregon pikën e dobët të idesë. Lexohet përshkrues — JO arsye për të lëvizur peshat pa hipotezë dhe test.',
  },
  entry_target_stop_week: {
    title: 'Hyrja u aktivizua · 3R u kap · Stop u godit',
    what: 'Pasqyrë e ekzekutimit hipotetik me target 3R: a arriti çmimi nivelin e hyrjes pas skanimit (Hyrja u aktivizua), a kapoi targetin 3R (3R u kap) apo ra te stopi (Stop u godit).',
    ideal: '«3R u kap» pa «Stop u godit» = rrugë e pastër. Këto kanale përbëjnë statistikën e javëve — me kampion të mjaftueshëm lexohen si tendencë, jo si siguri.',
  },

  // ───── SCREENER ─────
  pe_ratio: {
    title: 'P/E — çmim / fitim',
    what: 'Çmimi i aksionit i pjesëtuar me fitimin për aksion (EPS) të 12 muajve të fundit: sa dollarë paguan për çdo 1$ fitim vjetor.',
    ideal: 'I ulët RELATIVISHT me sektorin dhe rritjen = çmim modest; i lartë pa rritje të përshtatshme = kujdes. Krahaso gjithmonë brenda sektorit — teknologjia jeton me P/E më të larta se bankat.',
  },
  fwd_pe: {
    title: 'Fwd P/E — P/E parashikues',
    what: 'I njëjti raport por me EPS-në e ESTIMUAR për 12 muajt e ardhshëm — sa paguan për fitimet e pritshme, jo për ato të bëra.',
    ideal: 'Më i ulët se P/E historik = tregu pret rritje fitimi. Nëse Fwd P/E është shumë më i ulët, estimimet janë optimiste — verifiko sa shpesh kompania ka gabuar estimimet më parë.',
  },
  peg: {
    title: 'PEG — P/E i rregulluar me rritjen',
    what: 'P/E i pjesëtuar me normën e rritjes vjetore të fitimeve (P/E 20 me rritje 20%/vit = PEG 1.0). Sa paguan për njësi rritjeje.',
    ideal: 'Rreth 1.0 = çmim i drejtë për rritjen; nën 1.0 rritje e pavlerësuar; mbi 2.0 e paguar shtrenjtë. Kujdes te cilësia e rritjes — një vit i vetëm i fortë e shembet shifrën.',
  },
  ps_ratio: {
    title: 'P/S — çmim / shitje',
    what: 'Kapitalizimi i tregut i pjesëtuar me të ardhurat vjetore. Treguesi kryesor kur fitimet janë të vogla ose negative (kompani në fazë rritjeje).',
    ideal: 'Krahaso me historikun e vet dhe konkurrentët. P/S i lartë i qëndrueshëm kërkon marzhe që po përmirësohen — përndryshe është besim i plotë vetëm te rritja.',
  },
  marzh_net: {
    title: 'Marzh Net — marzhi i fitimit neto',
    what: 'Fitimi neto si përqind e shitjeve: nga çdo 100$ të ardhura, sa mbetet fitim pas të gjitha kostove, intereseve dhe taksave.',
    ideal: 'Varet nga sektori: software 15–30% i fortë, tregti me pakicë 2–5% normale. TENDENCA e marzhit vlen më shumë se niveli — marzh në rritje = fuqie çmimi.',
  },
  rritja_rev: {
    title: 'Rritja Rev — rritja e të ardhurave',
    what: 'Sa janë rritur shitjet (të ardhurat) krahasuar me periudhën e njëjtë të vitit të kaluar.',
    ideal: 'Dy gjëra njëherësh: niveli (10%+ i fortë për kompani të pjekura, 20%+ për të rinjtë) dhe QËNDRUESHMËRIA — tre-trimestrale e njëjtë vlen më shumë se një spike i vetëm.',
  },
  rritja_eps: {
    title: 'Rritja EPS — rritja e fitimit për aksion',
    what: 'Sa është rritur fitimi për aksion krahasuar me periudhën e njëjtë të vitit të kaluar.',
    ideal: 'Rritje EPS më e shpejtë se rritja e të ardhurave = marzhe që zgjerojnë. Rritje EPS pa rritje të ardhurash = kursime njëhershe — jo motor i qëndrueshëm.',
  },
  fcf: {
    title: 'FCF — fluksi i parasë së lirë',
    what: 'Para reale që mbeten pas operimit dhe investimeve (CapEx): fluksi i parasë operativ − investimet kryesore.',
    ideal: 'FCF pozitiv dhe në rritje = biznes që vetë-financohet. FCF negativ me të ardhura në rritje = djegie para për zgjerim — e durueshme vetëm me bilanc të fortë.',
  },
  kap_tregut: {
    title: 'Kap. Tregut — kapitalizimi i tregut',
    what: 'Vlera e përgjithshme e aksioneve në qarkullim: çmimi × numri i aksioneve. E përafërt: large-cap ≥ 10 mld$, mid-cap 2–10 mld$, small-cap < 2 mld$.',
    ideal: 'Lidhet me stabilitetin dhe likuiditetin: large-cap më e qëndrueshme dhe e mbuluar nga analistët; small-cap me hapësirë rritjeje por edhe gap-e më të mëdha dhe lojë më të dhimbshme.',
  },
  rvol: {
    title: 'RVol — volumi relativ',
    what: 'Volumi i ditës i ndarë me volumin mesatar (zakonisht 50-ditor): RVol 2.0 = tregtohet dyfish mbi normalen.',
    ideal: 'RVol mbi 1.5–2.0 BASHKË me lëvizje çmimi = konfirmim interesi real (zakonisht institucional). Lëvizje e madhe me volum normal = dyshimtë.',
    warn: 'Në pre-market llogaritet mbi volumet e pre-market — metrikë më e brishtë se ajo e seancës së plotë.',
  },
  sinjali_screener: {
    title: 'Sinjali (screener)',
    what: 'Etiketa e përgjithshme e modelit për aksionin (p.sh. Strong Buy / Buy / Hold / Sell): përzjen momentum, volum, trend dhe vlerësim.',
    ideal: 'Orientim eksplorues i skanerit — NUK është sinjali i strategjive të testuara (CTC/REV), të cilat kanë portat, ditarin dhe rregullat e ngrira të veta.',
  },
  piket_screener: {
    title: 'Pikët (score)',
    what: 'Shuma e peshuar e faktorëve të skanerit (momentum, volum relativ, thellësi vlerësimi, forcë trendi) në shkallë 0–100.',
    ideal: 'Më e lartë = më shumë faktorë të rreshtuar SIPAS formules së skanerit. Përdore si renditje eksploruese — jo si probabilitet fitimi i matur historikisht.',
  },

  // ───── SEKTORET — sector-scanner ─────
  rating_sektor: {
    title: 'Rating — STRONG BUY · BUY · HOLD · SELL',
    what: 'Etiketa e përgjithshme e skanerit të sektorëve për aksionin: përzjen quick score, trendin, vlerësimin dhe katalizatorët në 5 nivele.',
    ideal: 'Orientim eksplorues brenda skanerit — NUK është sinjali i strategjive të testuara (CTC/REV) që kanë portat e tyre. Verifiko arsyet në panelin e hapur para se të veprosh.',
  },
  quick_score: {
    title: 'Score (0–100)',
    what: 'Pikët e shpejta të skanerit: shuma e peshuar e forcës së trendit, momentumit, volumit dhe vlerësimit relativ brenda sektorit.',
    ideal: '70+ i fortë, 40–70 neutral, nën 40 i dobët — SIPAS formules së skanerit. Lexoji edhe arsyet shpjeguese, jo vetëm shifrën.',
  },
  upside_sektor: {
    title: 'Upside % — hapësira deri te target',
    what: '(Target − çmimi aktual) / çmimi × 100: sa rritje nënkupton targeti i llogaritur nga skaneri nga çmimi i tanishëm.',
    ideal: 'Kuptimplor bashkë me Risk/Reward dhe besueshmërinë. Upside i madh me besueshmëri të vogël = ide spekulativo — mos e lexo si «vlerën më të mirë».',
  },
  besueshmeria_sektor: {
    title: 'Besueshmëria %',
    what: 'Vetëvlerësimi i modelit për këtë parashikim: sa faktorë të pavarur (teknikë, themelor, katalizator) po thonë të njëjtën gjë.',
    ideal: 'Mbi 70% = disa faktorë prapa idesë. NUK është probabilitet fitimi i matur historikisht — është koherencë e faktorëve në momentin e skanimit.',
  },
  hyrja_entry: {
    title: 'Entry — hyrja',
    what: 'Niveli i çmimit ku skaneri sugjeron hyrjen në pozicion (long ose short sipas drejtimit të idesë).',
    ideal: 'I lidhur ngushtë me stop: hyrja e mirë është afër pikës ku ideja vërtetohet e pavlefshme — jo në mes të asgjës. Distanca Entry → Stop = 1R.',
  },

  // ───── ANALIZA TEKNIKE — technical-analysis ─────
  ta_rsi: {
    title: 'RSI (14) — Indeksi i Forcës Relative',
    what: 'Relative Strength Index me periudhë 14: llogaritet si raporti i fitimeve mesatare ndaj humbjeve mesatare të 14 periudhave të fundit, në shkallë 0–100. Mat shpejtësinë dhe forcën e lëvizjeve të çmimit.',
    ideal: 'Mbi 70 = zonë mbipëshitjeje (overbought), nën 30 = nënpëshitjeje (oversold), 50 = vija neutrale. Divergjenca mes RSI-së dhe çmimit shpesh paralajmëron kthim trendi.',
    warn: 'RSI mund të mbetet shumë kohë në zonat ekstreme gjatë një trendi të fortë — «mbipëshitje» nuk do të thotë automatikisht «shit».',
  },
  ta_macd: {
    title: 'MACD — Divergjenca e Mesatareve Lëvizëse',
    what: 'MACD = EMA12 − EMA26; vija e sinjalit është EMA e MACD-së (zakonisht 9 periudha); histogrami = MACD − sinjali. Mat momentumin dhe drejtimin e trendit.',
    ideal: 'MACD pozitiv dhe në rritje = trend bullish që forcohet; negativ dhe në zbie = bearish. Kryqëzimi i MACD-së me vijën e sinjalit tregon ndryshim momenti.',
    warn: 'MACD është tregues i vonuar (ndërtohet mbi mesatare) — në treg anësor jep kryqëzime të shpeshta e të rreme.',
  },
  ta_ma: {
    title: 'Moving Averages — SMA 20/50/200',
    what: 'Mesataret e lëvizshme të thjeshta: mesatarja e çmimeve të mbylljes të 20, 50 dhe 200 periudhave të fundit. EMA12 i jep peshë më të madhe çmimeve të fundit.',
    ideal: 'Çmimi mbi mesataret dhe mesataret në renditje rritëse (SMA20 > SMA50 > SMA200) = trend shëndetshëm. Golden Cross (SMA50 > SMA200) dhe Death Cross janë pikëpëmjet klasike afatgjata.',
    warn: 'Mesataret janë të vonuara nga natyra — punojnë mirë në trend, dështojnë në treg anësor ku çmimi i pret e ripret shpesh.',
  },
  ta_bb: {
    title: 'Bollinger Bands — brezat e volatilitetit',
    what: 'Tre vija rreth SMA20-së: vija e sipërme = SMA20 + 2 devijime standarde, e mesmja = SMA20, e poshtmja = SMA20 − 2σ. Brezat zgjerohen me volatilitet dhe ngushtohen pa të.',
    ideal: 'Rreth 90–95% e çmimeve zbresin brenda brezave. Prekja e brezit nuk është sinjal i vetëm: drejtimin e trendit e jep çmimi dhe volumi, jo brezi vetëm.',
    warn: 'Squeeze-i (ngushtimi ekstrem) shpesh paraqitet para një lëvizjeje të madhe — por brezat s\u2019thonë dot drejtimin e saj.',
  },
  ta_volum: {
    title: 'Volumi — konfirmimi i lëvizjeve',
    what: 'Numri i aksioneve të tregtuara në periudhë. Trendi i volumit krahasohet me mesataren e periudhave të mëparshme për të parë nëse lëvizja ka pjesëmarrje reale.',
    ideal: 'Rritje çmimi me volum në rritje = trend i fortë; rritje me volum në zbie = dyshimtë. Volum i lartë në rënie = presion shitës real.',
    warn: 'Volumi i vetëm s\u2019thotë drejtimin — lexohet gjithmonë BASHKË me çmimin (konfirmim, jo parashikim).',
  },
  ta_stoch: {
    title: 'Stochastic — %K dhe %D',
    what: 'Oscilator që krahason mbylljen e fundit me rangun max–min të N periudhave: %K është linja kryesore, %D është mesatarja e saj (linja e sinjalit). Vlerat 0–100.',
    ideal: 'Mbi 80 = zonë mbipëshitjeje, nën 20 = nënpëshitjeje. Sinjali klasik: kryqëzimi i %K-së me %D-në brenda zonave ekstreme.',
    warn: 'Në trend të fortë stochastic mund të «ngjitet» mbi 80 për shumë ditë — zonat ekstreme nuk janë kundër-trendi automatik.',
  },
  ta_suporte: {
    title: 'Suporte (nivele blerjeje)',
    what: 'Nivele ku çmimi ka rënë më parë dhe ka gjetur blerës — përcaktohen nga low-et e mëparshme dhe zonat me përqendrim volumi.',
    ideal: 'Çmimi që i qaset një suporti dhe mban = blerës aktivë aty. Thyerja e suportit me volum e kthen atë shpesh në rezistencë (rol swap).',
  },
  ta_rezistenca: {
    title: 'Rezistencë (nivele shitjeje)',
    what: 'Nivele ku çmimi është ndaluar më parë nga shitësit — përcaktohen nga high-et e mëparshme dhe zonat e volumit.',
    ideal: 'Thyerja e rezistencës ME VOLUM e kthen atë në suport dhe shpesh vazhdon trendin; refuzimi pa volum = prit kthim poshtë.',
  },
  ta_poc: {
    title: 'POC — Point of Control',
    what: 'Niveli i çmimit me volumin më të madh të tregtuar brenda periodës së volume profile-it: çmimi ku tregu «u pajtua» më shumë.',
    ideal: 'POC vepron si magnet dhe si suport/rezistencë dinamike: çmimi shpesh kthehet te POC dhe reagon aty. Largësia e çmimit nga POC tregon nëse je në ekuilibër apo në zgjatim.',
  },
  ta_value_area: {
    title: 'VAH / VAL — Value Area',
    what: 'Zona ku është tregtuar rreth 70% e volumit: VAH (Value Area High) është kufiri i sipërm, VAL (Value Area Low) i poshtëm.',
    ideal: 'Brenda Value Area = ekuilibër. Mbi VAH me pranim = forca; nën VAL me pranim = dobësi. Kthimet në brendësi të zonës pas një thyerjeje të rreme janë të shpeshta.',
  },

  // ───── PREDIKIMI AI — stock-predictor / stock-prediction-card ─────
  pred_score: {
    title: 'Score (−100 … +100)',
    what: 'Score-i i prediktorit: peshimi i treguesve teknikë (momentum, trend, volum, volatilitet) në një shkallë nga −100 (bearish i plotë) te +100 (bullish i plotë).',
    ideal: 'Mbi +25 lexohet pozitiv, nën −25 negativ, mes tyre neutral — sipas formulës së modelit. Është vlerësim i modelit, jo probabilitet fitimi i testuar historikisht.',
  },
  besim_modeli: {
    title: 'Besimi / Besueshmëria % (model)',
    what: 'Vetëvlerësimi i modelit se sa e qëndrueshme është parashikimi: sa faktorë të pavarur (teknikë, themelorë, lajme) po drejtohen në të njëjtin kuptim.',
    ideal: 'Mbi 70% = shumë faktorë të rreshtuar. NUK është probabilitet fitimi i matur historikisht — është koherencë e faktorëve në momentin e llogaritjes.',
    warn: 'Besimi i lartë i modelit nuk zëvendëson testimin: strategjitë e testuara (CTC/REV) kanë portat dhe ditarin e vet.',
  },
  probabilitet_modeli: {
    title: 'Probabiliteti % (model)',
    what: 'Probabiliteti që modeli cakton për drejtimin e parashikuar (rritje/ulje) në horizontin e dhënë — dalje e modelit, jo frekuencë fitimesh e matur mbi tregti reale.',
    ideal: 'Krahasoje me besimin dhe me lëvizjen e pritur: probabilitet i lartë me lëvizje të vogël ka kuptim tjetër nga probabilitet i lartë me lëvizje të madhe. Lexohet eksplorues.',
  },
  pred_levizja: {
    title: 'Lëvizja e pritur %',
    what: 'Sa përqind lëvizje pret modeli për aksionin në atë horizont (p.sh. +2.5% ose −1.8%) — drejtimi dhe madhësia e pritshme e lëvizjes.',
    ideal: 'Kuptimplote kundrejt volatilitetit: lëvizje e pritur më e vogël se lëvizja mesatare ditore e aksionit = parashikim me presion të ulët.',
  },
  pred_total_hybrid: {
    title: 'Total (score hibrid)',
    what: 'Shuma e score-it teknik dhe score-it themelor për aksionin: teknika nga 15 tregues, themeloret nga 6 faktorë (vlerësim, rritje, shëndet financiar…).',
    ideal: 'Total i fortë me TË DY komponentët pozitivë = rreshtim teknik+themelor. Kur njëri është i fortë e tjetri negativ, setup-i është konfliktual — lexoji veç e veç te Teknik/Fundamentet.',
  },
  pred_afati_shkurt: {
    title: 'Afati i shkurtër (1–3 ditë)',
    what: 'Parashikimi i modelit për ditët e ardhshme tregtare: drejtimi i pritur, probabiliteti dhe lëvizja e pritur brenda 1–3 ditëve.',
    ideal: 'Horizonte kaq të shkurtra mbizotërohen nga zhurma ditore dhe gap-et e hapjes — lexoji si orientim eksplorues, jo si sinjal ekzekutimi.',
  },
  pred_afati_gjate: {
    title: 'Afati i gjatë (1–2 javë)',
    what: 'Parashikimi i modelit për javët e ardhshme: drejtimi, probabiliteti dhe lëvizja e pritur brenda 1–2 javëve.',
    ideal: 'Horizontet më të gjata kapin më shumë trend në vend të zhurmës — por edhe më shumë lajme të papritura. Krahasoje me afatin e shkurtër: ndarja e tyre është informacion.',
  },
  pred_rreziku: {
    title: 'Rreziku (LOW / MEDIUM / HIGH)',
    what: 'Etiketa e modelit për rrezikun e idesë: përzjen volatilitetin, distancat e stopeve të mundshme dhe ndjeshmërinë ndaj lajmeve.',
    ideal: 'LOW = lëvizje të kontrollueshme; HIGH = gap-e dhe lëvizje të mëdha të pritshme. Rreziku i lartë nuk e pengon idenë vetvetiu — kërkon madhësi pozicioni më të vogël.',
  },
  pred_volatiliteti: {
    title: 'Volatiliteti (LOW / MEDIUM / HIGH)',
    what: 'Sa lëviz aksioni relativisht (bazuar në luhatjet e fundit të çmimit). Volatiliteti i lartë = rrugë më e egër drejt targetit.',
    ideal: 'Volatiliteti i lartë zgjeron si mundësinë ashtu dhe rrezikun: distanca e stopeve dhe sizing-i duhet ta pasqyrojnë — jo shpresa.',
  },
  pred_teknik_fund: {
    title: 'Teknik / Fundamentet (zbërthimi)',
    what: 'Zbërthimi i score-it në dy kanale: TEKNIK = treguesit e grafikut (momentum, trend, volum — 15 tregues); FUNDAMENTET = të dhënat e biznesit (vlerësim, rritje, marzhe — 6 faktorë).',
    ideal: 'Të dy pozitivë = ide e plotë. Teknik i fortë / themelore të dobëta = tregti afatshkurtër spekulativ; e kundërta = ide më e qetë afatgjatë. Kur mungojnë fundamentet, predikimi mbështetet vetëm te teknika.',
  },

  // ───── STATISTIKAT E VIZITORËVE — analytics-dashboard ─────
  an_total: {
    title: 'Vizitorë Total',
    what: 'Numri i përgjithshëm i vizitave të regjistruara në aplikacion që nga fillimi i matjes: çdo hapje e faqes numërohet një herë.',
    ideal: 'Metrikë e trafikut të aplikacionit — ka lidhje me përdorimin, jo me tregun. Tendencat javore thonë më shumë se numri total.',
  },
  an_sot: {
    title: 'Vizitorë Sot',
    what: 'Vizitat e ditës së sotme deri tani — numërim në kohë reale, rifreskohet çdo 30 sekonda.',
    ideal: 'Krahasoje me një ditë tipike javore. Ditët e tregut aktiv zakonisht sjellin më shumë vizita.',
  },
  an_unike: {
    title: 'Vizitorë Unikë',
    what: 'Sa vizitues të ndarë (me fingerprint të pajisjes) kanë hyrë gjithsej — një person me 10 vizita numërohet një herë.',
    ideal: 'Raporti vizita/vizitor unik tregon sa shpesh kthehen të njëjtët përdorues — besnikëria e përdorimit.',
  },
  an_online: {
    title: 'Online Tani',
    what: 'Sa vizitorë janë aktivë në aplikacion në këtë moment (aktivitet brenda minutave të fundit).',
    ideal: 'Numër live me luhatje të mëdha — kuptimplot vetëm si foto momentale, jo si tendencë.',
  },
  an_ip: {
    title: 'IP Unike (30d)',
    what: 'Sa adresa IP të ndryshme kanë vizituar brenda 30 ditëve të fundit — proksi i gjerësisë së audiencës.',
    ideal: 'Metrikë e gjerë: IP-të e përbashkëta (zyra, rrjete celularë) e bëjnë shifrën të përafërt. Lexoje për drejtim, jo për numër të saktë.',
  },

  // ───── ANALIZA E THELLUAR — advanced-analysis ─────
  aa_confidence_score: {
    title: 'Confidence Score (0–100)',
    what: 'Score i përbashkët i 4 treguesve (RSI, MACD, Bollinger, Volumi): secili voton BLERJE/SHITJE/NEUTRAL dhe votat përzihen në një shifrë 0–100 me sinjal përfundimtar.',
    ideal: 'Score i lartë me signal BLERJE = shumica e treguesve dakord. Lexoji edhe 4 kartat poshtë: nëse një tregues i vetëm e mbart score-in, besueshmëria është më e ulët sesa duket.',
    warn: 'Vetëvlerësim i modelit në momentin e llogaritjes — jo probabilitet fitimi i testuar.',
  },
  aa_win_rate: {
    title: 'Win Rate (backtest)',
    what: 'Përqindja e tregtimeve fituese në backtest-in historik të strategjisë së zgjedhur mbi këtë aksion: fitore / (fitore + humbje).',
    ideal: 'Mbi 50% është e mirë, por kuptimplote vetëm bashkë me raportin fitim/humbje mesatar dhe numrin e tregtimeve. Win rate 40% me fitore 2× më të mëdha se humbjet është fitues.',
    warn: 'Backtest i një aksioni të vetëm me parametra të zgjedhur është shumë i ndjeshëm ndaj overfitting: ndrysho një parameter dhe rezultati mund të kthehet. Eksplorim përshkrues — jo justifikim për të ndryshuar rregullat e strategjive.',
  },
  aa_total_return: {
    title: 'Total Return (backtest)',
    what: 'Kthimi kumulativ i strategjisë në periudhën e backtest-it, në përqindje: nga kapitali fillestar te final equity.',
    ideal: 'Pozitive dhe mbi rendimentin e mbajtjes pasive të aksionit për të njëjtën periudhë — ndryshe strategjia s\u2019paguan punën e saj.',
    warn: 'Rezultat i kaluar në një kënd të vetëm historik — nuk garanton asgjë për përpara; lexoje përshkrues.',
  },
  aa_max_dd: {
    title: 'Max Drawdown',
    what: 'Rënia më e madhe nga maja në fund që ka pësuar kapitali gjatë backtest-it: sa përqind humbje do të kishe përjetuar në pikën më të keqe.',
    ideal: 'Nën 10–20% e konsiderueshme për strategji të vetme. Drawdown i thellë tregon sa fort duhet të mbahen nervat — edhe kur strategjia në fund del fituese.',
  },
  aa_sharpe: {
    title: 'Sharpe Ratio',
    what: 'Rendimenti i tepërt i strategjisë i pjesëtuar me devijimin standard të tij: sa fitim për njësi rreziku (luhatshmërie).',
    ideal: 'Mbi 1.0 konsiderohet i mirë, mbi 2.0 shumë i fortë për strategji të vazhdueshme. Sharpe i lartë = rrugë e qetë drejt të njëjtit rendiment.',
    warn: 'Sharpe i llogaritur mbi pak tregtime ose periudhë të shkurtër është i paqëndrueshëm — mos e krahaso me Sharpe-t e fondseve reale.',
  },
  aa_profit_factor: {
    title: 'Profit Factor',
    what: 'Shuma e gjithë fitimeve e pjesëtuar me shumën e gjithë humbjeve: 2.0 = për çdo 1$ të humbur, strategjia ka fituar 2$.',
    ideal: 'Mbi 1.5 i shëndetshëm, mbi 2.0 i fortë. Nën 1.0 strategjia humbet para edhe me shumë «fitore» të vogla.',
  },
  aa_final_equity: {
    title: 'Final Equity',
    what: 'Kapitali përfundimtar i backtest-it: kapitali fillestar plus fitimet/humbjet e gjithë tregtimeve të simuluar.',
    ideal: 'Krahasoje me kapitalin fillestar dhe me buy-and-hold për të njëjtën periudhë — kjo është matja e trashë e rezultatit.',
  },
  aa_sentiment: {
    title: 'Analiza e Sentimentit me AI',
    what: 'Modeli lexon lajmet/publikimet e fundit për aksionin dhe i përmbledh në një etiketë BULLISH/BEARISH/NEUTRAL me score 0–100.',
    ideal: 'Sentiment pozitiv me çmim të dobët = mosmarrveshje e mundshme; sentiment negativ me çmim të fortë = kujdes. Kontekst tregu — verifiko burimet vetë.',
    warn: 'Sentimenti nga lajme është subjektiv dhe varet nga burimet e disponueshme në momentin e analizës.',
  },
  aa_korrelacion: {
    title: 'Matrica e Korrelacionit',
    what: 'Koeficienti i korrelacionit (−1 … +1) mes kthimeve ditore të çdo çifti simbolesh: +1 lëvizin njësoj, −1 në drejtime të kundërta, 0 pa lidhje lineare.',
    ideal: 'Korrelacion i lartë (+0.7) brenda një portofoli = risk i përqendruar (të gjitha bien bashkë). Vlerat mes −0.3 dhe +0.3 tregojnë diversifikim real.',
    warn: 'Korrelacioni llogaritet mbi dritaren e zgjedhur dhe ndryshon në kriza — gjatë rrëzimeve shumica e korrelacioneve shkojnë te 1.',
  },

  // ───── PAPER TRADING — paper-trading ─────
  pt_balanca: {
    title: 'Balanca (cash)',
    what: 'Para e papërdorura në portofolin e paper trading: gjithë ekuilibri minus vlera e pozicioneve të hapura.',
    ideal: 'Balanca 100% = pa pozicione; balanca shumë e vogël = portofol i ngarkuar plotësisht. Përqindja «e lirë» tregon hapësirën për hyrje të reja.',
  },
  pt_vlera: {
    title: 'Vlera e Portfolios',
    what: 'Vlera e përgjithshme momentale: balanca cash + vlera e aksioneve të mbajtura te çmimet live të tregut.',
    ideal: 'Krahasoje me balancën fillestare për rezultatin total; ndryshimi ditor vjen nga lëvizjet e pozicioneve dhe nga P&L-i i parealizuar.',
  },
  pt_pnl_total: {
    title: 'P&L Total',
    what: 'Fitimi/humbja e përgjithshme e portofolit: P&L i realizuar nga tregtimet e mbyllura + P&L i parealizuar i pozicioneve të hapura, në $ dhe në %.',
    ideal: 'Pozitive = portofoli përpara. Ndarja realizuar/parealizuar është e rëndësishme: fitimet në letër mund të shpëtojnë para se t\u2019i realizosh.',
  },
  pt_win_rate: {
    title: 'Win Rate (paper trading)',
    what: 'Përqindja e tregtimeve të mbyllura me fitim: fitore / gjithë tregtimet e mbyllura.',
    ideal: 'Mbi 50% i mirë — por lexohet vetëm bashkë me mesataren e fitimit kundrejt mesatares së humbjes: 45% win rate me fitore 2× më të mëdha është fitues.',
    warn: 'Me pak tregtime të mbyllura shifra luhaten fort — kampion i vogël, mos nxirr përfundime.',
  },
  pt_trades: {
    title: 'Total Trades',
    what: 'Numri i tregtimeve të mbyllura deri tani në llogarinë e paper trading.',
    ideal: 'Sa më shumë tregtime, aq më e qëndrueshme bëhet statistika — nën ~30 mendo si kampion të vogël.',
  },
  pt_avg_fitim: {
    title: 'Mesatarja e Fitimit',
    what: 'Kthimi mesatar (%) i tregtimeve fituese të mbyllura.',
    ideal: 'Shikoje kundrejt mesatares së humbjes: raporti fitim/humbje (p.sh. +4% kundrejt −2%) tregon nëse matematika punon për teje.',
  },
  pt_avg_humbje: {
    title: 'Mesatarja e Humbjes',
    what: 'Kthimi mesatar (%) i tregtimeve humbëse të mbyllura.',
    ideal: 'Humbje mesatare të vogla e të kontrolluara (stope të nderuar) = disiplinë. Humbje mesatare më të mëdha se fitimet mesatare = stope të gjerë ose mbajtje shpresash.',
  },
  pt_best: {
    title: 'Tregtimi më i mirë',
    what: 'Kthimi më i lartë (%) i një tregtimi të vetëm të mbyllur deri tani.',
    ideal: 'Statistikë ekstreme: një fitim i vetëm i madh mund ta zbukurojë gjithë historinë — krahasoje me mesataren e fitimit për të parë sa përfaqësues është.',
  },
  pt_worst: {
    title: 'Tregtimi më i keq',
    what: 'Kthimi më i thellë (%) i një tregtimi të vetëm të mbyllur deri tani.',
    ideal: 'Nëse më i keqit është shumë më i thellë se humbja mesatare, dikur një stop ka mbetur jashtë planit — informacion i rëndësishëm për disiplinën.',
  },
  pt_equity: {
    title: 'Lakore e Ekuitetit',
    what: 'Vlera e portofolit në kohë (me vijën e investuar): rruga e kapitalit nga fillimi deri tani; çdo pikë = një moment llogarie.',
    ideal: 'Ngjitje e qetë me ulje të cekëta = profil i shëndetshëm. Rënie të thella e të gjata tregojnë humbje të pambrojtura — lexohet përshkrues, jo arsye për të ndryshuar rregullat pa hipotezë dhe test.',
  },

  // ───── QUANT DASHBOARD — quant-dashboard ─────
  qd_total_score: {
    title: 'Score Total (agjentët e peshuar)',
    what: 'Shuma e peshuar e 4 agjentëve të analizës: Teknike (35%) + Fundamentale (25%) + Makro (20%) + Lajme/Geo (20%). Secili agjent voton me score të vetin.',
    ideal: 'Score total mbi pragun e shfaqur (badge threshold) përkthehet në sinjal përfundimtar. Radari dhe barrat tregojnë cili agjent e mbart vendimin — lexoji edhe ata, jo vetëm shifrën.',
  },
  qd_stop_loss: {
    title: 'Stop Loss (quant)',
    what: 'Niveli i daljes humbëse që sugjeron analiza multi-agjente për këtë setup.',
    ideal: 'I përcaktuar para hyrjes dhe i pandryshueshëm pas saj: distanca Hyrje → Stop është 1R, baza e llogaritjes së madhësisë së pozicionit.',
  },
  qd_target1: {
    title: 'Target 1',
    what: 'Niveli i parë i daljes fituese: zakonisht zonë ku mbyllet pjesa e parë e pozicionit ose vendoset trailing stop.',
    ideal: 'Target i parë i afërt rrit probabilitetin e daljes me fitim; kuptimplot vetëm kundrejt distancës së stopit (R:R).',
  },
  qd_target2: {
    title: 'Target 2',
    what: 'Niveli i dytë, më i largët i daljes fituese — zgjatja e lëvizjes nëse trendi vazhdon.',
    ideal: 'Target 2 kërkon momentum të vazhdueshëm: nëse çmimi ngec midis Target 1 dhe 2, dalja graduale është sjellje normale.',
  },
  qd_pozicioni: {
    title: 'Pozicioni (size)',
    what: 'Madhësia e sugjeruar e pozicionit: rreziku për trade (% i kapitalit) i pjesëtuar me distancën Hyrje → Stop.',
    ideal: 'Stop më i afërt = më shumë aksione me të njëjtin rrezik; stop më i largët = më pak aksione. Rreziku në dollar mbetet konstant — jo notionali.',
  },

  // ───── MAP E TREGUT — market-map ─────
  mm_harta: {
    title: 'Map e Tregut (heatmap)',
    what: 'Pllaka e tregut në stil Finviz: madhësia e secilës pllakë tregon kapitalizimin e tregut, ngjyra ndryshimin ditor të çmimit, blloqet janë sektorë.',
    ideal: 'Pllaka gjelbër të mëdha = paraja e madhe po rritet sot; kuq i përhapur në shumë sektorë = ditë shitesi e gjerë. Hover mbi pllakë shfaq lajmet «pse lëviz».',
    warn: 'Heatmap-i ponderohet me kapitalizim: disa gjigantë mbushin shumë hapësirë — pllaka e vogël s\u2019do thotë patjetër lëvizje e parëndësishme.',
  },
  mm_adv: {
    title: 'në majtje (advancers)',
    what: 'Sa nga kompanitë e hartës tregtohen mbi mbylljen e mëparshme në këtë moment.',
    ideal: 'Më shumë se gjysma e pllakave në gjelbër = ditë e gjerë pozitive. Gjerësia e vërtetë kërkohet bashkë me mesataren e ponderuar.',
  },
  mm_dec: {
    title: 'në rënie (decliners)',
    what: 'Sa nga kompanitë e hartës tregtohen nën mbylljen e mëparshme.',
    ideal: 'Rënie e përhapur (shumica në kuq) tregon presion shitës të përgjithshëm — kontekst i ditës, jo sinjal hyrjeje/daljeje.',
  },
  mm_mesatarja: {
    title: 'Mesatarja e ponderuar',
    what: 'Ndryshimi mesatar i hartës i ponderuar me kapitalizimin: kompanitë e mëdha numërojnë më shumë se të voglat (Σ(cap×ndryshim) / Σcap).',
    ideal: 'Mesatarja e ponderuar MBI mesataren e thjeshtë = gjigantët po tërheqin tregun; NËN të = të voglat po mbajnë peshën. Diferenca tregon gjerësinë e vërtetë të lëvizjes.',
  },

  // ───── GRAFIK FINVIZ — finviz-chart ─────
  fv_grafiku: {
    title: 'Grafik Finviz (qiri + volum + MA)',
    what: 'Grafik interaktiv me qiri japonez: secili qiri tregon open/high/low/close të periudhës, paneli i poshtëm volumin, dhe vijat SMA 20/50/200 mbivendosen mbi çmim.',
    ideal: 'Qiri gjelbër = mbyllja mbi hapjen; kuq = nën të. Mesataret prekura nga çmimi veprojnë si suport/rezistencë dinamike. Legjenda O/H/L/C në kënd tregon vlerat e qirit nën kursor.',
  },
  fv_ngjyra: {
    title: 'Ngjyra e qirinjve',
    what: 'Kodimi i qirinjve: gjelbër = periudha mbyll mbi se ç hapet (presion blerës brenda periudhës), kuq = mbyll nën hapje (presion shitës).',
    ideal: 'Qirinj të mëdhenj gjelbër pas konsolidimit tregojnë forcë; qiri i madh kuq pas një ngjitjeje të zgjatur = kujdes. Volumi i qirit vlen sa madhësia e lëvizjes.',
  },

  // ───── MARKET OVERVIEW — market-overview ─────
  mo_permbledhje: {
    title: 'Përmbledhje e Tregut (AI)',
    what: 'Përmbledhje e shkruar nga modeli AI për gjendjen e përgjithshme të tregut — sintezë e indekseve, sektorëve dhe lajmeve të fundit.',
    ideal: 'Kontekst narrativ për ditën: lexoje si pikëpamje të një analisti automatik, jo si sinjal të testuar. Strategjitë e ngrira (CTC/REV) nuk ndizen/fiken nga kjo.',
    warn: 'Teksti gjenerohet nga lajmet dhe të dhënat e momentit — mund të jetë i pasaktë ose i vjetëruar; verifiko vetë burimet kryesore.',
  },
  mo_vezhgime: {
    title: 'Vëzhgime Kryesore (AI)',
    what: 'Listë pikash e gjeneruar nga AI: çfarë ka më shumë gjasa të jetë duke lëvizur tregun tani (momentum, lajme, rotacion).',
    ideal: 'Pikat janë hipoteza për hulumtim — çdo vëzhgim verifikohet me të dhënat e grafikut para se të kthehet në vend.',
  },
  mo_risku: {
    title: 'Faktorët e Riskut (AI)',
    what: 'Rreziqet e identifikuara nga modeli për mjedisin aktual: ngjarje kalendarike, volatilitet, përqendrim, gjeopolitikë.',
    ideal: 'Lexoji si checklist kujdesi: faktorët e listuar ndikojnë madhësinë e pozicionit dhe pritjet — jo ndërrimin automatik të strategjisë.',
  },

  // ───── 5 PILLARS — five-pillars ─────
  p_rvol: {
    title: 'RVol — Relative Volume (≥5x)',
    what: 'Volumi i sotëm i ndarë me volumin mesatar 30-ditor: RVol 5x = po tregtohet pesëfish mbi normalen për këtë orë të ditës.',
    ideal: 'Pillar-i kërkon RVol ≥ 5x: shpërthim interesi që zakonisht vjen me lajm katalizator. RVol mbi 10x = panik/eufori ekstreme — lëvizje të mëdha në të dy drejtimet.',
    warn: 'Herët në seancë RVol llogaritet ndryshe (volum i mbledhur deri tani) — krahasimet më të sakta bëhen pasi seanca të ecë.',
  },
  p_momentum: {
    title: 'Daily change (≥10%)',
    what: 'Ndryshimi ditor i çmimit deri tani: pillar-i kërkon gain ≥ 10% — kandidatë me lëvizje ekstreme njëditore.',
    ideal: 'Gain i fortë me RVol të lartë dhe katalizator = konfluencë e plotë. Lëvizje 10%+ pa volum = dyshimtë; me volum ekstrem pas ngjitjeje të zgjatur = rrezik kthimi.',
  },
  p_catalyst: {
    title: 'News Catalyst',
    what: 'A ka lajm konkret që shpjegon lëvizjen (rezultate, FDA, kontratë, njoftim)? Skaneri kontrollon burimet dhe cakton statusin Verified / Review / Missing.',
    ideal: 'Katalizator i verifikuar i jep lëvizjes arsye dhe mundësi vazhdimësie. Lëvizje e madhe PA lajm është më e paparashikueshme — shpesh rumor ose pump.',
    warn: 'Datat dhe përmbajtja e lajmeve vijnë nga furnitorë të jashtëm — verifiko burimin origjinal para se të veprosh.',
  },
  p_price: {
    title: 'Price $2–$20',
    what: 'Filtro çmimi: aksione 2–20 dollarë — zona klasike e small-cap-eve ku lëvizjet procentuale ditore janë më të mëdha.',
    ideal: 'Zonë kuptimplote për day trading: çmim i ulët = lëvizje % të mëdha me volum të arsyeshëm. Nën 2$ rritet rreziku i manipulimit dhe delisting-ut.',
  },
  p_float: {
    title: 'Float (<20M aksione)',
    what: 'Aksionet në qarkullim të lirë (jo të mbajtur nga insiderët). Float i vogël = ofertë e kufizuar aksionesh për t\u2019u tregtuar.',
    ideal: 'Float nën 20M me kërkesë të fortë (RVol + katalizator) mund të shkaktojë lëvizje vertikale. Float i verifikuar (SA/Finviz) është më i besueshëm se ai statik.',
    warn: 'Short float i lartë (shfaqet te «Short: x%») shton mundësinë e short squeeze — volatilitet ekstra në të dy drejtimet.',
  },
  p_winrate_hist: {
    title: '1D/2D/3D/5D Win Rate (historik)',
    what: 'Modeli kërkon raste të kaluara me profil të ngjashëm dhe mat sa shpesh ato kanë vazhduar lart pas 1, 2, 3 dhe 5 ditëve, plus kthimin mesatar (avg).',
    ideal: 'Win rate mbi 50–60% me kthim mesatar pozitiv = pattern-i ka pasur gjurmë historikisht. Lexoji si grumbull rastesh, jo si garanci për këtë rast.',
    warn: 'Historia e pattern-eve NUK është backtest i strategjisë së testuar — e dhënë përshkruese, jo arsye për të ndryshuar rregullat pa hipotezë dhe test.',
  },

  // ───── IBKR — karta e kandidatit (ibkr-strategy) ─────
  ib_radar: {
    title: 'Score Radar (6 boshte)',
    what: 'Grafik radar i 6 sub-score-ve të kandidatit: Trend, RS, Momentum, Volum, Setup, Risk — të njëjtat komponentë që përbëjnë Total Score-in.',
    ideal: 'Formë e mbushur simetrikisht = kandidat i plotë; bosht i ngushtë (p.sh. Risk i ulët) = pika e dobët e idesë. Detajet për çdo bosht janë te qelizat poshtë radars.',
  },
  ib_konfid_lajme: {
    title: 'Konfidencë e News Signal',
    what: 'Vetëvlerësimi i modelit të lajmeve për këtë sinjal: sa raste të ngjashme historike po konfirmojnë parashikimin e impaktit.',
    ideal: 'Më e lartë = më shumë raste analoge mbështetëse. NUK është probabilitet fitimi i testuar — krahaso me rastet e listuara «të ngjashme».',
  },
  ib_mesataret: {
    title: 'EMA10 / EMA20 / SMA50 (vlerat)',
    what: 'Vlerat momentale të tre mesatareve të kandidatit: EMA10/EMA20 reagojnë shpejt (pesha eksponenciale te çmimet e fundit), SMA50 është referenca e trendit afatmesëm.',
    ideal: 'Në pullback të shëndetshëm çmimi i afrohet EMA10/20 nga lart ndërsa SMA50 mbetet nën të dhe në rritje. Vlerat ndihmojnë të verifikohet niveli i hyrjes kundrejt mesatareve.',
  },

  // [FJALORI_3 — metodologji]
};
