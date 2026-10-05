# Strategjia CTC v2 — "Delivery" (Trend Continuation)

**Statusi:** Strategji operacionale (funnel i plotë 5-shtresor, tab i dedikuar i izoluar).
**Versioni i universit bazë:** UNIVERSE_CORE_VERSION = 2 (efektive 2026-09-30)
**Data e këtij dokumenti:** 2026-09-30 (krijuar me rregullin e ri të Seksionit 2 — i para-regjistruar)

Ky dokument formalizon rregullat e strategjisë CTC v2 — Delivery, e izoluar nga
REV v1 (reversal) dhe nga mjetet e tjera. Ndarja është arkitekturore dhe metodologjike:
CTC vazhdon lëvizjen, REV e kthen mbrapsht — mos i përziej asnjëherë në të njëjtin
funnel, skor ose vendimmarrje (shih REV_v1_strategy_spec.md, Seksioni 0).

---

## 1. Përmbledhja e funnel-it

```
Universi bazë core (~200 US-domestic filers)
  → Filtër universi (US-domestic, US-GAAP filer)          [Seksioni 2.1]
  → Top-kuintil i likuiditetit (percentile mbi bazën)     [Seksioni 2.3]
  → Trend (SMA50/200 + RS vs SPY)                          [Seksioni 3]
  → Setup (vetëm TREND_CONT i tregtueshëm)                 [Seksioni 3]
  → Risk + Gap Gate → Skorimi → Top 1–5                    [Seksionet 4–6]
```

Kufizimet e delivery: **max 3 pozicione · 1/sektor · cooldown 10 ditë/simbol ·
vetëm setup TREND_CONT**.

Peshat e skorimit (rikalibrimi v2): Trend 15% · RS 25% · Momentum 15% ·
Volum 15% · Setup 10% · Likuiditet 10% · Risk 10% — me multiplikatorë të
mësuar (0.75–1.25) nga outcomes historike.

---

## 2. Universi & Likuiditeti

### 2.1 RREGULLI I UNIVERSIT BAZË (i para-regjistruar 2026-09-30)

**Filtro universin bazë për "US-domestic, US-GAAP filer" PARA se të aplikohet
rankimi i likuiditetit.**

Kriteret e bazës (të fiksuara):

| # | Kriter | Detaj |
|---|--------|-------|
| a | US-domestic, US-GAAP filer | Depoziton 10-K/10-Q/8-K pranë SEC; **JO** 20-F/40-F/ADR |
| b | Large/mega-cap | ≈ >$10B kapitalizim tregu |
| c | Likuide | ADV i lartë dollar-volume; spread i ngushtë |
| d | Listing primar | NYSE/Nasdaq, listing i vetëm |

Implementimi: `src/lib/scanner/universe-core.ts` (~200 emra, `UNIVERSE_CORE_VERSION = 2`,
`UNIVERSE_CORE_META` ekspozohet në përgjigjen e `/api/ibkr-scan` për transparencë).
Zëvendëson "400-listën e përzier" (`universe-400.ts`, e fshirë), e cila përmbante:

- **ADRs / filerat e huaj** (BABA, JD, NIO, TSM, ASML, AZN, GSK, NVS, SNY, TM,
  HMC, STLA, RACE, BUD, DEO, BTI, SHOP, CP, CNI, SPOT etj.) — depozitojnë
  20-F/40-F, shpesh IFRS;
- **Emra të vdekur/delisted** (NKLA, GOEV, FFIE, RIDE, KSU, MGP, SGEN, PXD, MRO,
  PARA, DFS, X, ATVI etj.);
- **Ticker-e të pavlefshme/dyshimtë** (CISCO, SJ) dhe përsëritje të shumta.

### 2.2 Arsyetimi — KORRIGJIM CILËSIE TË DHËNASH, JO TUNIM PARAMETRI

Ky ndryshim justifikohes **vetëm** si korrigjim cilësie të të dhënave:

