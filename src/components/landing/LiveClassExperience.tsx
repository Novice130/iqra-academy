const features = [
  {
    icon: "📱",
    title: "One-tap join from any device",
    desc: "Phone, tablet, or laptop — no meeting codes, no downloads. Just click the link in the email or in your dashboard and you're in the classroom.",
  },
  {
    icon: "📞",
    title: "Teacher calls your child",
    desc: "Running late? The teacher can send a \"call now\" notification directly to your device so your child never accidentally misses class.",
  },
  {
    icon: "👥",
    title: "Webinar & small interactive classes",
    desc: "Free weekly webinars are muted and moderated (20 kids, Q&A at end). Paid tiers use small interactive classrooms — 1:1 or group of 3 — with full audio and screen share.",
  },
  {
    icon: "🎥",
    title: "Optional class recordings",
    desc: "When recordings are enabled, only you and your child can access them — never shared publicly. Great for review or if a class is missed.",
  },
];

export default function LiveClassExperience() {
  return (
    <section className="py-16 sm:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            A real classroom — not just a Zoom link
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Our secure video classroom is built specifically for kids — safe, simple, and distraction-free.
          </p>
        </div>

        <div className="flex flex-col lg:flex-row gap-10 lg:gap-16 items-center">
          {/* Class UI Mockup */}
          <div className="w-full max-w-md lg:max-w-none lg:flex-1 shrink-0">
            <div className="rounded-2xl bg-gray-900 shadow-2xl overflow-hidden border border-gray-700">
              {/* Top bar */}
              <div className="flex items-center justify-between px-4 py-3 bg-gray-800 border-b border-gray-700">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <div className="w-2 h-2 rounded-full bg-yellow-400" />
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-300 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse" />
                  Live Class · 18:34 remaining
                </div>
                <div className="text-[10px] text-gray-500">🔒 Secure</div>
              </div>

              {/* Video tiles */}
              <div className="grid grid-cols-2 gap-2 p-3 bg-gray-900">
                {/* Teacher tile */}
                <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-emerald-900 to-teal-900 aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-emerald-600 flex items-center justify-center text-white text-xl mx-auto mb-1">
                      👩‍🏫
                    </div>
                    <div className="text-xs text-white font-medium">Ustadha Fatima</div>
                  </div>
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/40 px-1.5 py-0.5 rounded text-[10px] text-white">
                    🎙️ Speaking
                  </div>
                  <div className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-emerald-600 text-[9px] text-white font-bold">
                    Teacher
                  </div>
                </div>

                {/* Student tile */}
                <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-blue-900 to-indigo-900 aspect-video flex items-center justify-center">
                  <div className="text-center">
                    <div className="w-12 h-12 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl mx-auto mb-1">
                      👦
                    </div>
                    <div className="text-xs text-white font-medium">Yusuf</div>
                  </div>
                  <div className="absolute bottom-1.5 left-1.5 flex items-center gap-1 bg-black/40 px-1.5 py-0.5 rounded text-[10px] text-white">
                    🔇 Muted
                  </div>
                </div>
              </div>

              {/* Controls bar */}
              <div className="flex items-center justify-center gap-4 px-4 py-3 bg-gray-800 border-t border-gray-700">
                <button className="px-3 py-1.5 rounded-lg bg-gray-700 text-xs text-gray-300 hover:bg-gray-600 transition-colors">
                  🎙️ Mute
                </button>
                <button className="px-3 py-1.5 rounded-lg bg-emerald-600 text-xs text-white hover:bg-emerald-500 transition-colors">
                  ✋ Raise Hand
                </button>
                <button className="px-3 py-1.5 rounded-lg bg-gray-700 text-xs text-gray-300 hover:bg-gray-600 transition-colors">
                  📹 Camera
                </button>
                <button className="px-3 py-1.5 rounded-lg bg-red-600 text-xs text-white hover:bg-red-700 transition-colors">
                  Leave
                </button>
              </div>
            </div>
            <p className="text-center text-xs text-gray-400 mt-3">
              Secure video classroom built for kids · No external meeting codes
            </p>
          </div>

          {/* Feature list */}
          <div className="flex-1 flex flex-col gap-6">
            {features.map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-xl shrink-0">
                  {f.icon}
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 mb-1">{f.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
