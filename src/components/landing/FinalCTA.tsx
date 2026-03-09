export default function FinalCTA() {
  return (
    <section className="py-16 sm:py-20 bg-gradient-to-br from-emerald-700 to-teal-700">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
        <div className="text-5xl mb-5">🌙</div>
        <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-4 leading-tight">
          Make Quran time your child&apos;s favorite part of the week
        </h2>
        <p className="text-emerald-100 text-lg leading-relaxed mb-8 max-w-xl mx-auto">
          If you want Quran learning to feel like something your child looks forward to — not a battle
          — our 4×/week, 30-min live classes are built for you. Start with a free 15-minute assessment
          call and we&apos;ll take care of the rest.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <a
            href="#book"
            className="w-full sm:w-auto px-8 py-4 rounded-xl bg-white text-emerald-700 font-extrabold text-base hover:bg-emerald-50 transition-colors shadow-lg shadow-emerald-900/20"
          >
            Book a Free Assessment
          </a>
          <a
            href="mailto:hello@iqraacademy.com"
            className="w-full sm:w-auto text-emerald-100 text-sm font-semibold hover:text-white underline underline-offset-4 transition-colors"
          >
            Have questions? Email us →
          </a>
        </div>

        <p className="mt-4 text-emerald-200 text-xs">
          15-minute placement call · No credit card needed · Cancel anytime
        </p>
      </div>
    </section>
  );
}
