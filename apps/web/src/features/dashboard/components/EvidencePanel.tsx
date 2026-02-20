/**
 * EvidencePanel Component
 * Story 4.4 AC4.4.3: Accordion layout showing heuristic breakdowns for a fraud detection.
 * Sections with zero score are collapsed by default; non-zero are expanded.
 */

import { useState } from 'react';
import { ChevronDown, ChevronRight, MapPin, Timer, Copy, Clock, BarChart3 } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { FraudSeverityBadge } from './FraudSeverityBadge';
import { FraudResolutionBadge } from './FraudResolutionBadge';
import { GpsClusterMap } from './GpsClusterMap';
import { ErrorBoundary } from '../../../components/ErrorBoundary';
import type {
  FraudDetectionDetail,
  GpsDetails,
  SpeedDetails,
  StraightlineDetails,
  DuplicateDetails,
  TimingDetails,
} from '../api/fraud.api';

interface EvidencePanelProps {
  detection: FraudDetectionDetail;
  onReview: () => void;
}

interface EvidenceSectionProps {
  title: string;
  icon: React.ReactNode;
  score: number;
  maxWeight: number;
  defaultOpen: boolean;
  children: React.ReactNode;
}

function EvidenceSection({ title, icon, score, maxWeight, defaultOpen, children }: EvidenceSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="border border-neutral-200 rounded-lg">
      <button
        className="w-full flex items-center justify-between p-3 text-left hover:bg-neutral-50"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
      >
        <div className="flex items-center gap-2">
          {isOpen ? <ChevronDown className="w-4 h-4 text-neutral-400" /> : <ChevronRight className="w-4 h-4 text-neutral-400" />}
          {icon}
          <span className="font-medium text-neutral-900">{title}</span>
        </div>
        <span className="text-sm font-mono text-neutral-600">
          {score.toFixed(1)}/{maxWeight}
        </span>
      </button>
      {isOpen && (
        <div className="px-4 pb-3 border-t border-neutral-100">
          {children}
        </div>
      )}
    </div>
  );
}

function GpsEvidenceSection({ details, score: _score, gpsLat, gpsLng }: { details: GpsDetails | null; score: number; gpsLat: number | null; gpsLng: number | null }) {
  if (!details) return <p className="text-sm text-neutral-500 py-2">No GPS data available</p>;

  return (
    <div className="space-y-3 pt-2">
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <span className="text-neutral-500">Cluster Members:</span>{' '}
          <span className="font-medium">{details.clusterCount}</span>
        </div>
        <div>
          <span className="text-neutral-500">Accuracy:</span>{' '}
          <span className="font-medium">{details.accuracy != null ? `${details.accuracy}m` : 'N/A'}</span>
        </div>
        <div>
          <span className="text-neutral-500">Teleportation:</span>{' '}
          <span className={`font-medium ${details.teleportationFlag ? 'text-red-600' : 'text-green-600'}`}>
            {details.teleportationFlag ? `Yes (${details.teleportationSpeed?.toFixed(0)} km/h)` : 'No'}
          </span>
        </div>
        <div>
          <span className="text-neutral-500">Duplicate Coords:</span>{' '}
          <span className={`font-medium ${details.duplicateCoords ? 'text-red-600' : 'text-green-600'}`}>
            {details.duplicateCoords ? 'Yes' : 'No'}
          </span>
        </div>
        {details.nearestNeighborDistance != null && (
          <div>
            <span className="text-neutral-500">Nearest Neighbor:</span>{' '}
            <span className="font-medium">{details.nearestNeighborDistance.toFixed(0)}m</span>
          </div>
        )}
      </div>

      {gpsLat != null && gpsLng != null && (
        <ErrorBoundary fallbackProps={{ title: 'Map Error', description: 'Unable to render GPS map.' }}>
          <GpsClusterMap
            primaryCoords={{ lat: gpsLat, lng: gpsLng }}
            clusterMembers={details.clusterMembers}
          />
        </ErrorBoundary>
      )}
    </div>
  );
}

