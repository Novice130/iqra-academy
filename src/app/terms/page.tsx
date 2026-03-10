import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Terms of Service | Iqra Academy",
  description:
    "Terms of Service for Iqra Academy — rules, policies, cancellation, and refund conditions for online Quran classes.",
};

export default function TermsPage() {
  return (
    <>
      {/* Minimal nav */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[var(--color-cream)]">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-[var(--color-sage)] rounded-lg flex items-center justify-center text-white text-sm font-bold">
              ق
            </div>
            <span className="font-bold text-[var(--color-charcoal)]">
              Iqra <span className="text-[var(--color-gold)]">Academy</span>
            </span>
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-3xl lg:text-4xl font-bold text-[var(--color-charcoal)] mb-2">
          Terms of Service
        </h1>
        <p className="text-[var(--color-gray)] mb-10">
          Last updated: March 10, 2026
        </p>

        <div className="space-y-8">
          <Section title="1. Acceptance of Terms">
            <p>
              By accessing or using Iqra Academy&apos;s services, you agree to
              be bound by these Terms of Service. If you do not agree with any
              part of these terms, you may not use our services.
            </p>
          </Section>

          <Section title="2. Services">
            <p>
              Iqra Academy provides live online Quran tutoring services including
              Noorani Qaida, Quran reading with Tajweed, and Hifz (Quran
              memorization) programs. Classes are conducted one-on-one via our
              video platform.
            </p>
          </Section>

          <Section title="3. Accounts">
            <ul>
              <li>
                You must be at least 18 years old or have parental/guardian
                consent to create an account
              </li>
              <li>
                You are responsible for maintaining the security of your account
                credentials
              </li>
              <li>
                You must provide accurate and complete information when
                registering
              </li>
              <li>
                One parent/guardian account can manage multiple student profiles
              </li>
            </ul>
          </Section>

          <Section title="4. Class Policies">
            <ul>
              <li>
                <strong>Duration:</strong> Each class is 30 minutes unless
                otherwise specified in your plan
              </li>
              <li>
                <strong>Punctuality:</strong> Please join your class on time.
                Missed time due to late arrival cannot be recovered
              </li>
              <li>
                <strong>Cancellations:</strong> Classes may be cancelled or
                rescheduled with at least 4 hours of notice without penalty
              </li>
              <li>
                <strong>No-shows:</strong> Missing a class without notice counts
                as a used session
              </li>
              <li>
                <strong>Technical issues:</strong> If a class is disrupted due
                to technical problems on our end, it will be rescheduled at no
                charge
              </li>
            </ul>
          </Section>

          <Section title="5. Payment & Billing">
            <ul>
              <li>
                Payments are processed securely through Stripe
              </li>
              <li>
                Monthly subscriptions are billed automatically on the same date
                each month
              </li>
              <li>
                You may cancel your subscription at any time; access continues
                through the end of the billing period
              </li>
              <li>
                No refunds are issued for partial months or unused sessions,
                except at our discretion
              </li>
            </ul>
          </Section>

          <Section title="6. Refund Policy">
            <ul>
              <li>
                <strong>Free trial:</strong> No charge during the trial period.
                Cancel anytime before it ends
              </li>
              <li>
                <strong>First 7 days:</strong> If you are unsatisfied within the
                first 7 days of a paid subscription, we offer a full refund
              </li>
              <li>
                <strong>After 7 days:</strong> Refunds are considered on a
                case-by-case basis. Contact us at support@iqra-academy.com
              </li>
            </ul>
          </Section>

          <Section title="7. Code of Conduct">
            <p>All users (parents, students, and teachers) must:</p>
            <ul>
              <li>
                Treat each other with respect and maintain an Islamic learning
                environment
              </li>
              <li>
                Not record, screenshot, or distribute class sessions without
                consent
              </li>
              <li>
                Not share account login credentials with others
              </li>
              <li>
                Report any concerns about safety or inappropriate behavior
                immediately
              </li>
            </ul>
          </Section>

          <Section title="8. Intellectual Property">
            <p>
              All course materials, curriculum content, and platform features are
              the intellectual property of Iqra Academy. You may not reproduce,
              distribute, or create derivative works without written permission.
            </p>
          </Section>

          <Section title="9. Limitation of Liability">
            <p>
              Iqra Academy provides educational services on an &quot;as
              is&quot; basis. We are not liable for any indirect, incidental, or
              consequential damages arising from use of our services. Our total
              liability shall not exceed the amount paid by you in the preceding
              12 months.
            </p>
          </Section>

          <Section title="10. Changes to Terms">
            <p>
              We may update these Terms of Service from time to time. Continued
              use of our services after changes constitutes acceptance of the
              new terms. We will notify you of significant changes via email.
            </p>
          </Section>

          <Section title="11. Contact">
            <p>
              For questions about these Terms, contact us at{" "}
              <a
                href="mailto:support@iqra-academy.com"
                className="text-[var(--color-sage)] underline"
              >
                support@iqra-academy.com
              </a>
              .
            </p>
          </Section>
        </div>

        <div className="mt-12 pt-8 border-t border-[var(--color-cream)]">
          <Link
            href="/"
            className="text-[var(--color-sage)] hover:text-[var(--color-sage-dark)] font-medium transition-colors"
          >
            ← Back to Home
          </Link>
        </div>
      </main>
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xl font-bold text-[var(--color-charcoal)] mb-3">
        {title}
      </h2>
      <div className="text-[var(--color-gray)] leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:space-y-1.5 [&_a]:text-[var(--color-sage)] [&_a]:underline">
        {children}
      </div>
    </section>
  );
}
