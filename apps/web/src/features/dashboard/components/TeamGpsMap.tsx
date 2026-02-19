/**
 * Team GPS Map Component
 *
 * Story 4.1 AC4.1.3: GPS Map View of Latest Submissions
 * Renders a Leaflet map showing each enumerator's latest GPS-captured submission.
 *
 * Library: leaflet@1.9.4 + react-leaflet@4.2.1 (React 18.3 compatible)
 * Leaflet CSS is imported locally in this component (not globally).
 */

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import type { GpsPoint } from '../api/supervisor.api';

// Fix Leaflet default marker icon in bundled environments (Vite strips asset refs).
// Local imports ensure markers work offline (PWA service worker caches bundled assets).
const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});
L.Marker.prototype.options.icon = DefaultIcon;

/** Default map center: Ibadan, Oyo State (reused by Story 4.3 fraud GPS maps) */
const DEFAULT_MAP_CENTER: [number, number] = [7.3775, 3.947];

interface TeamGpsMapProps {
  points: GpsPoint[];
}

export function computeCenter(points: GpsPoint[]): [number, number] {
  if (points.length === 0) return DEFAULT_MAP_CENTER;
  const lat = points.reduce((sum, p) => sum + p.latitude, 0) / points.length;
  const lng = points.reduce((sum, p) => sum + p.longitude, 0) / points.length;
  return [lat, lng];
}

function formatSubmittedAt(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export function TeamGpsMap({ points }: TeamGpsMapProps) {
  const center = computeCenter(points);

  return (
    <div className="h-64 md:h-80 rounded-lg overflow-hidden" data-testid="gps-map-container">
      <MapContainer
        center={center}
        zoom={12}
        scrollWheelZoom={false}
        className="h-full w-full"
        aria-label="Enumerator submission locations map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {points.map((point) => (
          <Marker
            key={point.enumeratorId}
            position={[point.latitude, point.longitude]}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">{point.enumeratorName}</p>
                <p className="text-neutral-500">{formatSubmittedAt(point.submittedAt)}</p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
