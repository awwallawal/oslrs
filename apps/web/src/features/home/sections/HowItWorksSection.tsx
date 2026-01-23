import { UserPlus, Mail, FileText, BadgeCheck } from 'lucide-react';
import { SectionWrapper, SectionHeading, StepIndicator } from '../components';

/**
 * Steps data for the registration flow
 */
const steps = [
  {
    step: 1,
    title: 'Create Account',
    description: 'Register with your phone number, email, and NIN',
    icon: UserPlus,
  },
  {
    step: 2,
    title: 'Verify Email',
    description: 'Confirm your email address',
    icon: Mail,
  },
  {
    step: 3,
    title: 'Complete Survey',
    description: 'Fill out the skills survey (~10 minutes)',
    icon: FileText,
  },
  {
    step: 4,
    title: 'Get Verified',
    description: 'Appear in the marketplace with verified badge',
    icon: BadgeCheck,
  },
];

/**
 * HowItWorksSection - 4-step registration flow visualization.
 *
 * Content from docs/public-website-ia.md Section 2.
 * Shows horizontal steps on desktop, vertical on mobile.
 */
function HowItWorksSection() {
  return (
    <SectionWrapper variant="light" id="how-it-works">
      <SectionHeading centered>How It Works</SectionHeading>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-4">
        {steps.map((step, index) => (
          <StepIndicator
            key={step.step}
            step={step.step}
            title={step.title}
            description={step.description}
            icon={step.icon}
            isLast={index === steps.length - 1}
          />
        ))}
      </div>
    </SectionWrapper>
  );
}

export { HowItWorksSection };
