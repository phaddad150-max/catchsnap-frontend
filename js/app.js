const API_BASE = window.CATCHSNAP_API || 'http://localhost:3001/api/v1';
const BRAND = '#3779EC';
const BRAND_DARK = '#2856C7';
const EASY_COLOR = '#22c55e';

let currentFish = null;
let selectedSpot = null;
let journalEntries = JSON.parse(localStorage.getItem('journalEntries') || '[]');
let map = null;
let userMarker = null;
let userLat = null;
let userLng = null;
const maxDistanceKm = 50;
let legalMarkers = [];
let protectionMarkers = [];
let mapFilter = 'all';
let difficultyFilter = null;

let fishData = [];
let legalFishingSpots = [];
let protectedAreas = [];
let discoverPlaces = [];
let discoverMarkers = [];
let categoryFilter = null;
let placesLoaded = false;

const PAGES = ['step-upload', 'step-analyzing', 'step-results', 'step-map', 'step-journal', 'step-legal'];

/** Resize image client-side before upload (max edge 1280px, JPEG ~0.82). */
function resizeImageFile(file, maxEdge = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read image'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image'));
      img.onload = () => {
        let { width, height } = img;
        if (width > maxEdge || height > maxEdge) {
          if (width >= height) {
            height = Math.round((height * maxEdge) / width);
            width = maxEdge;
          } else {
            width = Math.round((width * maxEdge) / height);
            height = maxEdge;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function loadJson(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed ${path}`);
  return res.json();
}

async function apiFetch(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

function fishDisplayName(fish) {
  return getFishDisplayName(fish);
}

async function loadAppData() {
  try {
    const [examples, legal, protected_] = await Promise.all([
      apiFetch('/analyze/examples'),
      apiFetch('/map/legal'),
      apiFetch('/map/protected'),
    ]);
    fishData = examples.data;
    legalFishingSpots = legal.data;
    protectedAreas = protected_.data;
  } catch {
    [fishData, legalFishingSpots, protectedAreas] = await Promise.all([
      loadJson('data/fish.json'),
      loadJson('data/legal-spots.json'),
      loadJson('data/protected-areas.json'),
    ]);
  }
}

function renderExampleFish() {
  const grid = document.getElementById('example-fish-grid');
  if (!grid) return;
  grid.innerHTML = fishData.slice(0, 3).map((fish) => `
    <button type="button" data-example-index="${fish.id}" class="fish-card">
      <img src="${fish.image}" alt="${fishDisplayName(fish)}" loading="lazy">
      <div class="fish-card-label">${fishDisplayName(fish)}</div>
    </button>`).join('');
  grid.querySelectorAll('[data-example-index]').forEach((btn) => {
    btn.addEventListener('click', () => selectExampleFish(+btn.dataset.exampleIndex));
  });
}

function formatJournalDate(isoOrStr) {
  try {
    const d = new Date(isoOrStr);
    const locale = getCurrentLang() === 'gr' ? 'el-GR' : 'en-US';
    return d.toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return isoOrStr;
  }
}

function renderJournalPage() {
  const list = document.getElementById('journal-list');
  const empty = document.getElementById('journal-empty');
  const countLabel = document.getElementById('journal-count-label');
  if (!list || !empty || !countLabel) return;

  const count = journalEntries.length;
  countLabel.textContent = t('catchesLogged', count);

  if (count === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = journalEntries.map((entry) => {
    const isLegal = entry.lengthValue >= entry.minLegalLength;
    const date = formatJournalDate(entry.date || entry.addedAt);
    const name = getCurrentLang() === 'gr' && entry.greek_name ? entry.greek_name : entry.species;
    return `
      <article class="journal-card" data-entry-id="${entry.id}">
        <div class="journal-thumb"><img src="${entry.image}" alt="${name}"></div>
        <div class="flex-1 min-w-0 pr-6">
          <div class="species-name">${name}</div>
          <div class="journal-meta"><i class="fa-regular fa-calendar"></i>${date}</div>
          <div class="journal-meta"><i class="fa-solid fa-location-dot"></i>${entry.location || 'Greece'}</div>
          <span class="legal-badge ${isLegal ? '' : 'below'}">
            <i class="fa-solid fa-check"></i>${isLegal ? t('legalBadge') : t('belowMinLabel')}
          </span>
        </div>
        <button type="button" class="journal-delete" data-delete-id="${entry.id}" aria-label="Delete">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </article>`;
  }).join('');

  list.querySelectorAll('.journal-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteJournalEntry(+btn.dataset.deleteId));
  });
}

async function runAnalysis(exampleId, customImage) {
  const body = {};
  if (exampleId !== undefined && exampleId !== null && !customImage) {
    body.exampleId = exampleId;
  }
  if (selectedSpot) {
    body.spotName = selectedSpot.name;
    body.spotRegion = selectedSpot.region;
  }
  if (userLat != null && userLng != null) {
    body.lat = userLat;
    body.lng = userLng;
  }
  if (customImage) body.customImage = customImage;

  try {
    const res = await fetch(`${API_BASE}/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json.message || `API ${res.status}`;
      const err = new Error(msg);
      err.code = json.code;
      err.status = res.status;
      throw err;
    }
    return json.data;
  } catch (err) {
    // Offline demo fallback only for example cards — never fake a real upload ID
    if (customImage) throw err;
    const fish = exampleId !== undefined
      ? { ...(fishData.find((f) => f.id === exampleId) || fishData[exampleId]) }
      : null;
    if (!fish) throw err;
    if (selectedSpot) fish.location = `${selectedSpot.name}, ${selectedSpot.region}`;
    return fish;
  }
}

function hideAllSteps() {
  PAGES.forEach((id) => document.getElementById(id)?.classList.add('hidden'));
}

function showSnapUpload() {
  hideAllSteps();
  document.getElementById('step-upload').classList.remove('hidden');
  setNavActive('snap');
}

function selectExampleFish(index) {
  hideAllSteps();
  document.getElementById('step-analyzing').classList.remove('hidden');
  setNavActive('snap');
  runAnalysis(index).then((fish) => {
    currentFish = fish;
    setTimeout(() => showResults(currentFish), 1100);
  });
}

async function handleRealUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  event.target.value = '';

  hideAllSteps();
  document.getElementById('step-analyzing').classList.remove('hidden');
  setNavActive('snap');

  try {
    const dataUrl = await resizeImageFile(file);
    const fish = await runAnalysis(undefined, dataUrl);
    currentFish = fish;
    showResults(currentFish);
  } catch (err) {
    hideAllSteps();
    document.getElementById('step-upload').classList.remove('hidden');
    const msg =
      err.code === 'VISION_NOT_CONFIGURED'
        ? t('visionNotConfigured')
        : err.message || t('identifyFailed');
    showToast(msg);
  }
}

