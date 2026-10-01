// Out the Door: data layer (MTA trains + alerts, weather, air quality, sun/moon).
// Calls render() (defined by the page) whenever fresh data arrives.

const hm = t => { const d = new Date(t * 1000); return `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, "0")}`; };

// ---------- settings ----------
const BUFFER_MIN = 1;                      // extra slack on top of the walk
const REFRESH_SEC = 30;                    // how often to pull the MTA feeds
const FEED = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/nyct%2F";

// Walk times from home (Google Maps, walking).
// toward = any Manhattan stop on that line; a train counts only if it reaches it after your station.
const OPTIONS = [
  { route: "M", feed: "gtfs-bdfm", stop: "M10", station: "Central Av",          walk: 5,  toward: "M18" },
  { route: "M", feed: "gtfs-bdfm", stop: "M11", station: "Myrtle Av–Broadway", walk: 11, toward: "M18" },
  { route: "J", feed: "gtfs-jz",   stop: "M11", station: "Myrtle Av–Broadway", walk: 11, toward: "M18" },
  { route: "Z", feed: "gtfs-jz",   stop: "M11", station: "Myrtle Av–Broadway", walk: 11, toward: "M18" },
  { route: "L", feed: "gtfs-l",    stop: "L15", station: "Jefferson St",       walk: 13, toward: "L06" },
  { route: "L", feed: "gtfs-l",    stop: "L14", station: "Morgan Av",          walk: 13, toward: "L06" },
];

// Where trains end up (last stop of the trip) -> readable name.
const TERMINALS = {
  L01: "8 Av", L03: "Union Sq", G08: "Forest Hills–71 Av", M23: "Broad St", M22: "Fulton St",
  M21: "Chambers St", M18: "Delancey St–Essex St", D15: "47–50 Sts", B08: "Lexington Av/63 St",
  Q05: "96 St", D14: "7 Av", G21: "Queens Plaza", M19: "Bowery", M20: "Canal St",
};

// ---------- minimal GTFS-realtime protobuf reader ----------
const td = new TextDecoder();
function fields(buf, s = 0, e = buf.length) {
  const out = []; let i = s;
  const varint = () => { let r = 0, m = 1, b; do { b = buf[i++]; r += (b & 127) * m; m *= 128; } while (b & 128); return r; };
  while (i < e) {
    const k = varint(), f = Math.floor(k / 8), w = k & 7;
    if (w === 0) out.push([f, varint()]);
    else if (w === 2) { const L = varint(); out.push([f, [i, i + L]]); i += L; }
    else if (w === 1) i += 8; else if (w === 5) i += 4; else break;
  }
  return out;
}
function parseFeed(buf) {
  const trips = [];
  for (const [f, v] of fields(buf)) {
    if (f !== 2) continue;                                   // FeedMessage.entity
    let tu = null;
    for (const [f2, v2] of fields(buf, ...v)) if (f2 === 3) tu = v2;   // trip_update
    if (!tu) continue;
    let route = ""; const stops = [];
    for (const [f3, v3] of fields(buf, ...tu)) {
      if (f3 === 1) for (const [a, b] of fields(buf, ...v3)) if (a === 5) route = td.decode(buf.subarray(...b));
      if (f3 === 2) {
        let id = "", t = 0;
        for (const [a, b] of fields(buf, ...v3)) {
          if (a === 4) id = td.decode(buf.subarray(...b));
          if ((a === 2 || a === 3) && !t) for (const [c, d] of fields(buf, ...b)) if (c === 2) t = d;
        }
        stops.push([id.slice(0, 3), t]);
      }
    }
    trips.push({ route, stops });
  }
  return trips;
}

// ---------- data ----------
let trains = {};        // option index -> [{t, terminal}]
let updated = 0, lastError = "";

