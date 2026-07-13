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

const PAGES = ['step-upload', 'step-analyzing', 'step-results', 'step-map', 'step-journal', 'step-legal'];

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
  const examples = fishData.slice(0, 3);
  grid.innerHTML = examples.map((fish) => `
    <button type="button" data-example-index="${fish.id}" class="fish-card">
      <img src="${fish.image}" alt="${fish.species}" loading="lazy">
      <div class="fish-card-label">${fish.species}</div>
    </button>`).join('');
  grid.querySelectorAll('[data-example-index]').forEach((btn) => {
    btn.addEventListener('click', () => selectExampleFish(+btn.dataset.exampleIndex));
  });
}

function formatJournalDate(isoOrStr) {
  try {
    const d = new Date(isoOrStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return isoOrStr;
  }
}

function renderJournalPage() {
  const list = document.getElementById('journal-list');
  const empty = document.getElementById('journal-empty');
  const countLabel = document.getElementById('journal-count-label');
  if (!list || !empty) return;

  const count = journalEntries.length;
  countLabel.textContent = `${count} catch${count === 1 ? '' : 'es'} logged`;

  if (count === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  list.innerHTML = journalEntries.map((entry) => {
    const isLegal = entry.lengthValue >= entry.minLegalLength;
    const date = formatJournalDate(entry.date || entry.addedAt);
    return `
      <article class="journal-card" data-entry-id="${entry.id}">
        <div class="journal-thumb"><img src="${entry.image}" alt="${entry.species}"></div>
        <div class="flex-1 min-w-0">
          <div class="font-bold text-sm text-slate-900">${entry.species}</div>
          <div class="journal-meta"><i class="fa-regular fa-calendar"></i> ${date}</div>
          <div class="journal-meta"><i class="fa-solid fa-location-dot"></i> ${entry.location || 'Greece'}</div>
          <span class="legal-badge"><i class="fa-solid fa-check"></i> ${isLegal ? 'Legal' : 'Below min'}</span>
        </div>
        <button type="button" class="journal-delete text-slate-300 hover:text-red-500 p-1" data-delete-id="${entry.id}" aria-label="Delete">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      </article>`;
  }).join('');

  list.querySelectorAll('.journal-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteJournalEntry(+btn.dataset.deleteId));
  });
}

async function runAnalysis(exampleId, customImage) {
  const body = { exampleId };
  if (selectedSpot) {
    body.spotName = selectedSpot.name;
    body.spotRegion = selectedSpot.region;
  }
  if (customImage) body.customImage = customImage;

  try {
    const { data } = await apiFetch('/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return data;
  } catch {
    const fish = exampleId !== undefined
      ? { ...(fishData.find((f) => f.id === exampleId) || fishData[exampleId]) }
      : { ...fishData[0], species: fishData[0].species + ' (AI Identified)', confidence: 88 };
    if (customImage) fish.image = customImage;
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

function handleRealUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    hideAllSteps();
    document.getElementById('step-analyzing').classList.remove('hidden');
    setNavActive('snap');
    runAnalysis(undefined, e.target.result).then((fish) => {
      currentFish = fish;
      setTimeout(() => showResults(currentFish), 1100);
    });
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

function showResults(fish) {
  hideAllSteps();
  document.getElementById('step-results').classList.remove('hidden');
  setNavActive('snap');

  document.getElementById('result-species').textContent = fish.species;
  document.getElementById('result-confidence').innerHTML = `<i class="fa-solid fa-check-circle"></i> ${fish.confidence}% confidence`;
  document.getElementById('result-location').innerHTML = `<i class="fa-solid fa-location-dot text-brand"></i> ${fish.location}`;
  document.getElementById('result-length').textContent = fish.length;
  document.getElementById('result-eco').textContent = `+${fish.ecoScore}`;
  document.getElementById('result-fish-image').innerHTML = `<img src="${fish.image}" class="w-full h-full object-cover" alt="${fish.species}">`;
  document.getElementById('result-nutrition').innerHTML = (fish.nutrition || [])
    .map((item) => `<div class="flex gap-2"><i class="fa-solid fa-check text-brand text-xs mt-1"></i><span>${item}</span></div>`)
    .join('');

  const legal = checkIfLegal(fish);
  const el = document.getElementById('result-legal-status');
  el.innerHTML = legal.legal
    ? `<span class="legal-badge"><i class="fa-solid fa-check"></i> Fully Legal</span>`
    : `<span class="text-amber-600 text-sm font-semibold">Below Minimum</span>`;
}

function checkIfLegal(fish) {
  const isWeight = fish.isWeight || /octopus|kg/i.test(fish.length || '');
  if (isWeight) return { legal: fish.lengthValue >= fish.minLegalLength, minSize: fish.minLegalLength + ' kg' };
  return { legal: fish.lengthValue >= fish.minLegalLength, minSize: fish.minLegalLength + ' cm' };
}

function addToJournal() {
  if (!currentFish) return;
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
  showToast('Added to Journal!');
}

function showToast(msg) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-brand text-white px-4 py-2 rounded-full shadow-lg text-sm z-[70]';
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2400);
}

function showJournal() {
  hideAllSteps();
  document.getElementById('step-journal').classList.remove('hidden');
  setNavActive('journal');
  renderJournalPage();
}

function deleteJournalEntry(id) {
  if (!confirm('Delete this entry?')) return;
  journalEntries = journalEntries.filter((e) => e.id !== id);
  localStorage.setItem('journalEntries', JSON.stringify(journalEntries));
  renderJournalPage();
  showToast('Catch deleted from your journal.');
}

function showComplianceModal() {
  document.getElementById('compliance-modal').classList.remove('hidden');
  document.getElementById('compliance-modal').classList.add('flex');
}

function hideComplianceModal() {
  document.getElementById('compliance-modal').classList.remove('flex');
  document.getElementById('compliance-modal').classList.add('hidden');
}

function openOfficialPortal() {
  window.open('https://alieia.hcg.gr/', '_blank');
  hideComplianceModal();
}

function getShareCaption() {
  if (!currentFish) return '';
  return `🎣 Caught a ${currentFish.species} (${currentFish.length}) in Greece!
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
  else setTimeout(() => map.invalidateSize(), 120);
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

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([38.5, 24.0], 6);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>',
    subdomains: 'abcd',
    maxZoom: 19,
  }).addTo(map);
  loadMapData();
}

function spotColor(difficulty) {
  return difficulty === 'Moderate' ? BRAND : EASY_COLOR;
}

function loadMapData() {
  legalMarkers = [];
  protectionMarkers = [];

  protectedAreas.forEach((area) => {
    const marker = L.marker([area.lat, area.lng], {
      icon: L.divIcon({
        className: 'protected-marker',
        html: '<span class="protected-x-marker">✕</span>',
        iconSize: [16, 16],
        iconAnchor: [8, 8],
      }),
    }).addTo(map);
    marker.bindPopup(`<div style="min-width:180px"><div style="font-weight:600;color:#ef4444">${area.name}</div><div style="font-size:11px;color:#64748b">${area.region}</div><div style="font-size:11px;margin-top:4px;color:#ef4444">${area.protection_level}</div><div style="font-size:11px;margin-top:4px">${area.note}</div></div>`);
    protectionMarkers.push({ marker, data: area });
  });

  legalFishingSpots.forEach((spot) => {
    const color = spotColor(spot.difficulty);
    const marker = L.circleMarker([spot.lat, spot.lng], {
      radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.92,
    }).addTo(map);
    const popupHTML = `<div style="min-width:200px"><div style="font-weight:600">${spot.name}</div><div style="font-size:11px;color:#64748b">${spot.region} • ${spot.difficulty || 'Easy'}</div><div style="font-size:11px;margin-top:6px"><strong>Daily limit:</strong> ${spot.daily_limit_kg} kg</div><div style="margin-top:8px;display:flex;gap:6px"><button onclick="getDirections(${spot.lat},${spot.lng});event.stopPropagation();" style="font-size:11px;padding:4px 10px;border:1px solid #e2e8f0;border-radius:999px;flex:1;background:#fff">Directions</button><button onclick="logCatchFromSpot(${spot.id});event.stopPropagation();" style="font-size:11px;padding:4px 10px;border-radius:999px;flex:1;background:${BRAND};color:#fff;border:none">Log Catch</button></div><button onclick="showSpotDetails(${spot.id});event.stopPropagation();" style="margin-top:6px;width:100%;font-size:11px;padding:4px 10px;background:#f1f5f9;border:none;border-radius:999px">More Info →</button></div>`;
    marker.bindPopup(popupHTML, { maxWidth: 260 });
    legalMarkers.push({ marker, data: spot });
  });

  document.getElementById('protected-count').textContent = protectionMarkers.length;
  document.getElementById('legal-count').textContent = legalMarkers.length;
}

function applyMapFilters() {
  const searchTerm = (document.getElementById('map-search')?.value || '').toLowerCase().trim();
  const legalOnly = document.getElementById('legal-only-toggle')?.checked || mapFilter === 'legal';
  let visibleLegal = 0;
  let visibleProtected = 0;

  legalMarkers.forEach(({ marker, data: spot }) => {
    const matchesSearch = !searchTerm || spot.name.toLowerCase().includes(searchTerm) || spot.region.toLowerCase().includes(searchTerm);
    const matchesDiff = !difficultyFilter || spot.difficulty === difficultyFilter;
    const near = isWithinDistance(marker, userLat, userLng, maxDistanceKm);
    const show = matchesSearch && matchesDiff && near;
    marker.setOpacity(show ? 1 : 0.1);
    if (show) visibleLegal++;
  });

  protectionMarkers.forEach(({ marker, data: area }) => {
    const matchesSearch = !searchTerm || area.name.toLowerCase().includes(searchTerm) || area.region.toLowerCase().includes(searchTerm);
    const near = isWithinDistance(marker, userLat, userLng, maxDistanceKm);
    const show = !legalOnly && matchesSearch && near;
    marker.setOpacity(show ? 1 : 0.1);
    if (show) visibleProtected++;
  });

  document.getElementById('legal-count').textContent = visibleLegal;
  document.getElementById('protected-count').textContent = legalOnly ? 0 : visibleProtected;
}

function isWithinDistance(marker, lat, lng, maxKm) {
  if (!lat || !lng) return true;
  const p = marker.getLatLng();
  return getDistanceFromLatLonInKm(lat, lng, p.lat, p.lng) <= maxKm;
}

function goToMyLocation() {
  if (!map || !navigator.geolocation) return alert('Geolocation not available');
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
    setTimeout(applyMapFilters, 1300);
  }, () => alert('Enable location services'));
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let currentModalSpot = null;

function showSpotDetails(spotId) {
  const spot = legalFishingSpots.find((s) => s.id === spotId);
  if (!spot) return;
  currentModalSpot = spot;
  map?.closePopup();
  document.getElementById('spot-modal-name').textContent = spot.name;
  document.getElementById('spot-modal-region').textContent = `${spot.region} • ${spot.difficulty || 'Easy'} spot`;
  document.getElementById('spot-modal-content').innerHTML = `
    <div class="space-y-3 text-sm">
      <div><div class="section-header mb-1">Access</div>${spot.access}</div>
      <div><div class="section-header mb-1">Allowed</div><div class="flex flex-wrap gap-1">${(spot.allowed_gear || []).map((g) => `<span class="px-2 py-0.5 bg-brand-light text-brand-dark rounded-full text-[11px]">${g}</span>`).join('')}</div></div>
      <div class="text-xs text-slate-600"><strong>Daily limit:</strong> ${spot.daily_limit_kg} kg · <strong>Best:</strong> ${spot.best_time}</div>
      ${spot.warnings ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs">${spot.warnings}</div>` : ''}
    </div>`;
  document.getElementById('spot-details-modal').classList.remove('hidden');
  document.getElementById('spot-details-modal').classList.add('flex');
}

function hideSpotDetailsModal() {
  document.getElementById('spot-details-modal').classList.remove('flex');
  document.getElementById('spot-details-modal').classList.add('hidden');
  currentModalSpot = null;
}

function logCatchFromSpotModal() {
  if (!currentModalSpot) return;
  selectedSpot = currentModalSpot;
  hideSpotDetailsModal();
  showSnapUpload();
  showToast(`Spot: ${selectedSpot.name}`);
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
  showToast(`Spot: ${selectedSpot.name}`);
}

function resetCatchSnap() {
  showSnapUpload();
  currentFish = null;
}

function setupEventListeners() {
  document.getElementById('nav-map')?.addEventListener('click', showMap);
  document.getElementById('nav-snap')?.addEventListener('click', showSnapUpload);
  document.getElementById('nav-journal')?.addEventListener('click', showJournal);
  document.getElementById('nav-legal')?.addEventListener('click', showLegalGuide);

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
  document.getElementById('legal-only-toggle')?.addEventListener('change', (e) => {
    setMapFilter(e.target.checked ? 'legal' : 'all');
  });
  document.getElementById('btn-near-me')?.addEventListener('click', goToMyLocation);

  document.getElementById('compliance-close')?.addEventListener('click', hideComplianceModal);
  document.getElementById('btn-national-report')?.addEventListener('click', openOfficialPortal);
  document.getElementById('btn-open-portal')?.addEventListener('click', openOfficialPortal);
  document.getElementById('compliance-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'compliance-modal') hideComplianceModal();
  });

  document.getElementById('share-close')?.addEventListener('click', hideShareModal);
  document.getElementById('share-backdrop')?.addEventListener('click', hideShareModal);
  document.getElementById('share-copy')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(getShareCaption());
    showToast('Caption copied!');
  });
  document.getElementById('share-native')?.addEventListener('click', async () => {
    const text = getShareCaption();
    if (navigator.share) {
      try { await navigator.share({ title: 'My CatchSnap Catch', text }); } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(text);
      showToast('Caption copied!');
    }
  });

  document.getElementById('spot-modal-close')?.addEventListener('click', hideSpotDetailsModal);
  document.getElementById('btn-log-catch-spot')?.addEventListener('click', logCatchFromSpotModal);
  document.getElementById('btn-directions-spot')?.addEventListener('click', getDirectionsFromModal);
  document.getElementById('spot-details-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'spot-details-modal') hideSpotDetailsModal();
  });

  document.querySelectorAll('.lang-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.lang-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

async function init() {
  setupEventListeners();
  await loadAppData();
  renderExampleFish();
  renderJournalPage();
  setNavActive('snap');
  console.log(`[CatchSnap Greece] ready — ${fishData.length} species`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

window.showSpotDetails = showSpotDetails;
window.logCatchFromSpot = logCatchFromSpot;
window.getDirections = getDirections;