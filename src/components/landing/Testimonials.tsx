const testimonials = [
  {
    name: "Sarah M.",
    childAge: "daughter, 8",
    location: "Houston, TX",
    quote:
      "Our daughter used to dread Quran time. After just 6 weeks with Iqra Academy, she's asking to practice on her own. The teacher's patience made all the difference.",
    stars: 5,
  },
  {
    name: "Omar K.",
    childAge: "son, 11",
    location: "Chicago, IL",
    quote:
      "I love the weekly audio note from the teacher — I actually know what my son is working on and where he's improving. It keeps me connected even when I'm not in the room.",
    stars: 5,
  },
  {
    name: "Amira T.",
    childAge: "twins, 7 & 9",
    location: "Dearborn, MI",
    quote:
      "We enrolled both kids on the Siblings Bundle and it's been seamless. Different teachers, different paces, but one dashboard to track everything. Absolutely worth it.",
    stars: 5,
  },
  {
    name: "Khalid R.",
    childAge: "son, 13",
    location: "Fremont, CA",
    quote:
      "My son is shy and I was worried about the camera. But the teacher started with 1:1 sessions and made him comfortable slowly. He's now memorizing Surah Al-Mulk with confidence.",
    stars: 5,
  },
  {
    name: "Fatima B.",
    childAge: "daughter, 6",
    location: "Brooklyn, NY",
    quote:
      "She started not knowing a single letter. Within 4 months she completed Noorani Qaida and is now reading from the Quran. I cry every time I watch her recite.",
    stars: 5,
  },
  {
    name: "Yusuf A.",
    childAge: "son, 10",
    location: "Dallas, TX",
    quote:
      "The fixed schedule was the game-changer for us. We know exactly when Quran class is every week — no rescheduling chaos. It's become part of our family routine.",
    stars: 5,
  },
];

export default function Testimonials() {
  return (
    <section className="py-16 sm:py-24 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            What other parents are saying
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            Real stories from families across the US who made Quran learning part of their weekly routine.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {testimonials.map((t) => (
            <div
              key={t.name}
              className="rounded-2xl bg-[#faf9f6] border border-stone-100 p-6 flex flex-col gap-4 hover:shadow-md transition-shadow"
            >
              {/* Stars */}
              <div className="flex gap-0.5">
                {Array.from({ length: t.stars }).map((_, i) => (
                  <span key={i} className="text-amber-400 text-sm">
                    ★
                  </span>
                ))}
              </div>

              {/* Quote */}
              <p className="text-gray-700 text-sm leading-relaxed flex-1">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* Author */}
              <div className="flex items-center gap-3 pt-2 border-t border-stone-100">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-100 to-teal-100 flex items-center justify-center text-emerald-700 font-bold text-sm shrink-0">
                  {t.name[0]}
                </div>
                <div>
                  <div className="text-sm font-bold text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-400">
                    {t.childAge} · {t.location}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
