import { User, Briefcase, Building2 } from 'lucide-react';
import { SectionWrapper, SectionHeading, FeatureCard } from '../components';

/**
 * Participant cards data
 */
const participantCards = [
  {
    title: 'Residents',
    description: 'Register your skills and work status to be counted.',
    icon: User,
    linkText: 'Learn More',
    linkHref: '/participate',
  },
  {
    title: 'Skilled Workers',
    description: 'Showcase your trade and get verified for opportunities.',
    icon: Briefcase,
    linkText: 'Register Now',
    linkHref: '/register',
  },
  {
    title: 'Employers',
    description: 'Find verified local talent in the public marketplace.',
    icon: Building2,
    linkText: 'Search Workers',
    linkHref: '/marketplace',
  },
];

/**
 * ParticipantsSection - "Who Can Participate?" cards section.
 *
 * Content from docs/public-website-ia.md Section 2.
 * Displays 3 cards in responsive grid.
 */
function ParticipantsSection() {
  return (
    <SectionWrapper variant="default" id="who-can-participate">
      <SectionHeading centered>Who Can Participate?</SectionHeading>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
        {participantCards.map((card) => (
          <FeatureCard
            key={card.title}
            title={card.title}
            description={card.description}
            icon={card.icon}
            linkText={card.linkText}
            linkHref={card.linkHref}
          />
        ))}
      </div>
    </SectionWrapper>
  );
}

export { ParticipantsSection };
