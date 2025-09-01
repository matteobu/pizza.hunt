// Configuration
const API_BASE =
  window.location.hostname === 'localhost'
    ? 'http://127.0.0.1:5000'
    : 'https://pizza-map-api-aaac06da3a8f.herokuapp.com';

// Global variables
let map = null;
let markerCluster = null;
let currentLat = 52.52; // Default Berlin
let currentLng = 13.405;
let pizzaPlaces = [];

// Initialize the application
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
      if (e.key === 'Enter') {
        searchCity();
      }
    });
});

function initMap() {
  console.log('Initializing map...');

  map = L.map('map').setView([currentLat, currentLng], 12);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors | Pizza data via Python API',
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

function showLoading(show = true) {
  const overlay = document.getElementById('loadingOverlay');
  overlay.style.display = show ? 'flex' : 'none';
}

function updateStatus(message, type = '') {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
}

// --- UPDATED: load pizza places ONLY from Python API ---
async function loadPizzaPlaces() {
  showLoading(true);
  updateStatus('Loading pizza places from API...');

  try {
    const response = await fetch(
      `${API_BASE}/api/pizza-places?lat=${currentLat}&lng=${currentLng}&radius=0.05`
    );
    const data = await response.json();

    if (!data.success) {
      updateStatus(`Error: ${data.error}`, 'error');
      return;
    }

    const places = data.places;
    addPizzaMarkers(places);
    updateStatus(`Found ${places.length} pizza places!`, 'success');
  } catch (error) {
    console.error('Error loading pizza places:', error);
    updateStatus(`Error: ${error.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

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

async function searchCity() {
  const cityInput = document.getElementById('cityInput');
  const cityName = cityInput.value.trim();

  if (!cityName) {
    updateStatus('Please enter a city name', 'error');
    return;
  }

  updateStatus('Searching for city...');

  try {
    const response = await fetch(
      `${API_BASE}/api/search-city?city=${encodeURIComponent(cityName)}`
    );
    const data = await response.json();

    if (!data.success) {
      updateStatus(`City search error: ${data.error}`, 'error');
      return;
    }

    updateLocation(data.lat, data.lng);
    updateStatus(`Found ${data.city}`, 'success');
  } catch (error) {
    console.error('City search error:', error);
    updateStatus(`City search error: ${error.message}`, 'error');
  }
}

function updateLocation(lat, lng) {
  currentLat = lat;
  currentLng = lng;
  map.setView([lat, lng], 12);
  loadPizzaPlaces();
}

function useCurrentLocation() {
  if (navigator.geolocation) {
    updateStatus('Getting your location...');

    navigator.geolocation.getCurrentPosition(
      function (position) {
        updateLocation(position.coords.latitude, position.coords.longitude);
      },
      function (error) {
        console.error('Geolocation error:', error);
        updateStatus('Location access denied', 'error');
      }
    );
  } else {
    updateStatus('Geolocation not supported', 'error');
  }
}

function searchCurrentArea() {
  const center = map.getCenter();
  const zoom = map.getZoom();
  if (zoom < 10) {
    updateStatus('Please zoom in more to search a smaller area', 'error');
    return;
  }

  currentLat = center.lat;
  currentLng = center.lng;
  updateStatus('Searching pizza places in current area...');
  loadPizzaPlaces();
}
