const safetyTopics = [
  {
    icon: "🛡️",
    title: "Safe, supervised classrooms",
    desc: "Every teacher goes through a background check, interview, and teaching trial before joining. Classrooms are monitored, and any inappropriate behavior is reported and actioned immediately. Kids are never left alone with an unknown adult.",
  },
  {
    icon: "💛",
    title: "Respectful, child-friendly teachers",
    desc: "We match each child with a teacher based on age, learning style, and personality. Shy kids start slower — we never rush or pressure. If your child doesn't connect with their teacher, we'll find a better match, no questions asked.",
  },
  {
    icon: "⏱️",
    title: "Healthy screen time",
    desc: "Each session is exactly 30 minutes — structured, focused, and teacher-led. No autoplay YouTube, no ads, no distracting content. When class ends, the classroom closes. It's the most intentional 30 minutes of screen time your child will have.",
  },
  {
    icon: "💬",
    title: "Moderated chat & recordings",
    desc: "In-class chat is visible only to the teacher and student. Recordings (when enabled) are accessible only to parents and the assigned teacher — never shared or stored publicly. You can request a transcript or disable recording any time.",
  },
];

export default function ForParents() {
  return (
    <section id="for-parents" className="py-16 sm:py-24 bg-[#faf9f6]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Built with parents in mind
          </h2>
          <p className="text-gray-500 text-lg max-w-xl mx-auto">
            We know handing your child a device for an online class takes trust. Here&apos;s exactly
            how we keep things safe, healthy, and Islamically grounded.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 gap-6">
          {safetyTopics.map((topic) => (
            <div
              key={topic.title}
              className="flex items-start gap-5 rounded-2xl bg-white border border-stone-100 p-6 shadow-sm"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-2xl shrink-0">
                {topic.icon}
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900 mb-2">{topic.title}</h3>
                <p className="text-sm text-gray-500 leading-relaxed">{topic.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
