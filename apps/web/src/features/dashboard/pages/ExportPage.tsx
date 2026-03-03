/**
 * Export Page — PII-Rich CSV/PDF Export Interface
 *
 * Story 5.4: Shared export page for Government Official, Super Admin,
 * and Verification Assessor roles.
 * Direction 08 styling: maroon accents, card-based layout.
 */

import { useState, useEffect } from 'react';
import { Download, FileText, FileSpreadsheet, AlertTriangle, Database, List } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../../components/ui/select';
import { Input } from '../../../components/ui/input';
import { Label } from '../../../components/ui/label';
import { Skeleton } from '../../../components/ui/skeleton';
import { useExportPreviewCount, useExportDownload, useLgas, usePublishedForms } from '../hooks/useExport';
import { useToast } from '../../../hooks/useToast';
import type { ExportFilters } from '../api/export.api';

const SEVERITY_OPTIONS = ['clean', 'low', 'medium', 'high', 'critical'] as const;
const SOURCE_OPTIONS = ['enumerator', 'public', 'clerk'] as const;
const STATUS_OPTIONS = [
  'pending',
  'confirmed_fraud',
  'false_positive',
  'needs_investigation',
  'dismissed',
  'enumerator_warned',
  'enumerator_suspended',
] as const;

const PDF_MAX_ROWS = 1000;

