/* ============================================================
   NABOLAGSGUIDEN — app.js
   Vanilla JS | Nominatim + Overpass API | Leaflet map
   Improvements: caching, retry, timeout, mobile, animations
   ============================================================ */

'use strict';

// ─────────────────────────────────────────────
// CONSTANTS & CATEGORIES
// ─────────────────────────────────────────────

const RADIUS = 3000; // 3 km
const CACHE_TTL = 1000 * 60 * 30; // 30 min cache
const OVERPASS_TIMEOUT = 45_000; // 45s before retry
const MAX_RETRIES = 2;

const CATEGORIES = [
  {
    id: 'dagligvare',
    label: 'Dagligvare',
    color: '#39D353',
    target: 3,
    icon: '🛒',
    match: (t) => ['supermarket','convenience','grocery','food'].includes(t.shop || ''),
  },
  {
    id: 'transport',
    label: 'Kollektivtransport',
    color: '#4FC3F7',
    target: 5,
    icon: '🚌',
    match: (t) =>
      t.highway === 'bus_stop' ||
      ['tram_stop','station'].includes(t.railway || '') ||
      t.amenity === 'bus_station',
  },
  {
    id: 'skole',
    label: 'Skoler & barnehager',
    color: '#FFB74D',
    target: 2,
    icon: '🏫',
    match: (t) => ['school','kindergarten','college'].includes(t.amenity || ''),
  },
  {
    id: 'helse',
    label: 'Helse & apotek',
    color: '#F06292',
    target: 2,
    icon: '🏥',
    match: (t) => ['pharmacy','hospital','clinic','doctors','dentist'].includes(t.amenity || ''),
  },
  {
    id: 'park',
    label: 'Parker & friluft',
    color: '#81C784',
    target: 2,
    icon: '🌳',
    match: (t) => ['park','playground','sports_centre','pitch'].includes(t.leisure || ''),
  },
  {
    id: 'restaurant',
    label: 'Mat & kafé',
    color: '#CE93D8',
    target: 5,
    icon: '☕',
    match: (t) => ['restaurant','cafe','fast_food','bar'].includes(t.amenity || ''),
  },
];

// ─────────────────────────────────────────────
// STATE
// ─────────────────────────────────────────────

let currentResult = null;
let mapInstance = null;
let coordCycleInterval = null;

// ─────────────────────────────────────────────
// CACHE HELPERS
// ─────────────────────────────────────────────

function cacheKey(address) {
  return 'nabolag_' + address.trim().toLowerCase().replace(/\s+/g, '_');
}

function saveCache(address, data) {
  try {
    localStorage.setItem(cacheKey(address), JSON.stringify({ ts: Date.now(), data }));
  } catch (_) {}
}

function loadCache(address) {
  try {
    const raw = localStorage.getItem(cacheKey(address));
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (Date.now() - ts > CACHE_TTL) { localStorage.removeItem(cacheKey(address)); return null; }
    return data;
  } catch (_) { return null; }
}

// ─────────────────────────────────────────────
// API — Geocode
// ─────────────────────────────────────────────