1. **EDGAR coverage.** Kontrollet e strategjisë që varen nga arkivat amerikane
   (8-K material, 10-K, XBRL, databased e filings) merrin mbulim të plotë
   vetëm për domestic filers. Për ADR-të, EDGAR ka ose asgjë, ose dokumente
   me strukturë tjetër (6-K/20-F) → kontrollet prishen ose bëhen no-op
   në mënyrë të pandërgjegjshme.
2. **ADR filing mismatch.** 20-F/IFRS nuk është i krahasueshëm me 10-K/US-GAAP —
   çdo krahasim fundamental brenda universit ishte i prishur për ~10–15% të
   400-listës.
3. **Universal discipline.** Filti aplikohet PARA rankimit — rendi është pjesë
   e rregullit. Rankimi i likuiditetit duhet të bëhet mbi një bazë homogjene
   regjistrimi, përndryshe percentile-t përziejnë regjime të ndryshme të dhënash.

**⚠️ Kushti anti-tuning (detyrueshëm):** ky ndryshim është bërë si rregull
teorik i para-regjistruar, NËNË/Para çdo vlerësimi të rezultateve. Nëse pas
ndryshimit rezultatet përmirësohen — kjo është legjitime (bazë më e pastër).
Nëse dikush e bën këtë ndryshim SEPSE ka parë rezultatet dhe pastaj kërkon
arsyetim prapa — ai është rendi i gabuar: është i njëjti mëkat i overfitting-ut
që kjo strategji e eviton gjithë kohën. **Mos e rregullo listën duke parë
outcomes; rregulloje vetëm nga kriteret e të dhënave (2.1).**

### 2.3 Zona e likuiditetit CTC — top-kuintil percentile

Pas filtrit të bazës (2.1), likuiditeti rankohet brenda bazës së pastër:

- **Metrika:** dollar-volume trailing 20-ditor, POINT-IN-TIME
  (mesatarja e (close × volume) për 20 seancat e fundit).
- **Zona CTC:** **top-kuintil (top 20%)** i dollar-volume brenda bazës core —
  percentile ≥ 80 (nearest-rank Q80), implementuar në `/api/ibkr-scan`
  (fushat `liquidityPctile`, `inTopQuintile`, `quintileThresholdDolVol`).
- **Dysheme absolute** (sanitare, të ruajtura nga rikalibrimi v2):
  ADV ≥ $50M/ditë, çmim ≥ $15, volum ≥ 1M aksione/ditë.
- Për dallim: REV v1 operon në zonën e MESME (20–80 percentile) të të
  njëjtit univers bazë — ndarja e zonave është thelbësore (REV spec §1).

### 2.4 Vetitë e detyrueshme të bazës

- Deduplikim automatik (`Set`), pa prerje truncation — çdo sektor ka
  8–29 anëtarë realë;
- Fusha `UNIVERSE_CORE_META` (version, datë, kritere, arsyetim) duhet të
  qarkullojë në API — auditable në çdo kohë;
- Çdo ndryshim i listës së ardhshme kërkon: bump të `UNIVERSE_CORE_VERSION`,
  datë efektive, dhe shënim në Seksionin 7 (Historiku) me arsyetim të
  të dhënave — kurrë me arsyetim të rezultateve.

---

## 3. Sinjali & filtrat mekanikë (PHASE 1)

| Filter | Pragu |
|---|---|
| Trend | close > SMA50, SMA50 > SMA200 (golden), RS60d > SPY |
| Stacked MA | close > EMA20 > SMA50 > SMA200 |
| ADX(14) | > 25 |
| Event risk | pa event kritik (kompozit > −50, pa 8-K material bllokues) |
| Likuiditeti | §2.3 (top-kuintil + dysheme absolute) |

Setup-et e skanimit: vetëm **TREND_CONT** hyn në delivery (BREAKOUT/
PULLBACK_EDGE etj. shfaqen si kontekst, jo si kandidatë tregtimi).

## 4. Skorimi (rikalibrimi v2)

Formula: `0.15·Trend + 0.25·RS + 0.15·Momentum + 0.15·Volum + 0.10·Setup +
0.10·Likuiditet + 0.10·Risk`, normalizuar me peshat e mësuara. Bandat e
validuara 10-vjeçare: hyrje në score **55–84** (85+ performon më keq se 75–84 —
saturim i trendit; banda fituese: 75–84).

