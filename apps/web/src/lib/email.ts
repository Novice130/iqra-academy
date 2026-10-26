/**
 * @fileoverview Resend Email Integration
 *
 * 📚 EDUCATIONAL NOTE FOR JUNIOR DEVS:
 * Resend is our transactional email service. "Transactional" means:
 * - Triggered by user actions (signup → welcome email, payment → receipt)
 * - NOT marketing/bulk emails (those use a separate tool like Mailchimp)
 *
 * WHY RESEND OVER SENDGRID/SES?
 * - Developer-first API (simple, modern)
 * - Great Next.js integration
 * - React Email support (write emails as React components)
 * - Good deliverability (emails don't end up in spam)
 *
 * EMAIL TYPES WE SEND:
 * 1. Payment receipts (after a Stripe invoice is paid)
 * 2. Invoices raised by an admin
 * 3. Trial requests, 2FA codes
 * 4. Everything routed through lib/notify.ts (sendRawEmail)
 *
 * @module lib/email
 */

import { Resend } from "resend";

/**
 * Resend client instance (lazy-initialized).
 *
 * WHY LAZY? During `next build`, all modules are imported and evaluated.
 * If RESEND_API_KEY is a dummy placeholder (e.g. in Docker build stage),
 * `new Resend(...)` throws immediately. By deferring initialization to
 * the first actual email send, the build completes without error.
 *
 * FAILURE MODES:
 * - Missing RESEND_API_KEY → all email sends fail
 * - Invalid API key → Resend returns 401
 * - Rate limiting → Resend returns 429 (100 emails/day on free plan)
 */
let _resend: Resend | null = null;
function getResend(): Resend {
  if (!_resend) {
    _resend = new Resend(process.env.RESEND_API_KEY);
  }
  return _resend;
}

/**
 * The "from" address for all transactional emails.
 * Must be verified in the Resend dashboard.
 *
 * 📚 EMAIL DELIVERABILITY TIP:
 * Use a subdomain for transactional emails (e.g., noreply@mail.yourschool.com).
 * This separates your transactional reputation from marketing reputation.
 * If marketing emails get flagged as spam, your transactional emails still get through.
 */
const FROM_EMAIL = process.env.EMAIL_FROM || "Quran LMS <noreply@mail.quran-lms.com>";

/**
 * Sends a payment receipt email.
 *
 * @param to - Payer's email
 * @param name - Payer's name
 * @param amount - Formatted amount (e.g., "$70.00")
 * @param planName - Plan name (e.g., "1:1 Premium Plan")
 * @param invoiceUrl - Stripe hosted invoice URL
 */
export async function sendPaymentReceipt(
  to: string,
  name: string,
  amount: string,
  planName: string,
  invoiceUrl: string
): Promise<void> {
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `💳 Payment Received — ${planName}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a5f3a;">Payment Confirmed ✅</h2>
          <p style="font-size: 16px; color: #333;">
            JazakAllahu Khairan ${name}! We've received your payment of <strong>${amount}</strong>
            for the <strong>${planName}</strong>.
          </p>
          <p style="font-size: 16px; color: #333;">
            <a href="${invoiceUrl}" style="color: #1a5f3a;">View your invoice →</a>
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send payment receipt:", error);
  }
}

/**
 * The generic send, used by lib/notify.ts.
 *
 * The named helpers above each own one message's copy. This one exists for
 * everything routed through `notify()`, where the caller has already composed
 * the body. Same swallow-and-log contract: an email that does not send must
 * never fail the thing it was announcing.
 *
 * Returns whether Resend accepted it, for callers that want to log it.
 */
export async function sendRawEmail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<boolean> {
  if (!process.env.RESEND_API_KEY) {
    // Local dev and any deploy where the key was never set. Log rather than
    // throw, so the whole flow stays testable without a mail provider.
    console.warn("[EMAIL] RESEND_API_KEY unset — would have sent:", opts.subject, "→", opts.to);
    return false;
  }
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: opts.to,
      subject: opts.subject,
      html: opts.html,
      ...(opts.replyTo ? { replyTo: opts.replyTo } : {}),
    });
    return true;
  } catch (error) {
    console.error("[EMAIL] Failed to send:", opts.subject, error);
    return false;
  }
}

/**
 * The trial-class request, as the teacher and the admin see it.
 *
 * Deliberately carries the time twice — once in the teacher's zone and once in
 * the student's. A teacher in India reading "6:00 PM" about a student in
 * Chicago has no way to tell which 6:00 PM is meant, and getting that wrong
 * means somebody sits alone in a room.
 */
export async function sendTrialRequestEmail(
  to: string | string[],
  opts: {
    studentName: string;
    studentEmail: string;
    teacherName: string;
    whenTeacherZone: string;
    whenStudentZone: string;
    manageUrl: string;
  }
): Promise<boolean> {
  return sendRawEmail({
    to,
    subject: `New trial class request — ${opts.studentName}`,
    replyTo: opts.studentEmail,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#1a5f3a;">New trial class request</h2>
        <p style="font-size:16px;color:#333;">
          <strong>${opts.studentName}</strong> (${opts.studentEmail}) has booked a trial class
          with <strong>${opts.teacherName}</strong>.
        </p>
        <div style="background:#f8f9fa;border-radius:8px;padding:16px;margin:16px 0;">
          <p style="margin:4px 0;color:#333;">🕐 <strong>${opts.whenTeacherZone}</strong> &mdash; teacher's time</p>
          <p style="margin:4px 0;color:#555;">🌍 ${opts.whenStudentZone} &mdash; student's time</p>
        </div>
        <div style="text-align:center;margin:28px 0;">
          <a href="${opts.manageUrl}" style="background:#1a5f3a;color:#fff;padding:13px 26px;
             text-decoration:none;border-radius:8px;font-size:15px;font-weight:bold;">
            View the class
          </a>
        </div>
        <p style="font-size:14px;color:#666;">Reply to this email to reach the student directly.</p>
      </div>
    `,
  });
}

