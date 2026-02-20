import { useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Circle } from 'react-leaflet';
import { DefaultIcon, HighlightedIcon } from './leaflet-icons';
import { ArrowLeft, CheckSquare, Square } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { FraudSeverityBadge } from './FraudSeverityBadge';
import type { FraudClusterSummary } from '../api/fraud.api';

interface ClusterDetailViewProps {
  cluster: FraudClusterSummary;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onBack: () => void;
}

/**
 * ClusterDetailView — Map + submission list for a GPS cluster.
 * Story 4.5 AC4.5.5: Leaflet map with all cluster members, circle overlay, interactive markers.
 * Uses cluster.members for data (independent of paginated list query).
 */
export function ClusterDetailView({
  cluster,
  selectedIds,
  onToggle,
  onBack,
}: ClusterDetailViewProps) {
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const listRefs = useRef<Map<string, HTMLTableRowElement>>(new Map());

  function handleMapMarkerClick(detectionId: string) {
    setHighlightedId(detectionId);
    const row = listRefs.current.get(detectionId);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function handleListRowClick(detectionId: string) {
    setHighlightedId(detectionId);
  }

  return (
    <div className="space-y-4" data-testid="cluster-detail-view">
      {/* Back button + Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack} data-testid="cluster-back-button">
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <h3 className="text-lg font-semibold">
          Cluster &mdash; {cluster.detectionCount} alerts
        </h3>
      </div>

      {/* Map */}
      <Card>
        <CardContent className="p-0">
          <div className="h-64 md:h-80 rounded-t-lg overflow-hidden" data-testid="cluster-map">
            <MapContainer
              center={[cluster.center.lat, cluster.center.lng]}
              zoom={15}
              scrollWheelZoom={false}
              className="h-full w-full"
              aria-label="Cluster GPS map"
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Cluster radius circle */}
              <Circle
                center={[cluster.center.lat, cluster.center.lng]}
                radius={cluster.radiusMeters}
                pathOptions={{
                  color: '#9C1E23',
                  fillColor: '#9C1E23',
                  fillOpacity: 0.1,
                  weight: 2,
                  dashArray: '5,5',
                }}
              />

              {/* Cluster member markers — individual GPS points (H1 fix) */}
              {cluster.members.map((m) => {
                const lat = m.gpsLatitude ?? cluster.center.lat;
                const lng = m.gpsLongitude ?? cluster.center.lng;
                return (
                  <Marker
                    key={m.id}
                    position={[lat, lng]}
                    icon={highlightedId === m.id ? HighlightedIcon : DefaultIcon}
                    eventHandlers={{
                      click: () => handleMapMarkerClick(m.id),
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold">{m.enumeratorName}</p>
                        <p className="text-neutral-500 text-xs">
                          {new Date(m.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-neutral-400 text-xs font-mono">
                          Score: {m.totalScore.toFixed(1)}
                        </p>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}
            </MapContainer>
          </div>
        </CardContent>
      </Card>

      {/* Submission list */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto max-h-72 overflow-y-auto">
            <table className="w-full text-sm" role="table" aria-label="Cluster submissions">
              <thead className="sticky top-0 bg-neutral-50 border-b">
                <tr>
                  <th className="text-left p-3 w-10"></th>
                  <th className="text-left p-3">Enumerator</th>
                  <th className="text-left p-3">Date</th>
                  <th className="text-right p-3">Score</th>
                  <th className="text-left p-3">Severity</th>
                </tr>
              </thead>
              <tbody>
                {cluster.members.map((m) => {
                  const checked = selectedIds.has(m.id);
                  const isHighlighted = highlightedId === m.id;
                  return (
                    <tr
                      key={m.id}
                      ref={(el) => { if (el) listRefs.current.set(m.id, el); }}
                      role="row"
                      className={`border-b cursor-pointer hover:bg-neutral-50 ${isHighlighted ? 'bg-amber-50' : ''}`}
                      onClick={() => handleListRowClick(m.id)}
                      data-testid={`cluster-row-${m.id}`}
                    >
                      <td className="p-3">
                        <button
                          onClick={(e) => { e.stopPropagation(); onToggle(m.id); }}
                          className="flex items-center justify-center"
                          aria-label={checked ? `Deselect ${m.enumeratorName}` : `Select ${m.enumeratorName}`}
                          data-testid={`cluster-checkbox-${m.id}`}
                        >
                          {checked
                            ? <CheckSquare className="h-4 w-4 text-green-600" />
                            : <Square className="h-4 w-4 text-neutral-400" />
                          }
                        </button>
                      </td>
                      <td className="p-3">{m.enumeratorName}</td>
                      <td className="p-3 text-neutral-600">
                        {new Date(m.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </td>
                      <td className="p-3 text-right font-mono">{m.totalScore.toFixed(1)}</td>
                      <td className="p-3">
                        <FraudSeverityBadge severity={m.severity} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