## 5. Rreziku & pozicionimi

- Stop: `max(1.8×ATR, swing low − 0.35×ATR)`, i shumëzuar me VIX-multiplier
  (CALM 1.0 / ELEVATED 1.2 / HIGH 1.5);
- Risk/trade: ≤ 1% equity (LIVE final 0.25% — vetëm manual, Gate 6);
- Entry stop kapur: ≤ 5.5% (ishte 8%);
- Gap-resilience: stop-i duhet të thithë gap-et e zakonshme overnight;
- Regjimi: OK ×1.0 / CAUTION ×0.75 / RISK ×0.5 (struktura + VIX + breadth).

## 6. Delivery constraints & tregtimi

- Max 3 pozicione njëkohëse; max 1/sektor; cooldown 10 ditë/simbol;
- Targetet: 1R / 2R / 3R (bracket orders IBKR);
- Top 1–5 kandidatë shfaqen; vetëm READY (risk+gap gate kaluar) janë
  kandidatë delivery me bracket order gati.

## 7. Historiku i ndryshimeve

| Data | Version | Ndryshimi | Arsyetimi |
|---|---|---|---|
| 2026-09-30 | Univers core v2 | 400-lista e përzier → ~200 US-domestic/US-GAAP filers (`universe-core.ts`); top-kuintil percentile i dollar-vol aplikohet mbi bazën e pastër | Korrigjim cilësie të dhënash: EDGAR coverage + ADR filing mismatch (20-F/IFRS) + emra të vdekur/të përsëritur. I para-regjistruar para vlerësimit të rezultateve — jo tunim parametri (§2.2) |
| 2026-09-30 | Ditari i Sinjaleve v1 | Job A/B idempotente (`signal-journal.ts`), tabela `SignalJournalEntry`, tab-i «Gjurmuesi», crons 22:00/22:45 UTC | Instrument deskriptiv (Seksioni 8) — mat ekzekutimin pas 1–5 ditësh; NUK tunon parametra. Rregullat = rregullat e Validation Lab, të papastra |

## 8. Ditari i Sinjaleve (Gjurmuesi) — kontrolli pas 1–5 ditësh

**Qëllimi:** çdo ditë ruhen sinjalet që nxjerr strategjia (Job A); pas 1, 2,
3, 4 dhe 5 ditëve tregtare sistemi tregon për çdo sinjal a arriti target-in,
a goditi stop-in, ku është çmimi, dhe llogarit statistika (Job B). Ky ditar
është **DESKRIPTIV — mat çfarë ndodhi. NUK përdoret për të tunuar
parametrat e strategjisë.** Vlen për CTC (ky spec) dhe REV (spec-i i vet),
të ndara — tabela e Gjurmuesit i mban kurrë të përziera.

### 8.1 Të dhënat për çdo sinjal (një rresht, tabela `SignalJournalEntry`)

`id`, `strategy` (CTC | REV), `symbol`, `sector`; `signalDate`, `entryDate`,
`entry`, `stop`, `target`, `score`, `regime` (TRENDING/TRANSITIONAL/CHOP —
klasifikues deskriptiv mbi SPY, i para-regjistruar në `signal-journal.ts`);
checkpoint-et `d1..d5` (close, high-deri-tani, low-deri-tani, R-në-close,
statusi); `finalStatus`: `target | stop | gap_stop | time_stop | no_entry |
open` — **kyçet kur ndodh e para dhe nuk ndryshon më**. Flag-u `noSlot`
regjistron sinjalet e plota sipas rregullave që mbetën pa slot të lirë,
që statistikat të mos varen nga rendi i hapjes. Çelës unik:
`strategy + symbol + signalDate` — job-et janë idempotente, s'ka dyfishime.

### 8.2 Job-et ditore pas mbylljes

