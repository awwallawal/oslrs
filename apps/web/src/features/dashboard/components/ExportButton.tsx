/**
 * ExportButton — Reusable dropdown export button
 *
 * Story 5.4 Task 6: Shared component for triggering CSV/PDF downloads.
 * Reusable from ExportPage, Story 5.5 registry table, Story 5.6a productivity table.
 */

import { useState } from 'react';
import { Download, FileText, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../components/ui/dropdown-menu';
import { useExportDownload } from '../hooks/useExport';
import { useToast } from '../../../hooks/useToast';
import type { ExportFilters } from '../api/export.api';

interface ExportButtonProps {
  filters: ExportFilters;
  defaultFormat?: 'csv' | 'pdf';
}

export function ExportButton({ filters, defaultFormat }: ExportButtonProps) {
  const toast = useToast();
  const { download, isDownloading } = useExportDownload();
  const [open, setOpen] = useState(false);

  const handleExport = async (format: 'csv' | 'pdf') => {
    setOpen(false);
    try {
      const filename = await download(filters, format);
      toast.success({ message: `Export downloaded: ${filename}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      toast.error({ message: 'Export failed', description: message });
    }
  };

  if (defaultFormat) {
    return (
      <Button
        variant="outline"
        size="sm"
        disabled={isDownloading}
        onClick={() => handleExport(defaultFormat)}
        data-testid="export-button"
      >
        {isDownloading ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Download className="w-4 h-4 mr-2" />
        )}
        {isDownloading ? 'Exporting...' : `Export ${defaultFormat.toUpperCase()}`}
      </Button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isDownloading}
          data-testid="export-button"
        >
          {isDownloading ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Download className="w-4 h-4 mr-2" />
          )}
          {isDownloading ? 'Exporting...' : 'Export'}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          onClick={() => handleExport('csv')}
          data-testid="export-csv-option"
        >
          <FileSpreadsheet className="w-4 h-4 mr-2" />
          Export CSV
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport('pdf')}
          data-testid="export-pdf-option"
        >
          <FileText className="w-4 h-4 mr-2" />
          Export PDF
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
