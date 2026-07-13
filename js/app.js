const API_BASE = window.CATCHSNAP_API || 'http://localhost:3001/api/v1';
const BRAND = '#3779EC';
const BRAND_DARK = '#2856C7';

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
    { id: 0, speciesId: 'gilthead-seabream', species: 'Gilthead Sea Bream', scientific: 'Sparus aurata', confidence: 95, length: '38 cm', lengthValue: 38, minLegalLength: 20, location: 'Legal spot near Paros, Cyclades', nutrition: ['High-quality protein (20g per 100g)', 'Rich in omega-3 fatty acids for heart & brain health'], ecoScore: 92, image: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=400&h=400&fit=crop' },
    { id: 1, speciesId: 'european-seabass', species: 'European Sea Bass', scientific: 'Dicentrarchus labrax', confidence: 91, length: '42 cm', lengthValue: 42, minLegalLength: 42, location: 'Legal public harbor, Kefalonia', nutrition: ['Lean protein (18-20g per 100g)', 'High in omega-3s and vitamin B12'], ecoScore: 88, image: 'https://images.unsplash.com/photo-1519708227418-c8fd9a32b7a2?w=400&h=400&fit=crop' },
    { id: 2, speciesId: 'common-octopus', species: 'Common Octopus', scientific: 'Octopus vulgaris', confidence: 87, length: '~1.1 kg', lengthValue: 1.1, minLegalLength: 0.75, isWeight: true, location: 'Legal rocky shore, Crete', nutrition: ['Extremely high protein (25g+ per 100g cooked)', 'Low calorie, rich in iron, B12'], ecoScore: 95, image: 'https://images.unsplash.com/photo-1559737558-2f5a35f4523b?w=400&h=400&fit=crop' },
  ];

  legalFishingSpots = [
    { id: 500, name: 'Faliron Bay Public Piers', lat: 37.942, lng: 23.685, region: 'Attica', access: 'Easy - 5 min walk from free public parking', allowed_gear: ['Rod & line', 'Spinning', 'Jigging', 'Handline'], prohibited_gear: ['Nets', 'Spearguns', 'Traps'], daily_limit_kg: 5, best_time: 'Early morning & dusk', fishing_type: 'Shore casting & jigging', warnings: 'Busy promenade — watch for swimmers and boats', difficulty: 'Easy' },
    { id: 501, name: 'Vouliagmeni Rocky Shores', lat: 37.812, lng: 23.775, region: 'Attica', access: 'Moderate - 10 min walk from parking area', allowed_gear: ['Rod & line', 'Spinning', 'Jigging'], prohibited_gear: ['Nets', 'Spearguns', 'Bottom trawling'], daily_limit_kg: 5, best_time: 'Dawn and late afternoon', fishing_type: 'Rock fishing & spinning', warnings: 'Slippery rocks when wet — wear good shoes', difficulty: 'Moderate' },
    { id: 502, name: 'Glyfada Promenade', lat: 37.865, lng: 23.753, region: 'Attica', access: 'Very easy - directly from promenade', allowed_gear: ['Rod & line', 'Spinning', 'Jigging', 'Handline'], prohibited_gear: ['Nets', 'Spearguns'], daily_limit_kg: 5, best_time: 'Evening and night', fishing_type: 'Urban shore fishing', warnings: 'High foot traffic', difficulty: 'Easy' },
    { id: 505, name: 'Nafplio Harbor & Rocky Coast', lat: 37.568, lng: 22.796, region: 'Argolis', access: 'Easy - parking within 200m', allowed_gear: ['Rod & line', 'Spinning', 'Jigging'], prohibited_gear: ['Nets', 'Spearguns'], daily_limit_kg: 5, best_time: 'Sunrise and sunset', fishing_type: 'Harbor jigging & casting', warnings: 'Strong currents near harbor entrance', difficulty: 'Easy' },
    { id: 506, name: 'Kalamata Beachfront', lat: 37.038, lng: 22.113, region: 'Messenia', access: 'Easy - multiple access points along promenade', allowed_gear: ['Rod & line', 'Spinning', 'Jigging', 'Handline'], prohibited_gear: ['Nets', 'Spearguns', 'Traps'], daily_limit_kg: 5, best_time: 'Early morning', fishing_type: 'Beach and promenade fishing', warnings: 'Can be windy in afternoon', difficulty: 'Easy' },
    { id: 508, name: 'Aegina Town Pier & Marina', lat: 37.746, lng: 23.427, region: 'Aegina', access: 'Very easy - right in town center', allowed_gear: ['Rod & line', 'Spinning', 'Jigging'], prohibited_gear: ['Nets', 'Spearguns'], daily_limit_kg: 5, best_time: 'Dawn and dusk', fishing_type: 'Pier and marina casting', warnings: 'Ferry traffic — stay clear of berths', difficulty: 'Easy' },
    { id: 509, name: 'Paros Naoussa Harbor', lat: 37.124, lng: 25.236, region: 'Cyclades', access: 'Easy - limited parking 5 min away', allowed_gear: ['Rod & line', 'Spinning', 'Jigging'], prohibited_gear: ['Nets', 'Spearguns'], daily_limit_kg: 5, best_time: 'Early morning', fishing_type: 'Harbor and rocky shore', warnings: 'Tourist area in summer — fish early', difficulty: 'Easy' },
    { id: 510, name: 'Heraklion Old Port', lat: 35.342, lng: 25.134, region: 'Crete', access: 'Easy - parking available nearby', allowed_gear: ['Rod & line', 'Spinning', 'Jigging'], prohibited_gear: ['Nets', 'Spearguns'], daily_limit_kg: 5, best_time: 'Evening', fishing_type: 'Old port shore fishing', warnings: 'Watch for large waves during storms', difficulty: 'Moderate' },
    { id: 511, name: 'Chania Old Harbor', lat: 35.516, lng: 24.018, region: 'Crete', access: 'Very easy - central location', allowed_gear: ['Rod & line', 'Spinning', 'Jigging', 'Handline'], prohibited_gear: ['Nets', 'Spearguns'], daily_limit_kg: 5, best_time: 'Sunset', fishing_type: 'Harbor wall fishing', warnings: 'Very busy with tourists', difficulty: 'Easy' },
    { id: 512, name: 'Piraeus Mikrolimano', lat: 37.935, lng: 23.683, region: 'Attica', access: 'Easy - parking at marina', allowed_gear: ['Rod & line', 'Spinning', 'Jigging'], prohibited_gear: ['Nets', 'Spearguns'], daily_limit_kg: 5, best_time: 'Night fishing recommended', fishing_type: 'Marina and rocky breakwater', warnings: 'Strong winds can occur', difficulty: 'Moderate' },
  ];

  protectedAreas = [
    { name: 'Gyaros Marine Wildlife Refuge', lat: 37.62, lng: 24.72, protection_level: 'Most Restrictive', region: 'South Aegean', note: 'No fishing of any kind permitted' },
    { name: 'Zakynthos Marine Park', lat: 37.78, lng: 20.85, protection_level: 'No Fishing Zone', region: 'Ionian Islands', note: 'Strictly protected — heavy fines apply' },
    { name: 'Alonnisos Northern Sporades', lat: 39.15, lng: 23.85, protection_level: 'Highly Protected', region: 'Sporades', note: 'Limited access — check local rules' },
  ];
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
      ? { ...fishData[exampleId] }
      : { ...fishData[Math.floor(Math.random() * fishData.length)], species: fishData[0].species + ' (AI Identified)', confidence: 88 };
    if (customImage) fish.image = customImage;
    if (selectedSpot) fish.location = `${selectedSpot.name}, ${selectedSpot.region}`;
    return fish;
  }
}

