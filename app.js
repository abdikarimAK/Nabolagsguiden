/* ============================================================
   app.js — Nabolagsguiden v2
   Distance-weighted scoring · urban/rural calibration · compare
   mode · search history · shareable URL · Overpass fallback
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────
// CATEGORIES
// ─────────────────────────────────────────────

// SVG icon paths (stroke-based, used in card icons and toggles)
const ICONS = {
  dagligvare: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" x2="21" y1="6" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>`,
  transport:  `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><path d="M8 15h.01"/><path d="M16 15h.01"/></svg>`,
  skole:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>`,
  helse:      `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/><path d="M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0 2.82 2.82 0 0 1 0 3.98L12 19"/></svg>`,
  park:       `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 14c.83-1 1.5-2.34 1.5-3.5A3.5 3.5 0 0 0 15 7c-.55 0-1.08.14-1.54.4"/><path d="M7 14c-.83-1-1.5-2.34-1.5-3.5A3.5 3.5 0 0 1 9 7c1.93 0 3.5 1.57 3.5 3.5 0 1.16-.67 2.5-1.5 3.5"/><path d="M12 14c.83-1 1.5-2.34 1.5-3.5A1.5 1.5 0 0 0 12 9a1.5 1.5 0 0 0-1.5 1.5c0 1.16.67 2.5 1.5 3.5z"/><path d="M5 21h14"/><path d="M12 14v7"/></svg>`,
  restaurant: `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>`,
};

const CATEGORIES = [
  {
    id: 'dagligvare', label: 'Dagligvare', color: '#39D353', baseTarget: 3,
    icon: ICONS.dagligvare,
    match: t => ['supermarket','convenience','grocery','food'].includes(t.shop || ''),
  },
  {
    id: 'transport', label: 'Kollektivtransport', color: '#4FC3F7', baseTarget: 5,
    icon: ICONS.transport,
    match: t => t.highway === 'bus_stop' || ['tram_stop','station'].includes(t.railway||'') || t.amenity === 'bus_station',
  },
  {
    id: 'skole', label: 'Skoler & barnehager', color: '#FFB74D', baseTarget: 2,
    icon: ICONS.skole,
    match: t => ['school','kindergarten','college'].includes(t.amenity||''),
  },
  {
    id: 'helse', label: 'Helse & apotek', color: '#F06292', baseTarget: 2,
    icon: ICONS.helse,
    match: t => ['pharmacy','hospital','clinic','doctors','dentist'].includes(t.amenity||''),
  },
  {
    id: 'park', label: 'Parker & friluft', color: '#64B5F6', baseTarget: 2,
    icon: ICONS.park,
    match: t => ['park','playground','sports_centre','pitch'].includes(t.leisure||''),
  },
  {
    id: 'restaurant', label: 'Mat & kafé', color: '#CE93D8', baseTarget: 5,
    icon: ICONS.restaurant,
    match: t => ['restaurant','cafe','fast_food','bar'].includes(t.amenity||''),
  },
];

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────

let RADIUS = 1000;
const CACHE_TTL = 1000 * 60 * 30; // 30 min
const MAX_RETRIES = 2;
const OVERPASS_TIMEOUT = 40_000;
const HISTORY_LIMIT = 5;

const OVERPASS_MIRRORS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

let currentResult = null;
let compareResult = null;
let coordCycleInterval = null;
let lastSearchAddress = '';
let compareOpen = false;

// ─────────────────────────────────────────────
// CACHE
// ─────────────────────────────────────────────

function cacheKey(addr) {
  return 'nabolag2_' + addr.trim().toLowerCase().replace(/\s+/g,'_');
}
function saveCache(addr, data) {
  try { localStorage.setItem(cacheKey(addr), JSON.stringify({ ts: Date.now(), data })); } catch (_) {}
}
function loadCache(addr) {
  try {
    const raw = localStorage.getItem(cacheKey(addr));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(cacheKey(addr)); return null; }
    return data;
  } catch (_) { return null; }
}

// ─────────────────────────────────────────────
// SEARCH HISTORY
// ─────────────────────────────────────────────

function getHistory() {
  try { return JSON.parse(localStorage.getItem('nabolag_history') || '[]'); } catch (_) { return []; }
}
function addToHistory(address, score) {
  const h = getHistory().filter(e => e.address.toLowerCase() !== address.toLowerCase());
  h.unshift({ address, score });
  try { localStorage.setItem('nabolag_history', JSON.stringify(h.slice(0, HISTORY_LIMIT))); } catch (_) {}
}
function renderHistory() {
  const history = getHistory();
  const row = document.getElementById('history-row');
  const chips = document.getElementById('history-chips');
  if (!row || !chips || !history.length) { if (row) row.style.display = 'none'; return; }
  chips.innerHTML = history.map(e => `
    <button class="history-chip" data-address="${e.address}">
      <span>${e.address.split(',')[0]}</span>
      <span class="history-chip-score">${e.score}</span>
    </button>
  `).join('');
  row.style.display = 'flex';
  chips.querySelectorAll('.history-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('address-input').value = btn.dataset.address;
      document.getElementById('search-btn').disabled = false;
      handleSearch(btn.dataset.address);
    });
  });
}

// ─────────────────────────────────────────────
// SHAREABLE URL
// ─────────────────────────────────────────────

function updateURL(address) {
  const url = new URL(window.location.href);
  if (address) url.searchParams.set('q', address);
  else url.searchParams.delete('q');
  window.history.replaceState({}, '', url);
}

function getURLAddress() {
  return new URL(window.location.href).searchParams.get('q') || '';
}

function shareURL(address) {
  const url = new URL(window.location.href);
  url.searchParams.set('q', address);
  navigator.clipboard.writeText(url.toString())
      .then(() => showToast('Lenke kopiert til utklippstavlen! 🔗'))
      .catch(() => showToast('Kunne ikke kopiere lenke'));
}

// ─────────────────────────────────────────────
// GEOCODE
// ─────────────────────────────────────────────

async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=no`;
  const res = await fetchWithTimeout(url, {
    headers: { 'Accept-Language': 'no,nb,nn', 'User-Agent': 'Nabolagsguiden/2.0' }
  }, 10_000);
  if (!res.ok) throw new Error('Kunne ikke koble til karttjenesten.');
  const data = await res.json();
  if (!data?.length) throw new Error('Fant ikke adressen. Prøv å inkludere postnummer eller by.');
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    display_name: data[0].display_name.split(',').slice(0, 3).join(','),
  };
}

// ─────────────────────────────────────────────
// DISTANCE-WEIGHTED SCORING
// ─────────────────────────────────────────────

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Weight: full score within 20% of radius, linearly decreasing to 0.15 at edge
function distanceWeight(dist) {
  const fullZone = RADIUS * 0.2;
  if (dist <= fullZone) return 1.0;
  return Math.max(0.15, 1.0 - (dist - fullZone) / (RADIUS - fullZone) * 0.85);
}

// Urban vs rural calibration — if total raw count is very low, relax targets
function calibrateTarget(baseTarget, urbanFactor) {
  // urbanFactor 0.0=rural, 1.0=urban
  // Rural gets 50% lower targets so rural areas aren't punished unfairly
  const multiplier = 0.5 + 0.5 * urbanFactor;
  return Math.max(1, Math.round(baseTarget * multiplier));
}

// ─────────────────────────────────────────────
// OVERPASS (with fallback mirrors + retry)
// ─────────────────────────────────────────────

async function fetchFromOverpass(query, mirrorIdx = 0, attempt = 0) {
  const url = OVERPASS_MIRRORS[mirrorIdx % OVERPASS_MIRRORS.length];
  let res;
  try {
    res = await fetchWithTimeout(url, { method: 'POST', body: query }, OVERPASS_TIMEOUT);
  } catch (err) {
    // Try next mirror
    if (mirrorIdx + 1 < OVERPASS_MIRRORS.length) {
      showToast(`Prøver speilserver...`);
      return fetchFromOverpass(query, mirrorIdx + 1, 0);
    }
    if (attempt < MAX_RETRIES) {
      await sleep(2500 * (attempt + 1));
      return fetchFromOverpass(query, 0, attempt + 1);
    }
    throw new Error('Kartdatatjenesten svarer ikke. Prøv igjen om litt.');
  }
  if (!res.ok) {
    if (mirrorIdx + 1 < OVERPASS_MIRRORS.length) {
      return fetchFromOverpass(query, mirrorIdx + 1, 0);
    }
    if (attempt < MAX_RETRIES) {
      await sleep(2500 * (attempt + 1));
      return fetchFromOverpass(query, 0, attempt + 1);
    }
    throw new Error('Kunne ikke hente nabolagsdata.');
  }
  return res;
}

async function fetchNeighborhoodData(lat, lon, addressName) {
  const query = `
    [out:json][timeout:60];
    (
      nwr["shop"~"supermarket|convenience|grocery|food"](around:${RADIUS},${lat},${lon});
      nwr["highway"="bus_stop"](around:${RADIUS},${lat},${lon});
      nwr["railway"~"tram_stop|station"](around:${RADIUS},${lat},${lon});
      nwr["amenity"="bus_station"](around:${RADIUS},${lat},${lon});
      nwr["amenity"~"school|kindergarten|college"](around:${RADIUS},${lat},${lon});
      nwr["amenity"~"pharmacy|hospital|clinic|doctors|dentist"](around:${RADIUS},${lat},${lon});
      nwr["leisure"~"park|playground|sports_centre|pitch"](around:${RADIUS},${lat},${lon});
      nwr["amenity"~"restaurant|cafe|fast_food|bar"](around:${RADIUS},${lat},${lon});
    );
    out center tags 500;
  `;

  const res = await fetchFromOverpass(query);
  const data = await res.json();
  const elements = data.elements || [];

  // Detect urban vs rural — scale threshold with radius
  const totalRaw = elements.length;
  const urbanFactor = Math.min(1, totalRaw / (RADIUS / 1000 * 60));

  // Assign places to categories with distance weights
  const categoryScores = CATEGORIES.map(cat => ({
    category: cat, score: 0, count: 0, weightedScore: 0,
    places: [], target: calibrateTarget(cat.baseTarget, urbanFactor),
  }));

  elements.forEach(el => {
    if (!el.tags) return;
    const idx = CATEGORIES.findIndex(c => c.match(el.tags));
    if (idx === -1) return;
    const placeLat = el.lat || el.center?.lat;
    const placeLon = el.lon || el.center?.lon;
    if (!placeLat || !placeLon) return;

    const cat = CATEGORIES[idx];
    const dist = haversineDistance(lat, lon, placeLat, placeLon);
    const weight = distanceWeight(dist);
    const name = el.tags.name || el.tags.brand || cat.label;
    const street = el.tags['addr:street'] || '';
    const num = el.tags['addr:housenumber'] || '';
    const addr = street ? `${street} ${num}`.trim() : 'Adresse ikke oppgitt';

    categoryScores[idx].places.push({
      id: el.id, lat: placeLat, lon: placeLon,
      name, address: addr, distance: Math.round(dist),
      categoryId: cat.id, categoryColor: cat.color,
    });
    categoryScores[idx].count++;
    categoryScores[idx].weightedScore += weight;
  });

  // Calculate final scores using weighted count vs calibrated target
  let totalSum = 0;
  categoryScores.forEach(cs => {
    cs.score = Math.min(100, Math.round((cs.weightedScore / cs.target) * 100));
    totalSum += cs.score;
  });

  const totalScore = Math.round(totalSum / CATEGORIES.length);
  const isRural = urbanFactor < 0.3;

  return {
    address: addressName, lat, lon,
    totalScore, verdict: getVerdict(totalScore),
    categoryScores, isRural,
  };
}

function getVerdict(score) {
  if (score >= 80) return 'Utmerket nabolag';
  if (score >= 65) return 'Meget godt nabolag';
  if (score >= 50) return 'Godt nabolag';
  if (score >= 35) return 'Gjennomsnittlig nabolag';
  return 'Begrenset nabolag';
}

function getInsight(cs) {
  if (cs.score === 0) return `Ingen ${cs.category.label.toLowerCase()} funnet i nærheten.`;
  if (cs.score >= 100) return `Utmerket tilgang – ${cs.count} steder innenfor ${RADIUS >= 1000 ? RADIUS/1000 + ' km' : RADIUS + ' m'}.`;
  if (cs.score < 40) return `Begrenset tilgang – bare ${cs.count} steder funnet.`;
  const closest = cs.places.sort((a, b) => a.distance - b.distance)[0];
  if (closest) return `Nærmeste: ${closest.name} (${closest.distance}m)`;
  return null;
}

// ─────────────────────────────────────────────
// UTILS
// ─────────────────────────────────────────────

function fetchWithTimeout(url, opts = {}, ms = 15_000) {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(id));
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function interpolateColor(val) {
  if (val < 50) {
    const t = val / 50;
    return `rgb(${Math.round(196+16*t)},${Math.round(112+33*t)},${Math.round(75+19*t)})`;
  }
  const t = (val - 50) / 50;
  return `rgb(${Math.round(212-167*t)},${Math.round(145-50*t)},${Math.round(94-31*t)})`;
}

function animateNumber(el, end, duration = 1400, onStep) {
  let start = null;
  function step(ts) {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - p, 4);
    const val = Math.round(ease * end);
    el.textContent = val;
    if (onStep) onStep(val);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function showToast(msg, duration = 2800) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

// ─────────────────────────────────────────────
// STATE MACHINE
// ─────────────────────────────────────────────

function setState(name) {
  document.querySelectorAll('.state').forEach(el => el.classList.remove('active'));
  document.getElementById(`state-${name}`)?.classList.add('active');

  const header = document.getElementById('site-header');
  const resetBtn = document.getElementById('reset-btn');
  const compareBtn = document.getElementById('compare-toggle-btn');
  if (name === 'results') {
    header.classList.add('elevated');
    resetBtn.style.display = 'flex';
    compareBtn.style.display = 'flex';
  } else {
    header.classList.remove('elevated');
    resetBtn.style.display = 'none';
    compareBtn.style.display = 'none';
  }

  if (name !== 'loading' && coordCycleInterval) {
    clearInterval(coordCycleInterval);
    coordCycleInterval = null;
  }
}

// ─────────────────────────────────────────────
// LOADING UI
// ─────────────────────────────────────────────

const STEPS = ['geocoding','fetching','calculating'];

function setLoadingStep(active) {
  const idx = STEPS.indexOf(active);
  STEPS.forEach((id, i) => {
    const el = document.querySelector(`.loading-step[data-step="${id}"]`);
    if (!el) return;
    el.classList.toggle('active', i === idx);
    el.classList.toggle('done', i < idx);
  });
  const fill = document.getElementById('step-line-fill');
  if (fill) fill.style.height = `${idx * 50}%`;

  const coordEl = document.getElementById('step-coords');
  if (coordEl) {
    if (active === 'geocoding') {
      coordEl.classList.add('visible');
      coordCycleInterval = setInterval(() => {
        coordEl.textContent = `${(58+Math.random()*12).toFixed(4)}, ${(4+Math.random()*26).toFixed(4)}`;
      }, 90);
    } else {
      coordEl.classList.remove('visible');
      clearInterval(coordCycleInterval);
    }
  }
}

// ─────────────────────────────────────────────
// GAUGE
// ─────────────────────────────────────────────

function renderGauge(result) {
  const scoreEl = document.getElementById('gauge-score');
  const fillEl = document.getElementById('gauge-fill');
  const verdictEl = document.getElementById('gauge-verdict');
  if (!scoreEl || !fillEl || !verdictEl) return;

  verdictEl.textContent = result.verdict;
  const circ = 2 * Math.PI * 78;
  fillEl.style.strokeDasharray = circ;
  fillEl.style.strokeDashoffset = circ;
  fillEl.style.transition = 'none';

  requestAnimationFrame(() => {
    setTimeout(() => {
      const offset = circ - (result.totalScore / 100) * circ;
      fillEl.style.transition = `stroke-dashoffset 1.5s cubic-bezier(0.16,1,0.3,1), stroke .5s ease`;
      fillEl.style.strokeDashoffset = offset;
      fillEl.style.stroke = interpolateColor(result.totalScore);
    }, 300);

    animateNumber(scoreEl, result.totalScore, 1500, val => {
      scoreEl.style.color = interpolateColor(val);
    });

    setTimeout(() => verdictEl.classList.add('visible'), 1100);

    // Urban/rural meta
    const meta = document.getElementById('gauge-meta');
    if (meta) {
      if (result.isRural) {
        meta.innerHTML = `<strong>Landlig område</strong> – mål justert for lavere tetthet`;
      } else {
        const top = result.categoryScores.sort((a,b)=>b.score-a.score)[0];
        meta.innerHTML = `Sterkest: <strong>${top.category.icon} ${top.category.label}</strong> (${top.score}%)`;
      }
      setTimeout(() => meta.classList.add('visible'), 1300);
    }
  });
}

// ─────────────────────────────────────────────
// RADAR
// ─────────────────────────────────────────────

function renderRadar(categoryScores, svgId = 'radar-svg') {
  const svg = document.getElementById(svgId);
  if (!svg) return;
  const cx = 150, cy = 150, r = 88;
  const n = categoryScores.length;
  const step = (Math.PI * 2) / n;

  function pt(val, i) {
    const a = i * step - Math.PI / 2;
    const d = (val / 100) * r;
    return { x: cx + d * Math.cos(a), y: cy + d * Math.sin(a) };
  }

  let html = '';
  [0.33, 0.66, 1].forEach((lvl, gi) => {
    const pts = Array.from({length:n},(_,i) => { const {x,y}=pt(lvl*100,i); return `${x},${y}`; }).join(' ');
    html += `<polygon points="${pts}" fill="none" stroke="#EAE0D5" stroke-width="1"
      style="opacity:0;transform-origin:${cx}px ${cy}px;transform:scale(.5);
      transition:opacity .6s ease ${gi*150}ms,transform .6s ease ${gi*150}ms"/>`;
  });

  for (let i = 0; i < n; i++) {
    const {x,y}=pt(100,i);
    html += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="#EAE0D5" stroke-width="1"
      style="opacity:0;transition:opacity .6s ease 500ms"/>`;
  }

  const center = Array.from({length:n},()=>`${cx},${cy}`).join(' ');
  const data = categoryScores.map((cs,i) => { const {x,y}=pt(cs.score,i); return `${x},${y}`; }).join(' ');
  html += `<polygon class="radar-fill" points="${center}" fill="#2D5F3F" fill-opacity=".15"
    stroke="#2D5F3F" stroke-width="2" stroke-linejoin="round"/>`;

  categoryScores.forEach((cs,i) => {
    const {x,y}=pt(cs.score,i);
    html += `<circle cx="${x}" cy="${y}" r="5" fill="${cs.category.color}" stroke="#fff" stroke-width="1.5"
      style="opacity:0;transform-origin:${x}px ${y}px;transform:scale(0);
      transition:opacity .3s ease ${1200+i*70}ms,transform .4s cubic-bezier(.17,.67,.4,1.8) ${1200+i*70}ms"/>`;
  });

  categoryScores.forEach((cs,i) => {
    const {x,y}=pt(130,i);
    let anchor = 'middle';
    if (x < cx - 10) anchor = 'end';
    if (x > cx + 10) anchor = 'start';
    html += `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle"
      font-family="DM Sans,sans-serif" font-size="10" fill="#7d7368"
      style="opacity:0;transition:opacity .4s ease ${1500+i*70}ms">
      ${cs.category.label}
    </text>`;
  });

  svg.innerHTML = html;

  requestAnimationFrame(() => {
    setTimeout(() => {
      svg.querySelectorAll('polygon:not(.radar-fill),line').forEach(el => {
        el.style.opacity='1'; el.style.transform='scale(1)';
      });
      setTimeout(() => {
        const fill = svg.querySelector('.radar-fill');
        if (fill) { fill.setAttribute('points', data); fill.style.transition='points 1.2s cubic-bezier(0.16,1,0.3,1)'; }
        svg.querySelectorAll('circle,text').forEach(el => { el.style.opacity='1'; el.style.transform='scale(1)'; });
      }, 800);
    }, 100);
  });
}

// ─────────────────────────────────────────────
// CATEGORY CARDS
// ─────────────────────────────────────────────

function renderCards(categoryScores, containerId = 'category-cards', baseDelay = 800) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.innerHTML = categoryScores.map((cs, i) => {
    const insight = getInsight(cs);
    return `
      <div class="category-card" data-category="${cs.category.id}">
        <div class="card-accent" style="background:${cs.category.color}"></div>
        <div class="card-icon" style="background:${cs.category.color}">${cs.category.icon}</div>
        <div class="card-info">
          <div class="card-top">
            <div>
              <div class="card-name">${cs.category.label}</div>
              <div class="card-meta">Fant ${cs.count} steder · mål: ${cs.target}</div>
            </div>
            <span class="card-score" style="color:${cs.category.color}" data-score="${cs.score}">0</span>
          </div>
          <div class="card-bar-bg">
            <div class="card-bar-fill" style="background:${cs.category.color}" data-target="${cs.score}"></div>
          </div>
          ${insight ? `<div class="card-insight">${insight}</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  container.querySelectorAll('.category-card').forEach((card, i) => {
    setTimeout(() => {
      card.classList.add('visible');
      const scoreEl = card.querySelector('.card-score');
      if (scoreEl) animateNumber(scoreEl, parseInt(scoreEl.dataset.score), 900);
      const bar = card.querySelector('.card-bar-fill');
      if (bar) setTimeout(() => { bar.style.width = bar.dataset.target + '%'; }, 200);
      const insight = card.querySelector('.card-insight');
      if (insight) setTimeout(() => insight.classList.add('visible'), 600);
    }, baseDelay + i * 110);
  });
}

// ─────────────────────────────────────────────
// CATEGORY TOGGLES (map filter)
// ─────────────────────────────────────────────

function renderToggles(categoryScores) {
  const container = document.getElementById('category-toggles');
  if (!container) return;

  container.innerHTML = `
    <div class="toggle-row-label">Vis på kart</div>
    <div class="toggle-buttons-wrap" id="toggle-buttons-wrap"></div>
  `;

  const wrap = document.getElementById('toggle-buttons-wrap');
  categoryScores.forEach(cs => {
    const btn = document.createElement('button');
    btn.className = 'toggle-btn active';
    btn.dataset.id = cs.category.id;
    btn.title = `Vis kun ${cs.category.label}`;
    btn.innerHTML = `
      <span class="toggle-icon" style="background:${cs.category.color}">${cs.category.icon}</span>
      <span class="toggle-label-text">${cs.category.label}</span>
      <span class="toggle-count">${cs.count}</span>
    `;
    btn.addEventListener('click', () => {
      const allBtns = wrap.querySelectorAll('.toggle-btn');
      const activeBtns = [...allBtns].filter(b => b.classList.contains('active'));
      const isAlreadySolo = btn.classList.contains('active') && activeBtns.length === 1;

      if (isAlreadySolo) {
        // Re-click solo → show all
        allBtns.forEach(b => {
          b.classList.add('active'); b.classList.remove('inactive');
          MapModule.toggleCategory(b.dataset.id, true);
        });
        document.querySelectorAll('.category-card').forEach(c => c.classList.remove('dimmed'));
      } else {
        // Solo: show only this one
        allBtns.forEach(b => {
          const isSelf = b === btn;
          b.classList.toggle('active', isSelf);
          b.classList.toggle('inactive', !isSelf);
          MapModule.toggleCategory(b.dataset.id, isSelf);
        });
        document.querySelectorAll('.category-card').forEach(c => {
          c.classList.toggle('dimmed', c.dataset.category !== cs.category.id);
        });
      }
    });
    wrap.appendChild(btn);
  });
}

// ─────────────────────────────────────────────
// LEGEND
// ─────────────────────────────────────────────

function renderLegend(result) {
  const items = document.getElementById('legend-items');
  const legend = document.getElementById('map-legend');
  const controls = document.getElementById('map-overlay-controls');
  if (!items || !legend || !controls) return;
  items.innerHTML = result.categoryScores.map(cs => `
    <div class="legend-row">
      <span class="legend-dot" style="background:${cs.category.color}"></span>
      <span>${cs.category.label}</span>
      <span class="legend-count">${cs.count}</span>
    </div>
  `).join('');
  setTimeout(() => controls.classList.add('visible'), 900);
}

// ─────────────────────────────────────────────
// COMPARE MODE
// ─────────────────────────────────────────────

function openCompare() {
  compareOpen = true;
  const panel = document.getElementById('compare-panel');
  const mainPanel = document.getElementById('results-panel');
  const toggleBtn = document.getElementById('compare-toggle-btn');
  // Hide main panel, show compare panel in same position
  if (mainPanel) mainPanel.style.display = 'none';
  if (panel) { panel.style.display = 'flex'; }
  if (toggleBtn) toggleBtn.classList.add('active');
  document.getElementById('compare-input')?.focus();
  MapModule.invalidate();
}

function closeCompare() {
  compareOpen = false;
  const panel = document.getElementById('compare-panel');
  const mainPanel = document.getElementById('results-panel');
  const toggleBtn = document.getElementById('compare-toggle-btn');
  if (panel) panel.style.display = 'none';
  if (mainPanel) mainPanel.style.display = 'flex';
  if (toggleBtn) toggleBtn.classList.remove('active');
  // Reset compare body
  const compareBody = document.getElementById('compare-body');
  const compareLoading = document.getElementById('compare-loading');
  if (compareBody) compareBody.style.display = 'none';
  if (compareLoading) compareLoading.style.display = 'none';
  const scoreEl = document.getElementById('compare-gauge-score');
  const fillEl = document.getElementById('compare-gauge-fill');
  if (scoreEl) scoreEl.textContent = '0';
  if (fillEl) { fillEl.style.transition='none'; fillEl.style.strokeDashoffset=490; }
  compareResult = null;
  MapModule.invalidate();
}

async function handleCompareSearch(address) {
  if (!address.trim()) return;
  const loading = document.getElementById('compare-loading');
  const body = document.getElementById('compare-body');
  if (loading) loading.style.display = 'flex';
  if (body) body.style.display = 'none';

  try {
    const cached = loadCache(address);
    let data = cached;
    if (!data) {
      const geo = await geocodeAddress(address);
      data = await fetchNeighborhoodData(geo.lat, geo.lon, geo.display_name);
      saveCache(address, data);
    }
    compareResult = data;
    if (loading) loading.style.display = 'none';
    renderComparePanel(compareResult);
    MapModule.addSecondMarker(compareResult);
  } catch (err) {
    if (loading) loading.style.display = 'none';
    showToast('Feil: ' + (err.message || 'Ukjent feil'), 3500);
  }
}

function renderComparePanel(result) {
  // Update address bar
  const addrEl = document.querySelector('#compare-panel .compare-search-inline input');
  // Show body
  const body = document.getElementById('compare-body');
  if (body) body.style.display = 'block';

  // Render gauge
  const scoreEl = document.getElementById('compare-gauge-score');
  const fillEl = document.getElementById('compare-gauge-fill');
  const verdictEl = document.getElementById('compare-gauge-verdict');
  if (scoreEl && fillEl && verdictEl) {
    verdictEl.textContent = result.verdict;
    const circ = 2 * Math.PI * 78;
    fillEl.style.strokeDasharray = circ;
    fillEl.style.strokeDashoffset = circ;
    fillEl.style.transition = 'none';
    requestAnimationFrame(() => {
      setTimeout(() => {
        fillEl.style.transition = `stroke-dashoffset 1.5s cubic-bezier(0.16,1,0.3,1), stroke .5s ease`;
        fillEl.style.strokeDashoffset = circ - (result.totalScore / 100) * circ;
        fillEl.style.stroke = interpolateColor(result.totalScore);
      }, 300);
      animateNumber(scoreEl, result.totalScore, 1500, val => {
        scoreEl.style.color = interpolateColor(val);
      });
      setTimeout(() => verdictEl.classList.add('visible'), 1100);
    });
  }

  // Render radar
  setTimeout(() => renderRadar(result.categoryScores, 'compare-radar-svg'), 300);

  // Render cards
  renderCards(result.categoryScores, 'compare-category-cards', 800);
}

// ─────────────────────────────────────────────
// COPY SHARE TEXT
// ─────────────────────────────────────────────

function copyResult(result) {
  const lines = [
    `Nabolagsscore: ${result.totalScore}/100 (${result.verdict}) 🇳🇴`,
    `📍 ${result.address}`,
    '',
    ...result.categoryScores.map(cs => `${cs.category.icon} ${cs.category.label}: ${cs.score}%`),
    '',
    `Sjekk ditt nabolag → ${window.location.origin}${window.location.pathname}?q=${encodeURIComponent(result.address)}`,
  ];
  navigator.clipboard.writeText(lines.join('\n'))
      .then(() => showToast('Resultat kopiert! 📋'))
      .catch(() => showToast('Kunne ikke kopiere'));
}

// ─────────────────────────────────────────────
// SHOW RESULTS
// ─────────────────────────────────────────────

function showResults(result) {
  currentResult = result;
  setState('results');
  updateURL(result.address);
  addToHistory(result.address, result.totalScore);

  document.getElementById('panel-address-text').textContent = result.address;

  MapModule.init(result, RADIUS);
  renderToggles(result.categoryScores);
  setTimeout(() => document.getElementById('map-overlay-controls')?.classList.add('visible'), 900);

  const panel = document.getElementById('results-panel');
  panel?.classList.remove('visible');
  requestAnimationFrame(() => setTimeout(() => panel?.classList.add('visible'), 200));

  renderGauge(result);
  setTimeout(() => renderRadar(result.categoryScores), 300);
  renderCards(result.categoryScores);

  // Reset compare if open
  if (compareOpen) closeCompare();
}

// ─────────────────────────────────────────────
// RESET
// ─────────────────────────────────────────────

function resetApp() {
  currentResult = null;
  compareResult = null;
  lastSearchAddress = '';
  MapModule.destroy();

  if (compareOpen) closeCompare();

  document.getElementById('results-panel')?.classList.remove('visible');
  document.getElementById('map-overlay-controls')?.classList.remove('visible');

  const fill = document.getElementById('gauge-fill');
  if (fill) { fill.style.transition = 'none'; fill.style.strokeDashoffset = 490; }
  document.getElementById('gauge-verdict')?.classList.remove('visible');
  const meta = document.getElementById('gauge-meta');
  if (meta) { meta.classList.remove('visible'); meta.textContent = ''; }
  const scoreEl = document.getElementById('gauge-score');
  if (scoreEl) scoreEl.textContent = '0';

  const input = document.getElementById('address-input');
  input.value = '';
  document.getElementById('search-btn').disabled = true;

  updateURL('');
  renderHistory();
  setState('idle');
  setTimeout(() => input.focus(), 300);
}

// ─────────────────────────────────────────────
// MAIN SEARCH
// ─────────────────────────────────────────────

async function handleSearch(address) {
  if (!address.trim()) return;
  lastSearchAddress = address;

  const cached = loadCache(address);
  if (cached) {
    setState('loading');
    setLoadingStep('geocoding');
    await sleep(400);
    setLoadingStep('fetching');
    await sleep(400);
    setLoadingStep('calculating');
    await sleep(600);
    showResults(cached);
    showToast('Hentet fra cache ⚡');
    return;
  }

  setState('loading');
  setLoadingStep('geocoding');

  try {
    const geo = await geocodeAddress(address);
    setLoadingStep('fetching');
    const data = await fetchNeighborhoodData(geo.lat, geo.lon, geo.display_name);
    setLoadingStep('calculating');
    await sleep(1000);
    saveCache(address, data);
    showResults(data);
  } catch (err) {
    document.getElementById('error-message').textContent = err.message || 'En uventet feil oppstod.';
    setState('error');
  }
}

// ─────────────────────────────────────────────
// INIT
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('address-input');
  const searchBtn = document.getElementById('search-btn');

  input.addEventListener('input', () => {
    searchBtn.disabled = !input.value.trim();
  });

  document.getElementById('search-form').addEventListener('submit', e => {
    e.preventDefault();
    handleSearch(input.value.trim());
  });

  document.getElementById('reset-btn').addEventListener('click', resetApp);
  document.getElementById('logo-btn').addEventListener('click', resetApp);
  document.getElementById('logo-btn').addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') resetApp();
  });
  document.getElementById('error-retry-btn').addEventListener('click', () => handleSearch(lastSearchAddress));
  document.getElementById('error-back-btn').addEventListener('click', resetApp);

  // Compare
  document.getElementById('compare-toggle-btn').addEventListener('click', () => {
    compareOpen ? closeCompare() : openCompare();
  });
  document.getElementById('close-compare-btn').addEventListener('click', closeCompare);

  const compareInput = document.getElementById('compare-input');
  const compareSearchBtn = document.getElementById('compare-search-btn');
  compareInput.addEventListener('input', () => {
    compareSearchBtn.disabled = !compareInput.value.trim();
  });
  document.getElementById('compare-form').addEventListener('submit', e => {
    e.preventDefault();
    handleCompareSearch(compareInput.value.trim());
  });

  // Radius selector
  document.querySelectorAll('.radius-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.radius-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      RADIUS = parseInt(btn.dataset.radius);
      const label = RADIUS >= 1000 ? (RADIUS / 1000) + ' km' : RADIUS + ' m';
      const subtextEl = document.getElementById('subtext-radius');
      const statsEl = document.getElementById('stats-radius');
      if (subtextEl) subtextEl.textContent = label;
      if (statsEl) statsEl.textContent = label;
    });
  });

  // Load from URL query param
  renderHistory();
  const urlAddress = getURLAddress();
  if (urlAddress) {
    input.value = urlAddress;
    searchBtn.disabled = false;
    handleSearch(urlAddress);
  }
});