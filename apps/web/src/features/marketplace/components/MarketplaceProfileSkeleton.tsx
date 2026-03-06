import { Card, CardContent, CardHeader } from '../../../components/ui/card';

export function MarketplaceProfileSkeleton() {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6 animate-pulse" data-testid="profile-skeleton">
      {/* Back button placeholder */}
      <div className="h-8 w-32 bg-neutral-200 rounded" />

      {/* Header: title + badge */}
      <div className="space-y-2">
        <div className="h-8 w-64 bg-neutral-200 rounded" />
        <div className="h-6 w-40 bg-neutral-200 rounded-full" />
      </div>

      {/* Info card */}
      <Card>
        <CardHeader>
          <div className="h-5 w-28 bg-neutral-200 rounded" />
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="h-4 w-48 bg-neutral-200 rounded" />
          <div className="h-4 w-36 bg-neutral-200 rounded" />
          <div className="h-4 w-52 bg-neutral-200 rounded" />
        </CardContent>
      </Card>

      {/* About card */}
      <Card>
        <CardHeader>
          <div className="h-5 w-16 bg-neutral-200 rounded" />
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="h-4 w-full bg-neutral-200 rounded" />
          <div className="h-4 w-3/4 bg-neutral-200 rounded" />
          <div className="h-4 w-1/2 bg-neutral-200 rounded" />
        </CardContent>
      </Card>

      {/* Contact card */}
      <Card>
        <CardContent className="pt-6">
          <div className="h-10 w-full bg-neutral-200 rounded" />
        </CardContent>
      </Card>
    </div>
  );
}