- **Job A — regjistrimi** (cron 22:00 UTC Mon–Fri ose piggyback në çdo
  skanim): ruaj ÇDO sinjal READY delivery-eligible (CTC: `decision=READY` +
  `setup=TREND_CONT`; REV: `HYRJE_TANI`) — **jo vetëm Top 10** — edhe kur
  nuk ka slot të lirë (`noSlot=true`, arsyeja në `slotNote`).
- **Job B — vlerësimi** (cron 22:45 UTC Mon–Fri, `/api/signal-journal/evaluate`):
  për çdo sinjal të pakyçur me moshë ≤ 5 ditë tregtare merr OHLC ditor dhe
  plotëson checkpoint-in e ditës N.

### 8.3 Rregullat e vlerësimit (të njëjta me Validation Lab — NUK janë ndryshuar)

- **Hyrja:** CTC hyn në **open** të ditës pas konfirmimit (`d1 = dita e
  hyrjes`); REV hyn në **T+1** vetëm me konfirmim të kaluar (hyrja në
  **close** të ditës së konfirmimit, `d1 = dita pas hyrjes`).
- **Target hit:** high ≥ target. **Stop hit:** low ≤ stop.
- **E njëjta qiri prek edhe stop edhe target → numërohet STOP** (supozim
  konservativ — si `checkPositionBar` i Validation Lab).
- **Gap:** hapja përtej stop-it → humbja te **çmimi i hapjes** (`GAP_STOP`),
  jo te stop-i. Hapja mbi target → target te çmimi i hapjes.
- **Time stop:** CTC dita 5, REV dita 3 — dalje te close i asaj dite
  (REV ka edhe fund të fortë në ditën 5, si MAX_HOLD i backtest-it).
- Pasi statusi kyçet, **nuk ndryshon më** — Job B s'e prek më rreshtin.
- Dita tregtare = pa fundjava dhe pa festat e bursës (kalendari nga qiratë SPY).
- Kosto **C = 0.20%** round-trip (kalibruar me `DEFAULT_COSTS` të
  Validation Lab: komision + spread + slippage). Deskriptiv — jo parameter.

### 8.4 Faqja "Gjurmuesi" (tab i ri)

- **A. Lista** — filtra: Sot, 1–5 ditë më parë, sipas strategjisë. Çdo
  sinjal: simboli, mosha, statusi, % e rrugës drejt target-it, R aktual,
  shiriti stop → hyrje → target me çmimin aktual.
- **B. Statistikat sipas horizontit** — një rresht për çdo ditë 1..5,
  e ndarë CTC / REV: n (sinjale me ≥ N ditë moshë), % target kumulative,
  % stop kumulative, % ende open, R mesatar dhe median në close të ditës N,
  MFE/MAE mesatare, fitimi mesatar % pas kostos C.
- **C. Ndarje shtesë** — sipas sektorit dhe sipas regjimit
  (TRENDING / TRANSITIONAL / CHOP) — të shohësh ku strategjia punon e ku jo.

### 8.5 Rregullat e leximit të statistikave (të detyrueshme)

1. **Nën 30 sinjale** në një rresht → shënohet "kampion i vogël, mos nxirr
   përfundime".
2. **Mos e përdor këtë tabelë për të ndryshuar target, stop ose pragje.**
   Nëse sheh një model interesant, regjistroje si **hipotezë të re (version
   i ri)** dhe testoje në Validation Lab — e njëjta disiplinë anti-overfitting
   si në Seksionin 2.2.
3. **Krahaso gjithmonë** me paper trading dhe me OOS të Validation Lab.
   Nëse ditari jep rezultate shumë ndryshe nga OOS, ka diçka të gabuar në
   ekzekutim ose në të dhëna — heto para se të mendosh për strategjinë.

### 8.6 Testi i konsistencës (detyrueshëm para përdorimit)

Ekzekuto Job B mbi ~30 ditë historike (`scripts/journal-consistency-test.ts`)
dhe krahaso me rezultatet e backtest-it për të njëjtat sinjale — statuset
e daljes duhet të përputhen (dallimet e vetme të pranishme: GAP_STOP ku
backtest-i i vjetër numëronte STOP te niveli i stop-it — ditari është më i
saktë, pasi ndjek rregullin e gap-it të spec-it).
