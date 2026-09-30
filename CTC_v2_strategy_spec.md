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