async function refresh() {
  const feeds = {};
  try {
    for (const name of new Set(OPTIONS.map(o => o.feed))) {
      const r = await fetch(FEED + name, { cache: "no-store" });
      if (!r.ok) throw new Error(`${name}: HTTP ${r.status}`);
      feeds[name] = parseFeed(new Uint8Array(await r.arrayBuffer()));
    }
  } catch (e) { lastError = String(e.message || e); render(); return; }

  const now = Date.now() / 1000, next = {};
  OPTIONS.forEach((o, i) => {
    next[i] = [];
    for (const trip of feeds[o.feed]) {
      if (trip.route !== o.route) continue;
      const k = trip.stops.findIndex(s => s[0] === o.stop);
      if (k < 0 || !trip.stops[k][1] || trip.stops[k][1] < now - 60) continue;
      if (!trip.stops.slice(k + 1).some(s => s[0] === o.toward)) continue;   // not Manhattan-bound
      const last = trip.stops[trip.stops.length - 1][0];
      next[i].push({ t: trip.stops[k][1], terminal: TERMINALS[last] || "Manhattan", after: trip.stops.slice(k + 1) });
    }
    next[i].sort((a, b) => a.t - b.t);
  });
  trains = next; updated = now; lastError = ""; render();
}

// ---------- weather (Open-Meteo, free, no key) ----------
const HOME = { lat: 40.70, lon: -73.93 };   // rounded on purpose: neighborhood-level is plenty for weather
const WEATHER_URL = `https://api.open-meteo.com/v1/forecast?latitude=${HOME.lat}&longitude=${HOME.lon}` +
  "&hourly=apparent_temperature,precipitation_probability,precipitation,snowfall,wind_gusts_10m,uv_index,weather_code" +
  "&current=precipitation,weather_code,temperature_2m,apparent_temperature,cloud_cover,wind_speed_10m,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch" +
  "&timezone=America%2FNew_York&past_hours=12&forecast_hours=4&timeformat=unixtime";
let warnings = [];
let currentWx = null;   // conditions right now, for the backgrounds

