const problems = [
  "Your child is just starting Quran and you're worried about pronunciation.",
  "They can read letters but struggle to join and read smoothly.",
  "You want a gentle path into memorization without overwhelming them.",
  "You're busy and need fixed, reliable class times each week.",
  "You've tried YouTube videos but want real accountability and feedback.",
];

const solutions = [
  "Structured Noorani Qaida → Recitation → Hifz tracks, each building on the last.",
  "4× weekly short sessions that build reading habit and confidence step by step.",
  "Patient, kid-friendly teachers who adjust pace and celebrate every milestone.",
  "Fixed weekly schedule you pick once — same days, same teacher, every week.",
  "Live teacher interaction, audio feedback after each class, and weekly parent digest.",
];

export default function ProblemSolution() {
  return (
    <section className="py-16 sm:py-24 bg-[#faf9f6]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Does this sound familiar?
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            We built Iqra Academy around the real struggles parents and kids face.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Problems */}
          <div className="rounded-2xl bg-white border border-rose-100 p-7 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-rose-50 flex items-center justify-center text-lg">
                😟
              </div>
              <h3 className="text-lg font-bold text-gray-900">This is for your family if…</h3>
            </div>
            <ul className="space-y-4">
              {problems.map((p) => (
                <li key={p} className="flex items-start gap-3 text-gray-700 text-sm leading-relaxed">
                  <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-rose-50 border border-rose-200 text-rose-500 flex items-center justify-center text-xs font-bold">
                    ✗
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Solutions */}
          <div className="rounded-2xl bg-white border border-emerald-100 p-7 shadow-sm">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center text-lg">
                ✅
              </div>
              <h3 className="text-lg font-bold text-gray-900">How our program solves this</h3>
            </div>
            <ul className="space-y-4">
              {solutions.map((s) => (
                <li key={s} className="flex items-start gap-3 text-gray-700 text-sm leading-relaxed">
                  <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                  {s}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
