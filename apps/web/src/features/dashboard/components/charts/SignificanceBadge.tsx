interface SignificanceBadgeProps {
  significant: boolean;
  pBracket?: string;
}

export function SignificanceBadge({ significant, pBracket }: SignificanceBadgeProps) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
        significant
          ? 'bg-green-100 text-green-800'
          : 'bg-gray-100 text-gray-600'
      }`}
    >
      {significant ? `Significant (p ${pBracket || '< 0.05'})` : 'Not Significant'}
    </span>
  );
}
