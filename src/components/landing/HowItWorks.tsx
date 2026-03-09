const steps = [
  {
    number: "1",
    title: "Book a Free Assessment",
    desc: "Pick a 15-minute time slot that works for you and tell us a little about your child — their age, where they are in Quran, and what you're hoping to achieve.",
    icon: "📅",
  },
  {
    number: "2",
    title: "Meet Your Teacher",
    desc: "We'll match your child with a patient, certified teacher for a short 1:1 placement call. No pressure — just a friendly chat to understand their level and personality.",
    icon: "👩‍🏫",
  },
  {
    number: "3",
    title: "Lock Your Weekly Schedule",
    desc: "Choose 4 fixed 30-minute slots that fit your family routine. Same days, same teacher, every week — so Quran time becomes a natural part of your schedule.",
    icon: "🗓️",
  },
  {
    number: "4",
    title: "Watch Their Recitation Grow",
    desc: "Every week you'll receive a progress digest and a short audio note from the teacher. Watch your child go from their first letters to fluent recitation — milestone by milestone.",
    icon: "📈",
  },
];

export default function HowItWorks() {
  return (
    <section id="how-it-works" className="py-16 sm:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            How our Quran program works
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            From your first click to your child&apos;s first lesson — four simple steps.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8">
          {steps.map((step, index) => (
            <div key={step.number} className="relative">
              {/* Connector line (hidden on last) */}
              {index < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 left-[calc(100%_-_8px)] w-full h-px bg-gradient-to-r from-emerald-200 to-transparent z-0" />
              )}

              <div className="relative z-10 flex flex-col items-start gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-emerald-700 text-white font-extrabold text-sm flex items-center justify-center shadow-md shadow-emerald-900/20">
                    {step.number}
                  </div>
                  <div className="text-2xl">{step.icon}</div>
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <a
            href="#book"
            className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-emerald-700 text-white font-bold text-base hover:bg-emerald-800 transition-colors shadow-md shadow-emerald-900/15"
          >
            Book a Free Assessment →
          </a>
        </div>
      </div>
    </section>
  );
}