export default function ExportPage() {
  const toast = useToast();

  // Export mode state
  const [exportType, setExportType] = useState<'summary' | 'full'>('summary');
  const [formId, setFormId] = useState<string>('');

  // Filter state
  const [lgaId, setLgaId] = useState<string>('');
  const [source, setSource] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [severity, setSeverity] = useState<string>('');
  const [verificationStatus, setVerificationStatus] = useState<string>('');
  const [format, setFormat] = useState<'csv' | 'pdf'>('csv');

  // Force CSV when in full response mode
  useEffect(() => {
    if (exportType === 'full' && format !== 'csv') {
      setFormat('csv');
    }
  }, [exportType, format]);

  const isFullMode = exportType === 'full';

  // Build filters object (only include non-empty values)
  const filters: ExportFilters = {
    ...(lgaId && { lgaId }),
    ...(source && { source }),
    ...(dateFrom && { dateFrom: new Date(dateFrom).toISOString() }),
    ...(dateTo && { dateTo: new Date(dateTo).toISOString() }),
    ...(severity && { severity }),
    ...(verificationStatus && { verificationStatus }),
    ...(isFullMode && formId && { formId }),
    exportType,
  };

  // Debounce filters for count preview to avoid excessive API calls on rapid changes
  const [debouncedFilters, setDebouncedFilters] = useState<ExportFilters>(filters);
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedFilters(filters), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lgaId, source, dateFrom, dateTo, severity, verificationStatus, formId, exportType]);

  // Queries
  const { data: lgas = [], isLoading: lgasLoading, isError: lgaError } = useLgas();
  const { data: publishedForms = [], isLoading: formsLoading } = usePublishedForms();
  const { data: previewCount, isLoading: countLoading } = useExportPreviewCount(debouncedFilters);
  const { download, isDownloading } = useExportDownload();

  const recordCount = previewCount ?? 0;
  const isPdfLimited = !isFullMode && format === 'pdf' && recordCount > PDF_MAX_ROWS;
  const isFormRequired = isFullMode && !formId;

  const handleExport = async () => {
    try {
      const filename = await download(filters, format);
      toast.success({ message: `Export downloaded: ${filename}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      toast.error({ message: 'Export failed', description: message });
    }
  };

  const handleClearFilters = () => {
    setLgaId('');
    setSource('');
    setDateFrom('');
    setDateTo('');
    setSeverity('');
    setVerificationStatus('');
  };

  const hasActiveFilters = lgaId || source || dateFrom || dateTo || severity || verificationStatus;

  return (
    <div className="p-6 space-y-6">
      {/* Page Header */}
      <div className="border-l-4 border-[#9C1E23] pl-4" data-testid="page-header">
        <h1 className="text-2xl font-brand font-semibold text-gray-800">Export Reports</h1>
        <p className="text-sm text-gray-500 mt-1">Download filtered respondent data as CSV or PDF</p>
      </div>

      {/* Export Mode Toggle */}
      <Card className="border border-gray-200">
        <CardContent className="py-4">
          <div className="flex items-center gap-4">
            <Label className="text-sm font-medium text-gray-600 shrink-0">Export Mode</Label>
            <div className="grid grid-cols-2 gap-2 max-w-md" data-testid="mode-toggle">
              <Button
                variant={exportType === 'summary' ? 'default' : 'outline'}
                className={exportType === 'summary' ? 'bg-[#9C1E23] hover:bg-[#7A171B] text-white' : ''}
                onClick={() => setExportType('summary')}
                data-testid="mode-summary"
              >
                <List className="w-4 h-4 mr-2" />
                Respondent Summary
              </Button>
              <Button
                variant={exportType === 'full' ? 'default' : 'outline'}
                className={exportType === 'full' ? 'bg-[#9C1E23] hover:bg-[#7A171B] text-white' : ''}
                onClick={() => setExportType('full')}
                data-testid="mode-full"
              >
                <Database className="w-4 h-4 mr-2" />
                Full Response
              </Button>
            </div>
          </div>

          {/* Form Selector — only in Full Response mode */}
          {isFullMode && (
            <div className="mt-4 max-w-md" data-testid="form-selector-container">
              <Label htmlFor="form-selector" className="text-sm font-medium text-gray-600">Select Form</Label>
              {formsLoading ? (
                <Skeleton className="h-10 w-full mt-1.5" />
              ) : publishedForms.length === 0 ? (
                <p className="text-sm text-gray-500 mt-1.5" data-testid="no-forms-message">
                  No published forms available. Publish a form first to enable full response export.
                </p>
              ) : (
                <Select value={formId} onValueChange={setFormId}>
                  <SelectTrigger data-testid="form-selector" className="mt-1.5">
                    <SelectValue placeholder="Select a published form..." />
                  </SelectTrigger>
                  <SelectContent>
                    {publishedForms.map((form) => (
                      <SelectItem key={form.id} value={form.id}>
                        {form.title} (v{form.version})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {isFormRequired && (
                <p className="text-xs text-amber-600 mt-1" data-testid="form-required-message">
                  Please select a form to export full response data
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Filter Controls (left column) */}
        <div className="lg:col-span-8">
          <Card className="border border-gray-200">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold text-gray-700">Filter Records</CardTitle>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFilters}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {lgasLoading ? (
                <div className="space-y-4" data-testid="filter-skeleton">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* LGA Filter */}
                  <div className="space-y-1.5">
                    <Label htmlFor="lga-filter" className="text-sm font-medium text-gray-600">LGA</Label>
                    <Select value={lgaId} onValueChange={setLgaId}>
                      <SelectTrigger data-testid="lga-filter">
                        <SelectValue placeholder={lgaError ? "LGA unavailable" : "All LGAs"} />
                      </SelectTrigger>
                      <SelectContent>
                        {lgas?.map((lga) => (
                          <SelectItem key={lga.code} value={lga.code}>
                            {lga.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {lgaError && (
                      <p className="text-xs text-amber-600" data-testid="lga-error">Failed to load LGA list</p>
                    )}
                  </div>

                  {/* Source Channel Filter */}
                  <div className="space-y-1.5">
                    <Label htmlFor="source-filter" className="text-sm font-medium text-gray-600">Source Channel</Label>
                    <Select value={source} onValueChange={setSource}>
                      <SelectTrigger data-testid="source-filter">
                        <SelectValue placeholder="All Sources" />
                      </SelectTrigger>
                      <SelectContent>
                        {SOURCE_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Date From */}
                  <div className="space-y-1.5">
                    <Label htmlFor="date-from" className="text-sm font-medium text-gray-600">From Date</Label>
                    <Input
                      id="date-from"
                      type="date"
                      value={dateFrom}
                      onChange={(e) => setDateFrom(e.target.value)}
                      data-testid="date-from-filter"
                    />
                  </div>

                  {/* Date To */}
                  <div className="space-y-1.5">
                    <Label htmlFor="date-to" className="text-sm font-medium text-gray-600">To Date</Label>
                    <Input
                      id="date-to"
                      type="date"
                      value={dateTo}
                      onChange={(e) => setDateTo(e.target.value)}
                      data-testid="date-to-filter"
                    />
                    <p className="text-xs text-gray-400" data-testid="date-hint">
                      {isFullMode ? 'Filters by submission date' : 'Filters by registration date'}
                    </p>
                  </div>

                  {/* Fraud Severity Filter */}
                  <div className="space-y-1.5">
                    <Label htmlFor="severity-filter" className="text-sm font-medium text-gray-600">Fraud Severity</Label>
                    <Select value={severity} onValueChange={setSeverity}>
                      <SelectTrigger data-testid="severity-filter">
                        <SelectValue placeholder="Any Severity" />
                      </SelectTrigger>
                      <SelectContent>
                        {SEVERITY_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Verification Status Filter */}
                  <div className="space-y-1.5">
                    <Label htmlFor="status-filter" className="text-sm font-medium text-gray-600">Verification Status</Label>
                    <Select value={verificationStatus} onValueChange={setVerificationStatus}>
                      <SelectTrigger data-testid="status-filter">
                        <SelectValue placeholder="Any Status" />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUS_OPTIONS.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s.split('_').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Export Panel (right column) */}
        <div className="lg:col-span-4">
          <Card className="border border-gray-200">
            <CardHeader className="pb-4">
              <CardTitle className="text-base font-semibold text-gray-700">Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Record Count Preview */}
              <div className="bg-gray-50 rounded-lg p-4 text-center" data-testid="record-count">
                {countLoading ? (
                  <Skeleton className="h-8 w-24 mx-auto" />
                ) : (
                  <>
                    <p className="text-3xl font-bold text-gray-800">
                      {isFullMode && !formId ? '—' : recordCount.toLocaleString()}
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      {isFullMode
                        ? (formId
                          ? (hasActiveFilters ? 'submissions match your filters' : 'total submissions')
                          : 'select a form to see count')
                        : (hasActiveFilters ? 'records match your filters' : 'total records')}
                    </p>
                  </>
                )}
              </div>

              {/* Format Toggle */}
              <div className="space-y-2">
                <Label className="text-sm font-medium text-gray-600">Format</Label>
                <div className="grid grid-cols-2 gap-2" data-testid="format-toggle">
                  <Button
                    variant={format === 'csv' ? 'default' : 'outline'}
                    className={format === 'csv' ? 'bg-[#9C1E23] hover:bg-[#7A171B] text-white' : ''}
                    onClick={() => setFormat('csv')}
                    data-testid="format-csv"
                  >
                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  {!isFullMode && (
                    <Button
                      variant={format === 'pdf' ? 'default' : 'outline'}
                      className={format === 'pdf' ? 'bg-[#9C1E23] hover:bg-[#7A171B] text-white' : ''}
                      onClick={() => setFormat('pdf')}
                      data-testid="format-pdf"
                    >
                      <FileText className="w-4 h-4 mr-2" />
                      PDF
                    </Button>
                  )}
                </div>
                {isFullMode && (
                  <p className="text-xs text-gray-500">Full Response export supports CSV only</p>
                )}
              </div>

              {/* PDF Warning */}
              {isPdfLimited && (
                <div
                  className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg"
                  data-testid="pdf-warning"
                >
                  <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-sm text-amber-700">
                    PDF exports are limited to 1,000 records. Apply filters to narrow results or use CSV format.
                  </p>
                </div>
              )}

              {/* Export Button */}
              <Button
                className="w-full bg-[#9C1E23] hover:bg-[#7A171B] text-white font-semibold"
                disabled={recordCount === 0 || isDownloading || isPdfLimited || isFormRequired}
                onClick={handleExport}
                data-testid="export-button"
              >
                {isDownloading ? (
                  <>
                    <Download className="w-4 h-4 mr-2 animate-bounce" />
                    Generating export...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4 mr-2" />
                    Export {format.toUpperCase()}
                  </>
                )}
              </Button>

              {/* Progress indicator during download */}
              {isDownloading && (
                <div className="w-full bg-gray-200 rounded-full h-2" data-testid="export-progress">
                  <div className="bg-[#9C1E23] h-2 rounded-full animate-pulse w-2/3" />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
