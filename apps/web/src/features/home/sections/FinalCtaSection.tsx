import { Link } from 'react-router-dom';
import { SectionWrapper } from '../components';

/**
 * FinalCtaSection - Bottom CTA before footer.
 *
 * Content from docs/public-website-ia.md Section 2.
 * Includes primary register button and login link for returning users.
 */
function FinalCtaSection() {
  return (
    <SectionWrapper variant="dark" id="final-cta">
      <div className="max-w-3xl mx-auto text-center">
        {/* H2 heading */}
        <h2 className="text-3xl lg:text-4xl font-brand font-semibold text-white mb-4">
          Ready to Register?
        </h2>

        {/* Motivational subtext */}
        <p className="text-lg text-neutral-300 mb-8">
          Your skills matter. Register today and help shape Oyo State's future workforce.
        </p>

        {/* Primary CTA */}
        <Link
          to="/register"
          className="inline-block px-10 py-4 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-neutral-900 transition-colors text-lg mb-6"
        >
          Register Now
        </Link>

        {/* Returning user link */}
        <p className="text-neutral-400">
          Already started?{' '}
          <Link
            to="/login"
            className="text-primary-300 hover:text-primary-200 underline transition-colors"
          >
            Continue your registration
          </Link>
        </p>
      </div>
    </SectionWrapper>
  );
}

export { FinalCtaSection };
