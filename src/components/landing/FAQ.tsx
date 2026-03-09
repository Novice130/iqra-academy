"use client";

import { useState } from "react";

const faqs = [
  {
    q: "What if my child is very shy?",
    a: "Shy kids actually thrive in 1:1 classes because there's no peer pressure. Our teachers are trained to start gently — sometimes it's just reading a few letters together in the first class. We move at the child's comfort level, not a fixed script.",
  },
  {
    q: "What if we miss a class?",
    a: "Let your teacher know at least 24 hours ahead and we'll schedule a makeup session. Life happens — we don't penalize families for occasional absences. We just ask for a heads-up so the teacher can plan accordingly.",
  },
  {
    q: "Can we switch plans later?",
    a: "Absolutely. You can upgrade or change plans with 30 days notice. Many families start with a Group plan and upgrade to 1:1 as their child progresses — or add a sibling to the bundle when they're ready.",
  },
  {
    q: "What if my child doesn't connect with their assigned teacher?",
    a: "Just email us. We'll arrange a different teacher match, no questions asked. We want your child to genuinely enjoy their classes — a good teacher-student relationship is the most important ingredient.",
  },
  {
    q: "How much homework is there?",
    a: "We don't assign formal homework. Teachers may suggest 5–10 minutes of daily review, but it's gentle encouragement, not graded assignments. The goal is building a habit, not adding stress to family life.",
  },
  {
    q: "What tech do we need?",
    a: "Any device with a camera and microphone — a smartphone, tablet, or laptop works perfectly. You'll need a stable internet connection and a quiet corner. No downloads or plugins required; everything runs in the browser.",
  },
  {
    q: "Is card payment safe? Can we pay manually each month?",
    a: "Yes — payments are processed by Stripe, one of the world's most trusted payment providers. Your card details are never stored on our servers. You can also choose manual monthly payments via invoice if you prefer not to set up auto-pay.",
  },
  {
    q: "What ages do you teach?",
    a: "We teach children aged 5 to 15. For younger kids (5–7), we use extra-engaging techniques and keep sessions very interactive. Older students (12–15) can progress quickly through Tajweed and Hifz with more structured lessons.",
  },
  {
    q: "Are the teachers qualified?",
    a: "All our teachers hold Ijazah (a chain of certification back to the Prophet ﷺ) in Quran recitation and have completed formal Tajweed training. They also go through a child-safeguarding course and a teaching trial before their first paid class.",
  },
  {
    q: "Can I observe a class?",
    a: "Yes! Parents are welcome to sit in during any session — just let the teacher know beforehand. You can also receive weekly progress summaries and teacher audio notes so you're always in the loop.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <section id="faq" className="py-16 sm:py-24 bg-white">
      <div className="max-w-3xl mx-auto px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-3">
            Frequently asked questions
          </h2>
          <p className="text-gray-500 text-lg">
            Everything parents ask before enrolling — answered honestly.
          </p>
        </div>

        <div className="divide-y divide-stone-100">
          {faqs.map((faq, index) => (
            <div key={index} className="py-4">
              <button
                className="w-full flex items-start justify-between gap-4 text-left group"
                onClick={() => setOpenIndex(openIndex === index ? null : index)}
                aria-expanded={openIndex === index}
              >
                <span className="text-base font-semibold text-gray-900 group-hover:text-emerald-700 transition-colors">
                  {faq.q}
                </span>
                <span
                  className={`shrink-0 w-6 h-6 rounded-full border border-stone-200 flex items-center justify-center text-gray-400 transition-transform mt-0.5 ${
                    openIndex === index ? "rotate-180 bg-emerald-50 border-emerald-200 text-emerald-700" : ""
                  }`}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </span>
              </button>
              {openIndex === index && (
                <p className="mt-3 text-sm text-gray-500 leading-relaxed pr-10">{faq.a}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
