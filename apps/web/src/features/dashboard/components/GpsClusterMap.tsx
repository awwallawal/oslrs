/**
 * GPS Cluster Map Component
 * Story 4.4 AC4.4.4: Renders submission GPS point and cluster members on a Leaflet map.
 *
 * Reuses Leaflet setup from Story 4.1 (TeamGpsMap).
 * Library: leaflet@1.9.4 + react-leaflet@4.2.1 (React 18.3 compatible)
 */

import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// Fix Leaflet default marker icon in bundled environments
const DefaultIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

const SecondaryIcon = L.icon({
  iconUrl: markerIcon,
  iconRetinaUrl: markerIcon2x,
  shadowUrl: markerShadow,
  iconSize: [20, 33],
  iconAnchor: [10, 33],
  popupAnchor: [1, -27],
  shadowSize: [33, 33],
});

L.Marker.prototype.options.icon = DefaultIcon;

interface ClusterMember {
  submissionId: string;
  lat: number;
  lng: number;
  submittedAt: string;
}

interface GpsClusterMapProps {
  primaryCoords: { lat: number; lng: number };
  clusterMembers?: ClusterMember[];
}

export function GpsClusterMap({ primaryCoords, clusterMembers = [] }: GpsClusterMapProps) {
  const center: [number, number] = [primaryCoords.lat, primaryCoords.lng];

  // Build connecting lines from primary to each cluster member
  const lines: [number, number][][] = clusterMembers.map((m) => [
    [primaryCoords.lat, primaryCoords.lng],
    [m.lat, m.lng],
  ]);

  return (
    <div className="h-48 md:h-64 rounded-lg overflow-hidden mt-2" data-testid="gps-cluster-map">
      <MapContainer
        center={center}
        zoom={14}
        scrollWheelZoom={false}
        className="h-full w-full"
        aria-label="GPS cluster evidence map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Primary submission marker */}
        <Marker position={center} icon={DefaultIcon}>
          <Popup>
            <div className="text-sm">
              <p className="font-semibold">This Submission</p>
              <p className="text-neutral-500 font-mono text-xs">
                {primaryCoords.lat.toFixed(5)}, {primaryCoords.lng.toFixed(5)}
              </p>
            </div>
          </Popup>
        </Marker>

        {/* Cluster member markers */}
        {clusterMembers.map((member) => (
          <Marker
            key={member.submissionId}
            position={[member.lat, member.lng]}
            icon={SecondaryIcon}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-semibold">Cluster Member</p>
                <p className="text-neutral-500 font-mono text-xs">
                  {member.lat.toFixed(5)}, {member.lng.toFixed(5)}
                </p>
                <p className="text-neutral-400 text-xs">
                  {new Date(member.submittedAt).toLocaleString()}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Connecting lines */}
        {lines.map((line, i) => (
          <Polyline
            key={i}
            positions={line}
            pathOptions={{ color: '#9C1E23', weight: 1, dashArray: '5,5', opacity: 0.5 }}
          />
        ))}
      </MapContainer>
    </div>
  );
}
