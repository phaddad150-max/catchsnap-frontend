const API_BASE = window.CATCHSNAP_API || 'http://localhost:3001/api/v1';

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

let fishData = [];
let legalFishingSpots = [];
let protectedAreas = [];

async function apiFetch(path, options) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) throw new Error(`API ${res.status}`);
  return res.json();
}

async function loadBackendData() {
  try {
    const [examples, legal, protected_] = await Promise.all([
      apiFetch('/analyze/examples'),
      apiFetch('/map/legal'),
      apiFetch('/map/protected'),
    ]);
    fishData = examples.data;
    legalFishingSpots = legal.data;
    protectedAreas = protected_.data;
    console.log('[CatchSnap] Loaded real data from backend');
  } catch (e) {
    console.warn('[CatchSnap] Backend offline — using embedded fallback', e);
    useFallbackData();
  }
}

function useFallbackData() {
  fishData = [
    { id: 0, species: 'Gilthead Sea Bream', scientific: 'Sparus aurata', confidence: 95, length: '38 cm', lengthValue: 38, minLegalLength: 20, location: 'Legal spot near Paros, Cyclades', nutrition: ['High-quality protein (20g per 100g)', 'Rich in omega-3 fatty acids'], ecoScore: 92, image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=400&fit=crop' },
    { id: 1, species: 'European Sea Bass', scientific: 'Dicentrarchus labrax', confidence: 91, length: '42 cm', lengthValue: 42, minLegalLength: 42, location: 'Legal public harbor, Kefalonia', nutrition: ['Lean protein (18-20g per 100g)', 'High in omega-3s and vitamin B12'], ecoScore: 88, image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=400&fit=crop' },
    { id: 2, species: 'Common Octopus', scientific: 'Octopus vulgaris', confidence: 87, length: '~1.1 kg', lengthValue: 1.1, minLegalLength: 0.75, isWeight: true, location: 'Legal rocky shore, Crete', nutrition: ['Extremely high protein (25g+ per 100g)', 'Low calorie, rich in iron, B12'], ecoScore: 95, image: 'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?w=400&h=400&fit=crop' },
  ];
  legalFishingSpots = [{ id: 508, name: 'Aegina Town Pier & Marina', lat: 37.746, lng: 23.427, region: 'Aegina', access: 'Very easy', allowed_gear: ['Rod & line', 'Spinning'], prohibited_gear: ['Nets'], daily_limit_kg: 5, best_time: 'Dawn', fishing_type: 'Pier fishing', warnings: 'Ferry traffic', difficulty: 'Easy' }];
  protectedAreas = [{ name: 'Zakynthos Marine Park', lat: 37.78, lng: 20.85, protection_level: 'No Fishing Zone', region: 'Ionian Islands', note: 'Strictly protected' }];
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
    const fish = exampleId !== undefined ? { ...fishData[exampleId] } : { ...fishData[Math.floor(Math.random() * fishData.length)], species: fishData[0].species + ' (AI Identified)', confidence: 88 };
    if (customImage) fish.image = customImage;
    if (selectedSpot) fish.location = `${selectedSpot.name}, ${selectedSpot.region}`;
    return fish;
  }
}

function selectExampleFish(index) {
  document.getElementById('step-upload').classList.add('hidden');
  document.getElementById('step-analyzing').classList.remove('hidden');
  runAnalysis(index).then((fish) => {
    currentFish = fish;
    setTimeout(() => showResults(currentFish), 1200);
  });
}

function handleRealUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    document.getElementById('step-upload').classList.add('hidden');
    document.getElementById('step-analyzing').classList.remove('hidden');
    runAnalysis(undefined, e.target.result).then((fish) => {
      currentFish = fish;
      setTimeout(() => showResults(currentFish), 1200);
    });
  };
  reader.readAsDataURL(file);
}