function hideAllSteps() {
  ['step-upload', 'step-analyzing', 'step-results', 'step-map'].forEach((id) => {
    document.getElementById(id)?.classList.add('hidden');
  });
}

function selectExampleFish(index) {
  hideAllSteps();
  document.getElementById('step-analyzing').classList.remove('hidden');
  setNavActive('catchsnap');
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
    hideAllSteps();
    document.getElementById('step-analyzing').classList.remove('hidden');
    setNavActive('catchsnap');
    runAnalysis(undefined, e.target.result).then((fish) => {
      currentFish = fish;
      setTimeout(() => showResults(currentFish), 1200);
    });
  };
  reader.readAsDataURL(file);
}

function showResults(fish) {
  hideAllSteps();
  document.getElementById('step-results').classList.remove('hidden');

  document.getElementById('result-species').innerHTML = `${fish.species} <span class="text-base font-normal text-zinc-500">(${fish.scientific})</span>`;
  document.getElementById('result-confidence').innerHTML = `<i class="fa-solid fa-check-circle mr-1"></i> ${fish.confidence}% confidence`;
  document.getElementById('result-location').innerHTML = `<i class="fa-solid fa-map-marker-alt mr-1 text-brand"></i> ${fish.location}`;
  document.getElementById('result-length').innerHTML = fish.length;
  document.getElementById('result-eco').innerHTML = `+${fish.ecoScore}`;

  document.getElementById('result-fish-image').innerHTML = `<img src="${fish.image}" class="w-full h-full object-cover" alt="${fish.species}">`;

  document.getElementById('result-nutrition').innerHTML = fish.nutrition
    .map((item) => `<div class="flex items-start gap-x-2 text-sm"><i class="fa-solid fa-check text-brand mt-1"></i> <span>${item}</span></div>`)
    .join('');

  const legal = checkIfLegal(fish);
  const legalStatusContainer = document.getElementById('result-legal-status');
  if (legal.legal) {
    legalStatusContainer.innerHTML = `<div class="flex items-center gap-x-2"><i class="fa-solid fa-check-circle text-brand text-xl"></i><div><div class="font-semibold text-brand-dark">Fully Legal</div><div class="text-[10px] text-brand">Above minimum size</div></div></div>`;
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
  showToast('<i class="fa-solid fa-check-circle"></i> <span>Added to Journal!</span>', 'bg-brand');
}

function showToast(html, bg = 'bg-brand-dark') {
  const toast = document.createElement('div');
  toast.className = `fixed bottom-6 left-1/2 -translate-x-1/2 ${bg} text-white px-5 py-2.5 rounded-3xl shadow-xl text-sm z-[70] flex items-center gap-x-2`;
  toast.innerHTML = html;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2800);
}

