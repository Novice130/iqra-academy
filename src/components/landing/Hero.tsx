export default function Hero() {
  return (
    <section className="bg-gradient-to-br from-[#faf9f6] via-[#f5f9f6] to-[#f0f7f4] py-16 sm:py-24">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col lg:flex-row items-center gap-12 lg:gap-16">
          {/* Left – copy */}
          <div className="flex-1 text-center lg:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-100 text-emerald-700 text-xs font-semibold mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
              Enrollment open · US time zones
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold text-gray-900 leading-tight tracking-tight mb-5">
              Online Quran Classes for Kids —{" "}
              <span className="text-emerald-700">4 Live Sessions a Week</span>
            </h1>

            <p className="text-lg text-gray-600 leading-relaxed mb-7 max-w-xl mx-auto lg:mx-0">
              A structured path from Noorani Qaida all the way to Hifz — built for busy US families,
              with fixed weekly schedules and real progress your children can feel.
            </p>

            <ul className="space-y-3 mb-8 text-left max-w-md mx-auto lg:mx-0">
              {[
                "Start from Noorani Qaida or build confident, fluent Tajweed recitation.",
                "4 live 30-min sessions per week at fixed times that fit your family.",
                "Weekly parent email with teacher audio note on your child's progress.",
                "1:1, group of 3, or siblings bundle — US time zones, live teachers.",
              ].map((bullet) => (
                <li key={bullet} className="flex items-start gap-3 text-gray-700 text-sm sm:text-base">
                  <span className="mt-1 w-5 h-5 shrink-0 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                  {bullet}
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-3">
              <a
                id="book"
                href="#book"
                className="w-full sm:w-auto px-7 py-3.5 rounded-xl bg-emerald-700 text-white font-bold text-base hover:bg-emerald-800 transition-colors shadow-md shadow-emerald-900/15"
              >
                Book a Free Assessment
              </a>
              <a
                href="#pricing"
                className="text-sm font-semibold text-emerald-700 hover:text-emerald-800 underline underline-offset-4 transition-colors"
              >
                See plans &amp; pricing ↓
              </a>
            </div>

            <p className="mt-3 text-xs text-gray-400 text-center lg:text-left">
              15-minute placement call · No credit card needed
            </p>
          </div>

          {/* Right – product mockup */}
          <div className="flex-1 w-full max-w-md lg:max-w-none">
            <div className="relative rounded-2xl bg-white shadow-xl shadow-emerald-900/10 border border-stone-100 p-5 sm:p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-white text-xs font-bold">
                    ق
                  </div>
                  <div>
                    <div className="text-xs font-bold text-gray-900">Iqra Academy</div>
                    <div className="text-[10px] text-gray-400">Student Dashboard</div>
                  </div>
                </div>
                <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-semibold border border-emerald-100">
                  Live
                </span>
              </div>

              {/* Next class card */}
              <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-100 p-4 mb-4">
                <div className="text-xs text-emerald-600 font-semibold mb-1 uppercase tracking-wide">
                  Next Class
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-bold text-gray-900 text-sm">Tajweed – Session 12</div>
                    <div className="text-xs text-gray-500 mt-0.5">Today · 5:00 PM EST · with Ustadh Ahmed</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-extrabold text-emerald-700">2:34</div>
                    <div className="text-[10px] text-gray-400">hours away</div>
                  </div>
                </div>
                <div className="mt-3">
                  <button className="w-full py-2 rounded-lg bg-emerald-700 text-white text-xs font-bold hover:bg-emerald-800 transition-colors">
                    Join Class →
                  </button>
                </div>
              </div>

              {/* Progress */}
              <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold text-gray-700">Tajweed Progress</span>
                  <span className="text-xs font-bold text-emerald-700">68%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                    style={{ width: "68%" }}
                  />
                </div>
              </div>

              {/* Teacher feedback */}
              <div className="rounded-xl bg-amber-50 border border-amber-100 p-3 flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-amber-200 flex items-center justify-center text-xs shrink-0">
                  🎧
                </div>
                <div>
                  <div className="text-xs font-semibold text-gray-700">Teacher Audio Feedback</div>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    &ldquo;Great work on the noon mushaddada today, Yusuf!&rdquo;
                  </div>
                  <div className="mt-1.5 flex items-center gap-1">
                    <div className="h-1 rounded-full bg-amber-300 flex-1" />
                    <span className="text-[10px] text-amber-600 font-medium">▶ 0:42</span>
                  </div>
                </div>
              </div>

              {/* Weekly sessions mini-row */}
              <div className="mt-4 grid grid-cols-4 gap-1.5">
                {["Mon", "Tue", "Thu", "Fri"].map((day, i) => (
                  <div
                    key={day}
                    className={`rounded-lg py-2 text-center text-[10px] font-semibold ${
                      i < 3
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-gray-50 text-gray-400 border border-dashed border-gray-200"
                    }`}
                  >
                    {day}
                    <div className="text-[9px] mt-0.5">{i < 3 ? "✓" : "—"}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
