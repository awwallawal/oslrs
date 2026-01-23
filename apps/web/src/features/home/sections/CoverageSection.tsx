import { MapPin, Users, Activity } from 'lucide-react';
import { SectionWrapper, SectionHeading } from '../components';

/**
 * Metric cards data (Phase 1 static values)
 */
const metrics = [
  {
    icon: MapPin,
    value: '33',
    label: 'LGAs Covered',
    testId: 'metric-lgas-covered',
  },
  {
    icon: Users,
    value: 'Coming Soon',
    label: 'Registered Workers',
    testId: 'metric-registered-workers',
  },
  {
    icon: Activity,
    value: 'Active',
    label: 'Data Collection',
    testId: 'metric-status',
  },
];

/**
 * CoverageSection - "Coverage & Progress" metrics display.
 *
 * Phase 1 placeholder with static values.
 * data-testid attributes added for future API integration.
 */
function CoverageSection() {
  return (
    <SectionWrapper variant="primary" id="coverage">
      <SectionHeading centered>Coverage & Progress</SectionHeading>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <div
              key={metric.testId}
              className="text-center p-8 bg-white rounded-xl shadow-sm"
              data-testid={metric.testId}
            >
              <div className="w-14 h-14 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
                <Icon className="w-7 h-7 text-primary-600" />
              </div>
              <div className="text-3xl lg:text-4xl font-brand font-semibold text-primary-600 mb-2">
                {metric.value}
              </div>
              <div className="text-neutral-600 font-medium">
                {metric.label}
              </div>
            </div>
          );
        })}
      </div>
    </SectionWrapper>
  );
}

export { CoverageSection };
