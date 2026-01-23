import { Link } from 'react-router-dom';

/**
 * HeroSection - Main hero with H1, subtext, and CTAs.
 *
 * Content from docs/public-website-ia.md Section 2.
 * This is the ONLY section with an H1 heading.
 */
function HeroSection() {
  return (
    <section id="hero" className="relative py-20 lg:py-32 bg-gradient-to-b from-primary-50 to-white">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          {/* H1 - Only H1 on the page */}
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-brand font-semibold text-neutral-900 leading-tight mb-6">
            Building a Clear Picture of{' '}
            <span className="text-primary-600">Oyo State's Workforce</span>
          </h1>

          {/* Subtext */}
          <p className="text-lg sm:text-xl text-neutral-600 mb-10 max-w-3xl mx-auto">
            The Oyo State Labour & Skills Registry helps government plan better jobs,
            skills training, and economic opportunities — using accurate data collected
            directly from residents.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/register"
              className="px-8 py-4 bg-primary-600 text-white font-semibold rounded-lg hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors text-lg"
            >
              Register Your Skills
            </Link>
            <Link
              to="/about/how-it-works"
              className="px-8 py-4 border-2 border-neutral-300 text-neutral-700 font-semibold rounded-lg hover:bg-neutral-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors text-lg"
            >
              Learn How It Works
            </Link>
          </div>
        </div>
      </div>

      {/* Decorative background pattern */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-0 right-0 w-1/2 h-1/2 bg-gradient-to-bl from-primary-100/30 to-transparent rounded-full blur-3xl" />
        <div className="absolute bottom-0 left-0 w-1/3 h-1/3 bg-gradient-to-tr from-primary-100/20 to-transparent rounded-full blur-3xl" />
      </div>
    </section>
  );
}

export { HeroSection };
