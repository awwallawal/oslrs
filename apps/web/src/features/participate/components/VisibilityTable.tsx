import { Check, X } from 'lucide-react';

interface VisibilityRow {
  information: string;
  publicSearch: boolean;
  registeredEmployer: boolean;
  note?: string;
}

const visibilityData: VisibilityRow[] = [
  { information: 'Profession/Skill', publicSearch: true, registeredEmployer: true },
  { information: 'Local Government', publicSearch: true, registeredEmployer: true },
  { information: 'Experience Level', publicSearch: true, registeredEmployer: true },
  { information: 'Verified Badge', publicSearch: true, registeredEmployer: true },
  { information: "Worker's Name", publicSearch: false, registeredEmployer: true, note: '*' },
  { information: 'Phone Number', publicSearch: false, registeredEmployer: true, note: '*' },
  { information: 'Bio', publicSearch: false, registeredEmployer: true, note: '*' },
];

/**
 * VisibilityTable - Table showing public vs registered employer visibility.
 *
 * Used on Employers page for "What Information Is Visible?" section.
 */
function VisibilityTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-neutral-100">
            <th className="text-left py-3 px-4 font-semibold text-neutral-900 border-b border-neutral-200">
              Information
            </th>
            <th className="text-center py-3 px-4 font-semibold text-neutral-900 border-b border-neutral-200">
              Public Search
            </th>
            <th className="text-center py-3 px-4 font-semibold text-neutral-900 border-b border-neutral-200">
              Registered Employer
            </th>
          </tr>
        </thead>
        <tbody>
          {visibilityData.map((row, index) => (
            <tr
              key={index}
              className={index % 2 === 0 ? 'bg-white' : 'bg-neutral-50'}
            >
              <td className="py-3 px-4 text-neutral-700 border-b border-neutral-200">
                {row.information}
              </td>
              <td className="text-center py-3 px-4 border-b border-neutral-200">
                {row.publicSearch ? (
                  <Check className="w-5 h-5 text-success-600 mx-auto" />
                ) : (
                  <X className="w-5 h-5 text-error-600 mx-auto" />
                )}
              </td>
              <td className="text-center py-3 px-4 border-b border-neutral-200">
                {row.registeredEmployer ? (
                  <span className="inline-flex items-center gap-1">
                    <Check className="w-5 h-5 text-success-600" />
                    {row.note && <span className="text-neutral-500 text-sm">{row.note}</span>}
                  </span>
                ) : (
                  <X className="w-5 h-5 text-error-600 mx-auto" />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-sm text-neutral-500 mt-3">
        * Only if worker opted in to share contact details.
      </p>
    </div>
  );
}

export { VisibilityTable };
