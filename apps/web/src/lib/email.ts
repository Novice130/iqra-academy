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
 * 1. Welcome email (after signup)
 * 2. Email verification
 * 3. Session reminders (30 min before class)
 * 4. Payment receipts (after invoice paid)
 * 5. Observer weekly digest (Quran progress summary)
 * 6. "Call Now" notification (teacher is calling!)
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
 * Sends a welcome email to a newly registered user.
 *
 * @param to - Recipient email address
 * @param name - User's name (for personalization)
 * @param orgName - Organization name (e.g., "Al-Noor Academy")
 */
export async function sendWelcomeEmail(
  to: string,
  name: string,
  orgName: string
): Promise<void> {
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `Welcome to ${orgName} — Your Quran Learning Journey Begins!`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a5f3a; font-size: 24px;">Bismillah! Welcome, ${name} 🌙</h1>
          <p style="font-size: 16px; line-height: 1.6; color: #333;">
            Assalamu Alaikum! Your account at <strong>${orgName}</strong> has been created successfully.
          </p>
          <p style="font-size: 16px; line-height: 1.6; color: #333;">
            Here's what you can do next:
          </p>
          <ul style="font-size: 16px; line-height: 1.8; color: #333;">
            <li>📚 Choose your learning plan (1:1, Group, or Siblings)</li>
            <li>📅 Book your first weekly class slot</li>
            <li>👨‍👩‍👧‍👦 Add child profiles if you're enrolling children</li>
          </ul>
          <p style="font-size: 14px; color: #666; margin-top: 30px;">
            May Allah make this journey fruitful. — ${orgName} Team
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send welcome email:", error);
  }
}

/**
 * Sends a session reminder email (30 minutes before class).
 *
 * @param to - Recipient email
 * @param name - Student/parent name
 * @param sessionTitle - Session title (e.g., "Qaida Lesson 5")
 * @param teacherName - Teacher's name
 * @param startTime - Session start time (formatted for display)
 * @param joinUrl - URL to join the video room
 */
export async function sendSessionReminder(
  to: string,
  name: string,
  sessionTitle: string,
  teacherName: string,
  startTime: string,
  joinUrl: string
): Promise<void> {
  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `🕐 Your Quran class starts in 30 minutes — ${sessionTitle}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #1a5f3a;">Class Starting Soon!</h2>
          <p style="font-size: 16px; color: #333;">
            Assalamu Alaikum ${name}, your class <strong>${sessionTitle}</strong> with
            ${teacherName} starts at <strong>${startTime}</strong>.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${joinUrl}"
               style="background: #1a5f3a; color: white; padding: 14px 28px;
                      text-decoration: none; border-radius: 8px; font-size: 16px;
                      font-weight: bold;">
              Join Class Now
            </a>
          </div>
          <p style="font-size: 14px; color: #666;">
            Make sure your microphone and camera are ready. Barakallahu feekum!
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send session reminder:", error);
  }
}

/**
 * Sends the weekly progress digest to observer emails.
 *
 * 📚 OBSERVER EMAIL PATTERN:
 * Parents can add observer emails (e.g., spouse, grandparent).
 * Every week, observers receive a summary of each child's progress.
 * This keeps the whole family engaged in the child's Quran learning.
 *
 * @param to - Observer email address
 * @param parentName - Account owner's name
 * @param profiles - Array of student profiles with their weekly progress
 */
export async function sendWeeklyDigest(
  to: string,
  parentName: string,
  profiles: Array<{
    name: string;
    lessonsCompleted: number;
    totalLessons: number;
    currentLevel: string;
    teacherNotes: string;
  }>
): Promise<void> {
  const profileSections = profiles
    .map(
      (p) => `
      <div style="background: #f8f9fa; border-radius: 8px; padding: 16px; margin: 12px 0;">
        <h3 style="color: #1a5f3a; margin: 0 0 8px 0;">${p.name}</h3>
        <p style="margin: 4px 0; color: #333;">📖 Level: <strong>${p.currentLevel}</strong></p>
        <p style="margin: 4px 0; color: #333;">✅ Lessons this week: <strong>${p.lessonsCompleted}/${p.totalLessons}</strong></p>
        ${p.teacherNotes ? `<p style="margin: 4px 0; color: #555; font-style: italic;">📝 Teacher: "${p.teacherNotes}"</p>` : ""}
      </div>
    `
    )
    .join("");

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to,
      subject: `📊 Weekly Quran Progress — ${parentName}'s Students`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #1a5f3a; font-size: 22px;">Weekly Progress Report 🌙</h1>
          <p style="font-size: 16px; color: #333;">
            Assalamu Alaikum! Here's this week's Quran learning summary:
          </p>
          ${profileSections}
          <p style="font-size: 14px; color: #666; margin-top: 24px;">
            JazakAllahu Khairan for supporting their Quran journey!
          </p>
        </div>
      `,
    });
  } catch (error) {
    console.error("[EMAIL] Failed to send weekly digest:", error);
  }
}

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