function showResults(fish) {
  hideAllSteps();
  document.getElementById('step-results').classList.remove('hidden');
  setNavActive('snap');

  const displayName = fishDisplayName(fish);
  const scientific = fish.scientific || '';
  document.getElementById('result-species').innerHTML = `${displayName}<div class="text-sm font-normal text-slate-400 italic mt-0.5">${scientific}</div>`;

  const conf = fish.confidence ?? 0;
  const rejected = fish.rejected === true || fish.verdict === 'rejected_non_fish';
  const lowConf = !rejected && (conf < 70 || fish.matched === false);
  document.getElementById('result-confidence').innerHTML = rejected
    ? `<i class="fa-solid fa-ban"></i> ${t('notAFishCatch')}`
    : fish.matched === false
      ? `<i class="fa-solid fa-circle-question"></i> ${t('notIdentified')}`
      : `<i class="fa-solid fa-check-circle"></i> ${t('confidence', conf)}${lowConf ? ` · ${t('lowConfidence')}` : ''}`;

  document.getElementById('result-location').innerHTML = `<i class="fa-solid fa-location-dot text-brand"></i> ${fish.location || 'Greece'}`;
  document.getElementById('result-length').textContent = fish.length || '—';
  document.getElementById('result-eco').textContent = fish.ecoScore != null ? `+${fish.ecoScore}` : '—';
  document.getElementById('result-fish-image').innerHTML = fish.image
    ? `<img src="${fish.image}" class="w-full h-full object-cover" alt="${displayName}">`
    : '';

  const nutrition = fish.nutrition || [];
  document.getElementById('result-nutrition').innerHTML = nutrition.length
    ? nutrition.map((item) => `<div class="flex gap-2"><i class="fa-solid fa-check text-brand text-xs mt-0.5"></i><span>${item}</span></div>`).join('')
    : `<div class="text-slate-400 text-sm">${t('noNutrition')}</div>`;

  const benefits = fish.benefits || [];
  const benefitsEl = document.getElementById('result-benefits');
  if (benefitsEl) {
    benefitsEl.innerHTML = benefits.length
      ? benefits.map((item) => `<div class="flex gap-2"><i class="fa-solid fa-heart-pulse text-brand text-xs mt-0.5"></i><span>${item}</span></div>`).join('')
      : '';
  }
  document.getElementById('benefits-block')?.classList.toggle('hidden', rejected || !benefits.length);

  const warnEl = document.getElementById('result-warning');
  if (warnEl) {
    const showWarn =
      rejected ||
      fish.matched === false ||
      lowConf ||
      fish.verdict === 'restricted' ||
      fish.verdict === 'unknown';
    warnEl.classList.toggle('hidden', !showWarn);
    warnEl.textContent =
      fish.verdictMessage ||
      fish.rejectReason ||
      (lowConf ? t('verifyBeforeRetain') : '');
  }
  if (rejected) {
    document.getElementById('result-nutrition').innerHTML =
      `<div class="text-slate-500 text-sm">${t('uploadFishOnly')}</div>`;
    document.getElementById('result-length').textContent = '—';
    document.getElementById('result-eco').textContent = '—';
  }

  const legal = checkIfLegal(fish);
  const el = document.getElementById('result-legal-status');
  if (rejected) {
    el.innerHTML = `<span class="legal-badge below">${t('notAFishCatch')}</span>`;
  } else if (fish.matched === false || fish.verdict === 'unknown') {
    el.innerHTML = `<span class="legal-badge below">${t('unknownLegal')}</span>`;
  } else if (fish.verdict === 'restricted' || fish.legalStatus === 'Restricted') {
    el.innerHTML = `<span class="legal-badge below">${t('restricted')}</span>`;
  } else if (legal.legal) {
    el.innerHTML = `<span class="legal-badge"><i class="fa-solid fa-check"></i>${t('fullyLegal')}</span><div class="text-[10px] text-brand mt-0.5">${t('aboveMin')}</div>`;
  } else {
    el.innerHTML = `<span class="legal-badge below">${t('belowMin')}</span>`;
  }
}