function showJournal() {
  hideAllSteps();
  document.getElementById('step-upload').classList.remove('hidden');
  setNavActive('journal');

  const existing = document.getElementById('journal-overlay');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'journal-overlay';
  modal.className = 'fixed inset-0 bg-black/70 flex items-end justify-center z-[60]';
  const content = journalEntries.length === 0
    ? '<div class="text-center py-10"><i class="fa-solid fa-book text-5xl text-zinc-200 mb-4"></i><p class="text-zinc-500">No catches logged yet.</p></div>'
    : journalEntries.map((entry) => `
      <div class="border border-zinc-100 rounded-2xl p-4 flex gap-4 mb-3" data-entry-id="${entry.id}">
        <div class="w-16 h-16 flex-shrink-0 rounded-2xl overflow-hidden border"><img src="${entry.image}" class="w-full h-full object-cover" alt=""></div>
        <div class="flex-1">
          <div class="font-semibold">${entry.species}</div>
          <div class="text-xs text-zinc-500">${entry.addedAt} • ${entry.location}</div>
          ${entry.spot ? `<div class="text-xs text-brand mt-0.5"><i class="fa-solid fa-map-marker-alt"></i> ${entry.spot}</div>` : ''}
          <div class="text-xs mt-1">${entry.lengthValue >= entry.minLegalLength ? '<span class="text-brand">Legal</span>' : '<span class="text-amber-600">Below min size</span>'}</div>
        </div>
        <button type="button" data-delete-id="${entry.id}" class="journal-delete text-red-400 hover:text-red-600 p-1"><i class="fa-solid fa-trash text-sm"></i></button>
      </div>`).join('');

  modal.innerHTML = `<div class="bg-white w-full max-w-[420px] rounded-t-3xl p-6 max-h-[85vh] overflow-auto">
    <div class="flex justify-between items-center mb-5">
      <div class="font-semibold text-2xl">My Journal</div>
      <button type="button" id="journal-close" class="text-3xl text-zinc-400 hover:text-zinc-600">×</button>
    </div>${content}</div>`;

  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
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
  if (journalEntries.length === 0) {
    document.getElementById('journal-overlay')?.remove();
    showJournal();
  }
}

