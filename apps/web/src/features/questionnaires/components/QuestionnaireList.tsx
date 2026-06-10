import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileSpreadsheet, Trash2, Archive, ChevronDown, Download, History, Edit, Send, XCircle, AlertTriangle, Eye } from 'lucide-react';
import { useQuestionnaires, useUpdateStatus, useDeleteQuestionnaire } from '../hooks/useQuestionnaires';
import { getDownloadUrl } from '../api/questionnaire.api';
import { SkeletonTable } from '../../../components/skeletons';
import { QuestionnaireVersionHistory } from './QuestionnaireVersionHistory';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../../../components/ui/alert-dialog';
import { useGetSetting, useUpdateSetting } from '../../settings/api/settings.api';
import { VALID_STATUS_TRANSITIONS } from '@oslsr/types';
import type { QuestionnaireFormStatus } from '@oslsr/types';

/** system_settings key the public-registration wizard reads on Step 4. */
const WIZARD_PIN_KEY = 'wizard.public_form_id';

const STATUS_BADGES: Record<QuestionnaireFormStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-neutral-100 text-neutral-700' },
  published: { label: 'Published', className: 'bg-green-100 text-green-700' },
  closing: { label: 'Closing', className: 'bg-orange-100 text-orange-700' },
  deprecated: { label: 'Deprecated', className: 'bg-amber-100 text-amber-700' },
  archived: { label: 'Archived', className: 'bg-neutral-200 text-neutral-500' },
};

const STATUS_ACTION_CONFIG: Record<QuestionnaireFormStatus, { icon: typeof Send; label: string; className: string }> = {
  published: { icon: Send, label: 'Publish', className: 'hover:text-green-600' },
  closing: { icon: XCircle, label: 'Close', className: 'hover:text-orange-600' },
  deprecated: { icon: AlertTriangle, label: 'Deprecate', className: 'hover:text-amber-600' },
  archived: { icon: Archive, label: 'Archive', className: 'hover:text-amber-600' },
  draft: { icon: Edit, label: 'Draft', className: '' },
};

interface ConfirmDialogState {
  open: boolean;
  formId: string | null;
  formTitle: string;
  formVersion: string;
}

interface StatusDialogState {
  open: boolean;
  formId: string | null;
  formTitle: string;
  targetStatus: QuestionnaireFormStatus | null;
}

interface PinDialogState {
  open: boolean;
  mode: 'pin' | 'unpin';
  formId: string | null;
  formTitle: string;
}

