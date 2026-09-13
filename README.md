# Aurora ZIP Card

**Paste a US ZIP (or lat, lon) → one shareable “tonight?” card:**  
NOAA Kp (now + 3-day) · OVATION nearest-cell % · Open-Meteo cloud cover · darkness window · look-north/south hint · **source timestamps on the face**.

Brand on the surface: **Aurora ZIP Card** only.

Not a chase dashboard. Not a fake 87% chance. NOAA removed the consumer viewline in May 2026 — this is a location-first share card, complementary to globes.

## Hypothesis

Casual users still want a friend-group “go outside / stay in” artifact they can text. Official viewline is gone; paid apps over-promise a % from Kp. Collapsing public SWPC + cloud into one honest ZIP card will earn storm-night shares faster than another OVATION globe.

## How to test (local)

```bash
cd kb/mde/aurora-zip-card
npm run build          # copies assets → dist/
# either open the file:
open index.html        # or dist/index.html
# or serve (needed for live NOAA / Open-Meteo fetch):
npm start              # http://localhost:4181
```

Manual checklist:

1. Open the page → click **MSP · 55401** (or paste `55401`).
2. Confirm **Kp + OVATION% + clouds + look direction** on one card, plus darkness window and source timestamps.
3. Try chips: CHI 60601, BOS 02101, Fairbanks 99701. Optional: paste `64.84, -147.72`.
4. **Copy summary** → clipboard has ZIP · Kp · OVATION · clouds · look · NOAA note.
5. **Share link** → URL hash `#zip=55401` restores the same place.
6. **Export PNG** → dark share card downloads.
7. Unknown ZIP / blocked geocoder → location-miss card (no invented coordinates).
8. Surface brand is **Aurora ZIP Card** only (no Conglomerate / personal names).

### GitHub Pages

This folder is static-ready. Point Pages at `/` of a dedicated repo (or `/docs` after copying `dist/`), with `index.html` at the site root. Relative paths (`styles.css`, `app.js`) work on project pages.

```bash
npm run build   # optional artifact in dist/
```

Do **not** create the public repo or post from this build step — Steward handles Pages + distro. Distro stays **trigger-gated** (next Kp≥4 night). **No sock accounts.**

## Seed ZIPs (MVP)

| ZIP | Place | Why in seed |
|-----|-------|-------------|
| 55401 | Minneapolis, MN | Mid-latitude default (MSP) |
| 60601 | Chicago, IL | Mid-latitude contrast |
| 02101 | Boston, MA | East-coast mid-lat |
| 99701 | Fairbanks, AK | High-latitude / oval-adjacent |

Paste ZIP, seed name, or `lat, lon`. Live Zippopotam.us lookup for other US 5-digit ZIPs when CORS allows.

## Live NOAA + clouds (attempted first)

Public, no key. SWPC advertised CORS `*` (confirmed 2026-09-12 / 2026-09-13). The page **always tries live JSON first**:

1. **Kp now** — `https://services.swpc.noaa.gov/json/planetary_k_index_1m.json`
2. **Kp 3-day** — `https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json`
3. **OVATION grid** — `https://services.swpc.noaa.gov/json/ovation_aurora_latest.json` · nearest 1° cell (`[lon, lat, aurora%]`; lon 0–359)
4. **Clouds + sunrise/sunset** — Open-Meteo `hourly=cloud_cover` + `daily=sunrise,sunset` (`timezone=auto`)
5. **ZIP → lat,lon** — Zippopotam.us `/us/{zip}` (seed table if blocked)

If SWPC is blocked, seed ZIPs fall back to a **labeled 2026-09-13 snapshot** (quiet day). Non-seed points show **OVATION unavailable** rather than a guessed %. Clouds are never invented.

Deep-links on the card: SWPC Kp, OVATION 30-minute forecast, 3-day forecast, Open-Meteo.

## Ads pathway (ad-only free utility — do not spend yet)

| Path | Notes |
|------|--------|
| **Revenue (primary)** | **AdSense / display on the card page + storm-night landing** (not inside the PNG). Inventory = high-intent “aurora tonight” sessions. Free ZIP card forever — **no paywall**, no forced SKU. |
| **Sponsorship (later)** | Travel / cameras / dark-sky lodging only after repeat storm traffic. |
| **Alerts (optional later)** | SMS/email “Kp≥5 near you” — may stay free; not required for MVP. |
| **Acquisition (gated)** | Google Search “aurora tonight [city]” / “will I see northern lights tonight”. Creative = one ZIP card with NOAA citation. Max CPA abort ~$0.15–0.30 without a return session. Debit/cash only. **Spend only after 1–2 organic storm nights show CTR on the card itself.** |
| **UTM** | Example: `?utm_source=reddit&utm_medium=organic&utm_campaign=aurora_zip_card_mvp` (query stays; hash carries ZIP). |
| **Tracking** | Card renders + share clicks (GoatCounter path when Pages is live). |
| **Abort sketch** | Pause paid if CPA exceeds band without return sessions / share clicks. |

**No spend from this ready_for_pages step.** Ads are the monetization path (ad-only OK). Distro stays trigger-gated for the next Kp≥4 night.

## Product constraints

- Single static site (no backend).
- **Never invent Kp, OVATION %, coordinates, or cloud numbers.**
- Label live vs snapshot vs unavailable on the face.
- Share = URL hash (`#zip=55401` or `#ll=lat,lon`) + PNG + copy summary.
- Brand: **Aurora ZIP Card** only on surface.
- Not a My Aurora Forecast / SpaceWeatherLive / Glendale / Norlys clone. No magnetometer-network clone.

## Files

| Path | Role |
|------|------|
| `index.html` | App shell (GitHub Pages entry) |
| `app.js` | ZIP resolve, SWPC/Open-Meteo fetch, tonight card, share hash, PNG |
| `styles.css` | Aurora ZIP Card UI |
| `scripts/build.js` | `npm run build` → `dist/` |
| `package.json` | build / start / preview scripts |

## Opportunity

Internal card: `opp_astro_aurora_zip_card` (astro track). Experiment stub: `institutions/mde/experiments/exp_aurora_zip_card.md`.
