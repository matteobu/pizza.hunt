// Configuration
const API_BASE = null;

// Global variables
let map = null;
let markerCluster = null;
let currentLat = 52.52; // Default Berlin
let currentLng = 13.405;
let pizzaPlaces = [];

// Initialize the application
document.addEventListener('DOMContentLoaded', function () {
  initMap();
  loadPizzaPlaces();
  map.on('moveend', function () {
    const searchBtn = document.getElementById('searchAreaBtn');
    searchBtn.style.background = '#f39c12'; // Orange color to indicate new area
    searchBtn.textContent = 'Search This Area';
  });

  // Add enter key support for city search
  document
    .getElementById('cityInput')
    .addEventListener('keypress', function (e) {
      if (e.key === 'Enter') {
        searchCity();
      }
    });
});

function initMap() {
  // Initialize the map
  map = L.map('map').setView([currentLat, currentLng], 12);

  // Add OpenStreetMap tiles
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors | Pizza data via Python API',
  }).addTo(map);

  // Initialize marker cluster
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

async function loadPizzaPlaces() {
  showLoading(true);
  updateStatus('Loading pizza places...');

  try {
    const bbox = 0.05;
    const south = currentLat - bbox;
    const north = currentLat + bbox;
    const west = currentLng - bbox;
    const east = currentLng + bbox;

    const query = `
            [out:json][timeout:25];
            (
              node["amenity"="restaurant"]["cuisine"~"pizza"](${south},${west},${north},${east});
              node["amenity"="fast_food"]["cuisine"~"pizza"](${south},${west},${north},${east});
            );
            out;
        `;

    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      body: query,
    });

    const data = await response.json();
    const places = data.elements.map((element) => ({
      lat: element.lat,
      lng: element.lon,
      name: element.tags?.name || 'Pizza Place',
      amenity: element.tags?.amenity || 'restaurant',
      address: buildAddress(element.tags || {}),
      phone: element.tags?.phone || '',
      website: element.tags?.website || '',
      opening_hours: element.tags?.opening_hours || '',
      takeaway: element.tags?.takeaway || '',
      delivery: element.tags?.delivery || '',
    }));

    addPizzaMarkers(places);
    updateStatus(`Found ${places.length} pizza places!`, 'success');
  } catch (error) {
    console.error('Error loading pizza places:', error);
    updateStatus(`Error: ${error.message}`, 'error');
  } finally {
    showLoading(false);
  }
}

function buildAddress(tags) {
  const parts = [];
  if (tags['addr:housenumber']) parts.push(tags['addr:housenumber']);
  if (tags['addr:street']) parts.push(tags['addr:street']);
  if (tags['addr:city']) parts.push(tags['addr:city']);
  return parts.join(', ') || '';
}

function addPizzaMarkers(places) {
  // Clear existing markers
  markerCluster.clearLayers();

  places.forEach((place) => {
    // Create custom pizza icon
    const pizzaIcon = L.divIcon({
      html: '🍕',
      className: 'pizza-marker',
      iconSize: [30, 30],
      iconAnchor: [15, 15],
    });

    // Create popup content
    const popupContent = createPopupContent(place);

    // Create marker
    const marker = L.marker([place.lat, place.lng], {
      icon: pizzaIcon,
    })
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

  if (place.address) {
    html += `<div class="popup-info"><strong>Address:</strong> ${place.address}</div>`;
  }

  if (place.phone) {
    html += `<div class="popup-info"><strong>Phone:</strong> ${place.phone}</div>`;
  }

  if (place.website) {
    html += `<div class="popup-info"><strong>Website:</strong> <a href="${place.website}" target="_blank">Visit</a></div>`;
  }

  if (place.opening_hours) {
    html += `<div class="popup-info"><strong>Hours:</strong> ${place.opening_hours}</div>`;
  }

  if (place.takeaway === 'yes') {
    html += `<div class="popup-info">🥡 Takeaway available</div>`;
  }

  if (place.delivery === 'yes') {
    html += `<div class="popup-info">🚚 Delivery available</div>`;
  }

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
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
        cityName
      )}&format=json&limit=1`,
      {
        headers: {
          'User-Agent': 'PizzaHuntApp/1.0',
        },
      }
    );
    const data = await response.json();

    if (data.length > 0) {
      const result = data[0];
      updateLocation(parseFloat(result.lat), parseFloat(result.lon));
      updateStatus(`Found ${result.display_name}`, 'success');
    } else {
      updateStatus('City not found', 'error');
    }
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
  // Get current map center and bounds
  const center = map.getCenter();
  const bounds = map.getBounds();

  // Calculate if the area is reasonable for searching
  const zoom = map.getZoom();
  if (zoom < 10) {
    updateStatus('Please zoom in more to search a smaller area', 'error');
    return;
  }

  updateStatus('Searching pizza places in current area...');

  // Update current coordinates to map center
  currentLat = center.lat;
  currentLng = center.lng;

  // Load pizza places for the new area
  loadPizzaPlaces();
}