async function geocodeAddress(address) {
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(address)}&format=json&limit=1&countrycodes=no`;
  const res = await fetchWithTimeout(url, {
    headers: { 'Accept-Language': 'no,nb,nn', 'User-Agent': 'Nabolagsguiden/1.0' },
  }, 10_000);
  if (!res.ok) throw new Error('Kunne ikke koble til karttjenesten.');
  const data = await res.json();
  if (!data || data.length === 0) throw new Error('Fant ikke adressen. Prøv å inkludere postnummer eller by.');
  return {
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
    display_name: data[0].display_name.split(',').slice(0, 3).join(','),
  };
}

// ─────────────────────────────────────────────
// API — Overpass (with retry)
// ─────────────────────────────────────────────

async function fetchNeighborhoodData(lat, lon, addressName, attempt = 0) {
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

  let res;
  try {
    res = await fetchWithTimeout('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    }, OVERPASS_TIMEOUT);
  } catch (err) {
    if (attempt < MAX_RETRIES) {
      await sleep(2000 * (attempt + 1));
      return fetchNeighborhoodData(lat, lon, addressName, attempt + 1);
    }
    throw new Error('Kartdatatjenesten svarer ikke. Prøv igjen om litt.');
  }

  if (!res.ok) {
    if (attempt < MAX_RETRIES) {
      await sleep(2000 * (attempt + 1));
      return fetchNeighborhoodData(lat, lon, addressName, attempt + 1);
    }
    throw new Error('Kunne ikke hente nabolagsdata. Tjenesten kan være nede.');
  }

  const data = await res.json();
  const elements = data.elements || [];

  // Process into categories
  const categoryScores = CATEGORIES.map(cat => ({ category: cat, score: 0, count: 0, places: [] }));

  elements.forEach(el => {
    if (!el.tags) return;
    const idx = CATEGORIES.findIndex(c => c.match(el.tags));
    if (idx === -1) return;

    const lat2 = el.lat || el.center?.lat;
    const lon2 = el.lon || el.center?.lon;
    if (!lat2 || !lon2) return;

    const cat = CATEGORIES[idx];
    const name = el.tags.name || el.tags.brand || cat.label;
    const street = el.tags['addr:street'] || '';
    const num = el.tags['addr:housenumber'] || '';
    const addr = street ? `${street} ${num}`.trim() : 'Adresse ikke oppgitt';

    categoryScores[idx].places.push({ id: el.id, lat: lat2, lon: lon2, name, address: addr, categoryId: cat.id, categoryColor: cat.color });
    categoryScores[idx].count++;
  });

  let total = 0;
  categoryScores.forEach(cs => {
    cs.score = Math.min(100, Math.round((cs.count / cs.category.target) * 100));
    total += cs.score;
  });

  const totalScore = Math.round(total / CATEGORIES.length);

  return { address: addressName, lat, lon, totalScore, verdict: getVerdict(totalScore), categoryScores };
}

function getVerdict(score) {
  if (score >= 80) return 'Utmerket nabolag';
  if (score >= 65) return 'Meget godt nabolag';
  if (score >= 50) return 'Godt nabolag';
  if (score >= 35) return 'Gjennomsnittlig nabolag';
  return 'Begrenset nabolag';
}

// ─────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────

function fetchWithTimeout(url, options = {}, ms = 15_000) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), ms);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(id));
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function interpolateColor(val) {
  // terracotta(196,112,75) → amber(212,145,94) → forest(45,95,63)
  if (val < 50) {
    const t = val / 50;
    return `rgb(${Math.round(196 + 16*t)}, ${Math.round(112 + 33*t)}, ${Math.round(75 + 19*t)})`;
  } else {
    const t = (val - 50) / 50;
    return `rgb(${Math.round(212 - 167*t)}, ${Math.round(145 - 50*t)}, ${Math.round(94 - 31*t)})`;
  }
}

function animateNumber(el, end, duration = 1400, onStep) {
  let start = null;
  function step(ts) {
    if (!start) start = ts;
    const progress = Math.min((ts - start) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 4); // easeOutQuart
    const val = Math.round(ease * end);
    el.textContent = val;
    if (onStep) onStep(val);
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

// ─────────────────────────────────────────────
// STATE MACHINE
// ─────────────────────────────────────────────

function setStep(name) {
  // Hide all
  document.querySelectorAll('.state').forEach(el => el.classList.remove('active'));
  // Show target
  const el = document.getElementById(`state-${name}`);
  if (el) el.classList.add('active');

  // Header style
  const header = document.getElementById('site-header');
  const resetBtn = document.getElementById('reset-btn');
  if (name === 'results') {
    header.classList.add('scrolled');
    resetBtn.style.display = 'flex';
  } else {
    header.classList.remove('scrolled');
    resetBtn.style.display = 'none';
  }

  // Stop coord cycling if leaving loading
  if (name !== 'loading' && coordCycleInterval) {
    clearInterval(coordCycleInterval);
    coordCycleInterval = null;
  }
}

// ─────────────────────────────────────────────
// LOADING STEPS UI
// ─────────────────────────────────────────────

const STEPS = ['geocoding', 'fetching', 'calculating'];

function setLoadingStep(active) {
  const activeIdx = STEPS.indexOf(active);
  STEPS.forEach((id, i) => {
    const el = document.querySelector(`.loading-step[data-step="${id}"]`);
    if (!el) return;
    el.classList.toggle('active', i === activeIdx);
    el.classList.toggle('done', i < activeIdx);
  });

  // Animate connecting line
  const fill = document.getElementById('step-line-fill');
  if (fill) {
    const pct = activeIdx === 0 ? 0 : activeIdx === 1 ? 50 : 100;
    fill.style.height = `${pct}%`;
  }

  // Coordinate cycling for geocoding step
  const coordEl = document.getElementById('step-coords');
  if (coordEl) {
    if (active === 'geocoding') {
      coordEl.classList.add('visible');
      coordCycleInterval = setInterval(() => {
        coordEl.textContent = `${(58 + Math.random() * 12).toFixed(4)}, ${(4 + Math.random() * 26).toFixed(4)}`;
      }, 100);
    } else {
      coordEl.classList.remove('visible');
      clearInterval(coordCycleInterval);
    }
  }
}

// ─────────────────────────────────────────────
// MAP
// ─────────────────────────────────────────────

function initMap(result) {
  const container = document.getElementById('map-container');

  // Destroy existing
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  mapInstance = L.map(container, { zoomControl: false, attributionControl: false })
    .setView([result.lat, result.lon], 14);

  L.control.zoom({ position: 'bottomleft' }).addTo(mapInstance);
  L.control.attribution({ position: 'bottomright' }).addTo(mapInstance);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 20,
  }).addTo(mapInstance);

  // Animated radius circle
  setTimeout(() => {
    const circle = L.circle([result.lat, result.lon], {
      radius: 0, color: '#2D5F3F', weight: 1.5,
      opacity: 0.4, fillColor: '#2D5F3F', fillOpacity: 0.05, dashArray: '5 9',
    }).addTo(mapInstance);

    let cur = 0;
    const target = RADIUS;
    const step = target / 40;
    function grow() {
      cur = Math.min(cur + step, target);
      circle.setRadius(cur);
      if (cur < target) requestAnimationFrame(grow);
    }
    requestAnimationFrame(grow);
  }, 600);

  // Home marker
  const homeIcon = L.divIcon({
    className: 'map-home-marker',
    html: '',
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });

  L.marker([result.lat, result.lon], { icon: homeIcon, zIndexOffset: 1000 })
    .addTo(mapInstance)
    .bindPopup(`
      <div style="font-family:'DM Sans',sans-serif">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#2D5F3F;margin-bottom:4px">Søkt adresse</div>
        <div style="font-weight:500;font-size:13px">${result.address}</div>
      </div>
    `);

  // POI markers
  result.categoryScores.forEach(cs => {
    cs.places.forEach(place => {
      const icon = L.divIcon({
        className: 'map-poi-marker',
        html: `<div style="background:${place.categoryColor};width:100%;height:100%;border-radius:50%"></div>`,
        iconSize: [13, 13],
        iconAnchor: [6, 6],
      });
      L.marker([place.lat, place.lon], { icon })
        .addTo(mapInstance)
        .bindPopup(`
          <div style="font-family:'DM Sans',sans-serif">
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
              <span style="font-size:16px">${cs.category.icon}</span>
              <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${place.categoryColor}">${cs.category.label}</span>
            </div>
            <div style="font-weight:500;font-size:13px;margin-bottom:3px">${place.name}</div>
            <div style="font-size:12px;color:#7d7368">${place.address}</div>
          </div>
        `);
    });
  });

  // Invalidate size after layout
  [50, 300, 700].forEach(ms => setTimeout(() => mapInstance?.invalidateSize(), ms));
}

// ─────────────────────────────────────────────
// LEGEND
// ─────────────────────────────────────────────

function renderLegend(result) {
  const container = document.getElementById('legend-items');
  const legend = document.getElementById('map-legend');
  if (!container || !legend) return;

  container.innerHTML = result.categoryScores.map(cs => `
    <div class="legend-row">
      <span class="legend-dot" style="background:${cs.category.color}"></span>
      <span>${cs.category.label}</span>
      <span class="legend-count">${cs.count}</span>
    </div>
  `).join('');

  setTimeout(() => legend.classList.add('visible'), 800);
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

  const circumference = 2 * Math.PI * 78; // r=78
  fillEl.style.strokeDasharray = circumference;
  fillEl.style.strokeDashoffset = circumference;

  // Animate after paint
  requestAnimationFrame(() => {
    setTimeout(() => {
      const offset = circumference - (result.totalScore / 100) * circumference;
      fillEl.style.transition = 'stroke-dashoffset 1.5s cubic-bezier(0.16,1,0.3,1), stroke 0.5s ease';
      fillEl.style.strokeDashoffset = offset;
    }, 300);

    animateNumber(scoreEl, result.totalScore, 1500, val => {
      const color = interpolateColor(val);
      scoreEl.style.color = color;
      fillEl.style.stroke = interpolateColor(result.totalScore);
    });

    setTimeout(() => verdictEl.classList.add('visible'), 1200);
  });
}

// ─────────────────────────────────────────────
// RADAR CHART
// ─────────────────────────────────────────────

function renderRadar(categoryScores) {
  const svg = document.getElementById('radar-svg');
  if (!svg) return;

  const size = 300;
  const center = 150;
  const r = 90;
  const n = categoryScores.length;
  const angleStep = (Math.PI * 2) / n;

  function coords(val, i) {
    const angle = i * angleStep - Math.PI / 2;
    const dist = (val / 100) * r;
    return { x: center + dist * Math.cos(angle), y: center + dist * Math.sin(angle) };
  }

  // Grid levels
  let html = '';
  [0.33, 0.66, 1].forEach((level, gi) => {
    const pts = Array.from({ length: n }, (_, i) => {
      const { x, y } = coords(level * 100, i);
      return `${x},${y}`;
    }).join(' ');
    html += `<polygon points="${pts}" fill="none" stroke="#EAE0D5" stroke-width="1"
      style="opacity:0;transform-origin:${center}px ${center}px;transform:scale(0.5);
             transition:opacity .6s ease ${gi*150}ms,transform .6s ease ${gi*150}ms"/>`;
  });

  // Axis lines
  for (let i = 0; i < n; i++) {
    const { x, y } = coords(100, i);
    html += `<line x1="${center}" y1="${center}" x2="${x}" y2="${y}" stroke="#EAE0D5" stroke-width="1"
      style="opacity:0;transition:opacity .6s ease 500ms"/>`;
  }

  // Data polygon — start collapsed at center
  const centerPts = Array.from({ length: n }, () => `${center},${center}`).join(' ');
  const dataPts = categoryScores.map((cs, i) => {
    const { x, y } = coords(cs.score, i);
    return `${x},${y}`;
  }).join(' ');

  html += `<polygon id="radar-fill" points="${centerPts}" fill="#2D5F3F" fill-opacity="0.15"
    stroke="#2D5F3F" stroke-width="2" stroke-linejoin="round"/>`;

  // Data points
  categoryScores.forEach((cs, i) => {
    const { x, y } = coords(cs.score, i);
    html += `<circle cx="${x}" cy="${y}" r="5" fill="${cs.category.color}"
      stroke="#fff" stroke-width="1.5"
      style="opacity:0;transform-origin:${x}px ${y}px;transform:scale(0);
             transition:opacity .3s ease ${1200+i*80}ms,transform .4s cubic-bezier(.17,.67,.4,1.8) ${1200+i*80}ms"/>`;
  });

  // Labels
  categoryScores.forEach((cs, i) => {
    const { x, y } = coords(130, i);
    let anchor = 'middle';
    if (x < center - 10) anchor = 'end';
    if (x > center + 10) anchor = 'start';
    html += `<text x="${x}" y="${y}" text-anchor="${anchor}" dominant-baseline="middle"
      font-family="DM Sans,sans-serif" font-size="10" fill="#7d7368"
      style="opacity:0;transition:opacity .4s ease ${1500+i*80}ms">
      ${cs.category.icon} ${cs.category.label}
    </text>`;
  });

  svg.innerHTML = html;

  // Trigger animations
  requestAnimationFrame(() => {
    setTimeout(() => {
      svg.querySelectorAll('polygon:not(#radar-fill), line').forEach(el => {
        el.style.opacity = '1';
        el.style.transform = 'scale(1)';
      });

      // Morph data polygon
      setTimeout(() => {
        const fill = document.getElementById('radar-fill');
        if (fill) {
          fill.setAttribute('points', dataPts);
          fill.style.transition = 'points 1.2s cubic-bezier(0.16,1,0.3,1)';
        }
        svg.querySelectorAll('circle, text').forEach(el => {
          el.style.opacity = '1';
          el.style.transform = 'scale(1)';
        });
      }, 800);
    }, 100);
  });
}

