import { AlertCircle, AlertTriangle } from 'lucide-react';

interface ValidationIssue {
  worksheet?: string;
  row?: number;
  column?: string;
  message: string;
  severity: string;
}

interface ValidationResultDisplayProps {
  result: {
    errors: ValidationIssue[];
    warnings: ValidationIssue[];
  };
}

export function ValidationResultDisplay({ result }: ValidationResultDisplayProps) {
  const { errors, warnings } = result;

  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div className="space-y-3">
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle className="w-4 h-4 text-red-600" />
            <span className="text-sm font-semibold text-red-800">
              {errors.length} Error{errors.length !== 1 ? 's' : ''}
            </span>
          </div>
          <ul className="space-y-1.5">
            {errors.map((err, i) => (
              <li key={i} className="text-sm text-red-700 flex gap-2">
                <span className="text-red-400 shrink-0">&bull;</span>
                <span>
                  {err.worksheet && (
                    <span className="font-medium">[{err.worksheet}] </span>
                  )}
                  {err.row && <span className="text-red-500">Row {err.row}: </span>}
                  {err.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span className="text-sm font-semibold text-amber-800">
              {warnings.length} Warning{warnings.length !== 1 ? 's' : ''}
            </span>
          </div>
          <ul className="space-y-1.5">
            {warnings.map((warn, i) => (
              <li key={i} className="text-sm text-amber-700 flex gap-2">
                <span className="text-amber-400 shrink-0">&bull;</span>
                <span>
                  {warn.worksheet && (
                    <span className="font-medium">[{warn.worksheet}] </span>
                  )}
                  {warn.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
