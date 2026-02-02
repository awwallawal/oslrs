import { useState } from 'react';
import { FileSpreadsheet, Trash2, Archive, ChevronDown, Download, History, Upload, Loader2, CloudOff } from 'lucide-react';
import { useQuestionnaires, useUpdateStatus, useDeleteQuestionnaire, usePublishToOdk, useUnpublishFromOdk } from '../hooks/useQuestionnaires';
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
import type { QuestionnaireFormStatus } from '@oslsr/types';

const STATUS_BADGES: Record<QuestionnaireFormStatus, { label: string; className: string }> = {
  draft: { label: 'Draft', className: 'bg-neutral-100 text-neutral-700' },
  published: { label: 'Published', className: 'bg-green-100 text-green-700' },
  closing: { label: 'Closing', className: 'bg-orange-100 text-orange-700' },
  deprecated: { label: 'Deprecated', className: 'bg-amber-100 text-amber-700' },
  archived: { label: 'Archived', className: 'bg-neutral-200 text-neutral-500' },
};

type ConfirmDialogType = 'publish' | 'delete' | 'unpublish' | null;

interface ConfirmDialogState {
  type: ConfirmDialogType;
  formId: string | null;
  formTitle: string;
  formVersion: string;
}

export function QuestionnaireList() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<QuestionnaireFormStatus | undefined>();
  const [versionHistoryFormId, setVersionHistoryFormId] = useState<string | null>(null);
  const [publishingFormId, setPublishingFormId] = useState<string | null>(null);
  const [unpublishingFormId, setUnpublishingFormId] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    type: null,
    formId: null,
    formTitle: '',
    formVersion: '',
  });

  const { data, isLoading } = useQuestionnaires({ page, pageSize: 10, status: statusFilter });
  const updateStatus = useUpdateStatus();
  const deleteMutation = useDeleteQuestionnaire();
  const publishMutation = usePublishToOdk();
  const unpublishMutation = useUnpublishFromOdk();

  const closeDialog = () => {
    setConfirmDialog({ type: null, formId: null, formTitle: '', formVersion: '' });
  };

  const handleConfirmAction = () => {
    if (!confirmDialog.formId) return;

    switch (confirmDialog.type) {
      case 'publish':
        setPublishingFormId(confirmDialog.formId);
        publishMutation.mutate(confirmDialog.formId, {
          onSettled: () => setPublishingFormId(null),
        });
        break;
      case 'delete':
        deleteMutation.mutate(confirmDialog.formId);
        break;
      case 'unpublish':
        setUnpublishingFormId(confirmDialog.formId);
        unpublishMutation.mutate(confirmDialog.formId, {
          onSettled: () => setUnpublishingFormId(null),
        });
        break;
    }
    closeDialog();
  };

  if (isLoading) {
    return <SkeletonTable rows={5} columns={6} />;
  }

  const forms = data?.data ?? [];
  const meta = data?.meta;

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
                      <span className={`inline-block px-2 py-0.5 text-xs font-medium rounded-full ${badge.className}`}>
                        {badge.label}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-neutral-500">
                      {new Date(form.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center justify-end gap-1">
                        <a
                          href={getDownloadUrl(form.id)}
                          className="p-1.5 text-neutral-400 hover:text-primary-600 rounded"
                          title="Download"
                        >
                          <Download className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => setVersionHistoryFormId(form.formId)}
                          className="p-1.5 text-neutral-400 hover:text-primary-600 rounded"
                          title="Version history"
                        >
                          <History className="w-4 h-4" />
                        </button>
                        {form.status === 'draft' && (
                          <>
                            <button
                              onClick={() => setConfirmDialog({
                                type: 'publish',
                                formId: form.id,
                                formTitle: form.title,
                                formVersion: form.version,
                              })}
                              disabled={publishingFormId === form.id}
                              className="p-1.5 text-neutral-400 hover:text-green-600 rounded disabled:opacity-50"
                              title="Publish to ODK Central"
                            >
                              {publishingFormId === form.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <Upload className="w-4 h-4" />
                              )}
                            </button>
                            <button
                              onClick={() => updateStatus.mutate({ id: form.id, status: 'archived' })}
                              disabled={updateStatus.isPending || publishingFormId === form.id}
                              className="p-1.5 text-neutral-400 hover:text-amber-600 rounded"
                              title="Archive"
                            >
                              <Archive className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => setConfirmDialog({
                                type: 'delete',
                                formId: form.id,
                                formTitle: form.title,
                                formVersion: form.version,
                              })}
                              disabled={deleteMutation.isPending || publishingFormId === form.id}
                              className="p-1.5 text-neutral-400 hover:text-red-600 rounded"
                              title="Delete draft"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {form.status === 'published' && (
                          <button
                            onClick={() => setConfirmDialog({
                              type: 'unpublish',
                              formId: form.id,
                              formTitle: form.title,
                              formVersion: form.version,
                            })}
                            disabled={unpublishingFormId === form.id}
                            className="p-1.5 text-neutral-400 hover:text-orange-600 rounded disabled:opacity-50"
                            title="Unpublish from ODK Central"
                          >
                            {unpublishingFormId === form.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <CloudOff className="w-4 h-4" />
                            )}
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

      {/* Confirmation Dialogs */}
      <AlertDialog open={confirmDialog.type === 'publish'} onOpenChange={(open) => !open && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish to ODK Central?</AlertDialogTitle>
            <AlertDialogDescription>
              This will publish "{confirmDialog.formTitle}" v{confirmDialog.formVersion} to ODK Central
              and make it available for field collection.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction} className="bg-green-600 hover:bg-green-700">
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDialog.type === 'delete'} onOpenChange={(open) => !open && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete draft form?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{confirmDialog.formTitle}" v{confirmDialog.formVersion}.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction} className="bg-red-600 hover:bg-red-700">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDialog.type === 'unpublish'} onOpenChange={(open) => !open && closeDialog()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unpublish from ODK Central?</AlertDialogTitle>
            <AlertDialogDescription>
              This will unpublish "{confirmDialog.formTitle}" v{confirmDialog.formVersion} from ODK Central
              and remove it from field collection. Forms with existing submissions cannot be unpublished.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmAction} className="bg-orange-600 hover:bg-orange-700">
              Unpublish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
