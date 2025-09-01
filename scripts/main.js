// ================================
// API BASE CONFIGURATION
// ================================

// Local Python API
// const API_BASE = 'http://127.0.0.1:5000';

// Heroku Python API
// const API_BASE = 'https://pizza-map-api-aaac06da3a8f.herokuapp.com';

// Direct Overpass API
const API_BASE = 'https://overpass-api.de/api/interpreter';

// ================================
// Global variables
// ================================
let map = null;
let markerCluster = null;
let currentLat = 52.52; // Default Berlin
let currentLng = 13.405;
let pizzaPlaces = [];

// ================================
// Initialize the application
// ================================
document.addEventListener('DOMContentLoaded', function () {
  console.log('DOM fully loaded and parsed');
  initMap();
  loadPizzaPlaces();

  map.on('moveend', function () {
    console.log('Map moved to new area');
    const searchBtn = document.getElementById('searchAreaBtn');
    searchBtn.style.background = '#f39c12';
    searchBtn.textContent = 'Search This Area';
  });

  document
    .getElementById('cityInput')
    .addEventListener('keypress', function (e) {
      if (e.key === 'Enter') searchCity();
    });
});

// ================================
// Map initialization
// ================================
function initMap() {
  console.log('Initializing map...');
  map = L.map('map').setView([currentLat, currentLng], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors | Pizza data via API',
  }).addTo(map);

  markerCluster = L.markerClusterGroup({
    iconCreateFunction: function (cluster) {
      const count = cluster.getChildCount();
      let size = 'small';
      if (count >= 10) size = 'medium';
      if (count >= 100) size = 'large';

      return L.divIcon({
        html: `<div><span>🍕</span><br><span>${count}</span></div>`,
        className: `pizza-cluster pizza-cluster-${size}`,
        iconSize: L.point(40, 40),
      });
    },
  });

  map.addLayer(markerCluster);
  console.log('Map initialized successfully');
}

// ================================
// UI Helpers
// ================================
function showLoading(show = true) {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = show ? 'flex' : 'none';
}

function updateStatus(message, type = '') {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
}

// ================================
// Load Pizza Places (Python API or Overpass)
// ================================
async function loadPizzaPlaces() {
  showLoading(true);
  updateStatus('Loading pizza places...');

  try {
    let places = [];

    if (API_BASE.includes('overpass-api.de')) {
      // --- Direct Overpass API ---
      const radius = 0.05;
      const south = currentLat - radius;
      const north = currentLat + radius;
      const west = currentLng - radius;
      const east = currentLng + radius;

      const query = `
        [out:json][timeout:25];
        (
          node["amenity"="restaurant"]["cuisine"~"pizza"](${south},${west},${north},${east});
          way["amenity"="restaurant"]["cuisine"~"pizza"](${south},${west},${north},${east});
          node["amenity"="fast_food"]["cuisine"~"pizza"](${south},${west},${north},${east});
          node["shop"="food"]["cuisine"~"pizza"](${south},${west},${north},${east});
        );
        out center;
      `;

      const response = await fetch(API_BASE, {
        method: 'POST',
        body: query,
        headers: { 'Content-Type': 'text/plain' },
      });

      const data = await response.json();
      places = data.elements
        .map((el) => {
          let lat, lng;
          if (el.lat && el.lon) {
            lat = el.lat;
            lng = el.lon;
          } else if (el.center) {
            lat = el.center.lat;
            lng = el.center.lon;
          } else {
            return null;
          }

          const tags = el.tags || {};
          return {
            id: el.id,
            lat,
            lng,
            name: tags.name || 'Pizza Place',
            cuisine: tags.cuisine || 'pizza',
            amenity: tags.amenity || tags.shop || 'restaurant',
            phone: tags.phone || '',
            website: tags.website || '',
            address: buildAddress(tags),
            opening_hours: tags.opening_hours || '',
            takeaway: tags.takeaway || '',
            delivery: tags.delivery || '',
          };
        })
        .filter(Boolean);
    } else {
      // --- Python API (localhost or Heroku) ---
      const response = await fetch(
        `${API_BASE}/api/pizza-places?lat=${currentLat}&lng=${currentLng}&radius=0.05`
      );
      const data = await response.json();
      if (!data.success) {
        updateStatus(`Error: ${data.error}`, 'error');
        return;
      }
      places = data.places;
    }

    addPizzaMarkers(places);
    updateStatus(`Found ${places.length} pizza places!`, 'success');
  } catch (error) {
    console.error('Error loading pizza places:', error);
    updateStatus(`Error: ${error.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

// ================================
// Add markers
// ================================
function addPizzaMarkers(places) {
  markerCluster.clearLayers();

  places.forEach((place) => {
    const pizzaIcon = L.divIcon({
      html: '🍕',
      className: 'pizza-marker',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    const popupContent = createPopupContent(place);

    const marker = L.marker([place.lat, place.lng], { icon: pizzaIcon })
      .bindPopup(popupContent, { maxWidth: 300 })
      .bindTooltip(place.name, { direction: 'top' });

    markerCluster.addLayer(marker);
  });

  console.log(`Added ${places.length} pizza markers to map`);
}

// ================================
// Popup content
// ================================
function createPopupContent(place) {
  const content = document.createElement('div');
  content.className = 'pizza-popup';

  let html = `<h3>${place.name}</h3>`;
  html += `<div class="popup-info"><strong>Type:</strong> ${place.amenity}</div>`;
  if (place.address)
    html += `<div class="popup-info"><strong>Address:</strong> ${place.address}</div>`;
  if (place.phone)
    html += `<div class="popup-info"><strong>Phone:</strong> ${place.phone}</div>`;
  if (place.website)
    html += `<div class="popup-info"><strong>Website:</strong> <a href="${place.website}" target="_blank">Visit</a></div>`;
  if (place.opening_hours)
    html += `<div class="popup-info"><strong>Hours:</strong> ${place.opening_hours}</div>`;
  if (place.takeaway === 'yes')
    html += `<div class="popup-info">🥡 Takeaway available</div>`;
  if (place.delivery === 'yes')
    html += `<div class="popup-info">🚚 Delivery available</div>`;

  content.innerHTML = html;
  return content;
}

// ================================
// Search city
// ================================
async function searchCity() {
  const cityInput = document.getElementById('cityInput');
  const cityName = cityInput.value.trim();
  if (!cityName) {
    updateStatus('Please enter a city name', 'error');
    return;
  }

  updateStatus('Searching for city...');
  try {
    if (API_BASE.includes('overpass-api.de')) {
      // Direct Overpass/Nominatim
      const response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
          cityName
        )}`,
        { headers: { 'User-Agent': 'PizzaHuntApp/1.0 (email@example.com)' } }
      );
      const data = await response.json();
      if (!data.length) throw new Error('City not found');

      updateLocation(parseFloat(data[0].lat), parseFloat(data[0].lon));
      updateStatus(`Found ${data[0].display_name}`, 'success');
    } else {
      // Python API
      const response = await fetch(
        `${API_BASE}/api/search-city?city=${encodeURIComponent(cityName)}`
      );
      const data = await response.json();
      if (!data.success) throw new Error(data.error);

      updateLocation(data.lat, data.lng);
      updateStatus(`Found ${data.city}`, 'success');
    }
  } catch (error) {
    console.error('City search error:', error);
    updateStatus(`City search error: ${error.message}`, 'error');
  }
}

// ================================
// Update map location
// ================================
function updateLocation(lat, lng) {
  currentLat = lat;
  currentLng = lng;
  map.setView([lat, lng], 12);
  loadPizzaPlaces();
}

// ================================
