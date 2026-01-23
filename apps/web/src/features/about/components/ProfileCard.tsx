import { User } from 'lucide-react';

interface ProfileCardProps {
  /** Person's name */
  name: string;
  /** Job title */
  title: string;
  /** Optional quote or description */
  quote?: string;
  /** Optional description (used instead of quote for non-commissioner roles) */
  description?: string;
  /** Photo URL (optional - shows placeholder if not provided) */
  photoUrl?: string;
  /** Data attribute for placeholder replacement */
  placeholderKey?: string;
}

/**
 * ProfileCard - Leader profile card with photo, name, title, and quote.
 *
 * Used on Leadership page for Commissioner and Project Director profiles.
 */
function ProfileCard({
  name,
  title,
  quote,
  description,
  photoUrl,
  placeholderKey,
}: ProfileCardProps) {
  return (
    <div
      className="bg-white rounded-xl border border-neutral-200 shadow-sm p-6 lg:p-8"
      data-placeholder={placeholderKey}
    >
      <div className="flex flex-col sm:flex-row gap-6 items-center sm:items-start">
        {/* Photo or Placeholder */}
        <div className="flex-shrink-0">
          {photoUrl ? (
            <img
              src={photoUrl}
              alt={name}
              className="w-24 h-24 lg:w-32 lg:h-32 rounded-full object-cover"
            />
          ) : (
            <div className="w-24 h-24 lg:w-32 lg:h-32 rounded-full bg-neutral-100 flex items-center justify-center">
              <User className="w-12 h-12 lg:w-16 lg:h-16 text-neutral-400" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 text-center sm:text-left">
          <h3
            className="text-xl lg:text-2xl font-semibold text-neutral-900 mb-1"
            data-placeholder={placeholderKey ? `${placeholderKey}-name` : undefined}
          >
            {name}
          </h3>
          <p className="text-primary-600 font-medium mb-4">{title}</p>

          {quote && (
            <blockquote className="text-neutral-600 italic border-l-4 border-primary-300 pl-4">
              "{quote}"
            </blockquote>
          )}

          {description && !quote && (
            <p className="text-neutral-600">{description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export { ProfileCard };
