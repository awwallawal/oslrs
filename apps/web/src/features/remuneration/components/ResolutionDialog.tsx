/**
 * Resolution Dialog
 * Story 6.6: Admin resolves a dispute with response text and optional evidence upload.
 * Pattern: DeactivateDialog.tsx AlertDialog + green theme for positive action.
 */

import { useState, useRef } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '../../../components/ui/alert-dialog';
import { Loader2, Upload, X, FileText } from 'lucide-react';
import { useResolveDispute } from '../hooks/useRemuneration';
import { formatNaira } from '../utils/format';
import type { DisputeDetail } from '../api/remuneration.api';

interface ResolutionDialogProps {
  dispute: DisputeDetail | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'application/pdf'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export function ResolutionDialog({ dispute, isOpen, onClose, onSuccess }: ResolutionDialogProps) {
  const [adminResponse, setAdminResponse] = useState('');
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mutation = useResolveDispute();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setFileError(null);

    if (!file) {
      setEvidenceFile(null);
      return;
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      setFileError('Only PNG, JPEG, and PDF files are allowed');
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      setFileError('File size must not exceed 10MB');
      return;
    }

    setEvidenceFile(file);
  };

  const handleRemoveFile = () => {
    setEvidenceFile(null);
    setFileError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = () => {
    if (!dispute || !adminResponse.trim()) return;

    mutation.mutate(
      {
        disputeId: dispute.id,
        data: {
          adminResponse: adminResponse.trim(),
          evidence: evidenceFile || undefined,
        },
      },
      {
        onSuccess: () => {
          setAdminResponse('');
          setEvidenceFile(null);
          setFileError(null);
          onSuccess();
          onClose();
        },
      },
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setAdminResponse('');
      setEvidenceFile(null);
      setFileError(null);
      onClose();
    }
  };

  if (!dispute) return null;

  return (
    <AlertDialog open={isOpen} onOpenChange={handleOpenChange}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle>Resolve Payment Dispute</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* Dispute summary */}
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-lg text-sm space-y-1">
                <p><span className="font-medium">Staff:</span> {dispute.staffName || 'Unknown'}</p>
                <p><span className="font-medium">Tranche:</span> {dispute.trancheName}</p>
                <p><span className="font-medium">Amount:</span> {formatNaira(dispute.amount)}</p>
                <p><span className="font-medium">Complaint:</span> {dispute.staffComment.split('\n---\n')[0]?.substring(0, 200)}</p>
              </div>

              {/* Resolution response */}
              <div>
                <label htmlFor="admin-response" className="block text-sm font-medium text-neutral-700 mb-1">
                  Resolution Response <span className="text-red-500">*</span>
                </label>
                <textarea
                  id="admin-response"
                  placeholder="Explain the resolution (e.g., 'Payment was confirmed via bank transfer on...')"
                  value={adminResponse}
                  onChange={(e) => setAdminResponse(e.target.value)}
                  className="w-full min-h-[100px] px-3 py-2 text-sm border rounded-md resize-y focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-green-500"
                  disabled={mutation.isPending}
                  data-testid="resolution-response-input"
                />
              </div>

              {/* Evidence upload */}
              <div>
                <label className="block text-sm font-medium text-neutral-700 mb-1">
                  Evidence (optional)
                </label>
                <p className="text-xs text-neutral-500 mb-2">Upload a bank screenshot or document (PNG, JPEG, PDF — max 10MB)</p>

                {!evidenceFile ? (
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 text-sm border-2 border-dashed border-neutral-300 rounded-md hover:border-green-400 hover:bg-green-50 transition-colors w-full justify-center"
                    disabled={mutation.isPending}
                    data-testid="upload-evidence-button"
                  >
                    <Upload className="w-4 h-4" />
                    Choose File
                  </button>
                ) : (
                  <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-md">
                    <FileText className="w-4 h-4 text-green-600 flex-shrink-0" />
                    <span className="text-sm text-green-800 truncate flex-1">{evidenceFile.name}</span>
                    <button
                      type="button"
                      onClick={handleRemoveFile}
                      className="p-1 hover:bg-green-100 rounded"
                      data-testid="remove-evidence-button"
                    >
                      <X className="w-3 h-3 text-green-600" />
                    </button>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf"
                  onChange={handleFileChange}
                  className="hidden"
                  data-testid="evidence-file-input"
                />

                {fileError && (
                  <p className="text-xs text-red-500 mt-1" data-testid="file-error">{fileError}</p>
                )}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleSubmit}
            disabled={mutation.isPending || !adminResponse.trim()}
            className="bg-green-600 hover:bg-green-700 text-white"
            data-testid="resolve-dispute-button"
          >
            {mutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Resolving...
              </>
            ) : (
              'Resolve Dispute'
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