/**
 * The invoice.
 *
 * This is the ONLY place a family is ever shown a price. The app itself stays
 * price-free on purpose — see lib/pricing-visibility.ts. Do not "helpfully"
 * mirror this figure onto a dashboard.
 */
export async function sendInvoiceEmail(
  to: string,
  opts: {
    name: string;
    orgName: string;
    planName: string;
    amount: string;
    studentCount: number;
    periodLabel: string;
    dueLabel: string;
    payUrl?: string;
  }
): Promise<boolean> {
  const students = opts.studentCount === 1 ? "1 student" : `${opts.studentCount} students`;
  const payButton = opts.payUrl
    ? `<div style="text-align:center;margin:28px 0;">
         <a href="${opts.payUrl}" style="background:#1a5f3a;color:#fff;padding:13px 26px;
            text-decoration:none;border-radius:8px;font-size:15px;font-weight:bold;">Pay now</a>
       </div>`
    : `<p style="font-size:15px;color:#333;">
         Reply to this email and we'll share the payment details.
       </p>`;

  return sendRawEmail({
    to,
    subject: `Invoice from ${opts.orgName} — ${opts.amount}`,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#1a5f3a;">Your invoice 🌙</h2>
        <p style="font-size:16px;color:#333;">
          Assalamu Alaikum ${opts.name}, here is your invoice for ${opts.periodLabel}.
        </p>
        <div style="background:#f8f9fa;border-radius:8px;padding:20px;margin:20px 0;">
          <p style="margin:6px 0;color:#333;font-size:16px;">
            <strong>${opts.planName}</strong> &mdash; ${students}
          </p>
          <p style="margin:6px 0;color:#555;">4 classes per week &middot; 30 minutes each</p>
          <p style="margin:14px 0 0;color:#1a5f3a;font-size:26px;font-weight:bold;">${opts.amount}</p>
          <p style="margin:6px 0 0;color:#666;font-size:14px;">Due ${opts.dueLabel}</p>
        </div>
        ${payButton}
        <p style="font-size:14px;color:#666;">JazakAllahu Khairan. &mdash; ${opts.orgName}</p>
      </div>
    `,
  });
}

/**
 * Sends a Two-Factor Authentication (2FA) one-time verification code via email.
 */
export async function sendTwoFactorEmail(to: string, code: string): Promise<boolean> {
  return sendRawEmail({
    to,
    subject: `Your Novice Tutor verification code: ${code}`,
    html: `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;border:1px solid #e5e7eb;border-radius:12px;">
        <h2 style="color:#1a5f3a;margin-top:0;font-size:22px;">Security Verification Code 🔐</h2>
        <p style="font-size:15px;line-height:1.6;color:#374151;">
          Use the following 6-digit one-time code to verify your sign-in or activate two-factor authentication:
        </p>
        <div style="margin:28px 0;text-align:center;">
          <span style="display:inline-block;font-size:32px;font-weight:700;letter-spacing:6px;padding:12px 28px;background:#f0fdf4;border:1.5px solid #86efac;border-radius:12px;color:#166534;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;">
            ${code}
          </span>
        </div>
        <p style="font-size:13px;color:#6b7280;line-height:1.5;">
          This code expires in 10 minutes. If you did not request this security code, someone may be attempting to access your account.
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />
        <p style="font-size:12px;color:#9ca3af;margin-bottom:0;">
          Novice Tutor Security &middot; Iqra Academy
        </p>
      </div>
    `,
  });
}