// Plain-language read of the current weather code (WMO codes used by Open-Meteo).
function describeNow(c) {
  if (!c) return null;
  const code = c.weather_code ?? 0;
  const kind =
    code >= 95 ? "storm" :
    (code >= 71 && code <= 77) || code === 85 || code === 86 ? "snow" :
    (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || (c.precipitation ?? 0) > 0 ? "rain" :
    code === 45 || code === 48 ? "fog" :
    (c.cloud_cover ?? 0) >= 70 || code === 3 ? "cloudy" :
    (c.cloud_cover ?? 0) >= 30 || code === 2 ? "partly" : "clear";
  const heavy = [63, 65, 67, 75, 81, 82, 86, 96, 99].includes(code);
  const label = { storm: "thunderstorms", snow: heavy ? "heavy snow" : "snow", rain: heavy ? "heavy rain" : "rain",
    fog: "fog", cloudy: "cloudy", partly: "partly cloudy", clear: "clear" }[kind];
  const feels = c.apparent_temperature ?? c.temperature_2m;
  return { kind, heavy, label, temp: Math.round(c.temperature_2m), feels: Math.round(feels),
           cloud: c.cloud_cover ?? 0, wind: c.wind_speed_10m ?? 0, cold: feels <= 40, hot: feels >= 84 };
}

// Returns only things worth acting on in the next ~3 hours. Empty list = nothing to show.
function weatherWarnings(w, now) {
  const h = w.hourly, out = [];
  out.rain = false; out.snow = false;
  const idx = h.time.map((t, i) => i);
  const ahead = idx.filter(i => h.time[i] + 3600 > now && h.time[i] <= now + 3 * 3600);
  const past = idx.filter(i => h.time[i] + 3600 <= now);
  if (!ahead.length) return out;
  const max = k => Math.max(...ahead.map(i => h[k][i] ?? 0));
  const min = k => Math.min(...ahead.map(i => h[k][i] ?? 0));
  const sum = (k, set) => set.reduce((a, i) => a + (h[k][i] ?? 0), 0);
  const firstHour = test => { const i = ahead.find(test); return i === undefined ? "" : hm(Math.max(h.time[i], now)); };

  // Storms / rain / snow
  const storm = ahead.some(i => h.weather_code[i] >= 95);
  const rainingNow = (w.current?.precipitation ?? 0) > 0;
  const rainSoon = max("precipitation_probability") >= 40 || sum("precipitation", ahead) >= 0.02;
  out.snow = sum("snowfall", ahead) > 0;
  out.rain = (w.current?.precipitation ?? 0) > 0 || max("precipitation_probability") >= 40 || sum("precipitation", ahead) >= 0.02;
  if (sum("snowfall", ahead) > 0) out.push(["Snow: wear boots", `About ${sum("snowfall", ahead).toFixed(1)} in expected by ${hm(now + 3 * 3600)}`]);
  if (storm) out.push(["Thunderstorms possible", `Starting around ${firstHour(i => h.weather_code[i] >= 95)}. Umbrella, and maybe wait it out`]);
  else if (rainingNow) out.push(["Raining now: umbrella", `${max("precipitation_probability")}% chance it keeps going`]);
  else if (rainSoon) out.push(["Bring an umbrella", `${max("precipitation_probability")}% chance of rain, from about ${firstHour(i => h.precipitation_probability[i] >= 40 || h.precipitation[i] > 0)}`]);

  // Puddles from earlier rain
  const fell = sum("precipitation", past);
  if (!rainSoon && !rainingNow && fell >= 0.15) out.push(["Wet streets: waterproof shoes", `${fell.toFixed(2)} in of rain in the last 12 hours`]);

  // Temperature (feels-like)
  const lo = Math.round(min("apparent_temperature")), hi = Math.round(max("apparent_temperature"));
  if (lo <= 32) out.push(["Freezing: coat, hat, gloves", `Feels like ${lo}°F`]);
  else if (lo <= 45) out.push(["Cold: warm coat", `Feels like ${lo}°F`]);
  else if (lo <= 55) out.push(["Cool: bring a jacket", `Feels like ${lo}°F`]);
  if (hi >= 90) out.push(["Very hot: water and light clothes", `Feels like ${hi}°F`]);
  else if (hi >= 84) out.push(["Hot: dress light, bring water", `Feels like ${hi}°F`]);
  const nowFeel = h.apparent_temperature[ahead[0]];
  if (lo > 55 && nowFeel - lo >= 12) out.push(["Getting colder: bring a layer", `Drops from ${Math.round(nowFeel)}°F to ${lo}°F`]);

  // Wind and sun
  const gust = Math.round(max("wind_gusts_10m"));
  if (gust >= 30) out.push(["Windy", `Gusts up to ${gust} mph${rainSoon ? ". Umbrellas will struggle" : ""}`]);
  if (max("uv_index") >= 7) out.push(["Strong sun: sunscreen", `UV index ${Math.round(max("uv_index"))}`]);
  return out;
}

// ---------- air quality (Open-Meteo, US AQI) ----------
const AIR_URL = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${HOME.lat}&longitude=${HOME.lon}` +
  "&hourly=us_aqi&forecast_hours=4&timeformat=unixtime&timezone=America%2FNew_York";
let airWarnings = [];

function airQualityWarnings(a, now) {
  const vals = a.hourly.time.map((t, i) => [t, a.hourly.us_aqi[i]])
    .filter(([t, v]) => v != null && t + 3600 > now && t <= now + 3 * 3600).map(([, v]) => v);
  if (!vals.length) return [];
  const aqi = Math.round(Math.max(...vals));
  if (aqi >= 201) return [["Very unhealthy air: stay in or wear an N95", `Air quality index ${aqi}`]];
  if (aqi >= 151) return [["Unhealthy air: consider a mask", `Air quality index ${aqi}`]];
  if (aqi >= 101) return [["Poor air quality", `Air quality index ${aqi}. Unhealthy for sensitive groups`]];
  return [];
}

async function refreshWeather() {
  const now = Date.now() / 1000;
  try { const w = await (await fetch(WEATHER_URL, { cache: "no-store" })).json(); warnings = weatherWarnings(w, now); currentWx = describeNow(w.current); } catch (e) {}
  try { airWarnings = airQualityWarnings(await (await fetch(AIR_URL, { cache: "no-store" })).json(), now); } catch (e) {}
  render();
}

// ---------- MTA service alerts ----------
const ALERTS_URL = "https://api-endpoint.mta.info/Dataservice/mtagtfsfeeds/camsys%2Fsubway-alerts.json";
const MY_ROUTES = new Set(OPTIONS.map(o => o.route));
// Stops from your stations into Manhattan. Alerts that only touch other stops (e.g. the L in Canarsie) are skipped.
const RELEVANT_STOPS = new Set([
  "L01", "L02", "L03", "L05", "L06", "L08", "L10", "L11", "L12", "L13", "L14", "L15",
  "M10", "M11", "M12", "M13", "M14", "M16", "M18", "M19", "M20", "M21", "M22", "M23",
  "D21", "D20", "D19", "D18", "D17", "D16", "D15", "F12", "F11",
]);
let alerts = [];

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function cleanAlertText(t) {
  return esc(t).replace(/\[[^\]]*icon\]\s*/gi, "").replace(/\[([A-Z0-9])\]/g, "<b>$1</b>").trim();
}

function serviceAlerts(feed, now) {
  const seen = new Set(), out = [];
  for (const e of feed.entity || []) {
    const a = e.alert; if (!a) continue;
    const ents = a.informed_entity || [];
    const routes = [...new Set(ents.map(x => x.route_id).filter(r => MY_ROUTES.has(r)))];
    if (!routes.length) continue;
    const stops = ents.map(x => (x.stop_id || "").slice(0, 3)).filter(Boolean);
    if (stops.length && !stops.some(s => RELEVANT_STOPS.has(s))) continue;
    const periods = a.active_period || [{}];
    const active = periods.some(p => (p.start || 0) <= now && (!p.end || p.end >= now));
    const soon = periods.map(p => p.start).filter(t => t > now && t <= now + 12 * 3600).sort()[0];
    if (!active && !soon) continue;
    const text = (a.header_text?.translation || []).find(t => t.language === "en")?.text;
    if (!text || seen.has(text)) continue;
    seen.add(text);
    out.push({ routes, html: cleanAlertText(text), when: active ? "Now" : `From ${hm(soon)}${new Date(soon * 1000).getHours() < 12 ? "am" : "pm"}`,
               type: a["transit_realtime.mercury_alert"]?.alert_type || "", active });
  }
  return out.sort((x, y) => y.active - x.active).slice(0, 5);
}

async function refreshAlerts() {
  try { alerts = serviceAlerts(await (await fetch(ALERTS_URL, { cache: "no-store" })).json(), Date.now() / 1000); } catch (e) {}
  render();
}

// ---------- sunset and the moon (SunCalc, computed on the device) ----------
function skyLine(now) {
  if (!window.SunCalc) return "";
  const d = new Date(now * 1000), tmr = new Date(d.getTime() + 864e5);
  const sun = SunCalc.getTimes(d, HOME.lat, HOME.lon);
  const parts = [];
  if (d < sun.sunset) parts.push(`Sunset ${hm(sun.sunset / 1000)}`);
  else parts.push(`Sunrise ${hm(SunCalc.getTimes(tmr, HOME.lat, HOME.lon).sunrise / 1000)}`);

  // Moon only when it's worth looking up: around full moon (moonrise) or new moon (dark sky).
  const { fraction, phase } = SunCalc.getMoonIllumination(d);
  if (fraction >= 0.9) {
    const rises = [SunCalc.getMoonTimes(d, HOME.lat, HOME.lon).rise, SunCalc.getMoonTimes(tmr, HOME.lat, HOME.lon).rise]
      .filter(r => r && r.getTime() / 1000 > now - 1800);
    const name = fraction >= 0.98 ? "Full moon" : phase < 0.5 ? "Nearly full moon" : "Just past full moon";
    if (rises[0] && rises[0].getTime() / 1000 < now + 18 * 3600) parts.push(`${name} rises ${hm(rises[0] / 1000)}`);
    else parts.push(name);
  } else if (fraction <= 0.03) parts.push("New moon: darkest skies tonight");
  return parts.join(" · ");
}