function checkIfLegal(fish) {
  if (fish.legal === false) return { legal: false };
  if (fish.legal === true && fish.verdict !== 'illegal_size') return { legal: true };
  const isWeight = fish.isWeight || /octopus|kg/i.test(fish.length || '');
  if (isWeight) return { legal: fish.lengthValue >= fish.minLegalLength };
  return { legal: fish.lengthValue >= fish.minLegalLength };
}

function addToJournal() {
  if (!currentFish) return;
  if (currentFish.rejected || currentFish.verdict === 'rejected_non_fish' || currentFish.matched === false) {
    showToast(t('cannotJournalRejected'));
    return;
  }
  const entry = {
    id: Date.now(),
    date: new Date().toISOString(),
    ...currentFish,
    addedAt: new Date().toLocaleDateString(),
    spot: selectedSpot ? selectedSpot.name : null,
  };
  journalEntries.unshift(entry);
  localStorage.setItem('journalEntries', JSON.stringify(journalEntries));
  renderJournalPage();
  showToast(t('addedToJournal'));
}

function showToast(msg) {
  document.querySelector('.app-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = 'app-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function showJournal() {
  hideAllSteps();
  document.getElementById('step-journal').classList.remove('hidden');
  setNavActive('journal');
  renderJournalPage();
}

function deleteJournalEntry(id) {
  if (!confirm(t('deleteConfirm'))) return;
  journalEntries = journalEntries.filter((e) => e.id !== id);
  localStorage.setItem('journalEntries', JSON.stringify(journalEntries));
  renderJournalPage();
  showToast(t('entryRemovedDesc'));
}

function showComplianceModal() {
  const modal = document.getElementById('compliance-modal');
  modal.classList.remove('hidden');
}

function hideComplianceModal() {
  document.getElementById('compliance-modal').classList.add('hidden');
}

function openOfficialPortal() {
  window.open('https://alieia.hcg.gr/', '_blank');
  hideComplianceModal();
}

function getShareCaption() {
  if (!currentFish) return '';
  const name = fishDisplayName(currentFish);
  if (getCurrentLang() === 'gr') {
    return `🎣 Έπιασα ${name} (${currentFish.length}) στην Ελλάδα!
Αναγνωρίστηκε με το CatchSnap AI 🇬🇷
#CatchSnapAI #ΑλιείαΕλλάδα`;
  }
  return `🎣 Caught a ${name} (${currentFish.length}) in Greece!
Identified with CatchSnap AI — the smart fishing app for Greece 🇬🇷
#CatchSnapAI #FishingGreece #GreekFishing`;
}

function showShareModal() {
  if (!currentFish) return;
  document.getElementById('share-preview').textContent = getShareCaption();
  document.getElementById('share-modal').classList.remove('hidden');
}

function hideShareModal() {
  document.getElementById('share-modal').classList.add('hidden');
}

function showMap() {
  hideAllSteps();
  document.getElementById('step-map').classList.remove('hidden');
  setNavActive('map');
  if (!map) initMap();
  else setTimeout(() => map.invalidateSize(), 150);
}

function showLegalGuide() {
  hideAllSteps();
  document.getElementById('step-legal').classList.remove('hidden');
  setNavActive('legal');
}

function setNavActive(tab) {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === tab);
  });
}

