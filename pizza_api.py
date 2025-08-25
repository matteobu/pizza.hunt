from flask import Flask, jsonify, request
from flask_cors import CORS
import requests
import time
from functools import lru_cache

app = Flask(__name__)
CORS(app)  # Enable CORS for frontend requests

class PizzaDataService:
    def __init__(self):
        self.overpass_url = "http://overpass-api.de/api/interpreter"
        
    @lru_cache(maxsize=100)
    def get_pizza_places(self, lat, lng, radius=0.05):
        """
        Fetch pizza places from OpenStreetMap via Overpass API
        Uses caching to avoid repeated requests for same location
        """
        
        # Define bounding box
        south = lat - radius
        north = lat + radius
        west = lng - radius
        east = lng + radius
        
        # Overpass query for pizza places
        overpass_query = f"""
        [out:json][timeout:25];
        (
          node["amenity"="restaurant"]["cuisine"~"pizza"]({south},{west},{north},{east});
          way["amenity"="restaurant"]["cuisine"~"pizza"]({south},{west},{north},{east});
          node["amenity"="fast_food"]["cuisine"~"pizza"]({south},{west},{north},{east});
          node["shop"="food"]["cuisine"~"pizza"]({south},{west},{north},{east});
        );
        out center;
        """
        
        try:
            response = requests.get(
                self.overpass_url, 
                params={'data': overpass_query},
                timeout=30
            )
            response.raise_for_status()
            data = response.json()
            
            pizza_places = []
            for element in data['elements']:
                # Get coordinates
                if 'lat' in element and 'lon' in element:
                    lat_coord = element['lat']
                    lon_coord = element['lon']
                elif 'center' in element:
                    lat_coord = element['center']['lat']
                    lon_coord = element['center']['lon']
                else:
                    continue
                
                tags = element.get('tags', {})
                
                # Extract and clean data
                place_data = {
                    'id': element.get('id', ''),
                    'lat': lat_coord,
                    'lng': lon_coord,
                    'name': tags.get('name', 'Pizza Place'),
                    'cuisine': tags.get('cuisine', 'pizza'),
                    'amenity': tags.get('amenity', tags.get('shop', 'restaurant')),
                    'phone': tags.get('phone', ''),
                    'website': tags.get('website', ''),
                    'address': self._build_address(tags),
                    'opening_hours': tags.get('opening_hours', ''),
                    'takeaway': tags.get('takeaway', ''),
                    'delivery': tags.get('delivery', ''),
                    'rating': self._extract_rating(tags),
                }
                
                pizza_places.append(place_data)
            
            return pizza_places
            
        except requests.RequestException as e:
            print(f"Error fetching data from Overpass API: {e}")
            return []
        except Exception as e:
            print(f"Error processing pizza data: {e}")
            return []
    
    def _build_address(self, tags):
        """Build address string from OSM tags"""
        parts = []
        if tags.get('addr:housenumber'):
            parts.append(tags['addr:housenumber'])
        if tags.get('addr:street'):
            parts.append(tags['addr:street'])
        if tags.get('addr:city'):
            parts.append(tags['addr:city'])
        return ', '.join(parts) if parts else ''
    
    def _extract_rating(self, tags):
        """Extract rating if available"""
        rating = tags.get('rating', '')
        if rating:
            try:
                return float(rating)
            except ValueError:
                pass
        return None

# Initialize service
pizza_service = PizzaDataService()

@app.route('/api/pizza-places')
def get_pizza_places():
    """
    API endpoint to get pizza places
    Query parameters: lat, lng, radius (optional)
    """
    try:
        lat = float(request.args.get('lat', 40.7589))  # Default NYC
        lng = float(request.args.get('lng', -73.9851))
        radius = float(request.args.get('radius', 0.05))
        
        # Validate coordinates
        if not (-90 <= lat <= 90) or not (-180 <= lng <= 180):
            return jsonify({'error': 'Invalid coordinates'}), 400
            
        pizza_places = pizza_service.get_pizza_places(lat, lng, radius)
        
        return jsonify({
            'success': True,
            'count': len(pizza_places),
            'center': {'lat': lat, 'lng': lng},
            'places': pizza_places
        })
        
    except ValueError:
        return jsonify({'error': 'Invalid coordinate values'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search-city')
def search_city():
    """
    Search for city coordinates using Nominatim
    """
    city = request.args.get('city', '')
    
    if not city:
        return jsonify({'error': 'City parameter required'}), 400
    
    try:
        # Use Nominatim to get city coordinates
        nominatim_url = "https://nominatim.openstreetmap.org/search"
        params = {
            'q': city,
            'format': 'json',
            'limit': 1
        }
        headers = {
            'User-Agent': 'PizzaHuntApp/1.0 (your-email@example.com)'
        }
        response = requests.get(nominatim_url, params=params, headers=headers)
        response.raise_for_status()
        data = response.json()
        
        if not data:
            return jsonify({'error': 'City not found'}), 404
            
        result = data[0]
        
        return jsonify({
            'success': True,
            'city': result['display_name'],
            'lat': float(result['lat']),
            'lng': float(result['lon'])
        })
        
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/health')
def health_check():
    """Simple health check endpoint"""
    return jsonify({'status': 'healthy', 'service': 'pizza-map-api'})

if __name__ == '__main__':
    print("Starting Pizza Map API server...")
    print("Available endpoints:")
    print("  GET /api/pizza-places?lat=40.7589&lng=-73.9851")
    print("  GET /api/search-city?city=New York")
    print("  GET /api/health")
    
    app.run(host='0.0.0.0', port=5001, debug=True)