// ─────────────────────────────────────────────
// CATEGORY CARDS
// ─────────────────────────────────────────────

function renderCards(categoryScores) {
  const container = document.getElementById('category-cards');
  if (!container) return;

  container.innerHTML = categoryScores.map((cs, i) => `
    <div class="category-card" data-delay="${i}">
      <div class="card-accent" style="background:${cs.category.color}"></div>
      <div class="card-icon" style="background:${cs.category.color}18">${cs.category.icon}</div>
      <div class="card-info">
        <div class="card-top">
          <div>
            <div class="card-name">${cs.category.label}</div>
            <div class="card-meta">Fant ${cs.count} av ${cs.category.target} mål</div>
          </div>
          <span class="card-score" style="color:${cs.category.color}" data-score="${cs.score}">0</span>
        </div>
        <div class="card-bar-bg">
          <div class="card-bar-fill" style="background:${cs.category.color}" data-target="${cs.score}"></div>
        </div>
      </div>
    </div>
  `).join('');

  // Staggered entrance + animate bars and numbers
  container.querySelectorAll('.category-card').forEach((card, i) => {
    setTimeout(() => {
      card.classList.add('visible');

      // Animate score number
      const scoreEl = card.querySelector('.card-score');
      if (scoreEl) animateNumber(scoreEl, parseInt(scoreEl.dataset.score), 900);

      // Animate progress bar
      const bar = card.querySelector('.card-bar-fill');
      if (bar) {
        setTimeout(() => { bar.style.width = bar.dataset.target + '%'; }, 200);
      }
    }, 800 + i * 120);
  });
}

