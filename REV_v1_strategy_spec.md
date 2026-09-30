# Strategjia REV v1 — "Confirmed Short-Term Reversal"

## Strategji e VEÇANTË, e pavarur nga CTC v2 (Trend Continuation)

**Statusi:** Hipotezë e para-regjistruar për t'u VALIDUAR. E veçantë krejtësisht
nga CTC — s'e ndryshon atë, s'e prek funnel-in e saj, rendet paralel.

**Version:** REV_HYPOTHESIS_VERSION = 1 (familje e re, jo vazhdim i CTC)

**Data e regjistrimit:** 2026-09-29

**Baza teorike (ndryshe nga CTC):**
- Lehmann (1990), Jegadeesh (1990): kthimet 1-javore priren të kthehen mbrapsht
- Nagel (2012): kompensimi i furnizimit të likuiditetit — edge më i fortë te
  aksionet me likuiditet MESATAR, jo mega-cap (ku CTC operon)

---

## 0. Dallimi themelor nga CTC — mos i përzie

| | CTC v2 (ekzistuese) | REV v1 (e re) |
|---|---|---|
| Beti | Vazhdon lëvizja | Kthehet mbrapsht lëvizja |
| Likuiditeti | Top kuintil (top 20%) | Zona e mesme (~20-80 percentile, jo top/fund) |
| Regjimi i preferuar | Trending (ADX i lartë) | Funksionon edhe në chop; kujdes te crash sistemik |
| Win rate i pritur | ~35-45% | **~60-70%** (këtu aplikohet profili i GLM-it) |
| R mesatar | I vogël pozitiv, R:R>1 | Target modest, win rate kompenson |
| Rreziku kryesor | Hyrje e vonuar | "Falling knife" — vazhdim i rënies |

**Mos e vendos në të njëjtin funnel/score me CTC.** Rendi si proces i pavarur
skanimi, me sinjale të veçanta, edhe nëse ndajnë të njëjtin universe bazë 400
emrash.

---

## 1. Universi & Likuiditeti — zona e mesme, JO top-kuintil

| Kusht | Prag |
|---|---|
| Rankim | $ dollar-volume trailing 20d, POINT-IN-TIME (njësoj si CTC) |
| Zona e lejuar | 20-80 percentile (përjashto top 20% mega-cap DHE fundin 20% jo-likuid) |
| $ Volume min absolut | $10M/ditë (më i ulët se CTC, sepse s'kërkojmë mega-cap) |
| Çmimi min | $10 |

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
3. **Pa event fondamental real**: GATE — nëse ka 8-K real (jo çdo filing, por
   njoftim material, p.sh. Item 2.02 earnings surprise negative, guidance
   cut, etj.) brenda 2 ditëve, **BLLOKO** — kjo s'është "overreaction e
   tregut", është reagim ndaj lajmi real, ka gjasa të vazhdojë
4. **Regjimi sistemik s'është crash**: SPY vetë s'ka rënë >3% brenda ditës —
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

- Të dyja mund të skanojnë të njëjtin universe bazë 400 emrash, por me
  filtra likuiditeti të ndryshëm (CTC: top 20%; REV: 20-80 percentile) —
  **mbivendosje minimale natyrshëm**
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
re pa ndryshim hipoteze (REV_HYPOTHESIS_VERSION mbetet 1). Detajet dhe kushti
anti-tuning: `CTC_v2_strategy_spec.md`, Seksioni 2.
