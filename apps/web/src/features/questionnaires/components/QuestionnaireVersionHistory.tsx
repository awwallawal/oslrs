import { X, Loader2 } from 'lucide-react';
import { useVersionHistory } from '../hooks/useQuestionnaires';

interface QuestionnaireVersionHistoryProps {
  logicalFormId: string;
  onClose: () => void;
}

export function QuestionnaireVersionHistory({ logicalFormId, onClose }: QuestionnaireVersionHistoryProps) {
  const { data, isLoading } = useVersionHistory(logicalFormId);

  // Flatten all version entries across form records
  const allForms = data?.data ?? [];
  const versions = allForms.flatMap(form =>
    form.versions.map(v => ({ ...v, formTitle: form.title, formStatus: form.status }))
  ).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-neutral-200">
          <h3 className="text-lg font-semibold text-neutral-900">Version History</h3>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-600"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto flex-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-600" />
            </div>
          ) : versions.length === 0 ? (
            <p className="text-neutral-500 text-center py-8">No version history available.</p>
          ) : (
            <div className="space-y-3">
              {versions.map((v) => (
                <div
                  key={v.id}
                  className="p-3 rounded-lg border border-neutral-200 bg-neutral-50"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-neutral-900">v{v.version}</span>
                    <span className="text-xs text-neutral-500">
                      {new Date(v.createdAt).toLocaleString()}
                    </span>
                  </div>
                  {v.changeNotes && (
                    <p className="text-sm text-neutral-600 mt-1">{v.changeNotes}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-200">
          <button
            onClick={onClose}
            className="w-full px-4 py-2 border border-neutral-300 rounded-lg text-sm font-medium text-neutral-700 hover:bg-neutral-50"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
