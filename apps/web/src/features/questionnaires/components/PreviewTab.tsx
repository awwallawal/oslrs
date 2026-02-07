import type { NativeFormSchema } from '@oslsr/types';

interface PreviewTabProps {
  schema: NativeFormSchema;
}

export function PreviewTab({ schema }: PreviewTabProps) {
  const totalQuestions = schema.sections.reduce((sum, s) => sum + s.questions.length, 0);
  const totalChoiceLists = Object.keys(schema.choiceLists).length;
  const totalSkipLogic = schema.sections.reduce(
    (sum, s) =>
      sum +
      (s.showWhen ? 1 : 0) +
      s.questions.filter((q) => q.showWhen).length,
    0
  );

  return (
    <div className="space-y-6">
      {/* Statistics */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-center">
          <p className="text-2xl font-semibold text-neutral-900">{schema.sections.length}</p>
          <p className="text-xs text-neutral-500">Sections</p>
        </div>
        <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-center">
          <p className="text-2xl font-semibold text-neutral-900">{totalQuestions}</p>
          <p className="text-xs text-neutral-500">Questions</p>
        </div>
        <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-center">
          <p className="text-2xl font-semibold text-neutral-900">{totalChoiceLists}</p>
          <p className="text-xs text-neutral-500">Choice Lists</p>
        </div>
        <div className="p-3 rounded-lg bg-neutral-50 border border-neutral-200 text-center">
          <p className="text-2xl font-semibold text-neutral-900">{totalSkipLogic}</p>
          <p className="text-xs text-neutral-500">Skip Logic</p>
        </div>
      </div>

      {/* Field Summary Table */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-2">Field Summary</h3>
        <div className="overflow-x-auto rounded-lg border border-neutral-200">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr>
                <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Section</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Name</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Type</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Required</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Skip Logic</th>
                <th className="text-left py-2 px-3 text-xs font-semibold text-neutral-600">Choices</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-100 bg-white">
              {schema.sections.flatMap((section) =>
                section.questions.map((q) => (
                  <tr key={q.id} className="hover:bg-neutral-50">
                    <td className="py-2 px-3 text-neutral-600">{section.title || 'Untitled'}</td>
                    <td className="py-2 px-3 font-mono text-neutral-900">{q.name}</td>
                    <td className="py-2 px-3 text-neutral-600">{q.type}</td>
                    <td className="py-2 px-3">
                      {q.required ? (
                        <span className="text-red-600 font-medium">Yes</span>
                      ) : (
                        <span className="text-neutral-400">No</span>
                      )}
                    </td>
                    <td className="py-2 px-3">
                      {q.showWhen ? (
                        <span className="text-amber-600 font-medium">Yes</span>
                      ) : (
                        <span className="text-neutral-400">No</span>
                      )}
                    </td>
                    <td className="py-2 px-3 font-mono text-neutral-600">{q.choices || '-'}</td>
                  </tr>
                ))
              )}
              {totalQuestions === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-neutral-400">
                    No questions to display
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* JSON Viewer */}
      <div>
        <h3 className="text-sm font-semibold text-neutral-700 mb-2">JSON Schema</h3>
        <pre className="p-4 rounded-lg border border-neutral-200 bg-neutral-50 text-xs font-mono overflow-auto max-h-96 text-neutral-800">
          {JSON.stringify(schema, null, 2)}
        </pre>
      </div>
    </div>
  );
}