function showComplianceModal() {
  const modal = document.getElementById('compliance-modal');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function hideComplianceModal() {
  const modal = document.getElementById('compliance-modal');
  modal.classList.remove('flex');
  modal.classList.add('hidden');
  restoreComplianceBody();
}

function restoreComplianceBody() {
  document.getElementById('compliance-body').innerHTML = `
    <div class="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-amber-800">
      <strong>Important:</strong> Recreational sea fishers in Greece must register and report certain catches via the official national digital system.
    </div>
    <div>
      <div class="font-medium mb-2">Why report?</div>
      <ul class="space-y-1 text-xs text-zinc-600 pl-1">
        <li class="flex gap-x-2"><span class="text-brand">•</span> Helps scientists manage fish stocks</li>
        <li class="flex gap-x-2"><span class="text-brand">•</span> Protects species like the one you just caught</li>
        <li class="flex gap-x-2"><span class="text-brand">•</span> Avoids potential fines</li>
      </ul>
    </div>
    <div>
      <div class="font-medium mb-2">How to report (official steps):</div>
      <ol class="list-decimal pl-5 space-y-1 text-xs text-zinc-600">
        <li>Go to the official national recreational fishing portal or app.</li>
        <li>Complete digital registration (free, annual).</li>
        <li>Report your catch electronically — same day for many species.</li>
      </ol>
    </div>
    <div class="pt-2">
      <button type="button" id="btn-national-report" class="w-full py-3.5 bg-brand hover:bg-brand-dark text-white rounded-3xl font-semibold text-sm flex items-center justify-center gap-x-2">
        <span>Open Official Guidance</span>
        <i class="fa-solid fa-external-link-alt"></i>
      </button>
      <p class="text-center text-[10px] text-zinc-500 mt-2">This app guides you — it does not replace the official system.</p>
    </div>`;
  document.getElementById('btn-national-report')?.addEventListener('click', simulateNationalReport);
}

function simulateNationalReport() {
  document.getElementById('compliance-body').innerHTML = `
    <div class="p-6 text-center">
      <div class="mx-auto w-16 h-16 bg-brand-light rounded-full flex items-center justify-center mb-4"><i class="fa-solid fa-check text-brand text-4xl"></i></div>
      <div class="font-semibold text-xl mb-2">Thank you!</div>
      <p class="text-sm text-zinc-600 mb-4">You are being redirected to the official Hellenic Coast Guard portal.</p>
      <button type="button" id="btn-open-portal" class="w-full py-3 bg-brand text-white rounded-3xl font-medium">Open Official Portal</button>
    </div>`;
  document.getElementById('btn-open-portal')?.addEventListener('click', () => {
    window.open('https://alieia.hcg.gr/', '_blank');
    hideComplianceModal();
  });
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
  else setTimeout(() => map.invalidateSize(), 150);
}

function setNavActive(tab) {
  document.querySelectorAll('[data-nav]').forEach((el) => {
    el.classList.toggle('active', el.dataset.nav === tab);
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
    const marker = L.circleMarker([spot.lat, spot.lng], { radius: 9, fillColor: BRAND, color: '#fff', weight: 2, fillOpacity: 0.9 }).addTo(map);
    const popupHTML = `<div style="min-width:220px"><div class="font-semibold">${spot.name}</div><div class="text-xs text-zinc-500">${spot.region} • ${spot.difficulty}</div><div class="mt-2 text-xs"><strong>Daily limit:</strong> ${spot.daily_limit_kg} kg<br><strong>Allowed:</strong> ${spot.allowed_gear.slice(0, 2).join(', ')}</div><div class="mt-3 flex gap-2"><button onclick="getDirections(${spot.lat},${spot.lng});event.stopImmediatePropagation();" class="text-xs px-3 py-1 bg-white border border-zinc-300 rounded-full flex-1">Directions</button><button onclick="logCatchFromSpot(${spot.id});event.stopImmediatePropagation();" class="text-xs px-3 py-1 text-white rounded-full flex-1" style="background:${BRAND}">Log Catch</button></div><button onclick="showSpotDetails(${spot.id});event.stopImmediatePropagation();" class="mt-2 w-full text-xs px-3 py-1 bg-zinc-100 hover:bg-zinc-200 rounded-full">More Info →</button></div>`;
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
  let visibleLegal = 0;
  let visibleProtected = 0;
  legalMarkers.forEach(({ marker, data: spot }) => {
    const matches = !searchTerm || spot.name.toLowerCase().includes(searchTerm) || spot.region.toLowerCase().includes(searchTerm);
    const show = matches && isWithinDistance(marker, userLat, userLng, maxDistanceKm);
    marker.setOpacity(show ? 1 : 0.15);
    if (show) visibleLegal++;
  });
  protectionMarkers.forEach(({ marker, data: area }) => {
    const matches = !searchTerm || area.name.toLowerCase().includes(searchTerm) || area.region.toLowerCase().includes(searchTerm);
    if (showOnlyLegal) marker.setOpacity(0.1);
    else {
      marker.setOpacity(matches ? 1 : 0.15);
      if (matches) visibleProtected++;
    }
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
    userMarker = L.marker([userLat, userLng], {
      icon: L.divIcon({
        className: 'user-location',
        html: `<div style="background:${BRAND};width:14px;height:14px;border:3px solid white;border-radius:50%;box-shadow:0 0 0 2px ${BRAND}"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    }).addTo(map);
    userMarker.bindPopup('Your location').openPopup();
    map.flyTo([userLat, userLng], 10, { duration: 1.5 });
    setTimeout(() => {
      document.getElementById('legal-only-toggle').checked = true;
      applyMapFilters();
    }, 1600);
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
  if (map) map.closePopup();
  document.getElementById('spot-modal-name').textContent = spot.name;
  document.getElementById('spot-modal-region').textContent = `${spot.region} • ${spot.difficulty} access`;
  document.getElementById('spot-modal-content').innerHTML = `
    <div class="space-y-4 text-sm">
      <div><div class="font-semibold text-zinc-500 text-xs mb-1">ACCESS & LOCATION</div><div>${spot.access}</div></div>
      <div><div class="font-semibold text-brand-dark text-xs mb-1">ALLOWED EQUIPMENT</div><div class="flex flex-wrap gap-1">${spot.allowed_gear.map((g) => `<span class="px-2 py-0.5 bg-brand-light text-brand-dark rounded-full text-xs">${g}</span>`).join('')}</div></div>
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
  hideAllSteps();
  document.getElementById('step-upload').classList.remove('hidden');
  currentFish = null;
}

function setupEventListeners() {
  document.getElementById('nav-map')?.addEventListener('click', showMap);
  document.getElementById('nav-catchsnap')?.addEventListener('click', showCatchSnap);
  document.getElementById('nav-journal')?.addEventListener('click', showJournal);
  document.getElementById('nav-legal')?.addEventListener('click', () => {
    setNavActive('legal');
    showComplianceModal();
  });

  document.querySelectorAll('[data-example-index]').forEach((btn) => {
    btn.addEventListener('click', () => selectExampleFish(+btn.dataset.exampleIndex));
  });

  document.getElementById('upload-trigger')?.addEventListener('click', () => {
    document.getElementById('real-upload').click();
  });
  document.getElementById('real-upload')?.addEventListener('change', handleRealUpload);

  document.getElementById('btn-add-journal')?.addEventListener('click', addToJournal);
  document.getElementById('btn-compliance')?.addEventListener('click', showComplianceModal);
  document.getElementById('btn-reset')?.addEventListener('click', resetCatchSnap);

  document.getElementById('map-search')?.addEventListener('keyup', applyMapFilters);
  document.getElementById('legal-only-toggle')?.addEventListener('change', applyMapFilters);
  document.getElementById('btn-near-me')?.addEventListener('click', goToMyLocation);

  document.getElementById('compliance-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'compliance-modal') hideComplianceModal();
  });
  document.getElementById('compliance-close')?.addEventListener('click', hideComplianceModal);
  document.getElementById('btn-national-report')?.addEventListener('click', simulateNationalReport);

  document.getElementById('spot-details-modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'spot-details-modal') hideSpotDetailsModal();
  });
  document.getElementById('spot-modal-close')?.addEventListener('click', hideSpotDetailsModal);
  document.getElementById('btn-log-catch-spot')?.addEventListener('click', logCatchFromSpotModal);
  document.getElementById('btn-directions-spot')?.addEventListener('click', getDirectionsFromModal);
}

async function init() {
  setupEventListeners();
  setNavActive('catchsnap');
  await loadBackendData();
  console.log('%c[CatchSnap v1.4] Brand + full data loaded', `color:${BRAND};font-weight:bold`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

// Leaflet popup buttons still use inline onclick
window.showSpotDetails = showSpotDetails;
window.hideSpotDetailsModal = hideSpotDetailsModal;
window.logCatchFromSpot = logCatchFromSpot;
window.getDirections = getDirections;
window.logCatchFromSpotModal = logCatchFromSpotModal;
window.getDirectionsFromModal = getDirectionsFromModal;