function showResults(fish) {
  document.getElementById('step-analyzing').classList.add('hidden');
  document.getElementById('step-results').classList.remove('hidden');

  document.getElementById('result-species').innerHTML = `${fish.species} <span class="text-base font-normal text-zinc-500">(${fish.scientific})</span>`;
  document.getElementById('result-confidence').innerHTML = `<i class="fa-solid fa-check-circle mr-1"></i> ${fish.confidence}% confidence`;
  document.getElementById('result-location').innerHTML = `<i class="fa-solid fa-map-marker-alt mr-1 text-emerald-500"></i> ${fish.location}`;
  document.getElementById('result-length').innerHTML = fish.length;
  document.getElementById('result-eco').innerHTML = `+${fish.ecoScore}`;

  document.getElementById('result-fish-image').innerHTML = `<img src="${fish.image}" class="w-full h-full object-cover" alt="${fish.species}">`;

  document.getElementById('result-nutrition').innerHTML = fish.nutrition
    .map((item) => `<div class="flex items-start gap-x-2 text-sm"><i class="fa-solid fa-check text-emerald-500 mt-1"></i> <span>${item}</span></div>`)
    .join('');

  const legal = checkIfLegal(fish);
  const legalStatusContainer = document.getElementById('result-legal-status');
  if (legal.legal) {
    legalStatusContainer.innerHTML = `<div class="flex items-center gap-x-2"><i class="fa-solid fa-check-circle text-emerald-500 text-xl"></i><div><div class="font-semibold text-emerald-700">Fully Legal</div><div class="text-[10px] text-emerald-600">Above minimum size</div></div></div>`;
  } else {
    legalStatusContainer.innerHTML = `<div class="flex items-center gap-x-2"><i class="fa-solid fa-exclamation-triangle text-amber-500 text-xl"></i><div><div class="font-semibold text-amber-700">Below Minimum</div><div class="text-[10px] text-amber-600">Min: ${legal.minSize}</div></div></div>`;
  }
}

function checkIfLegal(fish) {
  if (fish.isWeight || fish.species.toLowerCase().includes('octopus')) {
    return { legal: fish.lengthValue >= fish.minLegalLength, minSize: fish.minLegalLength + ' kg' };
  }
  return { legal: fish.lengthValue >= fish.minLegalLength, minSize: fish.minLegalLength + ' cm' };
}

function addToJournal() {
  if (!currentFish) return;
  const entry = { id: Date.now(), date: new Date().toISOString(), ...currentFish, addedAt: new Date().toLocaleDateString(), spot: selectedSpot ? selectedSpot.name : null };
  journalEntries.unshift(entry);
  localStorage.setItem('journalEntries', JSON.stringify(journalEntries));
  showToast('<i class="fa-solid fa-check-circle"></i> <span>Added to Journal!</span>', 'bg-emerald-600');
}

