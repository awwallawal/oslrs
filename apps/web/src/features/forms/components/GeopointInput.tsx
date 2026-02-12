import { useState } from 'react';
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
}: QuestionRendererProps) {
  const [capturing, setCapturing] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  const geoValue = value as GeopointValue | null;

  const captureLocation = () => {
    if (!navigator.geolocation) {
      setGeoError('Geolocation is not supported by this browser.');
      return;
    }

    setCapturing(true);
    setGeoError(null);

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
        switch (err.code) {
          case err.PERMISSION_DENIED:
            setGeoError(
              'Location access denied. GPS data will not be recorded.'
            );
            break;
          case err.POSITION_UNAVAILABLE:
            setGeoError('Location information is unavailable.');
            break;
          case err.TIMEOUT:
            setGeoError('Location request timed out. Please try again.');
            break;
          default:
            setGeoError('An unknown error occurred.');
        }
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

      {geoError && (
        <p className="text-sm text-amber-600" role="alert">
          {geoError}
        </p>
      )}
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
