import nodemailer from "nodemailer";
import type { Match } from "./types.js";

export function notificationConfig() {
  return {
    emailConfigured: Boolean(
      process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD,
    ),
    whatsappConfigured: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID && process.env.WHATSAPP_TO,
    ),
  };
}

function textDigest(matches: Match[]): string {
  const lines = matches.map(
    (job) =>
      `${job.company} — ${job.title}\n${job.location || "Location not stated"} · ${job.score}% match\n${job.url}`,
  );
  return `ApplyOS found ${matches.length} new matching role${matches.length === 1 ? "" : "s"}:\n\n${lines.join("\n\n")}`;
}

function htmlDigest(matches: Match[]): string {
  const cards = matches
    .map(
      (job) => `<li style="margin:0 0 18px">
        <strong>${escapeHtml(job.company)} — ${escapeHtml(job.title)}</strong><br>
        ${escapeHtml(job.location || "Location not stated")} · ${job.score}% match<br>
        <a href="${escapeHtml(job.url)}">View official job posting</a>
      </li>`,
    )
    .join("");
  return `<div style="font-family:Arial,sans-serif;color:#17211b;line-height:1.5">
    <h2>New frontend matches</h2><p>ApplyOS found ${matches.length} new role${matches.length === 1 ? "" : "s"} aligned to your profile.</p>
    <ul style="padding-left:20px">${cards}</ul>
    <p style="color:#66736b">No application was submitted. Links point to the original job source.</p>
  </div>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char]!);
}

export async function sendNotifications(matches: Match[]): Promise<{ email: boolean; whatsapp: boolean }> {
  if (matches.length === 0) return { email: false, whatsapp: false };
  const config = notificationConfig();
  const [email, whatsapp] = await Promise.all([
    config.emailConfigured ? sendEmail(matches) : Promise.resolve(false),
    config.whatsappConfigured ? sendWhatsApp(matches) : Promise.resolve(false),
  ]);
  return { email, whatsapp };
}

async function sendEmail(matches: Match[]): Promise<boolean> {
  const gmailUser = process.env.GMAIL_USER!;
  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: {
      user: gmailUser,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });

  await transporter.sendMail({
    from: `ApplyOS Job Radar <${gmailUser}>`,
    to: process.env.ALERT_EMAIL_TO || gmailUser,
    subject: `${matches.length} new frontend job match${matches.length === 1 ? "" : "es"}`,
    text: textDigest(matches),
    html: htmlDigest(matches),
  });
  return true;
}

async function sendWhatsApp(matches: Match[]): Promise<boolean> {
  const endpoint = `https://graph.facebook.com/v23.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME;
  const payload = templateName
    ? {
        messaging_product: "whatsapp",
        to: process.env.WHATSAPP_TO,
        type: "template",
        template: {
          name: templateName,
          language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en_US" },
          components: [
            {
              type: "body",
              parameters: [
                { type: "text", text: String(matches.length) },
                { type: "text", text: matches[0].company },
                { type: "text", text: matches[0].title },
                { type: "text", text: matches[0].url },
              ],
            },
          ],
        },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: process.env.WHATSAPP_TO,
        type: "text",
        text: { preview_url: true, body: textDigest(matches).slice(0, 3900) },
      };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`WhatsApp notification failed with HTTP ${response.status}`);
  return true;
}