export function QuestionnaireList() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<QuestionnaireFormStatus | undefined>();
  const [versionHistoryFormId, setVersionHistoryFormId] = useState<string | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<ConfirmDialogState>({
    open: false,
    formId: null,
    formTitle: '',
    formVersion: '',
  });
  const [statusDialog, setStatusDialog] = useState<StatusDialogState>({
    open: false,
    formId: null,
    formTitle: '',
    targetStatus: null,
  });
  const [pinDialog, setPinDialog] = useState<PinDialogState>({
    open: false,
    mode: 'pin',
    formId: null,
    formTitle: '',
  });

  const queryClient = useQueryClient();
  const { data, isLoading } = useQuestionnaires({ page, pageSize: 10, status: statusFilter });
  const updateStatus = useUpdateStatus();
  const deleteMutation = useDeleteQuestionnaire();

  // Story 9-17: which published form is pinned as the public-wizard form.
  // Server-truth comes from the `wizard.public_form_id` setting; we mirror it
  // into local state for optimistic pin/unpin (SmsOtpToggle pattern).
  const { data: pinSetting } = useGetSetting(WIZARD_PIN_KEY);
  const updatePin = useUpdateSetting();
  const serverPinnedId = (pinSetting?.value as string | null | undefined) ?? null;
  const [pinnedFormId, setPinnedFormId] = useState<string | null>(serverPinnedId);
  useEffect(() => {
    setPinnedFormId(serverPinnedId);
  }, [serverPinnedId]);

  const closeDeleteDialog = () => {
    setDeleteDialog({ open: false, formId: null, formTitle: '', formVersion: '' });
  };

  const handleConfirmDelete = () => {
    if (deleteDialog.formId) {
      deleteMutation.mutate(deleteDialog.formId);
    }
    closeDeleteDialog();
  };

  const closeStatusDialog = () => {
    setStatusDialog({ open: false, formId: null, formTitle: '', targetStatus: null });
  };

  const handleConfirmStatusChange = () => {
    if (statusDialog.formId && statusDialog.targetStatus) {
      updateStatus.mutate({ id: statusDialog.formId, status: statusDialog.targetStatus });
    }
    closeStatusDialog();
  };

  const closePinDialog = () => {
    setPinDialog({ open: false, mode: 'pin', formId: null, formTitle: '' });
  };

  const handleConfirmPin = () => {
    const { mode, formId, formTitle } = pinDialog;
    closePinDialog();
    const previous = pinnedFormId;
    const nextValue = mode === 'pin' ? formId : null;
    setPinnedFormId(nextValue); // optimistic
    updatePin.mutate(
      { key: WIZARD_PIN_KEY, value: nextValue },
      {
        onSuccess: () => {
          // Refresh the published-forms list (badge position) and the setting
          // query (so the Settings landing read-only mirror picks it up too).
          queryClient.invalidateQueries({ queryKey: ['questionnaires'] });
          queryClient.invalidateQueries({ queryKey: ['settings', WIZARD_PIN_KEY] });
          toast.success(mode === 'pin' ? `Pinned ${formTitle}` : `Un-pinned ${formTitle}`);
        },
        onError: () => {
          setPinnedFormId(previous); // rollback
          // Anti-enumeration: never surface the backend error code.
          toast.error("Couldn't pin the form. Please try again.");
        },
      },
    );
  };

  if (isLoading) {
    return <SkeletonTable rows={5} columns={6} />;
  }

  const forms = data?.data ?? [];
  const meta = data?.meta;

  // Title of the currently-pinned form for the pin-confirmation dialog copy.
  // Falls back gracefully when the pinned form isn't on the current page.
  const currentPinnedTitle = pinnedFormId
    ? (forms.find((f) => f.id === pinnedFormId)?.title ?? 'the current form')
    : 'none';

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm font-medium text-neutral-700">Status:</label>
        <div className="relative">
          <select
            value={statusFilter ?? ''}
            onChange={(e) => {
              setStatusFilter((e.target.value || undefined) as QuestionnaireFormStatus | undefined);
              setPage(1);
            }}
            className="appearance-none pl-3 pr-8 py-1.5 border border-neutral-300 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="">All</option>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
            <option value="closing">Closing</option>
            <option value="deprecated">Deprecated</option>
            <option value="archived">Archived</option>
          </select>
          <ChevronDown className="w-4 h-4 text-neutral-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      {forms.length === 0 ? (
        <div className="text-center py-12 text-neutral-500">
          <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-neutral-300" />
          <p className="font-medium">No questionnaire forms found</p>
          <p className="text-sm mt-1">Upload an XLSForm to get started.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Title</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Form ID</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Version</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Status</th>
                <th className="text-left py-3 px-4 text-sm font-semibold text-neutral-700">Uploaded</th>
                <th className="text-right py-3 px-4 text-sm font-semibold text-neutral-700">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-200 bg-white">
              {forms.map((form) => {
                const badge = STATUS_BADGES[form.status];
                return (
                  <tr key={form.id} className="hover:bg-neutral-50">
                    <td className="py-3 px-4 text-sm font-medium text-neutral-900">{form.title}</td>
                    <td className="py-3 px-4 text-sm text-neutral-600 font-mono">{form.formId}</td>
                    <td className="py-3 px-4 text-sm text-neutral-600">{form.version}</td>
                    <td className="py-3 px-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>
                          {badge.label}
                        </span>
                        {form.status === 'published' && pinnedFormId === form.id && (
                          <span
                            data-testid="qm-pinned-badge"
                            aria-label="Currently active as the public-registration form"
                            className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-success-600 text-success-100"
                          >
                            🌐 Active for public wizard
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-500">
                      {new Date(form.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        {/* Story 9-17: public-wizard pin / unpin (published forms only) */}
                        {form.status === 'published' && (
                          pinnedFormId === form.id ? (
                            <button
                              data-testid="qm-unpin-button"
                              onClick={() => setPinDialog({
                                open: true,
                                mode: 'unpin',
                                formId: form.id,
                                formTitle: form.title,
                              })}
                              disabled={updatePin.isPending}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-green-700 border border-green-300 rounded hover:bg-green-50 disabled:opacity-50"
                              title="Un-pin from public wizard"
                            >
                              📌 Pinned · Unpin
                            </button>
                          ) : (
                            <button
                              data-testid="qm-pin-button"
                              onClick={() => setPinDialog({
                                open: true,
                                mode: 'pin',
                                formId: form.id,
                                formTitle: form.title,
                              })}
                              disabled={updatePin.isPending}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary-600 border border-primary-300 rounded hover:bg-primary-50 disabled:opacity-50"
                              title="Pin for public wizard"
                            >
                              Pin for Public Wizard
                            </button>
                          )
                        )}
                        {form.isNative && form.status === 'draft' && (
                          <button
                            onClick={() => navigate(`/dashboard/super-admin/questionnaires/builder/${form.id}`)}
                            className="p-1.5 text-neutral-400 hover:text-primary-600 rounded"
                            title="Edit in Form Builder"
                          >
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {form.isNative && (
                          <button
                            onClick={() => navigate(`/dashboard/super-admin/questionnaires/${form.id}/preview`)}
                            className="p-1.5 text-neutral-400 hover:text-primary-600 rounded"
                            title="Preview form"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                        )}
                        {!form.isNative && (
                          <a
                            href={getDownloadUrl(form.id)}
                            className="p-1.5 text-neutral-400 hover:text-primary-600 rounded"
                            title="Download"
                          >
                            <Download className="w-4 h-4" />
                          </a>
                        )}
                        <button
                          onClick={() => setVersionHistoryFormId(form.formId)}
                          className="p-1.5 text-neutral-400 hover:text-primary-600 rounded"
                          title="Version history"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        {/* Status transition buttons */}
                        {VALID_STATUS_TRANSITIONS[form.status].map((targetStatus) => {
                          const config = STATUS_ACTION_CONFIG[targetStatus];
                          const Icon = config.icon;
                          return (
                            <button
                              key={targetStatus}
                              onClick={() => setStatusDialog({
                                open: true,
                                formId: form.id,
                                formTitle: form.title,
                                targetStatus,
                              })}
                              disabled={updateStatus.isPending}
                              className={`p-1.5 text-neutral-400 ${config.className} rounded`}
                              title={config.label}
                            >
                              <Icon className="w-4 h-4" />
                            </button>
                          );
                        })}
                        {/* Delete for draft and archived forms */}
                        {(form.status === 'draft' || form.status === 'archived') && (
                          <button
                            onClick={() => setDeleteDialog({
                              open: true,
                              formId: form.id,
                              formTitle: form.title,
                              formVersion: form.version,
                            })}
                            disabled={deleteMutation.isPending}
                            className="p-1.5 text-neutral-400 hover:text-red-600 rounded"
                            title="Delete permanently"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-neutral-600">
          <span>
            Page {meta.page} of {meta.totalPages} ({meta.total} total)
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-50"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
              disabled={page >= meta.totalPages}
              className="px-3 py-1 border border-neutral-300 rounded disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Version history modal */}
      {versionHistoryFormId && (
        <QuestionnaireVersionHistory
          logicalFormId={versionHistoryFormId}
          onClose={() => setVersionHistoryFormId(null)}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialog.open} onOpenChange={(open) => !open && closeDeleteDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete form?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete &quot;{deleteDialog.formTitle}&quot; v{deleteDialog.formVersion}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmDelete} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Status Change Confirmation Dialog */}
      <AlertDialog open={statusDialog.open} onOpenChange={(open) => !open && closeStatusDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusDialog.targetStatus ? STATUS_ACTION_CONFIG[statusDialog.targetStatus].label : ''} form?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Change &quot;{statusDialog.formTitle}&quot; status to {statusDialog.targetStatus}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmStatusChange}>
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Story 9-17: Public-wizard Pin / Unpin Confirmation Dialog */}
      <AlertDialog open={pinDialog.open} onOpenChange={(open) => !open && closePinDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pinDialog.mode === 'pin' ? 'Pin for public wizard?' : 'Un-pin this form?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pinDialog.mode === 'pin' ? (
                <>
                  Replace <strong>{currentPinnedTitle}</strong> with{' '}
                  <strong>{pinDialog.formTitle}</strong>? Existing in-flight registrations will
                  continue against the previous form for up to 5 minutes due to client-side
                  caching, then the new form takes effect.
                </>
              ) : (
                <>Public users won&apos;t see any survey questions until you pin a form. Continue?</>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmPin}
              className={pinDialog.mode === 'unpin' ? 'bg-red-600 hover:bg-red-700' : ''}
            >
              {pinDialog.mode === 'pin' ? 'Confirm' : 'Un-pin'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