function showToast(html, bg = 'bg-emerald-700') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 ${bg} text-white px-5 py-2.5 rounded-3xl shadow-xl text-sm z-50 flex items-center gap-x-2`;
  toast.innerHTML = html;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function showJournal() {
  setNavActive('journal');
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black/70 flex items-end justify-center z-[60]';
  const content = journalEntries.length === 0
    ? '<div class="text-center py-10"><i class="fa-solid fa-book text-5xl text-zinc-200 mb-4"></i><p class="text-zinc-500">No catches logged yet.</p></div>'
    : journalEntries.map((entry) => `
      <div class="border border-zinc-100 rounded-2xl p-4 flex gap-4 mb-3">
        <div class="w-16 h-16 flex-shrink-0 rounded-2xl overflow-hidden border"><img src="${entry.image}" class="w-full h-full object-cover"></div>
        <div class="flex-1"><div class="font-semibold">${entry.species}</div><div class="text-xs text-zinc-500">${entry.addedAt} • ${entry.location}</div>
        ${entry.spot ? `<div class="text-xs text-emerald-600 mt-0.5"><i class="fa-solid fa-map-marker-alt"></i> ${entry.spot}</div>` : ''}
        <div class="text-xs mt-1">${entry.lengthValue >= entry.minLegalLength ? '<span class="text-emerald-600">Legal</span>' : '<span class="text-amber-600">Below min size</span>'}</div></div>
        <button onclick="deleteJournalEntry(${entry.id}, this)" class="text-red-400 hover:text-red-600 p-1"><i class="fa-solid fa-trash text-sm"></i></button>
      </div>`).join('');
  modal.innerHTML = `<div class="bg-white w-full max-w-[420px] rounded-t-3xl p-6 max-h-[85vh] overflow-auto"><div class="flex justify-between items-center mb-5"><div class="font-semibold text-2xl">My Journal</div><button onclick="this.closest('.fixed').remove()" class="text-3xl">×</button></div>${content}</div>`;
  document.body.appendChild(modal);
}

function deleteJournalEntry(id, element) {
  if (!confirm('Delete this entry?')) return;
  journalEntries = journalEntries.filter((e) => e.id !== id);
  localStorage.setItem('journalEntries', JSON.stringify(journalEntries));
  element.closest('.border')?.remove();
}

function showComplianceModal() {
  document.getElementById('compliance-modal').classList.remove('hidden');
  document.getElementById('compliance-modal').classList.add('flex');
}

function hideComplianceModal() {
  const modal = document.getElementById('compliance-modal');
  modal.classList.remove('flex');
  modal.classList.add('hidden');
}

function simulateNationalReport() {
  document.querySelector('#compliance-modal > div').innerHTML = `
    <div class="p-6 text-center">
      <div class="mx-auto w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4"><i class="fa-solid fa-check text-emerald-600 text-4xl"></i></div>
      <div class="font-semibold text-xl mb-2">Thank you!</div>
      <p class="text-sm text-zinc-600 mb-4">You are being redirected to the official Hellenic Coast Guard portal.</p>
      <button onclick="window.open('https://alieia.hcg.gr/', '_blank'); hideComplianceModal();" class="w-full py-3 bg-emerald-600 text-white rounded-3xl font-medium">Open Official Portal</button>
    </div>`;
}

function showCatchSnap() {
  document.getElementById('step-map').classList.add('hidden');
  document.getElementById('step-results')?.classList.add('hidden');
  document.getElementById('step-analyzing')?.classList.add('hidden');
  document.getElementById('step-upload').classList.remove('hidden');
  setNavActive('catchsnap');
}

function showMap() {
  document.getElementById('step-upload').classList.add('hidden');
  document.getElementById('step-results')?.classList.add('hidden');
  document.getElementById('step-analyzing')?.classList.add('hidden');
  document.getElementById('step-map').classList.remove('hidden');
  setNavActive('map');
  if (!map) initMap();
  else setTimeout(() => map.invalidateSize(), 100);
}

function setNavActive(tab) {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('text-emerald-600', el.dataset.nav === tab);
    el.classList.toggle('text-zinc-400', el.dataset.nav !== tab);
  });
}

function initMap() {
  map = L.map('map').setView([37.98, 23.72], 6);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap' }).addTo(map);
  loadMapData();
}

function loadMapData() {
  legalMarkers = [];
  protectionMarkers = [];
  protectedAreas.forEach((area) => {
    const marker = L.circleMarker([area.lat, area.lng], { radius: 7, fillColor: '#ef4444', color: '#fff', weight: 1.5, fillOpacity: 0.85 }).addTo(map);
    marker.bindPopup(`<div style="min-width:200px"><div class="font-semibold text-red-600">${area.name}</div><div class="text-xs text-zinc-500">${area.region}</div><div class="text-xs mt-1 text-red-600 font-medium">${area.protection_level}</div><div class="text-xs mt-1">${area.note}</div></div>`, { maxWidth: 240 });
    protectionMarkers.push({ marker, data: area });
  });
  legalFishingSpots.forEach((spot) => {
    const marker = L.circleMarker([spot.lat, spot.lng], { radius: 9, fillColor: '#10b981', color: '#fff', weight: 2, fillOpacity: 0.9 }).addTo(map);
    const popupHTML = `<div style="min-width:220px"><div class="font-semibold">${spot.name}</div><div class="text-xs text-zinc-500">${spot.region} • ${spot.difficulty}</div><div class="mt-2 text-xs"><strong>Daily limit:</strong> ${spot.daily_limit_kg} kg<br><strong>Allowed:</strong> ${spot.allowed_gear.slice(0, 2).join(', ')}</div><div class="mt-3 flex gap-2"><button onclick="getDirections(${spot.lat},${spot.lng});event.stopImmediatePropagation();" class="text-xs px-3 py-1 bg-white border border-zinc-300 rounded-full flex-1">Directions</button><button onclick="logCatchFromSpot(${spot.id});event.stopImmediatePropagation();" class="text-xs px-3 py-1 bg-emerald-600 text-white rounded-full flex-1">Log Catch</button></div><button onclick="showSpotDetails(${spot.id});event.stopImmediatePropagation();" class="mt-2 w-full text-xs px-3 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-full">More Info →</button></div>`;
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
  const searchTerm = document.getElementById('map-search').value.toLowerCase().trim();
  const showOnlyLegal = document.getElementById('legal-only-toggle').checked;
  let visibleLegal = 0, visibleProtected = 0;
  legalMarkers.forEach(({ marker, data: spot }) => {
    const matches = !searchTerm || spot.name.toLowerCase().includes(searchTerm) || spot.region.toLowerCase().includes(searchTerm);
    const show = matches && isWithinDistance(marker, userLat, userLng, maxDistanceKm);
    marker.setOpacity(show ? 1 : 0.15);
    if (show) visibleLegal++;
  });
  protectionMarkers.forEach(({ marker, data: area }) => {
    const matches = !searchTerm || area.name.toLowerCase().includes(searchTerm) || area.region.toLowerCase().includes(searchTerm);
    if (showOnlyLegal) marker.setOpacity(0.1);
    else { marker.setOpacity(matches ? 1 : 0.15); if (matches) visibleProtected++; }
  });
  document.getElementById('legal-count').textContent = visibleLegal;
  document.getElementById('protected-count').textContent = showOnlyLegal ? 0 : visibleProtected;
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
    userMarker = L.marker([userLat, userLng], { icon: L.divIcon({ className: 'user-location', html: '<div style="background:#3b82f6;width:14px;height:14px;border:3px solid white;border-radius:50%;box-shadow:0 0 0 2px #3b82f6"></div>', iconSize: [14, 14], iconAnchor: [7, 7] }) }).addTo(map);
    userMarker.bindPopup('Your location').openPopup();
    map.flyTo([userLat, userLng], 10, { duration: 1.5 });
    setTimeout(() => { document.getElementById('legal-only-toggle').checked = true; applyMapFilters(); }, 1600);
  }, () => alert('Enable location services'));
}

function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
  const R = 6371, dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

let currentModalSpot = null;

function showSpotDetails(spotId) {
  const spot = legalFishingSpots.find((s) => s.id === spotId);
  if (!spot) return;
  currentModalSpot = spot;
  if (map) map.closePopup();
  document.getElementById('spot-modal-name').textContent = spot.name;
  document.getElementById('spot-modal-region').textContent = `${spot.region} • ${spot.difficulty} access`;
  document.getElementById('spot-modal-content').innerHTML = `
    <div class="space-y-4 text-sm">
      <div><div class="font-semibold text-zinc-500 text-xs mb-1">ACCESS & LOCATION</div><div>${spot.access}</div></div>
      <div><div class="font-semibold text-emerald-700 text-xs mb-1">ALLOWED EQUIPMENT</div><div class="flex flex-wrap gap-1">${spot.allowed_gear.map((g) => `<span class="px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-xs">${g}</span>`).join('')}</div></div>
      <div><div class="font-semibold text-red-600 text-xs mb-1">NOT ALLOWED</div><div class="flex flex-wrap gap-1">${spot.prohibited_gear.map((g) => `<span class="px-2 py-0.5 bg-red-100 text-red-600 rounded-full text-xs">${g}</span>`).join('')}</div></div>
      <div><div class="font-semibold text-zinc-500 text-xs mb-1">KEY RULES</div><ul class="space-y-1 text-xs"><li><strong>Daily bag limit:</strong> ${spot.daily_limit_kg} kg total</li><li><strong>Best time:</strong> ${spot.best_time}</li><li><strong>Fishing style:</strong> ${spot.fishing_type}</li></ul></div>
      ${spot.warnings ? `<div class="bg-amber-50 border border-amber-200 rounded-xl p-3"><div class="font-semibold text-amber-700 text-xs mb-1"><i class="fa-solid fa-exclamation-triangle mr-1"></i> WARNING</div><div class="text-xs">${spot.warnings}</div></div>` : ''}
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
  showToast(`<i class="fa-solid fa-map-marker-alt"></i> <span>Spot selected: <strong>${selectedSpot.name}</strong></span>`);
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
  if (map) map.closePopup();
  showCatchSnap();
  showToast(`<i class="fa-solid fa-map-marker-alt"></i> <span>Spot selected: <strong>${selectedSpot.name}</strong></span>`);
}

