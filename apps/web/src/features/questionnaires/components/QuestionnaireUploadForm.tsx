import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileSpreadsheet, X, Loader2 } from 'lucide-react';
import { useUploadQuestionnaire } from '../hooks/useQuestionnaires';
import { ValidationResultDisplay } from './ValidationResultDisplay';
import type { ApiError } from '../../../lib/api-client';

export function QuestionnaireUploadForm() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [changeNotes, setChangeNotes] = useState('');
  const [validationError, setValidationError] = useState<{
    errors: Array<{ worksheet?: string; row?: number; column?: string; message: string; severity: string }>;
    warnings: Array<{ worksheet?: string; message: string; severity: string }>;
  } | null>(null);

  const uploadMutation = useUploadQuestionnaire();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length > 0) {
      setSelectedFile(acceptedFiles[0]);
      setValidationError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'application/xml': ['.xml'],
      'text/xml': ['.xml'],
    },
    maxSize: 10 * 1024 * 1024, // 10MB
    maxFiles: 1,
  });

  const handleUpload = async () => {
    if (!selectedFile) return;

    setValidationError(null);

    try {
      await uploadMutation.mutateAsync({
        file: selectedFile,
        changeNotes: changeNotes || undefined,
      });
      setSelectedFile(null);
      setChangeNotes('');
    } catch (err) {
      const apiErr = err as ApiError;
      if (apiErr.code === 'XLSFORM_VALIDATION_ERROR' && apiErr.details) {
        setValidationError(apiErr.details as typeof validationError);
      }
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
    setValidationError(null);
  };

  return (
    <div className="space-y-4">
      {/* Dropzone */}
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          isDragActive
            ? 'border-primary-400 bg-primary-50'
            : 'border-neutral-300 hover:border-primary-300 hover:bg-neutral-50'
        }`}
      >
        <input {...getInputProps()} />
        <Upload className="w-10 h-10 text-neutral-400 mx-auto mb-3" />
        {isDragActive ? (
          <p className="text-primary-600 font-medium">Drop the file here</p>
        ) : (
          <>
            <p className="text-neutral-700 font-medium">
              Drag & drop an XLSForm file, or click to browse
            </p>
            <p className="text-neutral-500 text-sm mt-1">
              Accepts .xlsx and .xml files up to 10MB
            </p>
          </>
        )}
      </div>

      {/* Selected file */}
      {selectedFile && (
        <div className="flex items-center gap-3 p-3 bg-neutral-50 rounded-lg border border-neutral-200">
          <FileSpreadsheet className="w-5 h-5 text-primary-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-neutral-900 truncate">
              {selectedFile.name}
            </p>
            <p className="text-xs text-neutral-500">
              {(selectedFile.size / 1024).toFixed(1)} KB
            </p>
          </div>
          <button
            onClick={removeFile}
            className="text-neutral-400 hover:text-neutral-600"
            aria-label="Remove file"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Change notes */}
      {selectedFile && (
        <div>
          <label
            htmlFor="changeNotes"
            className="block text-sm font-medium text-neutral-700 mb-1"
          >
            Change Notes (optional)
          </label>
          <input
            id="changeNotes"
            type="text"
            value={changeNotes}
            onChange={(e) => setChangeNotes(e.target.value)}
            placeholder="e.g. Updated consent fields"
            maxLength={500}
            className="w-full px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          />
        </div>
      )}

      {/* Validation errors */}
      {validationError && <ValidationResultDisplay result={validationError} />}

      {/* Upload button */}
      {selectedFile && (
        <button
          onClick={handleUpload}
          disabled={uploadMutation.isPending}
          className="w-full px-4 py-2 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4" />
              Upload Form
            </>
          )}
        </button>
      )}
    </div>
  );
}
