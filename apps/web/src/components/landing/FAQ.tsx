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
    <div id="faq" className="space-y-4">
      {FAQS.map((faq, i) => {
        const isOpen = openIndex === i;

        return (
          <div
            key={i}
            className="rounded-[1.75rem] border bg-white p-2 shadow-sm transition-all duration-200"
            style={{
              borderColor: isOpen
                ? "rgba(16, 185, 129, 0.28)"
                : "var(--border)",
              boxShadow: isOpen
                ? "0 18px 40px rgba(15, 23, 42, 0.07)"
                : "var(--shadow-sm)",
            }}
          >
            <button
              onClick={() => toggle(i)}
              className="flex w-full items-start justify-between gap-6 rounded-[1.25rem] px-4 py-4 text-left sm:px-5 sm:py-5"
            >
              <span
                className="pr-2 text-base font-semibold leading-7 sm:text-lg"
                style={{ color: "var(--text-primary)" }}
              >
                {faq.q}
              </span>

              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 transition-all"
                style={{
                  color: isOpen ? "#059669" : "var(--text-tertiary)",
                  transform: isOpen ? "rotate(45deg)" : "rotate(0deg)",
                }}
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 4v16m8-8H4"
                  />
                </svg>
              </span>
            </button>

            {isOpen && (
              <div className="animate-in px-4 pb-4 sm:px-5 sm:pb-5">
                <div className="rounded-[1.25rem] bg-slate-50 px-4 py-4 sm:px-5 sm:py-5">
                  <p
                    className="text-sm leading-7 sm:text-[15px]"
                    style={{ color: "var(--text-secondary)" }}
                  >
                    {faq.a}
                  </p>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
