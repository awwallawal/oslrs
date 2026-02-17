import { Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { ConnectionState } from '../hooks/useRealtimeConnection';

interface RealtimeStatusBannerProps {
  connectionState: ConnectionState;
}

const STATE_CONFIG: Record<ConnectionState, { icon: ReactNode; label: string; className: string }> = {
  connected: {
    icon: <Wifi className="w-4 h-4" />,
    label: 'Live',
    className: 'bg-green-50 text-green-700 border-green-200',
  },
  connecting: {
    icon: <Wifi className="w-4 h-4 animate-pulse" />,
    label: 'Connecting...',
    className: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  },
  degraded: {
    icon: <AlertTriangle className="w-4 h-4" />,
    label: 'Using polling (realtime unavailable)',
    className: 'bg-amber-50 text-amber-700 border-amber-200',
  },
  disconnected: {
    icon: <WifiOff className="w-4 h-4" />,
    label: 'Disconnected',
    className: 'bg-red-50 text-red-700 border-red-200',
  },
};

export function RealtimeStatusBanner({ connectionState }: RealtimeStatusBannerProps) {
  const config = STATE_CONFIG[connectionState];

  return (
    <div
      className={`inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-full border ${config.className}`}
      role="status"
      aria-live="polite"
      aria-label={`Realtime connection: ${config.label}`}
    >
      {config.icon}
      {config.label}
    </div>
  );
}
