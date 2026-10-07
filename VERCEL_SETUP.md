# Lidhja me Vercel — deploy automatik nga GitHub

Ky dokument përshkuron hapat për të pasur faqen publike në Vercel me
**deploy automatik** (çdo `git push` në `main` bëhet deploy) dhe me
**të dhëna të qëndrueshme** (Upstash Redis — se FS-i i Vercel-it është
i përkohshëm dhe do t'i zbraste kandidatët në çdo funksion të ri).

Koha totale: ~15 minuta pune tuajen.

---

## Pse duhen këto hapa

Sistemi «Social Arb» mban gjendjen (kandidatët, matjet, arkivi CSV) në
`data/social-arb.json`. Në serverless çdo funksion nis me FS bosh —
prandaj ruajtja degëzohet automatikisht në **Upstash Redis** kur janë
vendosur variablat e mjedisit përkatës. Pa ta, sandbox-i lokal vazhdon
të punojë siç është (skedar JSON) — asgjë nuk ndryshon aty.

Çfarë ofron ky repositor aktualisht (gati për Vercel):

- Store dy-backend: skedar JSON (lokal) / Upstash Redis (serverless)
- Lock ndër-procesesh në Redis — sandbox-i dhe Vercel-i s'përplasin skanime
- Buxhet kohor i skanimit (35s në Vercel; plani Hobby ndalon funksionet në 60s)
- Rruga `/api/social-arb/scan`: **fail-closed** — në Vercel kërkon `Authorization: Bearer <CRON_SECRET>` (GET ose POST). Butoni në faqe (POST same-origin) lejohet pa sekret, por me **cooldown 10 minuta** (429 + Retry-After) — kokat Origin/Sec-Fetch-Site s'janë autentikim, vetëm shenjë se thirrja vjen nga një shfletues
- `vercel.json` ka 2 crons ekzistuese (parashikimet) — mbeten të paprekura

---

## Hapi 1 — Upstash Redis (falas, ~5 min)

1. Krijo llogari në [upstash.com](https://upstash.com) (mund edhe me GitHub).
2. **Create Database** → emri p.sh. `social-arb` → regjioni më i afërt (EU/US).
3. Te skeda **REST API** kopjo dy vlerat:
   - `UPSTASH_REDIS_REST_URL` (p.sh. `https://social-arb-xxxx.upstash.io`)
   - `UPSTASH_REDIS_REST_TOKEN`

Plan i falas: 10,000 komanda/ditë — sistemi përdor ~5-10 komanda për
skanim dhe 2-3 për çdo hapje faqeje. Mjafton me shumë.

## Hapi 2 — Import në Vercel (~5 min)

1. Krijo llogari në [vercel.com](https://vercel.com) me GitHub.
2. **Add New → Project → Import** repozitarin `CMSFin-crypto/ai-financial-brain`.
3. Framework-i zbulohet vetë (Next.js). Mos ndrysho build settings.
4. Te **Environment Variables** (Production), shto:

   | Emri | Vlera |
   |---|---|
   | `UPSTASH_REDIS_REST_URL` | nga Hapi 1 |
   | `UPSTASH_REDIS_REST_TOKEN` | nga Hapi 1 |
   | `CRON_SECRET` | një string i rastësishëm (p.sh. `openssl rand -hex 24`) |

5. **Deploy**. Kjo është lidhja GitHub→Vercel: nga tani çdo push në `main`
   deploy-ohet automatikisht.

## Hapi 3 — Migrimi i të dhënave ekzistuese (opsional, ~2 min)

Që SBUX/MSFT dhe historia e matjeve të duken menjëherë në faqen publike
(pa pritur skanimin e parë), nga rrënja e projektit lokal:

```bash
UPSTASH_REDIS_REST_URL=<url> UPSTASH_REDIS_REST_TOKEN=<token> \
  bun scripts/seed-upstash.mjs
```

- Kopjon `data/social-arb.json` → çelësi `social-arb:store`
- Kopjon arkivin CSV → HASH `social-arb:csv` (fusha = muaji)
- I sigurt: pa `--force` s'prek asgjë ekzistuese.

**Zgjedhje:** mund ta lësh bosh — skanimi i parë do të nisë me empty state
të sinqertë dhe do të mbushë vetë gjatë ditëve. (Kujdes: sandbox-i dhe
Vercel-i do të ndajnë të njëjtin Upstash — nëse e mbush nga seed-i,
të dyja anët shohin të njëjtën gjendje. Kjo është qëllimi.)

## Hapi 4 — Skanimet periodike (2 orë) (~3 min)

Plani Hobby lejon vetëm 2 crons **ditore** brenda Vercel-it (të zëna nga
sistemi i parashikimeve). Prandaj cikli 2-orësh vjen nga një shërbim i
jashtëm falas:

1. Krijo llogari në [cron-job.org](https://cron-job.org) (falas).
2. **Create cronjob**:
   - URL: `https://<aplikacioni-yt>.vercel.app/api/social-arb/scan`
   - Metoda: **GET** (e mjafton — pranohet)
   - Header: `Authorization: Bearer <CRON_SECRET>` (i njëjti nga Hapi 2)
   - Çdo **2 orë** (`0 */2 * * *`)
   - Timeout i madh (60s) nëse ofrohet
3. Ruaj.

Alternativa pa cron të jashtëm: mos bëj asgjë — sandbox-i skanon vetë çdo
2 orë dhe shkruan në të njëjtin Upstash (nëse i vendos variablat e Hapit 1
edhe në `.env` lokal). Vercel-i atëherë funksionon si faqe leximi + backtest,
derisa të kalosh në planin Pro (crons çdo 2 min) dhe ta shtosh në `vercel.json`.

## Hapi 5 — Verifikimi

- `https://<app>.vercel.app/` — faqja kryesore me tab-in Social Arb
- `https://<app>.vercel.app/social-arb` — laboratori; në fund të faqes duhet të
  thotë «Ruajtja: Redis (Upstash)»
- `https://<app>.vercel.app/api/social-arb/state` — JSON me `storage.backend: "upstash"`
- Pas një skanimi manual (butoni «Skano tani» në faqe ose cron-i): `lastScanAt` përditësohet

### Nëse skanimi kthen 503

Para se të vendosësh variablat e Upstash, faqja në Vercel punon në mënyrë
**vetëm-leximi**: shfaq snapshot-in e të dhënave që është commit-uar në git
(`data/social-arb.json` hyn në bundle në build) — kandidatët duken, por
«Përditësuar më …» nuk lëviz pa Upstash, dhe skanimi kthen:

```
503 — Në Vercel skanimet kërkojnë ruajtjen në Upstash…
```

Kjo është e qëllimshme (e sinqertë në vend e rreme): shkrimi në FS-in e
funksionit serverless është i pamundur dhe do të humbiste çdo matje. Sapo
të shtosh variablat dhe të bësh Redeploy, skanimi aktivizohet vetë. Deri
atëherë, sandbox-i lokal vazhdon të skanojë çdo 2 orë dhe historia jeton
në git — asgjë s'humbet.

---

## Siguria

- `CRON_SECRET` është **i detyrueshëm në Vercel** (fail-closed): pa të, çdo thirrje e jashtme refuzohet me 401 — përfshirë cron-in. S'ka më modalitetin «pa sekret» në prodkim.
- Butoni «Skano tani» në faqe punon pa sekret (POST same-origin), por lejohet vetëm një herë në 10 minuta — kthimi është 429 me `Retry-After` dhe koha e mbetur shfaqet në faqe.
- Krahasimi i sekretit bëhet me `timingSafeEqual` — i paprekshëm nga timing-attack.
- Token-i i Upstash jep akses në Redis — mos e vendos kurrë në kod të commit-uar,
  vetëm në Environment Variables.
- Nëse dikush e merr sekretin, rrotulo `CRON_SECRET` te Vercel (Settings → Environment
  Variables) dhe te sekretet e GitHub Actions (nëse përdor workflow-in e skanimit) — pastaj Redeploy.

## Kufijtë e planit Hobby (për t'u ditur)

| Kufi | Vlera | Efekti |
|---|---|---|
| Kohëzgjatja e funksionit | 60s | Skanimi mbyllet brenda 35s (buxheti kohor); pjesa e mbetur vijon në skanimin tjetër |
| Crons | 2, ditore | Cikli 2-orësh vjen nga cron-job.org (sipas Hapit 4) |
| Bandwidth | 100GB/muaj | Faqja është e lehtë — s'ka problem |

Me planin Pro ($20/muaj): ngri `maxDuration` te `src/app/api/social-arb/scan/route.ts`
(300s) dhe shto cron-in 2-orësh direkt në `vercel.json` — përndryshe asgjë tjetër s'ndryshon.