function setMapFilter(mode) {
  mapFilter = mode;
  document.getElementById('filter-all')?.classList.toggle('active', mode === 'all');
  const toggle = document.getElementById('legal-only-toggle');
  if (toggle) toggle.checked = mode === 'legal';
  applyMapFilters();
}

function setDifficultyFilter(level) {
  if (difficultyFilter === level) {
    difficultyFilter = null;
    document.getElementById('filter-easy')?.classList.remove('active');
    document.getElementById('filter-moderate')?.classList.remove('active');
  } else {
    difficultyFilter = level;
    document.getElementById('filter-easy')?.classList.toggle('active', level === 'Easy');
    document.getElementById('filter-moderate')?.classList.toggle('active', level === 'Moderate');
    if (level === 'Easy') document.getElementById('filter-moderate')?.classList.remove('active');
    if (level === 'Moderate') document.getElementById('filter-easy')?.classList.remove('active');
  }
  applyMapFilters();
}

function updateMapStatPills() {
  document.getElementById('protected-count').textContent = protectionMarkers.length;
  document.getElementById('legal-count').textContent = legalMarkers.length + discoverMarkers.length;
}

const SPOT_MARKER_COLORS = {
  Easy: { bg: '#10b981', ring: '#d1fae5' },
  Moderate: { bg: '#3b82f6', ring: '#dbeafe' },
  Hard: { bg: '#f59e0b', ring: '#fef3c7' },
};

