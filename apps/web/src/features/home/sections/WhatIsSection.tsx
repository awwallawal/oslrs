import { SectionWrapper, SectionHeading } from '../components';

/**
 * WhatIsSection - "What Is OSLSR?" explanation section.
 *
 * Content from docs/public-website-ia.md Section 2.
 */
function WhatIsSection() {
  return (
    <SectionWrapper variant="light" id="what-is">
      <div className="max-w-3xl mx-auto text-center">
        <SectionHeading centered>What Is OSLSR?</SectionHeading>

        <p className="text-lg text-neutral-600 leading-relaxed">
          The Oyo State Labour & Skills Registry (OSLSR) is a government initiative to
          help Oyo State better understand its workforce. It allows residents to securely
          register their skills, work experience, and employment status using their
          mobile phones.
        </p>
      </div>
    </SectionWrapper>
  );
}

export { WhatIsSection };
