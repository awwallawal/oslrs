import { useState } from 'react';
import { geolocationErrorCodeToReason, type GpsUnavailableReason } from '@oslsr/types';
import { gpsRemediation } from '../lib/gps-remediation';
import type { QuestionRendererProps } from './QuestionRenderer';

interface GeopointValue {
  latitude: number;
  longitude: number;
  accuracy: number;
}

export function GeopointInput({
  question,
  value,
  onChange,
  error,
  disabled,
  onCaptureError,
  captureFailureReason,
}: QuestionRendererProps) {
  const [capturing, setCapturing] = useState(false);
  /**
   * Story 13-75 AC4 — the REASON this component's own last attempt failed, not a
   * sentence. The sentence comes from `gpsRemediation`, the same source the amber
   * block at submit reads, so the two surfaces cannot tell an enumerator different
   * things about the same failure.
   */
  const [localFailure, setLocalFailure] = useState<GpsUnavailableReason | null>(null);

  const geoValue = value as GeopointValue | null;

  /*
   * Story 13-75 AC7 — the enumerator learns what is wrong HERE, mid-interview, where
   * fixing it is free, instead of at the submit refusal.
   *
   * ⛔ Review L5 — WHEN THE PAGE SUPPLIES A REASON, THE PAGE'S IS THE FRESHEST. This
   * component's own failures reach the page through `onCaptureError`, and so do the
   * open-time and in-banner ones, so the page's value is always the last verdict
   * seen. Preferring the local one let a form whose geopoint is the LAST question
   * show an old failure on the question beside a newer one in the amber block.
   * `undefined` means no page is tracking (a caller that passes nothing), and then
   * the local failure is all there is.
   *
   * A held position hides it — unless THIS component's recapture just failed, which
   * the enumerator needs to hear about even over a position they already have.
   */
  const latestFailure = captureFailureReason !== undefined ? captureFailureReason : localFailure;
  const shownFailure = geoValue && !localFailure ? null : latestFailure;
  const remediation = shownFailure ? gpsRemediation(shownFailure) : null;

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setLocalFailure('unsupported');
      onCaptureError?.('unsupported');
      return;
    }

    setCapturing(true);
    setLocalFailure(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        onChange({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
        setCapturing(false);
      },
      (err) => {
        setCapturing(false);
        /*
         * ⛔ ULTRA REVIEW U15 — THE REASON HAS TO LEAVE THIS COMPONENT.
         *
         * This callback has always known exactly why the capture failed, and it kept
         * the answer to itself: `setGeoError` wrote a sentence into local state and
         * nothing else. `onChange` fires only on SUCCESS, so the page never learned
         * that an attempt had happened at all.
         *
         * ⭐ The consequence lands in the column AC6 exists to count. The escape
         * hatch files `gpsUnavailableReason ?? 'other'` from the OPEN-time capture —
         * so an enumerator whose auto-capture timed out in a concrete building, who
         * then walked outside and was refused PERMISSION, filed `timeout`. A phone
         * problem recorded as a signal problem, which is the one distinction AC4's
         * derived vocabulary exists to preserve. The fix for the phone is to unblock
         * the site; the fix for the signal is to move. They are not interchangeable.
         */
        onCaptureError?.(geolocationErrorCodeToReason(err.code));
        /*
         * ⛔ STORY 13-75 AC5 — the old copy for code 1 was "Location access denied.
         * GPS data will not be recorded." It assumed the site was the problem and
         * told the enumerator to give up. On iOS Safari code 1 can mean the phone's
         * Location Services is off, and the fix for that is a toggle, not a waiver.
         */
        setLocalFailure(geolocationErrorCodeToReason(err.code));
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  const formatCoord = (val: number, isLat: boolean) => {
    const dir = isLat ? (val >= 0 ? 'N' : 'S') : val >= 0 ? 'E' : 'W';
    return `${Math.abs(val).toFixed(4)}° ${dir}`;
  };

  return (
    <div className="space-y-2">
      <label className="block text-base font-medium text-gray-900">
        {question.label}
        {question.required && <span className="text-red-600 ml-1">*</span>}
      </label>
      {question.labelYoruba && (
        <p className="text-sm text-gray-500 italic">{question.labelYoruba}</p>
      )}

      {geoValue ? (
        <div
          className="p-4 bg-green-50 border border-green-200 rounded-lg"
          data-testid={`geopoint-display-${question.name}`}
        >
          <p className="font-mono text-sm text-gray-800">
            {formatCoord(geoValue.latitude, true)},{' '}
            {formatCoord(geoValue.longitude, false)}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Accuracy: ± {Math.round(geoValue.accuracy)}m
          </p>
          {!disabled && (
            <button
              type="button"
              onClick={captureLocation}
              className="mt-2 text-sm text-[#9C1E23] underline"
            >
              Recapture
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={captureLocation}
          disabled={disabled || capturing}
          className={`w-full min-h-[48px] px-4 py-3 text-base border rounded-lg
            transition-colors
            ${disabled
              ? 'bg-gray-100 cursor-not-allowed text-gray-400 border-gray-300'
              : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-300'}`}
          data-testid={`geopoint-capture-${question.name}`}
        >
          {capturing ? 'Capturing location...' : '📍 Capture GPS Location'}
        </button>
      )}

      {remediation && (
        <div className="space-y-1" role="alert" data-testid={`geopoint-remediation-${question.name}`}>
          <p className="text-sm text-amber-700">{remediation.action}</p>
          {remediation.secondary && (
            <p className="text-sm text-amber-700">{remediation.secondary}</p>
          )}
        </div>
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
