import { Building2 } from 'lucide-react';

interface PartnerLogoCardProps {
  /** Partner organization name */
  name: string;
  /** Optional logo URL */
  logoUrl?: string;
  /** Optional website URL */
  websiteUrl?: string;
  /** Data attribute for placeholder replacement */
  placeholderKey?: string;
}

/**
 * PartnerLogoCard - Placeholder card for partner organization logos.
 *
 * Shows organization name with placeholder icon until real logos are provided.
 */
function PartnerLogoCard({
  name,
  logoUrl,
  websiteUrl,
  placeholderKey,
}: PartnerLogoCardProps) {
  const content = (
    <div
      className="bg-white rounded-xl border border-neutral-200 p-6 flex flex-col items-center justify-center min-h-[160px] hover:border-primary-300 hover:shadow-sm transition-all"
      data-placeholder={placeholderKey}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt={name}
          className="max-h-16 max-w-full object-contain mb-4"
        />
      ) : (
        <div className="w-16 h-16 rounded-lg bg-neutral-100 flex items-center justify-center mb-4">
          <Building2 className="w-8 h-8 text-neutral-400" />
        </div>
      )}
      <p className="text-sm font-medium text-neutral-700 text-center">{name}</p>
    </div>
  );

  if (websiteUrl) {
    return (
      <a
        href={websiteUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        {content}
      </a>
    );
  }

  return content;
}

export { PartnerLogoCard };