function createSpotMarkerIcon(difficulty, selected = false) {
  const palette = SPOT_MARKER_COLORS[difficulty] || SPOT_MARKER_COLORS.Easy;
  const size = selected ? 44 : 36;
  const innerR = selected ? 16 : 12;
  const html = `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="${palette.ring}" opacity="0.6"/>
      <circle cx="${size / 2}" cy="${size / 2}" r="${innerR}" fill="${palette.bg}" stroke="white" stroke-width="2.5"/>
      ${selected ? `<circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 1}" fill="none" stroke="${palette.bg}" stroke-width="1.5" opacity="0.5"/>` : ''}
    </svg>`;
  return L.divIcon({
    html,
    className: 'cs-spot-icon',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createProtectedMarkerIcon() {
  const html = `
    <svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="16" cy="16" r="16" fill="#fecaca" opacity="0.5"/>
      <circle cx="16" cy="16" r="11" fill="#ef4444" stroke="white" stroke-width="2"/>
      <path d="M12 12 L20 20 M20 12 L12 20" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
    </svg>`;
  return L.divIcon({
    html,
    className: 'cs-protected-icon',
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

function initMap() {
  map = L.map('map', { zoomControl: true, minZoom: 5, maxZoom: 19 }).setView([38.8, 24.0], 6);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
  map.zoomControl.setPosition('topright');
  loadMapData();
}

function createDiscoverMarkerIcon() {
  const html = `
    <svg width="30" height="30" viewBox="0 0 30 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="15" cy="15" r="15" fill="#e0e7ff" opacity="0.7"/>
      <circle cx="15" cy="15" r="10" fill="#6366f1" stroke="white" stroke-width="2"/>
    </svg>`;
  return L.divIcon({
    html,
    className: 'cs-discover-icon',
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  });
}

function loadMapData() {
  legalMarkers = [];
  protectionMarkers = [];

  protectedAreas.forEach((area) => {
    const marker = L.marker([area.lat, area.lng], {
      icon: createProtectedMarkerIcon(),
      zIndexOffset: 100,
    }).addTo(map);
    const note = escapeHtml(area.note || area.fishing_allowed_note || '');
    const popupHTML = `
      <div class="cs-popup">
        <div class="cs-popup-head protected">
          <div class="cs-popup-kicker">${escapeHtml(t('protectedLegend'))}</div>
          <div class="cs-popup-title">${escapeHtml(area.name)}</div>
          <div class="cs-popup-meta">${escapeHtml(area.region || '')}${area.protection_level ? ` · ${escapeHtml(area.protection_level)}` : ''}</div>
        </div>
        <div class="cs-popup-body">
          ${note ? `<p class="cs-popup-note">${note}</p>` : `<p class="cs-popup-note">${escapeHtml(t('protectedHint'))}</p>`}
        </div>
      </div>`;
    marker.bindPopup(popupHTML, { maxWidth: 280, className: 'cs-leaflet-popup' });
    protectionMarkers.push({ marker, data: area });
  });

  legalFishingSpots.forEach((spot) => {
    const marker = L.marker([spot.lat, spot.lng], {
      icon: createSpotMarkerIcon(spot.difficulty || 'Easy'),
      zIndexOffset: 250,
    }).addTo(map);
    const cat = formatCategory(spot.category);
    const popupHTML = `
      <div class="cs-popup">
        <div class="cs-popup-head">
          <div class="cs-popup-kicker">${escapeHtml(t('verifiedSpot'))}</div>
          <div class="cs-popup-title">${escapeHtml(spot.name)}</div>
          <div class="cs-popup-meta">${escapeHtml(spot.region)} · ${escapeHtml(spot.difficulty || 'Easy')}${cat ? ` · ${escapeHtml(cat)}` : ''}</div>
        </div>
        <div class="cs-popup-body">
          <div class="cs-popup-row"><span>${escapeHtml(t('dailyBagLimit'))}</span><strong>${spot.daily_limit_kg} kg</strong></div>
          <div class="cs-popup-actions">
            <button type="button" class="cs-popup-btn" onclick="getDirections(${spot.lat},${spot.lng});event.stopPropagation();">${escapeHtml(t('directions'))}</button>
            <button type="button" class="cs-popup-btn primary" onclick="logCatchFromSpot(${spot.id});event.stopPropagation();">${escapeHtml(t('logCatchHere'))}</button>
          </div>
          <button type="button" class="cs-popup-link" onclick="showSpotDetails(${spot.id});event.stopPropagation();">${escapeHtml(t('moreInfo'))} →</button>
        </div>
      </div>`;
    marker.bindPopup(popupHTML, { maxWidth: 290, className: 'cs-leaflet-popup' });
    legalMarkers.push({ marker, data: spot });
  });

  updateMapStatPills();
  loadDiscoverPlaces();
}

async function loadDiscoverPlaces() {
  if (!map) return;
  const center = map.getCenter();
  const lat = userLat ?? center.lat;
  const lng = userLng ?? center.lng;
  const params = new URLSearchParams({
    lat: String(lat),
    lng: String(lng),
    radiusKm: String(maxDistanceKm),
  });
  if (categoryFilter) params.set('category', categoryFilter);

  try {
    const json = await apiFetch(`/places?${params}`);
    discoverPlaces = (json.data || []).filter((p) => p.source === 'osm');
    renderDiscoverMarkers();
    placesLoaded = true;
  } catch {
    discoverPlaces = [];
    renderDiscoverMarkers();
  }
}

function renderDiscoverMarkers() {
  discoverMarkers.forEach(({ marker }) => map.removeLayer(marker));
  discoverMarkers = [];

  discoverPlaces.forEach((place) => {
    const marker = L.marker([place.lat, place.lng], {
      icon: createDiscoverMarkerIcon(),
      zIndexOffset: 150,
    }).addTo(map);
    const cat = formatCategory(place.category) || place.category || 'spot';
    const popupHTML = `
      <div class="cs-popup">
        <div class="cs-popup-head discover">
          <div class="cs-popup-kicker">OpenStreetMap</div>
          <div class="cs-popup-title">${escapeHtml(place.name)}</div>
          <div class="cs-popup-meta">${escapeHtml(cat)}</div>
        </div>
        <div class="cs-popup-body">
          <p class="cs-popup-note">${escapeHtml(t('osmDisclaimer'))}</p>
          <button type="button" class="cs-popup-btn primary full" onclick="getDirections(${place.lat},${place.lng});event.stopPropagation();">${escapeHtml(t('directions'))}</button>
        </div>
      </div>`;
    marker.bindPopup(popupHTML, { maxWidth: 280, className: 'cs-leaflet-popup' });
    discoverMarkers.push({ marker, data: place });
  });
  updateMapStatPills();
  applyMapFilters();
}

function setCategoryFilter(cat) {
  categoryFilter = categoryFilter === cat ? null : cat;
  document.querySelectorAll('[data-category]').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.category === (categoryFilter || 'all'));
  });
  applyMapFilters();
  loadDiscoverPlaces();
}

function applyMapFilters() {
  const searchTerm = (document.getElementById('map-search')?.value || '').toLowerCase().trim();
  const legalOnly = document.getElementById('legal-only-toggle')?.checked || mapFilter === 'legal';

  legalMarkers.forEach(({ marker, data: spot }) => {
    const matchesSearch = !searchTerm || spot.name.toLowerCase().includes(searchTerm) || spot.region.toLowerCase().includes(searchTerm);
    const matchesDiff = !difficultyFilter || spot.difficulty === difficultyFilter;
    const matchesCat = !categoryFilter || spot.category === categoryFilter;
    const near = isWithinDistance(marker, userLat, userLng, maxDistanceKm);
    const show = matchesSearch && matchesDiff && matchesCat && near;
    marker.setOpacity(show ? 1 : 0.12);
  });

  discoverMarkers.forEach(({ marker, data: place }) => {
    const matchesSearch = !searchTerm || place.name.toLowerCase().includes(searchTerm);
    const matchesCat = !categoryFilter || place.category === categoryFilter;
    const near = isWithinDistance(marker, userLat, userLng, maxDistanceKm);
    const show = !legalOnly && matchesSearch && matchesCat && near;
    marker.setOpacity(show ? 1 : 0.08);
  });

  protectionMarkers.forEach(({ marker, data: area }) => {
    const matchesSearch = !searchTerm || area.name.toLowerCase().includes(searchTerm) || area.region.toLowerCase().includes(searchTerm);
    const near = isWithinDistance(marker, userLat, userLng, maxDistanceKm);
    const show = !legalOnly && matchesSearch && near;
    marker.setOpacity(show ? 1 : 0.1);
  });
}

function isWithinDistance(marker, lat, lng, maxKm) {
  if (!lat || !lng) return true;
  const p = marker.getLatLng();
  return getDistanceFromLatLonInKm(lat, lng, p.lat, p.lng) <= maxKm;
}

function goToMyLocation() {
  if (!map || !navigator.geolocation) return alert(t('geolocationUnavailable'));
  navigator.geolocation.getCurrentPosition((pos) => {
    userLat = pos.coords.latitude;
    userLng = pos.coords.longitude;
    if (userMarker) map.removeLayer(userMarker);
    userMarker = L.marker([userLat, userLng], {
      icon: L.divIcon({
        className: 'user-location',
        html: `<div style="background:${BRAND};width:14px;height:14px;border:3px solid white;border-radius:50%;box-shadow:0 0 0 2px ${BRAND}"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7],
      }),
    }).addTo(map);
    map.flyTo([userLat, userLng], 10, { duration: 1.2 });
    setTimeout(() => {
      applyMapFilters();
      loadDiscoverPlaces();
    }, 1300);
  }, () => alert(t('geolocationError')));
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let currentModalSpot = null;

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatCategory(cat) {
  if (!cat) return '';
  const map = {
    pier: t('catPier'),
    harbour: t('catHarbour'),
    marina: t('catMarina'),
    rocky_shore: t('catRocky'),
    beach: t('catBeach'),
    promenade: t('catPromenade'),
    fishing: t('catFishing'),
  };
  return map[cat] || cat.replace(/_/g, ' ');
}

