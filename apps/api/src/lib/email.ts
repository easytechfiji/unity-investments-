import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { AppConfig } from '../config/env.js';
import type { Logger } from './logger.js';

export interface Attachment {
  filename: string;
  content: Buffer;
}

export interface Email {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
  attachments?: Attachment[];
}

export interface Mailer {
  send(email: Email): Promise<void>;
  /** Only for the memory mailer used by tests. */
  readonly sent?: Email[];
}

/** Header values must be one line. This blocks email header injection. */
export function headerSafe(value: string): string {
  return value
    .replace(/[\r\n]+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function createMailer(config: AppConfig, logger: Logger): Mailer {
  switch (config.EMAIL_PROVIDER) {
    case 'resend':
      return resendMailer(config, logger);
    case 'memory':
      return memoryMailer();
    case 'file':
      return fileMailer(config, logger);
  }
}

function memoryMailer(): Mailer {
  const sent: Email[] = [];
  return {
    sent,
    send(email) {
      sent.push(email);
      return Promise.resolve();
    },
  };
}

/** Development: writes each email to .data/outbox so it can be read without sending anything. */
function fileMailer(config: AppConfig, logger: Logger): Mailer {
  const dir = resolve(config.OUTBOX_DIR);
  return {
    async send(email) {
      await mkdir(dir, { recursive: true });
      const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
      const body = [
        `From: ${config.EMAIL_FROM}`,
        `To: ${headerSafe(email.to)}`,
        email.replyTo ? `Reply-To: ${headerSafe(email.replyTo)}` : null,
        `Subject: ${headerSafe(email.subject)}`,
        email.attachments?.length
          ? `Attachments: ${email.attachments.map((a) => a.filename).join(', ')}`
          : null,
        '',
        email.text,
      ]
        .filter((line) => line !== null)
        .join('\n');
      await writeFile(join(dir, `${id}.txt`), body);
      for (const attachment of email.attachments ?? []) {
        await writeFile(join(dir, `${id}-${attachment.filename}`), attachment.content);
      }
      logger.info('email written to outbox', { id });
    },
  };
}

/** Production: Resend's HTTP API. No SDK needed for one POST request. */
function resendMailer(config: AppConfig, logger: Logger): Mailer {
  return {
    async send(email) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: config.EMAIL_FROM,
          to: [headerSafe(email.to)],
          subject: headerSafe(email.subject),
          text: email.text,
          html: email.html,
          reply_to: email.replyTo ? headerSafe(email.replyTo) : undefined,
          attachments: email.attachments?.map((attachment) => ({
            filename: attachment.filename,
            content: attachment.content.toString('base64'),
          })),
        }),
      });
      if (!response.ok) {
        // The status is enough to debug. The response body could echo the recipient.
        logger.error('email send failed', { status: response.status });
        throw new Error(`Email provider returned ${response.status}`);
      }
    },
  };
}
