const plans = [
  {
    name: "Free Webinar",
    price: null,
    priceDisplay: "Free",
    badge: null,
    highlight: false,
    description: "Weekly live Quran webinar for up to 20 kids. A great way to experience our teaching style.",
    features: [
      "Weekly 30-min live Quran webinar",
      "Listen and follow along together",
      "Q&A session at the end",
      "No credit card required",
    ],
    limitations: ["Muted — no 1:1 interaction", "No personalized feedback"],
    cta: "Join Next Free Session",
    ctaHref: "#book",
    ctaStyle: "outline",
  },
  {
    name: "1:1 Classes",
    price: 70,
    priceDisplay: "$70",
    badge: "Most Popular",
    highlight: true,
    description: "The most effective option — dedicated 1:1 attention with a teacher matched to your child.",
    features: [
      "4 × 30-min one-on-one classes per week",
      "Custom track per child (Qaida, Recitation, Hifz)",
      "Fixed weekly schedule you choose",
      "Teacher audio feedback after each class",
      "Community chat access",
      "Weekly parent progress digest",
    ],
    limitations: [],
    cta: "Start 1:1 Plan",
    ctaHref: "#book",
    ctaStyle: "primary",
  },
  {
    name: "Group of 3",
    price: 50,
    priceDisplay: "$50",
    badge: null,
    highlight: false,
    description: "Small group classes with same-level peers — great for sociable learners.",
    features: [
      "4 × 30-min small-group classes per week",
      "Same age & level peers for motivation",
      "Fixed weekly schedule",
      "Teacher audio feedback",
      "Community chat access",
      "Weekly parent progress digest",
    ],
    limitations: [],
    cta: "Join Group Plan",
    ctaHref: "#book",
    ctaStyle: "outline",
  },
  {
    name: "Siblings Bundle",
    price: 100,
    priceDisplay: "$100",
    badge: "Best Value",
    highlight: false,
    description: "Up to 3 siblings under one family account — each with their own track and progress.",
    features: [
      "4 × 30-min classes/week per child",
      "Up to 3 siblings under 1 account",
      "Individual profiles & progress tracking",
      "Teacher audio feedback for each child",
      "Observer emails (grandparents, etc.)",
      "Weekly family progress digest",
    ],
    limitations: [],
    cta: "Enroll Siblings",
    ctaHref: "#book",
    ctaStyle: "outline",
  },
];

export default function Pricing() {
  return (
    <section id="pricing" className="py-16 sm:py-24 bg-[#faf9f6]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Plans &amp; pricing
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Transparent pricing, no lock-ins. Start free and upgrade anytime.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative rounded-2xl flex flex-col p-6 ${
                plan.highlight
                  ? "bg-emerald-700 text-white shadow-xl shadow-emerald-900/25 ring-2 ring-emerald-600 scale-[1.02]"
                  : "bg-white border border-stone-200 shadow-sm"
              }`}
            >
              {/* Badge */}
              {plan.badge && (
                <div
                  className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full text-xs font-bold shadow-md ${
                    plan.highlight
                      ? "bg-amber-400 text-amber-900"
                      : "bg-emerald-700 text-white"
                  }`}
                >
                  {plan.badge}
                </div>
              )}

              {/* Name */}
              <div
                className={`text-sm font-semibold uppercase tracking-wide mb-1 ${
                  plan.highlight ? "text-emerald-200" : "text-gray-500"
                }`}
              >
                {plan.name}
              </div>

              {/* Price */}
              <div className="mb-3">
                <span
                  className={`text-4xl font-extrabold ${
                    plan.highlight ? "text-white" : "text-gray-900"
                  }`}
                >
                  {plan.priceDisplay}
                </span>
                {plan.price && (
                  <span
                    className={`text-sm ml-1 ${
                      plan.highlight ? "text-emerald-200" : "text-gray-400"
                    }`}
                  >
                    / month
                  </span>
                )}
              </div>

              {/* Description */}
              <p
                className={`text-sm leading-relaxed mb-5 ${
                  plan.highlight ? "text-emerald-100" : "text-gray-500"
                }`}
              >
                {plan.description}
              </p>

              {/* Features */}
              <ul className="space-y-2 flex-1 mb-6">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-0.5 text-xs font-bold shrink-0 ${
                        plan.highlight ? "text-emerald-300" : "text-emerald-600"
                      }`}
                    >
                      ✓
                    </span>
                    <span className={plan.highlight ? "text-emerald-50" : "text-gray-700"}>
                      {f}
                    </span>
                  </li>
                ))}
                {plan.limitations.map((l) => (
                  <li key={l} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-0.5 text-xs font-bold shrink-0 ${
                        plan.highlight ? "text-emerald-400" : "text-gray-300"
                      }`}
                    >
                      –
                    </span>
                    <span className={plan.highlight ? "text-emerald-300" : "text-gray-400"}>
                      {l}
                    </span>
                  </li>
                ))}
              </ul>

              {/* CTA */}
              <a
                href={plan.ctaHref}
                className={`w-full py-2.5 rounded-xl text-sm font-bold text-center transition-colors block ${
                  plan.highlight
                    ? "bg-white text-emerald-700 hover:bg-emerald-50"
                    : plan.ctaStyle === "primary"
                    ? "bg-emerald-700 text-white hover:bg-emerald-800"
                    : "border-2 border-emerald-700 text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {plan.cta}
              </a>
            </div>
          ))}
        </div>

        {/* Fine print */}
        <div className="mt-10 rounded-2xl bg-white border border-stone-100 p-6 text-sm text-gray-500 space-y-2 max-w-3xl mx-auto">
          <p>
            💳 <strong className="text-gray-700">US-based billing in USD.</strong> Monthly payments
            processed securely. Optional auto-pay available.
          </p>
          <p>
            🔄 <strong className="text-gray-700">Reschedules &amp; cancellations:</strong> Miss a class? Let
            your teacher know 24 hours ahead and we&apos;ll arrange a makeup session. Cancel any plan with
            30 days notice — no long-term contracts.
          </p>
          <p>
            💰 <strong className="text-gray-700">30-day money-back guarantee.</strong> If you&apos;re not
            satisfied after your first month of paid classes, we&apos;ll refund you — no questions asked.
          </p>
        </div>
      </div>
    </section>
  );
}