function difficultyLabel(d) {
  if (d === 'Easy') return t('easyFilter');
  if (d === 'Moderate') return t('moderateFilter');
  if (d === 'Hard') return t('hardFilter');
  return d || t('easyFilter');
}

async function showSpotDetails(spotId) {
  const spot = legalFishingSpots.find((s) => s.id === spotId);
  if (!spot) return;
  currentModalSpot = spot;
  map?.closePopup();

  const difficulty = spot.difficulty || 'Easy';
  const cat = formatCategory(spot.category);
  document.getElementById('spot-modal-name').textContent = spot.name;
  document.getElementById('spot-modal-region').textContent =
    `${spot.region}${cat ? ` · ${cat}` : ''} · ${spot.fishing_type || t('shoreFishing')}`;

  const badges = document.getElementById('spot-modal-badges');
  if (badges) {
    const diffClass = difficulty === 'Easy' ? 'easy' : difficulty === 'Moderate' ? 'moderate' : '';
    badges.innerHTML = `
      <span class="spot-chip verified"><i class="fa-solid fa-shield-halved"></i> ${escapeHtml(t('verifiedSpot'))}</span>
      <span class="spot-chip ${diffClass}"><i class="fa-solid fa-signal"></i> ${escapeHtml(difficultyLabel(difficulty))}</span>
      ${cat ? `<span class="spot-chip"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(cat)}</span>` : ''}`;
  }

  // Keep chips compact — max 4 allowed + 2 prohibited on one screen
  const allowed = (spot.allowed_gear || []).slice(0, 4)
    .map((g) => `<span class="spot-gear-chip">${escapeHtml(g)}</span>`)
    .join('');
  const prohibited = (spot.prohibited_gear || []).slice(0, 2)
    .map((g) => `<span class="spot-gear-chip off">${escapeHtml(g)}</span>`)
    .join('');
  const gearHtml = `${allowed}${prohibited}` || '—';

  document.getElementById('spot-modal-content').innerHTML = `
    <div class="spot-metrics">
      <div class="spot-metric">
        <div class="spot-metric-icon"><i class="fa-solid fa-weight-hanging"></i></div>
        <div class="spot-metric-copy">
          <div class="spot-metric-label">${escapeHtml(t('dailyBagLimit'))}</div>
          <div class="spot-metric-value">${spot.daily_limit_kg ?? '—'} kg</div>
        </div>
      </div>
      <div class="spot-metric">
        <div class="spot-metric-icon level"><i class="fa-solid fa-signal"></i></div>
        <div class="spot-metric-copy">
          <div class="spot-metric-label">${escapeHtml(t('difficultyLabel'))}</div>
          <div class="spot-metric-value">${escapeHtml(difficultyLabel(difficulty))}</div>
        </div>
      </div>
      <div class="spot-metric" id="spot-metric-temp">
        <div class="spot-metric-icon sea"><i class="fa-solid fa-temperature-half"></i></div>
        <div class="spot-metric-copy">
          <div class="spot-metric-label">${escapeHtml(t('seaTemp'))}</div>
          <div class="spot-metric-value" id="spot-temp-value">…</div>
        </div>
      </div>
      <div class="spot-metric" id="spot-metric-wave">
        <div class="spot-metric-icon wave"><i class="fa-solid fa-water"></i></div>
        <div class="spot-metric-copy">
          <div class="spot-metric-label">${escapeHtml(t('waveHeight'))}</div>
          <div class="spot-metric-value" id="spot-wave-value">…</div>
        </div>
      </div>
    </div>

    <div class="spot-panel">
      <div class="spot-row">
        <i class="fa-regular fa-clock"></i>
        <div class="spot-row-label">${escapeHtml(t('bestTime'))}</div>
        <div class="spot-row-value single">${escapeHtml(spot.best_time || '—')}</div>
      </div>
      <div class="spot-row">
        <i class="fa-solid fa-person-walking"></i>
        <div class="spot-row-label">${escapeHtml(t('accessLabel'))}</div>
        <div class="spot-row-value">${escapeHtml(spot.access || '—')}</div>
      </div>
      <div class="spot-row">
        <i class="fa-solid fa-fish-fins"></i>
        <div class="spot-row-label">${escapeHtml(t('allowedGear'))}</div>
        <div class="spot-row-value"><div class="spot-gear">${gearHtml}</div></div>
      </div>
    </div>

    ${spot.warnings ? `
      <div class="spot-warning">
        <i class="fa-solid fa-triangle-exclamation"></i>
        <span><strong>${escapeHtml(t('spotWarning'))}:</strong> ${escapeHtml(spot.warnings)}</span>
      </div>` : ''}
  `;

  document.getElementById('spot-details-modal').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  try {
    const marine = await apiFetch(`/marine?lat=${spot.lat}&lng=${spot.lng}`);
    const c = marine.current || {};
    const tempEl = document.getElementById('spot-temp-value');
    const waveEl = document.getElementById('spot-wave-value');
    if (tempEl) tempEl.textContent = c.seaTempC != null ? `${c.seaTempC}°C` : '—';
    if (waveEl) waveEl.textContent = c.waveHeightM != null ? `${c.waveHeightM} m` : '—';
  } catch {
    const tempEl = document.getElementById('spot-temp-value');
    const waveEl = document.getElementById('spot-wave-value');
    if (tempEl) tempEl.textContent = '—';
    if (waveEl) waveEl.textContent = '—';
  }
}

