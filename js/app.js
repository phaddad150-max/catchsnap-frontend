const API_BASE = window.CATCHSNAP_API || 'http://localhost:3001/api/v1';
const BRAND = '#2563eb';
const BRAND_DARK = '#1d4ed8';

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

let fishData = [];
let legalFishingSpots = [];
let protectedAreas = [];

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
    console.log('[CatchSnap] API data loaded');
  } catch (apiErr) {
    console.warn('[CatchSnap] API unavailable, loading bundled data', apiErr);
    try {
      [fishData, legalFishingSpots, protectedAreas] = await Promise.all([
        loadJson('data/fish.json'),
        loadJson('data/legal-spots.json'),
        loadJson('data/protected-areas.json'),
      ]);
    } catch (e) {
      console.error('[CatchSnap] Failed to load data', e);
    }
  }
}

function renderExampleFish() {
  const grid = document.getElementById('example-fish-grid');
  if (!grid) return;
  grid.innerHTML = fishData.map((fish) => `
    <button type="button" data-example-index="${fish.id}" class="fish-card text-left bg-white border border-zinc-200 rounded-2xl p-1.5 hover:border-brand">
      <div class="aspect-square bg-zinc-100 rounded-xl mb-1.5 overflow-hidden">
        <img src="${fish.image}" class="w-full h-full object-cover" alt="${fish.species}" loading="lazy">
      </div>
      <div class="text-[10px] font-semibold leading-tight px-0.5 line-clamp-2">${fish.species}</div>
    </button>`).join('');
  grid.querySelectorAll('[data-example-index]').forEach((btn) => {
    btn.addEventListener('click', () => selectExampleFish(+btn.dataset.exampleIndex));
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
      ? { ...fishData.find((f) => f.id === exampleId) || fishData[exampleId] }
      : { ...fishData[0], species: fishData[0].species + ' (AI Identified)', confidence: 88 };
    if (customImage) fish.image = customImage;
    if (selectedSpot) fish.location = `${selectedSpot.name}, ${selectedSpot.region}`;
    return fish;
  }
}

function hideAllSteps() {
  ['step-upload', 'step-analyzing', 'step-results', 'step-map', 'step-legal'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function selectExampleFish(index) {
  hideAllSteps();
  document.getElementById('step-analyzing').classList.remove('hidden');
  setNavActive('catchsnap');
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
    setNavActive('catchsnap');
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

  const greek = fish.greek_name ? ` <span class="text-sm font-normal text-zinc-400">(${fish.greek_name})</span>` : '';
  document.getElementById('result-species').innerHTML = `${fish.species}${greek}<div class="text-sm font-normal text-zinc-500 mt-0.5 italic">${fish.scientific}</div>`;
  document.getElementById('result-confidence').innerHTML = `<i class="fa-solid fa-check-circle"></i> ${fish.confidence}% confidence`;
  document.getElementById('result-location').innerHTML = `<i class="fa-solid fa-map-marker-alt text-brand mr-1"></i>${fish.location}`;
  document.getElementById('result-length').textContent = fish.length;
  document.getElementById('result-eco').textContent = `+${fish.ecoScore}`;
  document.getElementById('result-fish-image').innerHTML = `<img src="${fish.image}" class="w-full h-full object-cover" alt="${fish.species}">`;

  document.getElementById('result-nutrition').innerHTML = (fish.nutrition || [])
    .map((item) => `<div class="flex items-start gap-2"><i class="fa-solid fa-check text-brand mt-0.5 text-xs"></i><span>${item}</span></div>`)
    .join('');

  const legal = checkIfLegal(fish);
  const el = document.getElementById('result-legal-status');
  if (legal.legal) {
    el.innerHTML = `<div class="flex items-center gap-2"><i class="fa-solid fa-check-circle text-brand"></i><div><div class="font-semibold text-brand-dark text-sm">Fully Legal</div><div class="text-[10px] text-brand">Above minimum size</div></div></div>`;
  } else {
    el.innerHTML = `<div class="flex items-center gap-2"><i class="fa-solid fa-exclamation-triangle text-amber-500"></i><div><div class="font-semibold text-amber-700 text-sm">Below Minimum</div><div class="text-[10px] text-amber-600">Min: ${legal.minSize}</div></div></div>`;
  }
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
  showToast('<i class="fa-solid fa-check-circle"></i> Added to Journal!');
}

function showToast(html) {
  const toast = document.createElement('div');
  toast.className = 'fixed bottom-20 left-1/2 -translate-x-1/2 bg-brand text-white px-4 py-2 rounded-full shadow-lg text-sm z-[70] flex items-center gap-2';
  toast.innerHTML = html;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2600);
}

function showJournal() {
  hideAllSteps();
  document.getElementById('step-upload').classList.remove('hidden');
  setNavActive('journal');

  document.getElementById('journal-overlay')?.remove();
  const modal = document.createElement('div');
  modal.id = 'journal-overlay';
  modal.className = 'fixed inset-0 bg-black/60 z-[55] flex items-end justify-center';

  const content = journalEntries.length === 0
    ? `<div class="text-center py-12"><i class="fa-solid fa-book text-4xl text-zinc-200 mb-3"></i><p class="font-medium text-zinc-600">No catches yet</p><p class="text-xs text-zinc-400 mt-1">Use CatchSnap to identify and log your first catch</p></div>`
    : journalEntries.map((entry) => `
      <div class="border border-zinc-100 rounded-xl p-3 flex gap-3 mb-2" data-entry-id="${entry.id}">
        <div class="w-14 h-14 rounded-xl overflow-hidden border shrink-0"><img src="${entry.image}" class="w-full h-full object-cover" alt=""></div>
        <div class="flex-1 min-w-0">
          <div class="font-semibold text-sm truncate">${entry.species}</div>
          <div class="text-[11px] text-zinc-500">${entry.addedAt} • ${entry.location}</div>
          <div class="text-[11px] mt-0.5 ${entry.lengthValue >= entry.minLegalLength ? 'text-brand' : 'text-amber-600'}">${entry.lengthValue >= entry.minLegalLength ? 'Legal' : 'Below min'}</div>
        </div>
        <button type="button" data-delete-id="${entry.id}" class="journal-delete text-red-400 p-1"><i class="fa-solid fa-trash text-xs"></i></button>
      </div>`).join('');

  modal.innerHTML = `<div class="bg-white w-full max-w-lg rounded-t-3xl p-5 max-h-[80vh] overflow-auto">
    <div class="flex justify-between items-center mb-4">
      <div><div class="font-semibold text-lg">My Journal</div><div class="text-xs text-zinc-500">${journalEntries.length} catch${journalEntries.length !== 1 ? 'es' : ''} logged</div></div>
      <button type="button" id="journal-close" class="text-2xl text-zinc-400 px-2">×</button>
    </div>${content}</div>`;

  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  document.body.appendChild(modal);
  document.getElementById('journal-close')?.addEventListener('click', () => modal.remove());
  modal.querySelectorAll('.journal-delete').forEach((btn) => {
    btn.addEventListener('click', () => deleteJournalEntry(+btn.dataset.deleteId, btn));
  });
}

function deleteJournalEntry(id, element) {
  if (!confirm('Delete this entry?')) return;
  journalEntries = journalEntries.filter((e) => e.id !== id);
  localStorage.setItem('journalEntries', JSON.stringify(journalEntries));
  element.closest('[data-entry-id]')?.remove();
  showToast('Catch deleted from your journal.');
  if (!journalEntries.length) document.getElementById('journal-overlay')?.remove();
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

async function shareNative() {
  const text = getShareCaption();
  if (navigator.share) {
    try { await navigator.share({ title: 'My CatchSnap Catch', text, url: 'https://catchsnap.app' }); } catch { /* cancelled */ }
  } else {
    await navigator.clipboard.writeText(text);
    showToast('Caption copied!');
  }
}

function showCatchSnap() {
  hideAllSteps();
  document.getElementById('step-upload').classList.remove('hidden');
  setNavActive('catchsnap');
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
  document.getElementById('filter-legal')?.classList.toggle('active', mode === 'legal');
  applyMapFilters();
}

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([38.5, 24.0], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
  loadMapData();
}

function loadMapData() {
  legalMarkers = [];
  protectionMarkers = [];

  protectedAreas.forEach((area) => {
    const marker = L.circleMarker([area.lat, area.lng], {
      radius: 6, fillColor: '#dc2626', color: '#fff', weight: 1.5, fillOpacity: 0.85,
    }).addTo(map);
    marker.bindPopup(`<div style="min-width:180px"><div style="font-weight:600;color:#dc2626">${area.name}</div><div style="font-size:11px;color:#71717a">${area.region}</div><div style="font-size:11px;margin-top:4px;color:#dc2626;font-weight:500">${area.protection_level}</div><div style="font-size:11px;margin-top:4px">${area.note}</div></div>`, { maxWidth: 240 });
    protectionMarkers.push({ marker, data: area });
  });

  legalFishingSpots.forEach((spot) => {
    const marker = L.circleMarker([spot.lat, spot.lng], {
      radius: 8, fillColor: BRAND, color: '#fff', weight: 2, fillOpacity: 0.92,
    }).addTo(map);
    const popupHTML = `<div style="min-width:200px"><div style="font-weight:600">${spot.name}</div><div style="font-size:11px;color:#71717a">${spot.region} • ${spot.difficulty || 'Easy'}</div><div style="font-size:11px;margin-top:6px"><strong>Daily limit:</strong> ${spot.daily_limit_kg} kg</div><div style="margin-top:8px;display:flex;gap:6px"><button onclick="getDirections(${spot.lat},${spot.lng});event.stopPropagation();" style="font-size:11px;padding:4px 10px;border:1px solid #d4d4d8;border-radius:999px;flex:1;background:#fff">Directions</button><button onclick="logCatchFromSpot(${spot.id});event.stopPropagation();" style="font-size:11px;padding:4px 10px;border-radius:999px;flex:1;background:${BRAND};color:#fff;border:none">Log Catch</button></div><button onclick="showSpotDetails(${spot.id});event.stopPropagation();" style="margin-top:6px;width:100%;font-size:11px;padding:4px 10px;background:#f4f4f5;border:none;border-radius:999px">More Info →</button></div>`;
    marker.bindPopup(popupHTML, { maxWidth: 260 });
    legalMarkers.push({ marker, data: spot });
  });

  updateMapCounts();
}

function updateMapCounts() {
  document.getElementById('protected-count').textContent = protectionMarkers.length;
  document.getElementById('legal-count').textContent = legalMarkers.length;
}

function applyMapFilters() {
  const searchTerm = (document.getElementById('map-search')?.value || '').toLowerCase().trim();
  let visibleLegal = 0;
  let visibleProtected = 0;

  legalMarkers.forEach(({ marker, data: spot }) => {
    const matches = !searchTerm || spot.name.toLowerCase().includes(searchTerm) || spot.region.toLowerCase().includes(searchTerm);
    const near = isWithinDistance(marker, userLat, userLng, maxDistanceKm);
    const show = matches && near && mapFilter !== 'protected-only';
    marker.setOpacity(show ? 1 : 0.12);
    if (show) visibleLegal++;
  });

  protectionMarkers.forEach(({ marker, data: area }) => {
    const matches = !searchTerm || area.name.toLowerCase().includes(searchTerm) || area.region.toLowerCase().includes(searchTerm);
    const near = isWithinDistance(marker, userLat, userLng, maxDistanceKm);
    const show = mapFilter !== 'legal' && matches && near;
    marker.setOpacity(show ? 1 : 0.12);
    if (show) visibleProtected++;
  });

  document.getElementById('legal-count').textContent = visibleLegal;
  document.getElementById('protected-count').textContent = visibleProtected;
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
      <div><div class="section-header mb-1">Access</div><div class="text-sm">${spot.access}</div></div>
      <div><div class="section-header mb-1 text-brand-dark">Allowed</div><div class="flex flex-wrap gap-1">${(spot.allowed_gear || []).map((g) => `<span class="px-2 py-0.5 bg-brand-light text-brand-dark rounded-full text-[11px]">${g}</span>`).join('')}</div></div>
      <div><div class="section-header mb-1 text-red-600">Not Allowed</div><div class="flex flex-wrap gap-1">${(spot.prohibited_gear || []).map((g) => `<span class="px-2 py-0.5 bg-red-50 text-red-600 rounded-full text-[11px]">${g}</span>`).join('')}</div></div>
      <div class="text-xs text-zinc-600 space-y-1">
        <div><strong>Daily limit:</strong> ${spot.daily_limit_kg} kg</div>
        <div><strong>Best time:</strong> ${spot.best_time}</div>
        <div><strong>Fishing type:</strong> ${spot.fishing_type}</div>
      </div>
      ${spot.warnings ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800"><i class="fa-solid fa-exclamation-triangle mr-1"></i>${spot.warnings}</div>` : ''}
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
  showCatchSnap();
  showToast(`Spot selected: <strong>${selectedSpot.name}</strong>`);
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
  showCatchSnap();
  showToast(`Spot selected: <strong>${selectedSpot.name}</strong>`);
}

function resetCatchSnap() {
  hideAllSteps();
  document.getElementById('step-upload').classList.remove('hidden');
  currentFish = null;
}

function setupEventListeners() {
  document.getElementById('nav-map')?.addEventListener('click', showMap);
  document.getElementById('nav-catchsnap')?.addEventListener('click', showCatchSnap);
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
  document.getElementById('filter-legal')?.addEventListener('click', () => setMapFilter('legal'));
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
  document.getElementById('share-native')?.addEventListener('click', shareNative);
  document.getElementById('share-twitter')?.addEventListener('click', () => {
    const text = getShareCaption();
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent('https://catchsnap.app')}`, '_blank');
  });

  document.getElementById('spot-modal-close')?.addEventListener('click', hideSpotDetailsModal);
  document.getElementById('btn-log-catch-spot')?.addEventListener('click', logCatchFromSpotModal);
  document.getElementById('btn-directions-spot')?.addEventListener('click', getDirectionsFromModal);
  document.getElementById('spot-details-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'spot-details-modal') hideSpotDetailsModal();
  });
}

async function init() {
  setupEventListeners();
  setNavActive('catchsnap');
  await loadAppData();
  renderExampleFish();
  console.log(`%c[CatchSnap Greece] ${fishData.length} species, ${legalFishingSpots.length} spots, ${protectedAreas.length} protected`, `color:${BRAND};font-weight:bold`);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

window.showSpotDetails = showSpotDetails;
window.logCatchFromSpot = logCatchFromSpot;
window.getDirections = getDirections;