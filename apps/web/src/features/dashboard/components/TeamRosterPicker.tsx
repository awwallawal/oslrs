/**
 * Team Roster Picker
 *
 * Prep-1: Allows supervisors to pick a team member to start
 * a new direct conversation. Shows enumerator list with status,
 * marks existing threads, supports search filtering.
 */

import { useState, useMemo, useDeferredValue } from 'react';
import { Search, X, Circle, UserPlus, AlertTriangle } from 'lucide-react';
import { Skeleton } from '../../../components/ui/skeleton';
import { formatRelativeTime } from '../../../lib/utils';
import type { EnumeratorMetric } from '../api/supervisor.api';

interface TeamRosterPickerProps {
  enumerators: EnumeratorMetric[];
  isLoading: boolean;
  isError?: boolean;
  existingThreadPartnerIds: Set<string>;
  onSelectEnumerator: (id: string) => void;
  onClose: () => void;
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'active': return 'text-green-500';
    case 'inactive': return 'text-gray-400';
    default: return 'text-yellow-500';
  }
}

export default function TeamRosterPicker({
  enumerators,
  isLoading,
  isError = false,
  existingThreadPartnerIds,
  onSelectEnumerator,
  onClose,
}: TeamRosterPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const deferredQuery = useDeferredValue(searchQuery);

  const filteredEnumerators = useMemo(() => {
    if (!deferredQuery.trim()) return enumerators;
    const query = deferredQuery.toLowerCase();
    return enumerators.filter((e) =>
      e.fullName.toLowerCase().includes(query)
    );
  }, [enumerators, deferredQuery]);

  return (
    <div className="flex flex-col h-full" data-testid="team-roster-picker">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-blue-600" />
          <span className="text-sm font-medium">New Conversation</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 rounded"
          aria-label="Close roster picker"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search team members..."
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            aria-label="Search team members"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" role="list" aria-label="Team members">
        {isError ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center" data-testid="roster-error">
            <AlertTriangle className="h-8 w-8 text-red-400 mb-2" />
            <p className="text-sm text-red-600 font-medium">Failed to load team members</p>
            <p className="text-xs text-gray-500 mt-1">Please try again later</p>
          </div>
        ) : isLoading ? (
          <div aria-busy="true" aria-label="Loading team members">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 border-b">
                <Skeleton className="h-8 w-8 rounded-full flex-shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-28" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredEnumerators.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
            <p className="text-sm text-gray-500">
              {searchQuery ? 'No team members match your search' : 'No team members assigned'}
            </p>
          </div>
        ) : (
          filteredEnumerators.map((enumerator) => {
            const hasExistingThread = existingThreadPartnerIds.has(enumerator.id);
            return (
              <button
                key={enumerator.id}
                role="listitem"
                onClick={() => onSelectEnumerator(enumerator.id)}
                className="w-full text-left px-4 py-3 border-b hover:bg-gray-50 transition-colors"
                aria-label={`Start conversation with ${enumerator.fullName}${hasExistingThread ? ' (existing thread)' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex-shrink-0 relative">
                    <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm font-medium text-gray-600">
                      {enumerator.fullName.charAt(0).toUpperCase()}
                    </div>
                    <Circle
                      className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 fill-current ${getStatusColor(enumerator.status)}`}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-gray-900 truncate">
                        {enumerator.fullName}
                      </span>
                      {hasExistingThread && (
                        <span className="text-xs text-blue-500 flex-shrink-0">Existing thread</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500">
                      {formatRelativeTime(enumerator.lastLoginAt, 'Never logged in')}
                    </p>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
