"use client";

/**
 * FAQ Accordion — Landing Page
 *
 * Client component because it needs useState for open/close toggle.
 * 10 parent-focused FAQs with smooth height transitions.
 */

import { useState } from "react";

const FAQS = [
  {
    q: "What age is this program for?",
    a: "Our program is designed for children aged 5 to 15. We match each child with a teacher experienced in their age group, so younger children get a more playful, encouraging approach while older students get structured, goal-oriented sessions.",
  },
  {
    q: "What if my child is very shy or nervous?",
    a: "That's completely normal, especially in 1:1 sessions. Our teachers are trained to work gently with shy children — they use praise, patience, and a warm tone. Most shy children open up within the first two or three sessions. You're welcome to sit nearby during early classes.",
  },
  {
    q: "What happens if we miss a class?",
    a: "Life happens! If you notify us at least 4 hours before a session, we'll reschedule it to another available slot that week. Unnotified absences are counted as used sessions. We keep it fair and flexible.",
  },
  {
    q: "Can we change teachers if it's not a good fit?",
    a: "Absolutely. We want your child to look forward to class. If the dynamic isn't working, let us know and we'll reassign a new teacher at no extra cost. The transition is seamless — the new teacher gets a full briefing on your child's progress.",
  },
  {
    q: "Can we switch between plans later?",
    a: "Yes, you can upgrade or downgrade your plan at any time. Changes take effect at the start of your next billing cycle. If you switch from Individual to Siblings, we'll prorate accordingly.",
  },
  {
    q: "How much homework is there?",
    a: "There's no traditional homework. We ask that children practice their current lesson for 5–10 minutes daily between sessions — just reading or listening to the audio feedback their teacher left. It's enough to build retention without adding screen time or pressure.",
  },
  {
    q: "What devices and tech do we need?",
    a: "Any phone, tablet, or laptop with a camera and microphone. Chrome or Safari works best. No special software to install — your child joins with one tap from their dashboard. A stable internet connection is all that's needed.",
  },
  {
    q: "Is payment safe? Can we pay manually each month?",
    a: "We use Stripe for all payments — the same system used by Amazon and Google. Your card details are never stored on our servers. If you prefer, we also support manual monthly payments via invoice.",
  },
  {
    q: "What's included in the free webinar?",
    a: "Our free weekly webinar is a 30-minute live group session with up to 20 children. Kids listen and follow along while the teacher leads the lesson. The last 5 minutes are open Q&A with a hand-raise feature. It's a great way to try us out.",
  },
  {
    q: "How do I track my child's progress?",
    a: "You'll receive a weekly email digest with your child's progress, teacher notes, and an audio recording of their last lesson's feedback. You can also log in anytime to see their curriculum position, session history, and upcoming schedule.",
  },
  {
    q: "Are the teachers certified?",
    a: "Yes. All our teachers hold Ijazah (chain of transmission) certification or are certified Hafiz with formal Tajweed training. They also complete our internal training on child engagement, classroom safety, and our platform tools.",
  },
  {
    q: "Can grandparents or other family members follow along?",
    a: "Yes! Our Observer Emails feature lets you add family members who receive the same weekly progress digest. It's perfect for grandparents, co-parents, or anyone who wants to stay involved in your child's Quran journey.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (i: number) => {
    setOpenIndex(openIndex === i ? null : i);
  };

  return (
    <section id="faq" className="py-20 lg:py-24">
      <div className="max-w-3xl mx-auto px-6">
        <div className="text-center mb-14">
          <h2
            className="text-3xl sm:text-4xl font-bold tracking-tight mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            Frequently Asked Questions
          </h2>
          <p className="text-base" style={{ color: "var(--text-secondary)" }}>
            Everything parents ask before enrolling
          </p>
        </div>

        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="rounded-2xl overflow-hidden transition-all"
              style={{
                background: openIndex === i ? "var(--bg-elevated)" : "transparent",
                border: `1px solid ${openIndex === i ? "var(--border-hover)" : "var(--border)"}`,
              }}
            >
              <button
                onClick={() => toggle(i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <span
                  className="text-[15px] font-medium pr-4"
                  style={{ color: "var(--text-primary)" }}
                >
                  {faq.q}
                </span>
                <svg
                  className="w-5 h-5 shrink-0 transition-transform"
                  style={{
                    color: "var(--text-tertiary)",
                    transform: openIndex === i ? "rotate(45deg)" : "rotate(0deg)",
                  }}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
              {openIndex === i && (
                <div className="px-5 pb-5 animate-in">
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {faq.a}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
