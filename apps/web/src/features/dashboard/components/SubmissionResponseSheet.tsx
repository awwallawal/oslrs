/**
 * SubmissionResponseSheet — Slide-over panel showing full form responses
 *
 * Displays a submission's flattened form responses grouped by form sections.
 * Reuses server-side label mapping (flattenRawDataRow infrastructure).
 * Mobile-first: full viewport on mobile, 55% right panel on desktop.
 */

import { useState } from 'react';
import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '../../../components/ui/sheet';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Skeleton } from '../../../components/ui/skeleton';
import { useSubmissionResponses } from '../hooks/useRespondent';
import { downloadSubmissionResponseExport } from '../api/respondent.api';

interface SubmissionResponseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  respondentId: string;
  submissionId: string;
  respondentName?: string;
  onSubmissionChange?: (submissionId: string) => void;
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
      <span className="text-sm text-gray-500 shrink-0 mr-4">{label}</span>
      <span className="text-sm text-gray-800 text-right" data-testid={`field-${label}`}>
        {value || '\u2014'}
      </span>
    </div>
  );
}

export default function SubmissionResponseSheet({
  open,
  onOpenChange,
  respondentId,
  submissionId,
  respondentName,
  onSubmissionChange,
}: SubmissionResponseSheetProps) {
  const { data, isLoading } = useSubmissionResponses(respondentId, submissionId);
  const [exportingFormat, setExportingFormat] = useState<'csv' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const currentIndex = data?.siblingSubmissionIds.indexOf(submissionId) ?? -1;
  const totalCount = data?.siblingSubmissionIds.length ?? 0;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < totalCount - 1;

  const handlePrev = () => {
    if (hasPrev && data && onSubmissionChange) {
      onSubmissionChange(data.siblingSubmissionIds[currentIndex - 1]);
    }
  };

  const handleNext = () => {
    if (hasNext && data && onSubmissionChange) {
      onSubmissionChange(data.siblingSubmissionIds[currentIndex + 1]);
    }
  };

  const handleExport = async (format: 'csv' | 'pdf') => {
    try {
      setExportError(null);
      setExportingFormat(format);
      const blob = await downloadSubmissionResponseExport(respondentId, submissionId, format);
      const dateStr = new Date().toISOString().slice(0, 10);
      const fileName = `submission-detail-${submissionId.slice(0, 8)}-${dateStr}.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError((error as Error).message || 'Export failed');
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:w-[55vw] sm:max-w-3xl flex flex-col p-0"
        data-testid="submission-response-sheet"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <SheetTitle>Submission Detail</SheetTitle>
              <SheetDescription>
                {respondentName || 'Respondent'} {data?.formTitle ? `\u2014 ${data.formTitle}` : ''}
              </SheetDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleExport('csv')}
                disabled={isLoading || !data || exportingFormat !== null}
                data-testid="export-csv"
              >
                <Download className="w-4 h-4 mr-1" />
                {exportingFormat === 'csv' ? 'Exporting...' : 'CSV'}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => handleExport('pdf')}
                disabled={isLoading || !data || exportingFormat !== null}
                data-testid="export-pdf"
              >
                <Download className="w-4 h-4 mr-1" />
                {exportingFormat === 'pdf' ? 'Exporting...' : 'PDF'}
              </Button>
            </div>
          </div>
          {exportError && (
            <p className="text-xs text-red-600 mt-2" data-testid="export-error">
              {exportError}
            </p>
          )}
        </SheetHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isLoading ? (
            <div className="space-y-4" data-testid="sheet-skeleton">
              <Skeleton className="h-40 w-full" />
              <Skeleton className="h-60 w-full" />
              <Skeleton className="h-40 w-full" />
            </div>
          ) : data ? (
            <>
              {/* Submission Metadata */}
              <Card className="border border-gray-200" data-testid="metadata-card">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-gray-700">Submission Info</CardTitle>
                </CardHeader>
                <CardContent className="space-y-0">
                  <InfoRow label="Date" value={data.submittedAt ? new Date(data.submittedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : null} />
                  <InfoRow label="Source" value={data.source} />
                  <InfoRow label="Enumerator" value={data.enumeratorName} />
                  <InfoRow label="Completion Time" value={data.completionTimeSeconds != null ? `${data.completionTimeSeconds}s` : null} />
                  <InfoRow label="GPS" value={data.gpsLatitude != null && data.gpsLongitude != null ? `${data.gpsLatitude.toFixed(4)}, ${data.gpsLongitude.toFixed(4)}` : null} />
                  <InfoRow label="Fraud Severity" value={data.fraudSeverity} />
                  <InfoRow label="Fraud Score" value={data.fraudScore != null ? String(data.fraudScore) : null} />
                  <InfoRow label="Verification" value={data.verificationStatus} />
                  <InfoRow label="Form" value={`${data.formTitle} v${data.formVersion}`} />
                </CardContent>
              </Card>

              {/* Form Sections */}
              {data.sections.length > 0 ? (
                data.sections.map((section, idx) => (
                  <Card
                    key={idx}
                    className="border border-gray-200 border-l-4 border-l-[#9C1E23]"
                    data-testid={`section-${idx}`}
                  >
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-gray-700">{section.title}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-0">
                      {section.fields.map((field, fIdx) => (
                        <InfoRow key={fIdx} label={field.label} value={field.value} />
                      ))}
                    </CardContent>
                  </Card>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500" data-testid="no-sections">
                  Form responses unavailable for this submission
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Navigator Footer */}
        <SheetFooter className="px-6 py-3 border-t flex items-center justify-between" data-testid="sheet-footer">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={handlePrev}
            data-testid="nav-prev"
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Prev
          </Button>
          <span className="text-sm text-gray-500" data-testid="nav-counter">
            {totalCount > 0 ? `${currentIndex + 1} of ${totalCount}` : '\u2014'}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={handleNext}
            data-testid="nav-next"
          >
            Next
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