// ─────────────────────────────────────────────
// COPY / SHARE
// ─────────────────────────────────────────────

function copyResult(result) {
  const lines = [
    `Nabolagsscore: ${result.totalScore}/100 (${result.verdict}) 🇳🇴`,
    `📍 ${result.address}`,
    '',
    ...result.categoryScores.map(cs => `${cs.category.icon} ${cs.category.label}: ${cs.score}%`),
    '',
    'Sjekk ditt nabolag på Nabolagsguiden!',
  ];
  navigator.clipboard.writeText(lines.join('\n')).then(() => {
    const btn = document.getElementById('copy-btn');
    if (!btn) return;
    const original = btn.innerHTML;
    btn.textContent = '✓ Kopiert!';
    btn.style.color = '#2D5F3F';
    setTimeout(() => { btn.innerHTML = original; btn.style.color = ''; }, 2200);
  }).catch(() => {});
}

// ─────────────────────────────────────────────
// SHOW RESULTS
// ─────────────────────────────────────────────

function showResults(result) {
  currentResult = result;
  setStep('results');

  // Address bar
  const addrEl = document.getElementById('panel-address-text');
  if (addrEl) addrEl.textContent = result.address;

  // Map
  initMap(result);
  renderLegend(result);

  // Panel
  const panel = document.getElementById('results-panel');
  if (panel) {
    panel.classList.remove('visible');
    requestAnimationFrame(() => {
      setTimeout(() => panel.classList.add('visible'), 200);
    });
  }

  // Charts / cards
  renderGauge(result);
  setTimeout(() => renderRadar(result.categoryScores), 300);
  renderCards(result.categoryScores);
}

