/**
 * BulkImportModal Component
 * Story 2.5-3, AC2: CSV upload modal with validation feedback
 */

import { useState, useRef } from 'react';
import { X, Upload, FileSpreadsheet, AlertCircle, CheckCircle2, Loader2, Download } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from '../../../components/ui/alert-dialog';
import { useImportStaffCsv, useImportStatus } from '../hooks/useStaff';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

export function BulkImportModal({ isOpen, onClose, onSuccess }: BulkImportModalProps) {
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = useImportStaffCsv();
  const { data: importStatus } = useImportStatus(jobId, !!jobId);

  const isProcessing = jobId !== null && importStatus?.data?.status === 'processing';
  const isComplete = importStatus?.data?.status === 'completed';
  const hasFailed = importStatus?.data?.status === 'failed';

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const validateFile = (file: File): string | null => {
    if (!file.name.endsWith('.csv')) {
      return 'Please upload a CSV file';
    }
    if (file.size > MAX_FILE_SIZE) {
      return 'File size exceeds 5MB limit';
    }
    return null;
  };

  const handleFile = (selectedFile: File) => {
    const error = validateFile(selectedFile);
    if (error) {
      setValidationError(error);
      setFile(null);
    } else {
      setValidationError(null);
      setFile(selectedFile);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFile(e.target.files[0]);
    }
  };

  const handleUpload = () => {
    if (!file) return;

    importMutation.mutate(file, {
      onSuccess: (data) => {
        if (data.data.status === 'processing') {
          setJobId(data.data.jobId);
        } else if (data.data.status === 'completed') {
          onSuccess();
          handleClose();
        }
      },
    });
  };

  const handleClose = () => {
    setFile(null);
    setValidationError(null);
    setJobId(null);
    onClose();
  };

  // Success state
  if (isComplete && importStatus?.data) {
    return (
      <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="w-5 h-5" />
              Import Complete
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p className="text-neutral-700">
                  Successfully imported staff members from your CSV file.
                </p>
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-1">
                  <p className="text-sm text-green-800">
                    <strong>{importStatus.data.createdCount ?? 0}</strong> staff members created
                  </p>
                  {(importStatus.data.skippedCount ?? 0) > 0 && (
                    <p className="text-sm text-green-700">
                      <strong>{importStatus.data.skippedCount}</strong> rows skipped (duplicates or errors)
                    </p>
                  )}
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { onSuccess(); handleClose(); }}>
              Close
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <div className="flex items-center justify-between">
            <AlertDialogTitle>Bulk Import Staff</AlertDialogTitle>
            <button
              onClick={handleClose}
              className="text-neutral-400 hover:text-neutral-600"
              aria-label="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-4">
              {/* Template download */}
              <div className="p-3 bg-neutral-50 rounded-lg space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-neutral-700">
                    CSV Template
                  </span>
                  <a
                    href="/templates/staff-import-template.csv"
                    download
                    className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
                  >
                    <Download className="w-4 h-4" />
                    Download
                  </a>
                </div>
                <p className="text-xs text-neutral-500">
                  Required columns: <code className="bg-neutral-200 px-1 rounded">full_name</code>, <code className="bg-neutral-200 px-1 rounded">email</code>, <code className="bg-neutral-200 px-1 rounded">phone</code>, <code className="bg-neutral-200 px-1 rounded">role_name</code>
                </p>
                <p className="text-xs text-neutral-500">
                  Optional: <code className="bg-neutral-200 px-1 rounded">lga_name</code> (required for enumerator/supervisor roles)
                </p>
              </div>

              {/* Drop zone */}
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`
                  relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
                  ${dragActive ? 'border-primary-500 bg-primary-50' : 'border-neutral-300 hover:border-neutral-400'}
                  ${validationError ? 'border-red-300 bg-red-50' : ''}
                `}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />

                {file ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileSpreadsheet className="w-8 h-8 text-primary-600" />
                    <div className="text-left">
                      <p className="text-sm font-medium text-neutral-900">{file.name}</p>
                      <p className="text-xs text-neutral-500">
                        {(file.size / 1024).toFixed(1)} KB
                      </p>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="p-1 text-neutral-400 hover:text-neutral-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-10 h-10 mx-auto text-neutral-400" />
                    <p className="text-sm text-neutral-600">
                      <span className="font-medium text-primary-600">Click to upload</span> or drag and drop
                    </p>
                    <p className="text-xs text-neutral-400">CSV file (max 5MB)</p>
                  </div>
                )}
              </div>

              {/* Validation error */}
              {validationError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {validationError}
                </div>
              )}

              {/* Import errors from job */}
              {hasFailed && importStatus?.data?.errors && importStatus.data.errors.length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm font-medium text-red-600">Import errors:</p>
                  <div className="max-h-32 overflow-y-auto space-y-1">
                    {importStatus.data.errors.slice(0, 5).map((error, i) => (
                      <p key={i} className="text-xs text-red-600 bg-red-50 px-2 py-1 rounded">
                        Row {error.row}: {error.message}
                      </p>
                    ))}
                    {importStatus.data.errors.length > 5 && (
                      <p className="text-xs text-red-500">
                        ... and {importStatus.data.errors.length - 5} more errors
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Processing indicator */}
              {isProcessing && (
                <div className="flex items-center justify-center gap-2 p-4">
                  <Loader2 className="w-5 h-5 animate-spin text-primary-600" />
                  <span className="text-sm text-neutral-600">
                    Processing... {importStatus?.data?.processedRows ?? 0} / {importStatus?.data?.totalRows ?? '?'} rows
                  </span>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={importMutation.isPending || isProcessing}>
            Cancel
          </AlertDialogCancel>
          <button
            onClick={handleUpload}
            disabled={!file || importMutation.isPending || isProcessing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white text-sm font-medium rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {importMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Import
              </>
            )}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
