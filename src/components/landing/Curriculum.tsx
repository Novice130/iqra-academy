const tracks = [
  {
    number: "1",
    title: "Qaidah Foundations",
    subtitle: "Noorani Qaida",
    emoji: "🔤",
    color: "from-amber-50 to-orange-50",
    border: "border-amber-200",
    accent: "text-amber-700",
    badge: "bg-amber-100 text-amber-700",
    timeline: "~3–6 months",
    description:
      "We start right from the Arabic alphabet — letters, vowels, tanween, and joining — using the proven Noorani Qaida method. Your child learns to decode the Mushaf accurately before moving on.",
    outcomes: [
      "Recognizes all Arabic letters and their forms",
      "Reads short words with correct vowels",
      "Can open and read any page of the Quran",
    ],
  },
  {
    number: "2",
    title: "Fluent Recitation",
    subtitle: "Tajweed Rules",
    emoji: "📖",
    color: "from-emerald-50 to-teal-50",
    border: "border-emerald-200",
    accent: "text-emerald-700",
    badge: "bg-emerald-100 text-emerald-700",
    timeline: "~6–12 months",
    description:
      "With letters mastered, we focus on fluency, Makharij (articulation points), and the most common Tajweed rules. Sessions include recitation practice and real-time correction by the teacher.",
    outcomes: [
      "Reads with correct Makharij and basic Tajweed",
      "Recites confidently in Salah and at home",
      "Understands and applies Ghunnah, Ikhfa, and Idghaam",
    ],
  },
  {
    number: "3",
    title: "Hifz Pathway",
    subtitle: "Memorization",
    emoji: "🏅",
    color: "from-violet-50 to-indigo-50",
    border: "border-violet-200",
    accent: "text-violet-700",
    badge: "bg-violet-100 text-violet-700",
    timeline: "Ongoing",
    description:
      "For students ready to memorize, we begin with Juz Amma using structured revision cycles that build retention without overwhelm. Progress is tracked daily with the teacher and reviewed every week.",
    outcomes: [
      "Memorizes short Surahs with solid retention",
      "Builds a consistent daily review habit",
      "Progresses steadily through Juz Amma and beyond",
    ],
  },
];

export default function Curriculum() {
  return (
    <section id="curriculum" className="py-16 sm:py-24 bg-[#faf9f6]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Noorani Qaida to Hifz roadmap
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Three clear tracks — your child starts where they are and grows at their own pace.
          </p>
        </div>

        {/* Roadmap connector */}
        <div className="hidden lg:flex items-center justify-center mb-10 gap-0">
          {tracks.map((track, i) => (
            <div key={track.number} className="flex items-center gap-0">
              <div className={`flex items-center gap-2 px-5 py-2 rounded-full border-2 ${track.border} bg-white shadow-sm`}>
                <span className={`text-sm font-extrabold ${track.accent}`}>Track {track.number}</span>
                <span className="text-sm">{track.emoji}</span>
                <span className={`text-xs font-semibold ${track.accent}`}>{track.subtitle}</span>
              </div>
              {i < tracks.length - 1 && (
                <div className="flex items-center mx-2">
                  <div className="w-12 h-px bg-gradient-to-r from-gray-300 to-gray-300" />
                  <span className="text-gray-400 text-xs">→</span>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {tracks.map((track) => (
            <div
              key={track.number}
              className={`rounded-2xl bg-gradient-to-br ${track.color} border ${track.border} p-6 flex flex-col gap-4`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className={`text-xs font-bold uppercase tracking-widest ${track.accent} mb-1`}>
                    Track {track.number}
                  </div>
                  <h3 className="text-xl font-extrabold text-gray-900">{track.title}</h3>
                  <div className="text-sm text-gray-600 font-medium">{track.subtitle}</div>
                </div>
                <div className="text-4xl">{track.emoji}</div>
              </div>

              <div className={`inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full ${track.badge} text-xs font-semibold`}>
                ⏱ {track.timeline}
              </div>

              <p className="text-sm text-gray-700 leading-relaxed">{track.description}</p>

              <div>
                <div className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">
                  Outcomes
                </div>
                <ul className="space-y-1.5">
                  {track.outcomes.map((o) => (
                    <li key={o} className="flex items-start gap-2 text-sm text-gray-700">
                      <span className={`mt-0.5 text-xs font-bold ${track.accent}`}>✓</span>
                      {o}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