function SpeedEvidenceSection({ details }: { details: SpeedDetails | null }) {
  if (!details) return <p className="text-sm text-neutral-500 py-2">No speed data available</p>;

  return (
    <div className="space-y-2 pt-2 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-neutral-500">Completion Time:</span>{' '}
          <span className="font-medium">{Math.round(details.completionTimeSeconds)}s</span>
        </div>
        <div>
          <span className="text-neutral-500">Median Time:</span>{' '}
          <span className="font-medium">{details.medianTimeSeconds != null ? `${Math.round(details.medianTimeSeconds)}s` : 'N/A'}</span>
        </div>
        <div>
          <span className="text-neutral-500">Ratio:</span>{' '}
          <span className="font-medium">{details.ratio.toFixed(2)}x</span>
        </div>
        <div>
          <span className="text-neutral-500">Tier:</span>{' '}
          <span className={`font-medium ${details.tier ? 'text-red-600' : 'text-green-600'}`}>
            {details.tier ?? 'Normal'}
          </span>
        </div>
        <div>
          <span className="text-neutral-500">Historical Count:</span>{' '}
          <span className="font-medium">{details.historicalCount}</span>
        </div>
      </div>
    </div>
  );
}

function StraightlineEvidenceSection({ details }: { details: StraightlineDetails | null }) {
  if (!details) return <p className="text-sm text-neutral-500 py-2">No straightline data available</p>;

  return (
    <div className="space-y-2 pt-2">
      <p className="text-sm text-neutral-600">
        Flagged batteries: <span className="font-medium">{details.flaggedBatteryCount}</span> / {details.batteries.length}
      </p>
      {details.batteries.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-left text-neutral-500">
                <th className="py-1 pr-3">Section</th>
                <th className="py-1 pr-3">Questions</th>
                <th className="py-1 pr-3">PIR</th>
                <th className="py-1 pr-3">Entropy</th>
                <th className="py-1 pr-3">LIS</th>
                <th className="py-1">Flagged</th>
              </tr>
            </thead>
            <tbody>
              {details.batteries.map((b, i) => (
                <tr key={i} className={`border-b border-neutral-50 ${b.flagged ? 'bg-red-50' : ''}`}>
                  <td className="py-1 pr-3 font-medium">{b.sectionName}</td>
                  <td className="py-1 pr-3">{b.questionCount}</td>
                  <td className="py-1 pr-3">{(b.pir * 100).toFixed(0)}%</td>
                  <td className="py-1 pr-3">{b.entropy.toFixed(2)}</td>
                  <td className="py-1 pr-3">{b.lis}</td>
                  <td className="py-1">{b.flagged ? '⚠' : '✓'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function DuplicateEvidenceSection({ details }: { details: DuplicateDetails | null }) {
  if (!details) return <p className="text-sm text-neutral-500 py-2">No duplicate data available</p>;

  return (
    <div className="space-y-2 pt-2 text-sm">
      <div>
        <span className="text-neutral-500">Match Type:</span>{' '}
        <span className="font-medium">{details.matchType ?? 'None'}</span>
      </div>
      {details.matchingFields.length > 0 && (
        <div>
          <span className="text-neutral-500">Matching Fields:</span>{' '}
          <span className="font-medium">{details.matchingFields.join(', ')}</span>
        </div>
      )}
      {details.matchedSubmissions.length > 0 && (
        <div>
          <p className="text-neutral-500 mb-1">Matched Submissions:</p>
          <ul className="space-y-1 ml-4">
            {details.matchedSubmissions.map((m) => (
              <li key={m.submissionId} className="font-mono text-xs">
                {m.submissionId.slice(0, 8)}... — {(m.matchRatio * 100).toFixed(0)}% match
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TimingEvidenceSection({ details }: { details: TimingDetails | null }) {
  if (!details) return <p className="text-sm text-neutral-500 py-2">No timing data available</p>;

  return (
    <div className="space-y-2 pt-2 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="text-neutral-500">Submission Hour:</span>{' '}
          <span className="font-medium">{String(details.submissionHour).padStart(2, '0')}:00</span>
        </div>
        <div>
          <span className="text-neutral-500">Weekend:</span>{' '}
          <span className={`font-medium ${details.isWeekend ? 'text-orange-600' : 'text-green-600'}`}>
            {details.isWeekend ? 'Yes' : 'No'}
          </span>
        </div>
        <div>
          <span className="text-neutral-500">Off Hours:</span>{' '}
          <span className={`font-medium ${details.isOffHours ? 'text-red-600' : 'text-green-600'}`}>
            {details.isOffHours ? 'Yes' : 'No'}
          </span>
        </div>
        <div>
          <span className="text-neutral-500">Local Time:</span>{' '}
          <span className="font-medium">{new Date(details.localTime).toLocaleTimeString()}</span>
        </div>
      </div>
    </div>
  );
}

export function EvidencePanel({ detection, onReview }: EvidencePanelProps) {
  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Summary Section */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold text-neutral-900">{detection.enumeratorName}</h3>
            <p className="text-sm text-neutral-500">
              {detection.formName ?? 'Unknown Form'} — {new Date(detection.submittedAt).toLocaleDateString()}
            </p>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold font-mono text-neutral-900">{detection.totalScore.toFixed(1)}</div>
            <FraudSeverityBadge severity={detection.severity} />
          </div>
        </div>

        <div className="flex items-center gap-4 text-xs text-neutral-500">
          <span>Computed: {new Date(detection.computedAt).toLocaleString()}</span>
          <span>Config v{detection.configSnapshotVersion}</span>
        </div>

        {/* Heuristic Sections */}
        <div className="space-y-2">
          <EvidenceSection
            title="GPS Analysis"
            icon={<MapPin className="w-4 h-4 text-neutral-500" />}
            score={detection.gpsScore}
            maxWeight={25}
            defaultOpen={detection.gpsScore > 0}
          >
            <GpsEvidenceSection
              details={detection.gpsDetails}
              score={detection.gpsScore}
              gpsLat={detection.gpsLatitude}
              gpsLng={detection.gpsLongitude}
            />
          </EvidenceSection>

          <EvidenceSection
            title="Speed Analysis"
            icon={<Timer className="w-4 h-4 text-neutral-500" />}
            score={detection.speedScore}
            maxWeight={25}
            defaultOpen={detection.speedScore > 0}
          >
            <SpeedEvidenceSection details={detection.speedDetails} />
          </EvidenceSection>

          <EvidenceSection
            title="Straight-lining Analysis"
            icon={<BarChart3 className="w-4 h-4 text-neutral-500" />}
            score={detection.straightlineScore}
            maxWeight={20}
            defaultOpen={detection.straightlineScore > 0}
          >
            <StraightlineEvidenceSection details={detection.straightlineDetails} />
          </EvidenceSection>

          <EvidenceSection
            title="Duplicate Analysis"
            icon={<Copy className="w-4 h-4 text-neutral-500" />}
            score={detection.duplicateScore}
            maxWeight={20}
            defaultOpen={detection.duplicateScore > 0}
          >
            <DuplicateEvidenceSection details={detection.duplicateDetails} />
          </EvidenceSection>

          <EvidenceSection
            title="Timing Analysis"
            icon={<Clock className="w-4 h-4 text-neutral-500" />}
            score={detection.timingScore}
            maxWeight={10}
            defaultOpen={detection.timingScore > 0}
          >
            <TimingEvidenceSection details={detection.timingDetails} />
          </EvidenceSection>
        </div>

        {/* Existing Review Info (M2 fix) */}
        {detection.resolution && (
          <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-neutral-700">Previous Review</span>
              <FraudResolutionBadge resolution={detection.resolution} />
            </div>
            {detection.reviewedAt && (
              <p className="text-xs text-neutral-500">
                Reviewed: {new Date(detection.reviewedAt).toLocaleString()}
              </p>
            )}
            {detection.resolutionNotes && (
              <p className="text-sm text-neutral-600 italic">&ldquo;{detection.resolutionNotes}&rdquo;</p>
            )}
          </div>
        )}

        {/* Review Action (L1 fix: removed conflicting inline style) */}
        <div className="pt-2 border-t border-neutral-200">
          <button
            className="w-full px-4 py-2 text-white rounded-lg font-medium text-sm transition-colors"
            style={{ backgroundColor: '#9C1E23' }}
            onClick={onReview}
          >
            {detection.resolution ? 'Update Review' : 'Review This Detection'}
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
