import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../../../components/ui/card';
import { MapPin, Briefcase } from 'lucide-react';
import { GovernmentVerifiedBadge } from './GovernmentVerifiedBadge';
import { skillLabelForSlug, type MarketplaceSearchResultItem } from '@oslsr/types';

interface WorkerCardProps {
  profile: MarketplaceSearchResultItem;
}

/** Story 13-28 — how many skill chips show on a card before we collapse to "+N more". */
const MAX_CARD_SKILLS = 3;

export function WorkerCard({ profile }: WorkerCardProps) {
  const truncatedBio = profile.bio
    ? profile.bio.length > 100 ? `${profile.bio.slice(0, 100)}...` : profile.bio
    : null;

  // Story 13-28 — surface the worker's skills (the core matchmaking signal) as
  // canonical labels; degrade gracefully when a profile has none.
  const skills = profile.skills ?? [];
  const visibleSkills = skills.slice(0, MAX_CARD_SKILLS);
  const hiddenSkillCount = skills.length - visibleSkills.length;

  return (
    <Link to={`/marketplace/profile/${profile.id}`} className="block hover:no-underline">
      <Card data-testid="worker-card" className="h-full transition-shadow hover:shadow-md">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="text-base font-semibold">
              {profile.profession || 'Unknown Profession'}
            </CardTitle>
            {profile.verifiedBadge && (
              <GovernmentVerifiedBadge interactive={false} />
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {profile.lgaName && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" />
              {profile.lgaName}
            </div>
          )}
          {profile.experienceLevel && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Briefcase className="h-3.5 w-3.5" />
              {profile.experienceLevel}
            </div>
          )}
          {truncatedBio && (
            <p className="text-sm text-muted-foreground line-clamp-3">{truncatedBio}</p>
          )}
          {visibleSkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pt-0.5" data-testid="worker-card-skills">
              {visibleSkills.map((slug) => (
                <span
                  key={slug}
                  className="inline-flex items-center rounded-full bg-primary-600/10 px-2 py-0.5 text-xs font-medium text-primary-600"
                >
                  {skillLabelForSlug(slug)}
                </span>
              ))}
              {hiddenSkillCount > 0 && (
                <span
                  className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                  data-testid="worker-card-skills-more"
                >
                  +{hiddenSkillCount} more
                </span>
              )}
            </div>
          )}
          <span className="block text-sm font-medium text-center text-primary mt-2 py-1.5 border rounded-md border-input hover:bg-accent">
            View Profile
          </span>
        </CardContent>
      </Card>
    </Link>
  );
}
