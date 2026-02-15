/**
 * Enumerator Surveys Page
 *
 * Story 3.1 AC1: Grid of published form cards with Start Survey / Resume Draft.
 */

import { useNavigate } from 'react-router-dom';
import { FileText, PlayCircle, RotateCcw } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { SkeletonCard } from '../../../components/skeletons';
import { usePublishedForms, useFormDrafts } from '../../forms/hooks/useForms';

export default function EnumeratorSurveysPage() {
  const navigate = useNavigate();
  const { data: forms, isLoading, error } = usePublishedForms();
  const { draftMap } = useFormDrafts();

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-brand font-semibold text-neutral-900">Surveys</h1>
        <p className="text-neutral-600 mt-1">Available questionnaires for data collection</p>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="surveys-loading">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {/* Error state */}
      {error && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-red-600 font-medium" data-testid="surveys-error">
              {error.message || 'Failed to load surveys'}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Empty state */}
      {!isLoading && !error && forms && forms.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-12 h-12 text-neutral-300 mb-4" />
            <p className="text-neutral-500 font-medium">No surveys available yet</p>
            <p className="text-sm text-neutral-400 mt-1">Contact your supervisor.</p>
          </CardContent>
        </Card>
      )}

      {/* Survey cards grid */}
      {!isLoading && !error && forms && forms.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" data-testid="surveys-grid">
          {forms.map((form) => (
            <Card key={form.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-5">
                <div className="flex items-start gap-3 mb-4">
                  <div className="p-2 bg-primary-100 rounded-lg shrink-0">
                    <FileText className="w-5 h-5 text-primary-600" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-neutral-900 truncate">{form.title}</h3>
                    <p className="text-xs text-neutral-400 mt-0.5">v{form.version}</p>
                  </div>
                </div>
                {form.description && (
                  <p className="text-sm text-neutral-500 mb-4 line-clamp-2">{form.description}</p>
                )}
                <button
                  onClick={() => navigate(`/dashboard/enumerator/survey/${form.id}`)}
                  className={`w-full min-h-[48px] flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-colors ${
                    draftMap[form.id] === 'in-progress'
                      ? 'bg-amber-600 text-white hover:bg-amber-700'
                      : 'bg-[#9C1E23] text-white hover:bg-[#7A171B]'
                  }`}
                  data-testid={`start-survey-${form.id}`}
                >
                  {draftMap[form.id] === 'in-progress' ? (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      Resume Draft
                    </>
                  ) : (
                    <>
                      <PlayCircle className="w-4 h-4" />
                      Start Survey
                    </>
                  )}
                </button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