// ─────────────────────────────────────────────
// RESET
// ─────────────────────────────────────────────

function resetApp() {
  currentResult = null;

  if (mapInstance) { mapInstance.remove(); mapInstance = null; }

  const panel = document.getElementById('results-panel');
  if (panel) panel.classList.remove('visible');

  const legend = document.getElementById('map-legend');
  if (legend) legend.classList.remove('visible');

  const gauge = document.getElementById('gauge-fill');
  if (gauge) { gauge.style.transition = 'none'; gauge.style.strokeDashoffset = 490; }

  const verdict = document.getElementById('gauge-verdict');
  if (verdict) verdict.classList.remove('visible');

  const scoreEl = document.getElementById('gauge-score');
  if (scoreEl) scoreEl.textContent = '0';

  document.getElementById('address-input').value = '';
  document.getElementById('search-btn').disabled = true;
  document.getElementById('address-input').focus();

  setStep('idle');
}

// ─────────────────────────────────────────────
// MAIN SEARCH FLOW
// ─────────────────────────────────────────────

async function handleSearch(address) {
  if (!address.trim()) return;

  // Check cache first
  const cached = loadCache(address);
  if (cached) {
    await sleep(600); // Brief animation feel
    showResults(cached);
    return;
  }

  setStep('loading');
  setLoadingStep('geocoding');

  try {
    const geo = await geocodeAddress(address);
    setLoadingStep('fetching');

    const data = await fetchNeighborhoodData(geo.lat, geo.lon, geo.display_name);
    setLoadingStep('calculating');

    await sleep(1200); // Let calculating animation breathe
    saveCache(address, data);
    showResults(data);

  } catch (err) {
    const msg = document.getElementById('error-message');
    if (msg) msg.textContent = err.message || 'En uventet feil oppstod.';
    setStep('error');
  }
}

// ─────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('address-input');
  const form = document.getElementById('search-form');
  const searchBtn = document.getElementById('search-btn');

  // Enable button when input has value
  input.addEventListener('input', () => {
    searchBtn.disabled = !input.value.trim();
  });

  // Enter key / form submit
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    handleSearch(input.value.trim());
  });

  // Reset buttons
  document.getElementById('reset-btn').addEventListener('click', resetApp);
  document.getElementById('logo-btn').addEventListener('click', resetApp);
  document.getElementById('logo-btn').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') resetApp(); });
  document.getElementById('panel-reset-btn').addEventListener('click', resetApp);
  document.getElementById('error-retry-btn').addEventListener('click', () => setStep('idle'));

  // Copy
  document.getElementById('copy-btn').addEventListener('click', () => {
    if (currentResult) copyResult(currentResult);
  });
});