function hideSpotDetailsModal() {
  document.getElementById('spot-details-modal').classList.add('hidden');
  currentModalSpot = null;
  document.body.style.overflow = '';
}

function logCatchFromSpotModal() {
  if (!currentModalSpot) return;
  selectedSpot = currentModalSpot;
  hideSpotDetailsModal();
  showSnapUpload();
  showToast(t('spotSelected', selectedSpot.name));
}

function getDirectionsFromModal() {
  if (currentModalSpot) getDirections(currentModalSpot.lat, currentModalSpot.lng);
}

function getDirections(lat, lng) {
  window.open(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`, '_blank');
}

function logCatchFromSpot(spotId) {
  selectedSpot = legalFishingSpots.find((s) => s.id === spotId);
  if (!selectedSpot) return;
  map?.closePopup();
  showSnapUpload();
  showToast(t('spotSelected', selectedSpot.name));
}

function resetCatchSnap() {
  showSnapUpload();
  currentFish = null;
}

window.onLanguageChange = () => {
  renderExampleFish();
  renderJournalPage();
  if (currentFish && !document.getElementById('step-results').classList.contains('hidden')) {
    showResults(currentFish);
  }
};

function setupEventListeners() {
  document.getElementById('nav-map')?.addEventListener('click', showMap);
  document.getElementById('nav-snap')?.addEventListener('click', showSnapUpload);
  document.getElementById('nav-journal')?.addEventListener('click', showJournal);
  document.getElementById('nav-legal')?.addEventListener('click', showLegalGuide);

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => setLanguage(btn.dataset.lang));
  });

  document.getElementById('upload-trigger')?.addEventListener('click', () => document.getElementById('real-upload').click());
  document.getElementById('real-upload')?.addEventListener('change', handleRealUpload);

  document.getElementById('btn-add-journal')?.addEventListener('click', addToJournal);
  document.getElementById('btn-share')?.addEventListener('click', showShareModal);
  document.getElementById('btn-compliance')?.addEventListener('click', showComplianceModal);
  document.getElementById('btn-reset')?.addEventListener('click', resetCatchSnap);

  document.getElementById('map-search')?.addEventListener('input', applyMapFilters);
  document.getElementById('filter-all')?.addEventListener('click', () => setMapFilter('all'));
  document.getElementById('filter-easy')?.addEventListener('click', () => setDifficultyFilter('Easy'));
  document.getElementById('filter-moderate')?.addEventListener('click', () => setDifficultyFilter('Moderate'));
  document.getElementById('legal-only-toggle')?.addEventListener('change', (e) => setMapFilter(e.target.checked ? 'legal' : 'all'));
  document.getElementById('btn-near-me')?.addEventListener('click', goToMyLocation);

  document.querySelectorAll('[data-category]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.category;
      setCategoryFilter(cat === 'all' ? null : cat);
    });
  });

  document.getElementById('compliance-close')?.addEventListener('click', hideComplianceModal);
  document.getElementById('btn-national-report')?.addEventListener('click', openOfficialPortal);
  document.getElementById('btn-open-portal')?.addEventListener('click', openOfficialPortal);

  document.getElementById('share-close')?.addEventListener('click', hideShareModal);
  document.getElementById('share-backdrop')?.addEventListener('click', hideShareModal);
  document.getElementById('share-copy')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(getShareCaption());
    showToast(t('captionCopied'));
  });
  document.getElementById('share-native')?.addEventListener('click', async () => {
    const text = getShareCaption();
    if (navigator.share) {
      try { await navigator.share({ title: 'CatchSnap', text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      showToast(t('captionCopied'));
    }
  });

  document.getElementById('spot-modal-close')?.addEventListener('click', hideSpotDetailsModal);
  document.getElementById('spot-modal-backdrop')?.addEventListener('click', hideSpotDetailsModal);
  document.getElementById('compliance-backdrop')?.addEventListener('click', hideComplianceModal);
  document.getElementById('btn-log-catch-spot')?.addEventListener('click', logCatchFromSpotModal);
  document.getElementById('btn-directions-spot')?.addEventListener('click', getDirectionsFromModal);
  document.getElementById('spot-details-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'spot-details-modal') hideSpotDetailsModal();
  });
}

async function init() {
  setupEventListeners();
  await loadAppData();
  setLanguage(getCurrentLang());
  renderExampleFish();
  renderJournalPage();
  setNavActive('snap');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

window.showSpotDetails = showSpotDetails;
window.logCatchFromSpot = logCatchFromSpot;
window.getDirections = getDirections;