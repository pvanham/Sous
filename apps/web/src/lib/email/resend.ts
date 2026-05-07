import { Resend } from "resend";
import { render } from "@react-email/render";
import type { ReactElement } from "react";

/**
 * Resend transport adapter.
 *
 * The single Resend client is lazily instantiated so module load on
 * environments without the env var (tests, scripts) doesn't throw.
 * Failures are logged with structured detail and never thrown — the
 * dispatcher is fire-and-forget by design.
 *
 * Reference: https://resend.com/docs
 */

let cached: Resend | null = null;

function getClient(): Resend | null {
  if (cached) return cached;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[resend] RESEND_API_KEY is not set; emails will be skipped");
    return null;
  }
  cached = new Resend(apiKey);
  return cached;
}

function getFromAddress(): string {
  return process.env.RESEND_FROM ?? "Sous <onboarding@resend.dev>";
}

export interface SendEmailInput {
  to: string;
  subject: string;
  /** A React element rendered to HTML via `@react-email/render`. */
  react: ReactElement;
  /** Optional plain-text fallback. Auto-derived if omitted. */
  text?: string;
}

export async function sendEmail(input: SendEmailInput): Promise<void> {
  const client = getClient();
  if (!client) return;

  let html: string;
  let text: string;
  try {
    html = await render(input.react);
    text = input.text ?? (await render(input.react, { plainText: true }));
  } catch (err) {
    console.error("[resend] failed to render email:", {
      error: err instanceof Error ? err.message : String(err),
      to: input.to,
      subject: input.subject,
    });
    return;
  }

  try {
    const result = await client.emails.send({
      from: getFromAddress(),
      to: input.to,
      subject: input.subject,
      html,
      text,
    });
    if (result.error) {
      console.error("[resend] send rejected by API:", {
        to: input.to,
        subject: input.subject,
        error: result.error,
      });
    }
  } catch (err) {
    console.error("[resend] send threw:", {
      error: err instanceof Error ? err.message : String(err),
      to: input.to,
      subject: input.subject,
    });
  }
}

/**
 * Send a batch of emails with a small concurrency cap so a 50-recipient
 * publish doesn't trip Resend's per-second rate limit. Errors on
 * individual recipients are logged and swallowed.
 */
export async function sendEmailBatch(
  messages: SendEmailInput[],
  concurrency = 5,
): Promise<void> {
  if (messages.length === 0) return;
  let cursor = 0;

  async function worker() {
    while (cursor < messages.length) {
      const idx = cursor++;
      const msg = messages[idx];
      if (!msg) continue;
      await sendEmail(msg);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, messages.length) }, worker);
  await Promise.all(workers);
}
