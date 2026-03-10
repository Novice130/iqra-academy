import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy | Iqra Academy",
  description:
    "Privacy Policy for Iqra Academy — how we collect, use, and protect your personal data and your children's information.",
};

export default function PrivacyPage() {
  return (
    <>
      {/* Minimal nav */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-[var(--color-cream)]">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center">
          <Link href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 flex items-center justify-center text-white text-sm font-bold">
              <img src="/logo.png" className="w-full h-full object-contain" alt="Logo" />
            </div>
            <span className="font-bold text-[var(--color-charcoal)]">
              Iqra <span className="text-[var(--color-gold)]">Academy</span>
            </span>
          </Link>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-3xl lg:text-4xl font-bold text-[var(--color-charcoal)] mb-2">
          Privacy Policy
        </h1>
        <p className="text-[var(--color-gray)] mb-10">
          Last updated: March 10, 2026
        </p>

        <div className="prose-style space-y-8">
          <Section title="1. Information We Collect">
            <p>
              We collect information you provide directly to us when you create
              an account, enroll a student, book a class, or contact us. This
              may include:
            </p>
            <ul>
              <li>Parent/guardian name and email address</li>
              <li>Student&apos;s first name and age</li>
              <li>Payment information (processed securely by Stripe)</li>
              <li>Class recordings (for quality assurance purposes)</li>
              <li>Communication logs between parents and teachers</li>
            </ul>
          </Section>

          <Section title="2. How We Use Your Information">
            <p>We use the information we collect to:</p>
            <ul>
              <li>Provide and maintain our educational services</li>
              <li>Process payments and manage subscriptions</li>
              <li>Communicate with you about classes and progress</li>
              <li>Match students with appropriate teachers</li>
              <li>Improve our platform and educational content</li>
              <li>Send important service updates and announcements</li>
            </ul>
          </Section>

          <Section title="3. Children's Privacy (COPPA Compliance)">
            <p>
              We are committed to protecting children&apos;s privacy. We comply
              with the Children&apos;s Online Privacy Protection Act (COPPA):
            </p>
            <ul>
              <li>
                We do not collect personal information directly from children
                under 13 without parental consent
              </li>
              <li>
                All student accounts are created and managed by
                parents/guardians
              </li>
              <li>
                Parents may review, update, or delete their child&apos;s
                information at any time
              </li>
              <li>
                We do not share children&apos;s information with third parties
                for marketing purposes
              </li>
            </ul>
          </Section>

          <Section title="4. Data Sharing">
            <p>
              We do not sell your personal information. We share data only with:
            </p>
            <ul>
              <li>
                <strong>Teachers</strong> — Student name and learning level
                (necessary for instruction)
              </li>
              <li>
                <strong>Stripe</strong> — Payment processing (PCI-DSS
                compliant)
              </li>
              <li>
                <strong>Resend</strong> — Email delivery service
              </li>
            </ul>
          </Section>

          <Section title="5. Data Security">
            <p>
              We implement industry-standard security measures including
              encrypted connections (HTTPS/TLS), secure authentication, and
              role-based access controls. Payment data is handled directly by
              Stripe and never stored on our servers.
            </p>
          </Section>

          <Section title="6. Your Rights">
            <p>You have the right to:</p>
            <ul>
              <li>Access the personal data we hold about you</li>
              <li>Request correction of inaccurate data</li>
              <li>Request deletion of your account and data</li>
              <li>Opt out of non-essential communications</li>
            </ul>
            <p>
              To exercise any of these rights, contact us at{" "}
              <a
                href="mailto:privacy@iqra-academy.com"
                className="text-[var(--color-sage)] underline"
              >
                privacy@iqra-academy.com
              </a>
              .
            </p>
          </Section>

          <Section title="7. Contact Us">
            <p>
              If you have questions about this Privacy Policy, please reach out:
            </p>
            <p>
              <strong>Email:</strong>{" "}
              <a
                href="mailto:privacy@iqra-academy.com"
                className="text-[var(--color-sage)] underline"
              >
                privacy@iqra-academy.com
              </a>
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
