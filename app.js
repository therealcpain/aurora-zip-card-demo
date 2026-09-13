/**
 * Aurora ZIP Card — client-side MVP
 * ZIP / lat,lon → one-glance tonight card.
 * Attempts public NOAA SWPC JSON first (CORS * as of 2026-09-12).
 * Seed ZIPs + labeled snapshot if a fetch is blocked. Never invents Kp / OVATION %.
 */
(function () {
  "use strict";

  const SWPC_KP_1M = "https://services.swpc.noaa.gov/json/planetary_k_index_1m.json";
  const SWPC_KP_FC = "https://services.swpc.noaa.gov/products/noaa-planetary-k-index-forecast.json";
  const SWPC_OVATION = "https://services.swpc.noaa.gov/json/ovation_aurora_latest.json";
  const ZIPPO = (zip) => "https://api.zippopotam.us/us/" + zip;
  const OPEN_METEO = (lat, lon) =>
    "https://api.open-meteo.com/v1/forecast?latitude=" +
    encodeURIComponent(lat) +
    "&longitude=" +
    encodeURIComponent(lon) +
    "&hourly=cloud_cover&daily=sunrise,sunset&forecast_days=2&timezone=auto";

  const LINKS = {
    kp: "https://www.swpc.noaa.gov/products/planetary-k-index",
    ovation: "https://www.swpc.noaa.gov/products/aurora-30-minute-forecast",
    forecast: "https://www.swpc.noaa.gov/products/3-day-forecast",
    viewline: "https://www.swpc.noaa.gov/products/aurora-viewline-tonight-and-tomorrow-night-experimental",
    meteo: "https://open-meteo.com/",
  };

  /**
   * Seed locations for the smallest external test (MSP, CHI, BOS, Fairbanks).
   * Coordinates are public city-center / ZIP centroids.
   */
  const SEED = [
    {
      zip: "55401",
      label: "MSP · 55401",
      city: "Minneapolis",
      region: "MN",
      lat: 44.9835,
      lon: -93.2683,
      aliases: ["msp", "minneapolis", "55401"],
    },
    {
      zip: "60601",
      label: "CHI · 60601",
      city: "Chicago",
      region: "IL",
      lat: 41.886,
      lon: -87.6231,
      aliases: ["chi", "chicago", "60601"],
    },
    {
      zip: "02101",
      label: "BOS · 02101",
      city: "Boston",
      region: "MA",
      lat: 42.3584,
      lon: -71.0598,
      aliases: ["bos", "boston", "02101", "2101"],
    },
    {
      zip: "99701",
      label: "Fairbanks · 99701",
      city: "Fairbanks",
      region: "AK",
      lat: 64.8378,
      lon: -147.7164,
      aliases: ["fairbanks", "alaska", "fai", "99701"],
    },
  ];

  /**
   * Last-known SWPC snapshot (2026-09-13T17:17Z) — quiet-day fallback only.
   * Used when live JSON is blocked. Labeled on the card. Not a storm replay.
   */
  const SNAPSHOT = {
    captured: "2026-09-13T17:17:00Z",
    kp: { time_tag: "2026-09-13T17:17:00", kp_index: 0, estimated_kp: 0.33, kp: "0P" },
    ovationObs: "2026-09-13T17:09:00Z",
    ovationFc: "2026-09-13T18:13:00Z",
    ovationByZip: { "55401": 0, "60601": 0, "02101": 0, "99701": 4 },
    forecast: [
      { time_tag: "2026-09-14T15:00:00", kp: 3.0, observed: "predicted" },
      { time_tag: "2026-09-14T18:00:00", kp: 3.67, observed: "predicted" },
      { time_tag: "2026-09-14T21:00:00", kp: 3.33, observed: "predicted" },
      { time_tag: "2026-09-15T00:00:00", kp: 3.33, observed: "predicted" },
      { time_tag: "2026-09-15T03:00:00", kp: 3.67, observed: "predicted" },
      { time_tag: "2026-09-15T06:00:00", kp: 3.33, observed: "predicted" },
      { time_tag: "2026-09-15T12:00:00", kp: 3.0, observed: "predicted" },
      { time_tag: "2026-09-15T18:00:00", kp: 3.0, observed: "predicted" },
      { time_tag: "2026-09-16T00:00:00", kp: 3.67, observed: "predicted" },
    ],
  };

  /** @type {null | {index: Map<string, number>, obs: string, fc: string}} */
  let ovationCache = null;
  /** @type {object | null} */
  let current = null;

  const $ = (id) => document.getElementById(id);

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[#]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  function padZip(z) {
    const d = String(z || "").replace(/\D/g, "");
    if (d.length === 4) return "0" + d;
    return d;
  }

  function parseLatLon(raw) {
    const m = String(raw || "").trim().match(
      /^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/
    );
    if (!m) return null;
    const lat = Number(m[1]);
    const lon = Number(m[2]);
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
    return { lat, lon };
  }

  function findSeed(raw) {
    const n = norm(raw);
    const zip = padZip(n);
    return (
      SEED.find((s) => s.zip === zip || s.aliases.some((a) => a === n || a === zip)) ||
      null
    );
  }

  function lon360(lon) {
    let x = lon % 360;
    if (x < 0) x += 360;
    return Math.round(x) % 360;
  }

  function fmtKp(n) {
    if (n == null || Number.isNaN(n)) return "—";
    return Number(n).toFixed(Number(n) % 1 === 0 ? 0 : 2).replace(/\.00$/, "");
  }

  function fmtClock(isoLocal) {
    if (!isoLocal) return "—";
    const m = String(isoLocal).match(/T(\d{2}):(\d{2})/);
    if (!m) return isoLocal;
    let h = Number(m[1]);
    const min = m[2];
    const ap = h >= 12 ? "p" : "a";
    h = h % 12;
    if (h === 0) h = 12;
    return min === "00" ? h + ap : h + ":" + min + ap;
  }

  function fmtZulu(iso) {
    if (!iso) return "—";
    const d = new Date(iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z");
    if (Number.isNaN(d.getTime())) return String(iso).replace("T", " ").slice(0, 16);
    return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
  }

  function noaaScale(kp) {
    if (kp == null || Number.isNaN(kp)) return "—";
    if (kp >= 9) return "G5 · extreme";
    if (kp >= 8) return "G4 · severe";
    if (kp >= 7) return "G3 · strong";
    if (kp >= 6) return "G2 · moderate";
    if (kp >= 5) return "G1 · minor";
    return "below G-scale";
  }

  function lookHint(lat, ovationPct) {
    const north = lat >= 0;
    const pole = north ? "N" : "S";
    const horizon = north ? "northern horizon" : "southern horizon";
    if (ovationPct == null) {
      return {
        dir: pole,
        short: "Look " + pole,
        note: "OVATION cell unavailable — default poleward horizon.",
      };
    }
    if (ovationPct >= 40) {
      return {
        dir: "OH",
        short: "Overhead",
        note: "High cell here — curtains can be above you, not just on the horizon.",
      };
    }
    if (ovationPct >= 15) {
      return {
        dir: pole,
        short: "Look " + pole + " / high",
        note: "Activity near this ZIP. Face " + horizon + ", scan up.",
      };
    }
    if (ovationPct >= 3) {
      return {
        dir: pole,
        short: "Look low " + pole,
        note: "Oval is still poleward. Low on the " + horizon + ".",
      };
    }
    return {
      dir: pole,
      short: "Look " + pole + " (far)",
      note: "Quiet cell. Mid-lat views need a real storm + dark + clear.",
    };
  }

  function compassSvg(dir) {
    const rot = dir === "S" ? 180 : dir === "OH" ? 0 : 0;
    const overhead = dir === "OH";
    return (
      '<svg viewBox="0 0 36 36" role="img" aria-hidden="true">' +
      '<circle cx="18" cy="18" r="16" fill="none" stroke="#2a3544" stroke-width="1.5"/>' +
      (overhead
        ? '<circle cx="18" cy="18" r="6" fill="#3dffb0" opacity="0.85"/>' +
          '<circle cx="18" cy="18" r="11" fill="none" stroke="#3dffb0" stroke-width="1.5"/>'
        : '<g transform="rotate(' +
          rot +
          ' 18 18)">' +
          '<polygon points="18,5 22,16 18,14 14,16" fill="#3dffb0"/>' +
          '<polygon points="18,31 22,20 18,22 14,20" fill="#5a6574"/>' +
          "</g>") +
      "</svg>"
    );
  }

  function cloudBand(pct) {
    if (pct == null) return "unknown";
    if (pct <= 35) return "clear";
    if (pct <= 70) return "broken";
    return "socked";
  }

  function summarizeClouds(hours) {
    if (!hours || !hours.length) {
      return { label: "—", note: "Cloud hours unavailable", min: null, window: null };
    }
    const night = hours.filter((h) => h.night);
    const pool = night.length ? night : hours;
    let min = Infinity;
    pool.forEach((h) => {
      if (h.cloud != null && h.cloud < min) min = h.cloud;
    });
    if (!Number.isFinite(min)) min = null;

    let best = null;
    let run = [];
    const flush = () => {
      if (run.length >= 2 && (!best || run.length > best.length)) best = run.slice();
      run = [];
    };
    pool.forEach((h) => {
      if (h.night && h.cloud != null && h.cloud <= 35) run.push(h);
      else flush();
    });
    flush();

    if (best) {
      const a = fmtClock(best[0].time);
      const last = best[best.length - 1];
      const endH = Number((last.time.match(/T(\d{2})/) || [])[1] || 0);
      const endIso = last.time.replace(/T\d{2}/, "T" + String((endH + 1) % 24).padStart(2, "0"));
      return {
        label: "clear",
        note: a + "–" + fmtClock(endIso),
        min,
        window: a + "–" + fmtClock(endIso),
      };
    }
    const band = cloudBand(min);
    return {
      label: band,
      note: min == null ? "no cloud number" : "min " + Math.round(min) + "%",
      min,
      window: null,
    };
  }

  function verdict(opts) {
    const { kp, ovation, cloudMin, hasDark, lat } = opts;
    if (!hasDark) {
      return {
        key: "stay",
        label: "STAY IN",
        sub: "No darkness window in the forecast hours we have.",
        headline: "Daylight / no dark window",
      };
    }
    if (cloudMin != null && cloudMin >= 80) {
      return {
        key: "stay",
        label: "STAY IN",
        sub: "Clouds sock you in even if the oval is active.",
        headline: "Socked in",
      };
    }
    const mid = Math.abs(lat) < 55;
    const activity =
      (ovation != null && ovation >= 10) ||
      (mid && kp != null && kp >= 5) ||
      (!mid && ((ovation != null && ovation >= 5) || (kp != null && kp >= 3)));
    const clear = cloudMin != null && cloudMin < 45;
    if (activity && clear) {
      return {
        key: "go",
        label: "GO OUT",
        sub: "Activity + a clearer dark window. Still not a guarantee — substorms pop and fade.",
        headline: "Worth a look tonight",
      };
    }
    if ((activity && cloudMin != null && cloudMin < 70) || (clear && kp != null && kp >= 4)) {
      return {
        key: "maybe",
        label: "MAYBE",
        sub: "Mixed. Fine if you’re already outside — don’t drive an hour on this card alone.",
        headline: "Mixed tonight",
      };
    }
    return {
      key: "stay",
      label: "STAY IN",
      sub: "Kp / OVATION / clouds don’t line up. Check again if Kp jumps.",
      headline: "Quiet / stay in",
    };
  }

  async function fetchJson(url, ms) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms || 12000);
    try {
      const res = await fetch(url, { signal: ctrl.signal });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  }

  async function resolvePlace(raw) {
    const seed = findSeed(raw);
    if (seed) {
      return {
        kind: "seed",
        zip: seed.zip,
        city: seed.city,
        region: seed.region,
        lat: seed.lat,
        lon: seed.lon,
        label: seed.city + ", " + seed.region + " · " + seed.zip,
        geoSource: "seed ZIP",
      };
    }

    const ll = parseLatLon(raw);
    if (ll) {
      return {
        kind: "latlon",
        zip: null,
        city: "Pinned",
        region: "",
        lat: ll.lat,
        lon: ll.lon,
        label:
          ll.lat.toFixed(2) + "°, " + ll.lon.toFixed(2) + "°",
        geoSource: "pasted lat, lon",
      };
    }

    const zip = padZip(raw);
    if (!/^\d{5}$/.test(zip)) return null;

    try {
      const data = await fetchJson(ZIPPO(zip), 8000);
      const p = data && data.places && data.places[0];
      if (!p) throw new Error("empty");
      return {
        kind: "zip",
        zip,
        city: p["place name"] || "ZIP " + zip,
        region: p["state abbreviation"] || p.state || "",
        lat: Number(p.latitude),
        lon: Number(p.longitude),
        label: (p["place name"] || "ZIP") + ", " + (p["state abbreviation"] || "") + " · " + zip,
        geoSource: "Zippopotam.us",
      };
    } catch (err) {
      return {
        kind: "unresolved",
        zip,
        error: err && err.message,
      };
    }
  }

  function indexOvation(json) {
    const map = new Map();
    const coords = json.coordinates || [];
    for (let i = 0; i < coords.length; i++) {
      const row = coords[i];
      map.set(Math.round(row[0]) + "," + Math.round(row[1]), row[2]);
    }
    return {
      index: map,
      obs: json["Observation Time"] || json.ObservationTime || "",
      fc: json["Forecast Time"] || json.ForecastTime || "",
    };
  }

  function cellAt(cache, lat, lon) {
    const tLon = lon360(lon);
    const tLat = Math.max(-90, Math.min(90, Math.round(lat)));
    const v = cache.index.get(tLon + "," + tLat);
    return { lon: tLon, lat: tLat, pct: v == null ? null : Number(v) };
  }

  async function loadOvation() {
    if (ovationCache) return { ok: true, source: "live", cache: ovationCache };
    try {
      const json = await fetchJson(SWPC_OVATION, 15000);
      ovationCache = indexOvation(json);
      return { ok: true, source: "live", cache: ovationCache };
    } catch (err) {
      return { ok: false, source: "blocked", error: err && err.message };
    }
  }

  async function loadKp() {
    try {
      const [oneMin, fc] = await Promise.all([
        fetchJson(SWPC_KP_1M, 10000),
        fetchJson(SWPC_KP_FC, 10000),
      ]);
      const last = Array.isArray(oneMin) && oneMin.length ? oneMin[oneMin.length - 1] : null;
      return { ok: true, source: "live", now: last, forecast: Array.isArray(fc) ? fc : [] };
    } catch (err) {
      return {
        ok: false,
        source: "snapshot",
        now: SNAPSHOT.kp,
        forecast: SNAPSHOT.forecast,
        error: err && err.message,
      };
    }
  }

  async function loadWeather(lat, lon) {
    try {
      const json = await fetchJson(OPEN_METEO(lat, lon), 10000);
      return { ok: true, source: "live", json };
    } catch (err) {
      return { ok: false, source: "unavailable", error: err && err.message };
    }
  }

  function parseWeather(wx) {
    if (!wx || !wx.ok || !wx.json) {
      return { hours: [], sunrise: null, sunset: null, timezone: null };
    }
    const j = wx.json;
    const times = (j.hourly && j.hourly.time) || [];
    const clouds = (j.hourly && j.hourly.cloud_cover) || [];
    const sunrises = (j.daily && j.daily.sunrise) || [];
    const sunsets = (j.daily && j.daily.sunset) || [];
    const sunset = sunsets[0] || null;
    const sunriseNext = sunrises[1] || sunrises[0] || null;

    const hours = times.map((t, i) => {
      const night =
        sunset && sunriseNext ? t >= sunset && t < sunriseNext : false;
      return { time: t, cloud: clouds[i], night };
    });
    return {
      hours,
      sunrise: sunriseNext,
      sunset,
      timezone: j.timezone || null,
    };
  }

  function setStatus(msg) {
    $("status").textContent = msg || "";
  }

  function renderChips() {
    const box = $("seedChips");
    box.innerHTML = "";
    SEED.forEach((s) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip";
      b.textContent = s.label;
      b.setAttribute("role", "listitem");
      b.addEventListener("click", () => {
        $("queryInput").value = s.zip;
        runLookup(s.zip);
      });
      box.appendChild(b);
    });
  }

  function markActiveChip(zip) {
    const chips = $("seedChips").querySelectorAll(".chip");
    chips.forEach((c, i) => {
      c.classList.toggle("active", SEED[i] && SEED[i].zip === zip);
    });
  }

  function shareUrlFor(card) {
    const u = new URL(location.href);
    u.hash = card.zip ? "zip=" + card.zip : "ll=" + card.lat + "," + card.lon;
    return u.toString();
  }

  function summaryText(card) {
    const bits = [
      card.zip ? "ZIP " + card.zip : "lat,lon " + card.lat.toFixed(2) + "," + card.lon.toFixed(2),
      card.city,
      "Kp " + (card.kpLabel || "—"),
      card.ovation == null ? "OVATION unavailable" : card.ovation + "% OVATION",
      card.cloud.label === "—"
        ? "clouds unavailable"
        : card.cloud.label + (card.cloud.window ? " " + card.cloud.window : " " + card.cloud.note),
      card.look.short,
      card.verdict.label,
    ];
    return (
      bits.filter(Boolean).join(" · ") +
      "\n" +
      "Sources: " +
      card.sourceLine +
      "\n" +
      "Aurora ZIP Card — not a chase dashboard. OVATION ≠ substorm."
    );
  }

  function renderCard(card) {
    current = card;
    $("cardSection").hidden = false;
    $("cardPlace").textContent = card.label + " · " + card.lat.toFixed(2) + "°, " + card.lon.toFixed(2) + "°";
    $("cardHeadline").textContent = card.verdict.headline;
    const badge = $("verdictBadge");
    badge.className = "verdict " + card.verdict.key;
    $("verdictLabel").textContent = card.verdict.label;
    $("verdictSub").textContent = card.verdict.sub;

    $("kpValue").textContent = card.kpLabel;
    $("kpScale").textContent = card.kpScale;
    $("ovationValue").textContent = card.ovation == null ? "—" : card.ovation + "%";
    $("ovationNote").textContent =
      card.ovation == null
        ? card.ovationNote
        : "cell " + card.ovationCell + " · " + card.ovationNote;
    $("cloudValue").textContent = card.cloud.label;
    $("cloudNote").textContent = card.cloud.note;
    $("lookValue").textContent = card.look.short;
    $("lookNote").textContent = card.look.note;
    $("compass").innerHTML = compassSvg(card.look.dir);

    $("darkTitle").textContent = "Darkness window";
    $("darkRange").textContent =
      card.sunset && card.sunrise
        ? fmtClock(card.sunset) + " → " + fmtClock(card.sunrise)
        : "unavailable";

    const track = $("darkTrack");
    track.innerHTML = "";
    const nightHours = card.hours.filter((h) => h.night).slice(0, 16);
    const show = nightHours.length ? nightHours : card.hours.slice(0, 12);
    show.forEach((h) => {
      const d = document.createElement("div");
      d.className = "hour " + (h.night ? cloudBand(h.cloud) : "day");
      d.title = (h.time || "") + " · " + (h.cloud == null ? "—" : h.cloud + "%");
      track.appendChild(d);
    });
    $("darkMeta").textContent = card.darkMeta;

    const bars = $("kpBars");
    bars.innerHTML = "";
    let peak = null;
    card.kpSeries.forEach((p) => {
      const d = document.createElement("div");
      const kp = p.kp;
      if (kp != null && (peak == null || kp > peak)) peak = kp;
      const h = Math.max(4, Math.round(((kp || 0) / 9) * 40));
      d.className = "bar " + (p.observed === "observed" ? "obs" : "pred") + (kp >= 5 ? " hot" : "");
      d.style.height = h + "px";
      d.title = (p.time_tag || "") + " · Kp " + fmtKp(kp) + " · " + (p.observed || "");
      bars.appendChild(d);
    });
    $("kpPeak").textContent = peak == null ? "—" : "peak " + fmtKp(peak);

    $("sourceLine").textContent = "Sources: " + card.sourceLine;
    const links = $("sourceLinks");
    links.innerHTML = "";
    [
      ["SWPC Kp ↗", LINKS.kp],
      ["OVATION ↗", LINKS.ovation],
      ["3-day ↗", LINKS.forecast],
      ["Open-Meteo ↗", LINKS.meteo],
    ].forEach(([t, href]) => {
      const a = document.createElement("a");
      a.href = href;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.textContent = t;
      links.appendChild(a);
    });

    const url = shareUrlFor(card);
    if (location.hash !== "#" + (card.zip ? "zip=" + card.zip : "ll=" + card.lat + "," + card.lon)) {
      history.replaceState(null, "", url);
    }
    markActiveChip(card.zip);
  }

  function showMiss(raw, detail) {
    current = null;
    $("cardSection").hidden = false;
    $("cardPlace").textContent = raw ? "Query · " + raw : "Unknown place";
    $("cardHeadline").textContent = "Couldn’t resolve that location";
    const badge = $("verdictBadge");
    badge.className = "verdict stay";
    $("verdictLabel").textContent = "NO CARD";
    $("verdictSub").textContent = detail || "Paste a 5-digit US ZIP, a seed chip, or lat, lon. No invented coordinates.";
    $("kpValue").textContent = "—";
    $("kpScale").textContent = "—";
    $("ovationValue").textContent = "—";
    $("ovationNote").textContent = "not fetched";
    $("cloudValue").textContent = "—";
    $("cloudNote").textContent = "—";
    $("lookValue").textContent = "—";
    $("lookNote").textContent = "—";
    $("compass").innerHTML = compassSvg("N");
    $("darkRange").textContent = "—";
    $("darkTrack").innerHTML = "";
    $("darkMeta").textContent = "No card without a real point.";
    $("kpBars").innerHTML = "";
    $("kpPeak").textContent = "—";
    $("sourceLine").textContent = "Sources: none — location miss.";
    $("sourceLinks").innerHTML = "";
  }

  async function buildCard(place) {
    setStatus("Fetching NOAA SWPC + Open-Meteo…");
    const [kpPack, ovPack, wxPack] = await Promise.all([
      loadKp(),
      loadOvation(),
      loadWeather(place.lat, place.lon),
    ]);

    const now = kpPack.now || SNAPSHOT.kp;
    const kpNow = now.estimated_kp != null ? Number(now.estimated_kp) : Number(now.kp_index);
    const kpLabel = now.kp ? String(now.kp) : fmtKp(kpNow);
    const kpSource = kpPack.ok ? "live SWPC" : "seed snapshot " + SNAPSHOT.captured;

    let ovation = null;
    let ovationCell = "—";
    let ovationNote = "unavailable";
    let ovationTime = null;
    if (ovPack.ok && ovPack.cache) {
      const cell = cellAt(ovPack.cache, place.lat, place.lon);
      ovation = cell.pct;
      ovationCell = cell.lon + "°, " + cell.lat + "°";
      ovationNote = "live SWPC";
      ovationTime = ovPack.cache.obs;
    } else if (place.zip && SNAPSHOT.ovationByZip[place.zip] != null) {
      ovation = SNAPSHOT.ovationByZip[place.zip];
      ovationCell = "seed ZIP";
      ovationNote = "snapshot " + SNAPSHOT.ovationObs;
      ovationTime = SNAPSHOT.ovationObs;
    } else {
      ovation = null;
      ovationNote = "SWPC blocked · no seed cell";
    }

    const weather = parseWeather(wxPack);
    const cloud = summarizeClouds(weather.hours);
    const hasDark = weather.hours.some((h) => h.night);
    const look = lookHint(place.lat, ovation);
    const v = verdict({
      kp: kpNow,
      ovation,
      cloudMin: cloud.min,
      hasDark: hasDark || Boolean(weather.sunset),
      lat: place.lat,
    });

    const series = (kpPack.forecast || []).filter((row, i, arr) => {
      if (!row || row.kp == null) return false;
      const t = row.time_tag || "";
      // keep last few observed + upcoming predicted
      if (row.observed === "predicted") return true;
      return i >= arr.length - 16;
    }).slice(-16);

    const parts = [
      "Kp " + kpSource + " " + fmtZulu(now.time_tag),
      ovationTime
        ? "OVATION " + (ovPack.ok ? "live" : "snapshot") + " " + fmtZulu(ovationTime)
        : "OVATION unavailable",
      wxPack.ok ? "Open-Meteo clouds " + (weather.timezone || "") : "clouds unavailable",
      "geo " + place.geoSource,
    ];

    const darkMeta = weather.sunset
      ? (cloud.window
          ? "Clear-ish stretch " + cloud.window + " (cloud ≤35%). Hour colors: green clear · amber broken · gray socked."
          : "No 2-hour stretch under 35% cloud. Hour colors: green clear · amber broken · gray socked.")
      : "Sunrise/sunset unavailable — darkness not guessed.";

    const card = {
      zip: place.zip,
      city: place.city,
      region: place.region,
      lat: place.lat,
      lon: place.lon,
      label: place.label,
      kp: kpNow,
      kpLabel,
      kpScale: noaaScale(kpNow) + (now.kp ? " · " + now.kp : ""),
      kpSeries: series.length ? series : SNAPSHOT.forecast,
      ovation,
      ovationCell,
      ovationNote,
      cloud,
      look,
      verdict: v,
      hours: weather.hours,
      sunset: weather.sunset,
      sunrise: weather.sunrise,
      darkMeta,
      sourceLine: parts.join(" · "),
      kpLive: kpPack.ok,
      ovLive: ovPack.ok,
      wxLive: wxPack.ok,
    };
    renderCard(card);

    const flags = [
      kpPack.ok ? "Kp live" : "Kp snapshot",
      ovPack.ok ? "OVATION live" : "OVATION fallback",
      wxPack.ok ? "clouds live" : "clouds unavailable",
    ];
    setStatus("Card ready · " + flags.join(" · "));
  }

  async function runLookup(raw) {
    const q = String(raw == null ? $("queryInput").value : raw).trim();
    if (!q) {
      showMiss("", "Paste a ZIP or lat, lon first.");
      setStatus("Empty query.");
      return;
    }
    setStatus("Resolving location…");
    const place = await resolvePlace(q);
    if (!place || place.kind === "unresolved") {
      showMiss(q, "ZIP geocoder missed or was blocked. Use a seed chip or paste lat, lon.");
      setStatus("Location miss — no invented coordinates.");
      return;
    }
    $("queryInput").value = place.zip || place.lat + ", " + place.lon;
    await buildCard(place);
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      return false;
    }
  }

  function wrapText(ctx, text, x, y, maxW, lh) {
    const words = String(text).split(/\s+/);
    let line = "";
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, y);
        y += lh;
        line = words[i];
      } else {
        line = test;
      }
    }
    if (line) {
      ctx.fillText(line, x, y);
      y += lh;
    }
    return y;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function exportPng() {
    const card = current;
    if (!card) {
      setStatus("Build a tonight card first.");
      return;
    }
    const canvas = $("pngCanvas");
    const ctx = canvas.getContext("2d");
    const w = canvas.width;
    const h = canvas.height;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#12201c");
    bg.addColorStop(0.45, "#0b1220");
    bg.addColorStop(1, "#070b12");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#3dffb0";
    ctx.font = "700 13px IBM Plex Sans, sans-serif";
    ctx.fillText("AURORA ZIP CARD", 40, 48);

    const vColor =
      card.verdict.key === "go" ? "#3ecf8e" : card.verdict.key === "maybe" ? "#f0b429" : "#9b8cff";
    ctx.fillStyle = vColor;
    ctx.font = "700 22px IBM Plex Sans, sans-serif";
    ctx.textAlign = "right";
    ctx.fillText(card.verdict.label, w - 40, 50);
    ctx.textAlign = "left";

    ctx.fillStyle = "#8b9aab";
    ctx.font = "400 14px IBM Plex Mono, monospace";
    ctx.fillText(card.label + "  ·  " + card.lat.toFixed(2) + "°, " + card.lon.toFixed(2) + "°", 40, 78);

    ctx.fillStyle = "#e8eef4";
    ctx.font = "700 28px IBM Plex Sans, sans-serif";
    let y = wrapText(ctx, card.verdict.headline, 40, 118, w - 80, 34);

    y += 10;
    const cells = [
      { k: "Kp NOW", v: card.kpLabel, s: card.kpScale },
      { k: "OVATION", v: card.ovation == null ? "—" : card.ovation + "%", s: card.ovationNote },
      { k: "CLOUDS", v: card.cloud.label, s: card.cloud.note },
      { k: "LOOK", v: card.look.short, s: card.look.note },
    ];
    const cw = (w - 80 - 30) / 4;
    cells.forEach((c, i) => {
      const x = 40 + i * (cw + 10);
      ctx.fillStyle = "#10161f";
      roundRect(ctx, x, y, cw, 118, 10);
      ctx.fill();
      ctx.fillStyle = "#8b9aab";
      ctx.font = "600 11px IBM Plex Sans, sans-serif";
      ctx.fillText(c.k, x + 10, y + 22);
      ctx.fillStyle = "#e8eef4";
      ctx.font = "700 26px IBM Plex Mono, monospace";
      ctx.fillText(String(c.v).slice(0, 10), x + 10, y + 58);
      ctx.fillStyle = "#8b9aab";
      ctx.font = "400 11px IBM Plex Sans, sans-serif";
      wrapText(ctx, c.s, x + 10, y + 80, cw - 18, 14);
    });

    y += 138;
    ctx.fillStyle = "#10161f";
    roundRect(ctx, 40, y, w - 80, 90, 12);
    ctx.fill();
    ctx.fillStyle = "#e8eef4";
    ctx.font = "700 14px IBM Plex Sans, sans-serif";
    ctx.fillText("DARKNESS", 56, y + 28);
    ctx.fillStyle = "#8b9aab";
    ctx.font = "400 14px IBM Plex Mono, monospace";
    ctx.fillText(
      card.sunset && card.sunrise
        ? fmtClock(card.sunset) + " → " + fmtClock(card.sunrise)
        : "unavailable",
      56,
      y + 52
    );
    ctx.fillStyle = "#c5d0db";
    ctx.font = "400 13px IBM Plex Sans, sans-serif";
    wrapText(ctx, card.darkMeta, 56, y + 74, w - 120, 16);

    y += 110;
    ctx.fillStyle = "#10161f";
    roundRect(ctx, 40, y, w - 80, 88, 12);
    ctx.fill();
    ctx.fillStyle = "#e8eef4";
    ctx.font = "700 14px IBM Plex Sans, sans-serif";
    ctx.fillText("Kp · observed + 3-day", 56, y + 26);
    const series = card.kpSeries || [];
    const barX = 56;
    const barW = w - 112;
    const gap = 3;
    const bw = series.length ? Math.max(4, (barW - gap * (series.length - 1)) / series.length) : 8;
    series.forEach((p, i) => {
      const kp = p.kp || 0;
      const bh = Math.max(3, Math.round((kp / 9) * 40));
      ctx.fillStyle = kp >= 5 ? "#f0b429" : p.observed === "observed" ? "#3dffb0" : "#9b8cff";
      ctx.fillRect(barX + i * (bw + gap), y + 72 - bh, bw, bh);
    });

    y += 110;
    ctx.fillStyle = "#e8d9a8";
    ctx.font = "400 15px IBM Plex Sans, sans-serif";
    y = wrapText(
      ctx,
      "OVATION ≠ substorm. Kp is planetary, not your backyard. This is not an 87% chance.",
      40,
      y,
      w - 80,
      22
    );

    y += 16;
    ctx.fillStyle = "#8b9aab";
    ctx.font = "400 12px IBM Plex Mono, monospace";
    y = wrapText(ctx, card.sourceLine, 40, y, w - 80, 16);

    ctx.fillStyle = "#8b9aab";
    ctx.font = "400 12px IBM Plex Sans, sans-serif";
    ctx.fillText("Public NOAA SWPC + Open-Meteo · not a chase dashboard", 40, h - 48);
    ctx.fillText("Aurora ZIP Card · sources on the face", 40, h - 28);

    canvas.toBlob((blob) => {
      if (!blob) {
        setStatus("PNG export failed.");
        return;
      }
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const name = "aurora-zip-card-" + (card.zip || "pin") + ".png";
      a.download = name;
      a.click();
      URL.revokeObjectURL(a.href);
      setStatus("PNG downloaded · " + name);
    });
  }

  function restoreFromHash() {
    const h = location.hash.replace(/^#/, "");
    if (!h) return;
    const zip = (h.match(/(?:^|[?&])zip=([^&]+)/) || [])[1];
    const ll = (h.match(/(?:^|[?&])ll=([^&]+)/) || [])[1];
    if (zip) {
      const z = decodeURIComponent(zip);
      $("queryInput").value = z;
      runLookup(z);
      return;
    }
    if (ll) {
      const v = decodeURIComponent(ll);
      $("queryInput").value = v;
      runLookup(v);
    }
  }

  function init() {
    renderChips();
    $("lookupBtn").addEventListener("click", () => runLookup());
    $("queryInput").addEventListener("keydown", (e) => {
      if (e.key === "Enter") runLookup();
    });
    $("copyCard").addEventListener("click", async () => {
      if (!current) {
        setStatus("Build a tonight card first.");
        return;
      }
      const ok = await copyText(summaryText(current));
      setStatus(ok ? "Summary copied." : "Copy failed — select text manually.");
    });
    $("shareBtn").addEventListener("click", async () => {
      if (!current) {
        setStatus("Build a tonight card first.");
        return;
      }
      const url = shareUrlFor(current);
      $("shareBox").hidden = false;
      $("shareUrl").value = url;
      const ok = await copyText(url);
      setStatus(ok ? "Share link copied (hash = ZIP / lat,lon)." : "Share box ready — copy manually.");
    });
    $("copyShare").addEventListener("click", async () => {
      const ok = await copyText($("shareUrl").value);
      setStatus(ok ? "Share URL copied." : "Copy failed.");
    });
    $("exportPng").addEventListener("click", exportPng);
    window.addEventListener("hashchange", restoreFromHash);
    if (location.hash) restoreFromHash();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
