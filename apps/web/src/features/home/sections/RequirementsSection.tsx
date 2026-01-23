import { CreditCard, Phone, Mail, Clock } from 'lucide-react';
import { SectionWrapper, SectionHeading } from '../components';

/**
 * Requirements checklist data
 */
const requirements = [
  {
    icon: CreditCard,
    title: 'NIN (National Identification Number)',
    description: 'Your 11-digit NIN verifies your identity. We validate it locally — we don\'t store or share it publicly.',
  },
  {
    icon: Phone,
    title: 'Phone Number',
    description: 'A Nigerian mobile number for verification and optional marketplace contact.',
  },
  {
    icon: Mail,
    title: 'Email Address',
    description: 'For account verification and important updates.',
  },
  {
    icon: Clock,
    title: 'About 10 Minutes',
    description: 'The survey covers your skills, work history, and marketplace preferences.',
  },
];

/**
 * RequirementsSection - "What You'll Need" checklist.
 *
 * Content from docs/public-website-ia.md Section 2.
 * Displays requirements in a 2x2 grid on desktop.
 */
function RequirementsSection() {
  return (
    <SectionWrapper variant="default" id="what-youll-need">
      <SectionHeading centered>What You'll Need</SectionHeading>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8 max-w-4xl mx-auto">
        {requirements.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="flex gap-4 p-6 bg-neutral-50 rounded-xl"
            >
              <div className="flex-shrink-0">
                <div className="w-12 h-12 rounded-lg bg-primary-100 flex items-center justify-center">
                  <Icon className="w-6 h-6 text-primary-600" />
                </div>
              </div>
              <div>
                <h3 className="font-semibold text-neutral-900 mb-1">
                  {item.title}
                </h3>
                <p className="text-sm text-neutral-600">
                  {item.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </SectionWrapper>
  );
}

export { RequirementsSection };
