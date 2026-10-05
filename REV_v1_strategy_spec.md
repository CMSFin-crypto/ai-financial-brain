# Strategjia REV v1 — "Confirmed Short-Term Reversal"

## Strategji e VEÇANTË, e pavarur nga CTC v2 (Trend Continuation)

**Statusi:** Hipotezë e para-regjistruar për t'u VALIDUAR. E veçantë krejtësisht
nga CTC — s'e ndryshon atë, s'e prek funnel-in e saj, rendet paralel.

**Version:** REV_HYPOTHESIS_VERSION = 1.1 (familje e re, jo vazhdim i CTC)

**Data e regjistrimit fillestar:** 2026-09-29 (v1)

**Amendimi para-testimit:** 2026-09-30 (v1.1) — TË TRIA rafinimet më poshtë
janë arsyetuar VETËM teorikisht, pa parë asnjë rezultat testi — prandaj janë
të ligjshme për t'u regjistruar tani. Pas fillimit të testimit, ASNJË ndryshim
më parametrash (e njëjta disiplinë si regjistrimi fillestar).

**Baza teorike (ndryshe nga CTC):**
- Lehmann (1990), Jegadeesh (1990): kthimet 1-javore priren të kthehen mbrapsht
- Nagel (2012): kompensimi i furnizimit të likuiditetit — edge më i fortë te
  aksionet me likuiditet MESATAR (mid-cap i vërtetë), jo mega-cap (ku CTC operon)

---

## 0. Dallimi themelor nga CTC — mos i përzie

| | CTC v2 (ekzistuese) | REV v1 (e re) |
|---|---|---|
| Beti | Vazhdon lëvizja | Kthehet mbrapsht lëvizja |
| Likuiditeti | Top kuintil (top 20%) | Zona e mesme (20-80p) mbi pool dedikuar me shtresë mid-cap |
| Gate i lajmeve | PEAD — bonus (mungesa thjesht e humb përforcimin) | 8-K real → BLLOKO + EDGAR fail-closed (kusht sigurie) |
| Regjimi i preferuar | Trending (ADX i lartë) | Funksionon edhe në chop; kujdes te crash sistemik DHE shock sektorial |
| Win rate i pritur | ~35-45% | **~60-70%** (këtu aplikohet profili i GLM-it) |
| R mesatar | I vogël pozitiv, R:R>1 | Target modest, win rate kompenson |
| Rreziku kryesor | Hyrje e vonuar | "Falling knife" — vazhdim i rënies |

**Mos e vendos në të njëjtin funnel/score me CTC.** Rendi si proces i pavarur
skanimi, me sinjale të veçanta dhe me pool-in e vet dedikuar (Seksioni 1).

---

## 1. Universi & Likuiditeti — zona e mesme mbi pool DEDIKUAR REV

