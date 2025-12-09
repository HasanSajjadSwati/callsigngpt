import nodemailer from 'nodemailer';
import type Mail from 'nodemailer/lib/mailer';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_FILES = 5;
const MAX_FILE_SIZE =
  Number(process.env.MAX_REPORT_ATTACHMENT_MB || process.env.NEXT_PUBLIC_MAX_ATTACHMENT_MB || 5) *
  1024 *
  1024; // default 5MB each
const MAX_TOTAL_SIZE = 3 * MAX_FILE_SIZE; // total cap derived from per-file limit

function sanitize(value: FormDataEntryValue | null, fallback = ''): string {
  if (typeof value !== 'string') return fallback;
  return value.trim().slice(0, 2000);
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const description = sanitize(formData.get('description'));
    if (!description) {
      return NextResponse.json({ error: 'Description is required.' }, { status: 400 });
    }

    const subject = sanitize(formData.get('subject'), 'Problem report');
    const email = sanitize(formData.get('email'));
    const name = sanitize(formData.get('name'));

    const files = formData.getAll('attachments');
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximum ${MAX_FILES} attachments allowed.` },
        { status: 400 }
      );
    }

    let totalSize = 0;
    const attachments: Mail.Attachment[] = [];

    for (const [index, entry] of files.entries()) {
      if (!(entry instanceof File)) continue;
      if (entry.size === 0) continue;
      if (entry.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `Each attachment must be under ${Math.floor(MAX_FILE_SIZE / (1024 * 1024))}MB.` },
          { status: 413 }
        );
      }
      totalSize += entry.size;
      if (totalSize > MAX_TOTAL_SIZE) {
        return NextResponse.json(
          { error: 'Attachments exceed total size limit.' },
          { status: 413 }
        );
      }

      const buffer = Buffer.from(await entry.arrayBuffer());
      attachments.push({
        filename: entry.name || `attachment-${index + 1}`,
        content: buffer,
        contentType: entry.type || undefined,
      });
    }

    const host = process.env.SMTP_HOST;
    const port = Number(process.env.SMTP_PORT || 587);
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const to = process.env.REPORT_TO_EMAIL || 'contact@strativ.io';
    const from = process.env.REPORT_FROM_EMAIL || user || 'no-reply@strativ.io';
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465;

    if (!host || !user || !pass) {
      return NextResponse.json(
        { error: 'Email transport is not configured.' },
        { status: 500 }
      );
    }

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
    });

    const reporterLine = [name || null, email || null].filter(Boolean).join(' • ') || 'Unknown user';
    const safeReporter = escapeHtml(reporterLine);
    const safeDescription = escapeHtml(description);
    const textBody = `Reporter: ${reporterLine}\n\n${description}`;
    const htmlBody = `
      <p><strong>Reporter:</strong> ${safeReporter}</p>
      <p>${safeDescription.replace(/\n/g, '<br />')}</p>
    `;

    await transporter.sendMail({
      from,
      to,
      replyTo: email || undefined,
      subject: `[CallSignGPT] ${subject || 'Problem report'}`,
      text: textBody,
      html: htmlBody,
      attachments,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('[report-issue] Failed to send report', error);
    return NextResponse.json(
      { error: 'Unable to send the report right now. Please try again later.' },
      { status: 500 }
    );
  }
}