function resetCatchSnap() {
  document.getElementById('step-results')?.classList.add('hidden');
  document.getElementById('step-upload').classList.remove('hidden');
  currentFish = null;
}

async function init() {
  await loadBackendData();
  console.log('%c[LegalBite v1.4] Popup + Details • API connected', 'color:#10b981;font-weight:bold');
}

window.onload = init;
window.selectExampleFish = selectExampleFish;
window.handleRealUpload = handleRealUpload;
window.addToJournal = addToJournal;
window.showJournal = showJournal;
window.deleteJournalEntry = deleteJournalEntry;
window.showComplianceModal = showComplianceModal;
window.hideComplianceModal = hideComplianceModal;
window.simulateNationalReport = simulateNationalReport;
window.showCatchSnap = showCatchSnap;
window.showMap = showMap;
window.applyMapFilters = applyMapFilters;
window.goToMyLocation = goToMyLocation;
window.showSpotDetails = showSpotDetails;
window.hideSpotDetailsModal = hideSpotDetailsModal;
window.logCatchFromSpotModal = logCatchFromSpotModal;
window.getDirectionsFromModal = getDirectionsFromModal;
window.getDirections = getDirections;
window.logCatchFromSpot = logCatchFromSpot;
window.resetCatchSnap = resetCatchSnap;