| Kusht | Prag |
|---|---|
| Rankim | $ dollar-volume trailing 20d, POINT-IN-TIME (njësoj si CTC) |
| Zona e lejuar | 20-80 percentile (përjashto top 20% mega-cap DHE fundin 20% jo-likuid) |
| $ Volume min absolut | $10M/ditë (më i ulët se CTC, sepse s'kërkojmë mega-cap) |
| Çmimi min | $10 |
| **Shtresa mid-cap (amendimi 1.1)** | Pool-i REV = baza + shtresa mid-cap dedikuese ($2-20B, S&P 400 / Russell Midcap-stil) |
| **Përbërja e zonës (amendimi 1.1)** | Zona 20-80p duhet të përmbajë **≥40% mid-cap** — GATE i validimit |

### 1.1 Pse shtresa mid-cap (amendimi 1.1 — Nagel 2012)

Nagel (2012) e gjen kompensimin e likuiditetit më të fortë te emrat që s'janë
thjesht "jo top 20%", por VËRTET mid-cap. Problemi praktik: baza 400 e
përbashkët është e përqendruar në large/mega-cap, kështu që zona 20-80
percentile e kësaj liste do të ishte "jo-mega-cap brenda liste large-cap" —
jo mid-cap i vërtetë ku edge-i është më i fortë. Do ta testoja hipotezën mbi
zonën e gabuar të spektrit të likuiditetit.

Zgjidhja e para-regjistruar: REV ka pool-in e vet dedikuar — baza e zmadhuar
me një shtresë mid-cap (kandidatë likuidë $2-20B, `REV_MIDCAP_TIER` në
`src/lib/rev/signal.ts`). Filtri 20-80 percentile + pragjet absolute vlejnë
për të gjithë pool-in. Dhe matja nuk është opsionale: **përbërja e zonës**
(sa % e emrave brenda 20-80p janë mid-cap) duhet ≥40% — përndryshe gate-i i
validimit dështon (fail-closed).

**Pse jo top-kuintil:** Nagel (2012) e lidh edge-in e reversal-it me
kompensimin për furnizim likuiditeti — kjo është më e fortë pikërisht ku
"arbitrazhuesit stat-arb" e kanë më pak të leverdishme (spread pak më i
gjerë se mega-cap, por jo aq sa te emrat vërtet jo-likuid).

---

## 2. Sinjali i Hyrjes — rënie e identifikueshme, jo çdo ditë e kuqe

Të GJITHA kushtet duhet plotësuar:

1. **Rënie e konsiderueshme pa arsye fondamentale**: kthimi kumulativ 3-ditor
   ≤ -8%, OSE RSI(2) < 10
2. **Rënia është idiosinkratike, jo sistemike**: (kthimi i aksionit − kthimi
   i SPY në të njëjtën periudhë) duhet të jetë dukshëm negativ — pra aksioni
   po bie MË SHUMË se tregu, jo thjesht duke ndjekur një ditë të kuqe të
   përgjithshme
3. **Dobësi kundrejt sektorit të vet (amendimi 1.1)**: kthimi i aksionit duhet
   të jetë dukshëm negativ EDHE kundrejt mesatares së sektorit të vet (jo
   vetëm SPY). Një aksion mund të bjerë njësoj si gjithë sektori (p.sh.
   gjithë bankat bien nga një lajm makro bankar) pa u dukur kundrejt SPY —
   aty shock-i është sektorial, korrelacioni brenda sektorit rritet (njësoj
   si te crash sistemik) dhe reversal-i individual është më pak i besueshëm.
   Mesatarja e sektorit llogaritet equal-weight mbi peers me të dhëna,
   PA veten; kërkohen **≥3 peers** — nëse më pak, kushti s'kubohet ta
   verifikojë → fail-closed (pa sinjal).
4. **Pa event fondamental real — GATE me FAIL-CLOSED (amendimi 1.1)**: nëse
   ka 8-K real (jo çdo filing, por njoftim material, p.sh. Item 2.02
   earnings surprise negative, guidance cut, etj.) brenda 2 ditëve,
   **BLLOKO** — kjo s'është "overreaction e tregut", është reagim ndaj lajmi
   real, ka gjasa të vazhdojë. KRITIK: te CTC event-gate është bonus (PEAD)
   — nëse mungon, humbet vetëm një përforcim. Te REV ai BLLOKON hyrjen, dhe
   prandaj është **kusht sigurie**: (a) vetëm **US-domestic filers** — ADR/foreign
   private issuers (formularët 6-K, 20-F, 40-F) nuk depozitojnë 8-K, gate-i
   do të ishte i verbër për ta → **EKSKLUZOHEN nga REV krejtësisht**;
   (b) emri pa timeline EDGAR të plotë (pa asnjë filing brenda 120 ditëve,
   ose pa të dhëna fare) gjithashtu **EKSKLUZOHET** — në asnjë rast s'trajetohet
   "event-neutral". Skenari më i keq (hyrje në rënie me lajm real të paverifikueshëm)
   duhet të jetë i pamundur strukturisht, jo thjesht i rrallë.
5. **Regjimi sistemik s'është crash**: SPY vetë s'ka rënë >3% brenda ditës —
   në ditë crash-i, korrelacionet shkojnë drejt 1 dhe reversal individual
   bëhet më pak i besueshëm

---

## 3. Konfirmimi — MBROJTJA kundër "falling knife" (kritike)

Mos hyr në ditën e rënies vetë. Prit:

1. **Candle stabilizimi** të nesërmen: close > open (ditë e gjelbër), OSE
   low i ri > low i ditës paraardhëse (higher low)
2. **Volumi në rënie** relativisht ditën e konfirmimit (presioni i shitjes
   po shterret, jo duke u përshpejtuar)
3. Nëse çmimi bën **low të ri** ditën e konfirmimit (pra vazhdon rënia) →
   **MOS HYR FARE**, thesis-i i overreaction u invalidua vetë

Kjo është dallimi kryesor nga PULLBACK-u i vjetër i sistemit — atje
s'kishte konfirmim eksplicit, thjesht hyrje mekanike, gjë që ndoshta e bënte
të "kapte thika" pa filtër.

---

## 4. Exit — më i shkurtër dhe më konservativ se CTC

| Parametër | Vlerë | Arsyetimi |
|---|---|---|
| Stop | 1.3 × ATR(14) (më i ngushtë se CTC-1.8) | Low i ri = invalidim i qartë, dil shpejt |
| Target | 1.2R | Mean-reversion: fiton shpesh, jo shumë — win rate kompenson |
| Time stop | 3 ditë | Literatura: efekti manifestohet brenda javës; nëse s'ka lëvizur, teza dobësohet |
| Max holding | 5 ditë | Brenda kufirit swing 1-7d të kërkuar |
| Min holding | 1 ditë | (konfirmimi vetë kërkon min 1 ditë pritje pas sinjalit) |

---

## 5. Risk & Position Sizing — më konservativ se CTC

| Parametër | Vlerë | Krahasim me CTC |
|---|---|---|
| Risk per tregti | 0.5% | (CTC: 0.75%) — rrezik më i lartë per-tregti (falling knife) |
| Max pozicione të hapura | 3 | njësoj |
| Max per sektor | 1 | njësoj |
| Cooldown per simbol | 5 ditë | (CTC: 10) — cikli reversal është më i shkurtër |

---

## 6. Modeli i Kostos & Cost Sensitivity

Njësoj si CTC (komision $0.005/aksion min $1, slippage, spread nga ADV) —
por meqë likuiditeti është më i ulët se CTC, **prit spread pak më të gjerë**
(slippage 5bps + spread est. 10bps). Testo veçmas: nëse PF bie nën 1.05 me
+10bp shtesë, kjo ka gjasa më të mëdha të ndodhë këtu se te CTC — nëse
ndodh, zgjidhja është të ngushtosh edhe më shumë zonën e likuiditetit (jo
drejt zonën e mesme, por drejt fundit të sipërm të saj, ~40-80 percentile
në vend të 20-80).

---

## 7. Profili i Pritur — KËTU aplikohet profili i GLM-it

| Metrikë | Pritje reale për REV v1 |
|---|---|
| Win rate | **60-70%** |
| Profit factor | 1.1-1.5 (PF≥2 = dyshim bias/bug, njësoj si CTC) |
| Kosto/vit | 3-6% |
| R mesatar | I vogël pozitiv, por nga shumë fitore të vogla jo nga R:R e lartë |

**Kujdes:** win rate i lartë s'do të thotë "më i mirë" se CTC automatikisht
— kompensohet me target më të vogël. Krahaso Profit Factor dhe Expectancy
neto, jo vetëm win rate.

---

## 8. Portat e Validimit — strukturalisht njësoj si CTC v2, por familje e veçantë

Gates (REV_GATES — të ngrira):

| Gate | Pragu |
|---|---|
| IS tregti / PF | ≥ 30 tregti, PF ≥ 1.30 |
| OOS tregti / PF | ≥ 30 tregti, PF ≥ 1.15 |
| Walk-forward | ≥ 70% dritare pozitive (min 8 tregti/dritare) |
| Max drawdown | ≤ 20% |
| Koncentrim top-3 simbole | ≤ 60% e profilit |
| Stabilitet IS→OOS win-rate | devijim ≤ 10 pp |
| Cost sensitivity +10bp | PF ≥ 1.05 |
| **Falling-knife rate (SPECIFIK REV)** | ≤ 40% e tregtive bëjnë low të ri pas hyrjes |
| **Shtresa mid-cap në zonën REV (amendimi 1.1)** | ≥ 40% e zonës 20-80p mid-cap ($2-20B); fail-closed nëse s'matet |

**Gate shtesë specifik për REV** — Falling-Knife Check:
Mat % e tregtive që bënë "low të ri" pas hyrjes PARA se të arrinin target
(dmth konfirmimi dështoi të parandalonte vazhdimin e rënies). Nëse >40% e
tregtive bëjnë këtë, filtri i konfirmimit (Seksioni 3) s'po funksionon
mjaftueshëm — kjo tregon defekt specifik, jo problem gjenerik parametrash.

**Krahaso REV KUNDRË EXPECTED_PROFILE_REVERSAL (60-70% WR), JO kundrejt
profilit të CTC (35-45% WR)** — janë familje strategjish me nënshkrime
statistikore krejt të ndryshme.

---

## 9. Si rendet paralel me CTC — jo në konflikt

- Të dyja skanojnë universet me mbivendosje të pjesshme, por REV ka pool-in
  e vet dedikuar (baza + shtresa mid-cap) me filtra likuiditeti të ndryshëm
  (CTC: top 20%; REV: 20-80 percentile) — **mbivendosje minimale natyrshëm**
- Nëse një simbol kualifikohet rastësisht për të dyja (rrallë, për shkak të
  zonave të ndryshme likuiditeti), **mos hap dy pozicione të kundërta** —
  REV ka përparësi nëse konfirmimi i saj është më i fortë, përndryshe anashkalo
- Gjurmo P&L **veç e veç** në raportim — mos i përziej metrikat e CTC dhe REV
  në një Validation Lab të vetëm, që të mbetet e qartë cila strategji
  kontribuon çfarë

---

## 10. Implementimi në këtë repo (Financial Brain)

REV v1 jeton krejtësisht e izoluar — skedarët e saj s'prekin asnjë skedar të
CTC (IBKR), CAMS apo Social Arb:

| Skedar | Roli |
|---|---|
| `REV_v1_strategy_spec.md` | Ky speku — rregullat e plota të ngrira |
| `scripts/rev_v1_validator.py` | Validator Python (gates + falling-knife, self-contained) |
| `src/lib/rev/hypothesis.ts` | Hipoteza e ngrirë + portat e validimit (pasqyrë TS) |
| `src/lib/rev/signal.ts` | Motori i sinjalit + backtest-i REV (self-contained) |
| `src/app/api/rev-scan/route.ts` | API skanimi live REV |
| `src/app/api/rev-validate/route.ts` | API validimi IS/OOS/WF + verdikti PASS/REJECT |
| `src/components/financial-brain/rev-strategy.tsx` | UI — tab i veçantë "REV" |

Tab-i në UI: **"REV"** (kategoria Tregu, ngjyra cyan — e veçuar nga IBKR
jeshilja, CAMS vjollca). Label: *"REV v1 — Reversal (familje e veçantë nga CTC)"*.

---

## Addendum (2026-09-30) — Universi bazë i përbashkët u korrigjua

Universi bazë i përbashkët CTC/REV zëvendësua si **korrigjim cilësie të
dhënash** (EDGAR coverage, ADR filing mismatch, emra të vdekur): nga
"400-lista e përzier" te `src/lib/scanner/universe-core.ts` (~200 emra
US-domestic, US-GAAP filers, large/mega-cap, likuide) — `UNIVERSE_CORE_VERSION = 2`.

Zonat e likuiditetit të REV janë **percentile-based (20–80)** brenda bazës,
pra janë invariante ndaj kësaj korrigjimi — adaptohen automatikisht te baza e
re pa ndryshim hipoteze. Kjo korrigjim tani është pjesë e amendimit **v1.1**
(më poshtë: shtresa mid-cap u shtua pikërisht mbi këtë bazë të pastër
US-domestic). Detajet dhe kushti anti-tuning: `CTC_v2_strategy_spec.md`, Seksioni 2.

---

## Adenda — Ditari i Sinjaleve (Gjurmuesi), 2026-09-30

REV hyn në ditarin deskriptiv të sinjaleve (`SignalJournalEntry`, tab-i
«Gjurmuesi») si strategji e veçantë — metrikat e REV **s'përzier kurrë** me
të CTC (Seksioni 9 i këtij spec-i). Rregullat me të cilat ditari e vlerëson
REV janë pikërisht rregullat e hipotezës së ngrirë, pa asnjë ndryshim:

- **Regjistrimi (Job A):** çdo sinjal `HYRJE_TANI` të skanimit ditor —
  hyrja reale = close i ditës së konfirmimit (T+1). Sinjalet
  `PRIT_KONFIRMIM` NUK regjistrohen (rregulli i hyrjes: pa konfirmim, pa
  tregti). Flag-u `pa_slot` vjen nga slot-et e skanimit (max 3 pozicione,
  1/sektor) — çdo sinjal i konfirmuar rregjistrohet gjithësesi.
- **Vlerësimi (Job B):** checkpoint-e d1..d5 ku `d1 = dita pas hyrjes`;
  target hit = high ≥ target; stop hit = low ≤ stop; qiri që i prek të
  dyja → **STOP** (konservativ); gap nën stop → **GAP_STOP** te çmimi i
  hapjes; **time-stop dita 3** te close (fund i fortë dita 5, si MAX_HOLD).
- **Kostoja C = 0.20%** round-trip — vetëm për kolonën «PnL net %».
- **Kushti anti-tuning** (i njëjta disiplinë si te CTC, Seksioni 2.2): ditari
  është **deskriptiv** — mat çfarë ndodhi pas sinjaleve. NUK përdoret për të
  ndryshuar stop 1.3×ATR, target 1.2R, time-stop 3d apo ndonjë prag tjetër.
  Modelet interesante regjistrohen si hipotezë e re (version i ri) dhe
  testohen me backtest + OOS përpara çdo ndryshimi të hipotezës së ngrirë.

Detajet e plota të infrastrukturës (tabela, job-et idempotente, crons,
rregullat e leximit, testi i konsistencës):
`CTC_v2_strategy_spec.md`, Seksioni 8.
