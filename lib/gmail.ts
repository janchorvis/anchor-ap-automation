import { google } from "googleapis";
import { AppSettings } from "./types";

const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/tiff",
  "image/heic",
];

function shouldSkipEmail(
  subject: string,
  from: string,
  settings: AppSettings
): { skip: boolean; reason?: string } {
  const subjectLower = subject.toLowerCase();
  const fromLower = from.toLowerCase();

  for (const keyword of settings.skipKeywords) {
    if (subjectLower.includes(keyword.toLowerCase())) {
      return { skip: true, reason: `Subject contains skip keyword: "${keyword}"` };
    }
  }

  for (const sender of settings.skipSenders) {
    if (fromLower.includes(sender.toLowerCase())) {
      return { skip: true, reason: `Sender matches skip rule: "${sender}"` };
    }
  }

  return { skip: false };
}

export interface GmailAttachment {
  emailId: string;
  subject: string;
  from: string;
  receivedAt: string;
  attachmentId: string;
  attachmentName: string;
  mimeType: string;
  size: number;
}

export async function scanAPInbox(
  accessToken: string,
  settings: AppSettings
): Promise<{ attachments: GmailAttachment[]; skipped: Array<{ subject: string; from: string; reason: string }> }> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth });
  const userId = settings.apInboxEmail;

  // Search for unread emails with attachments in the AP inbox
  const listResp = await gmail.users.messages.list({
    userId,
    q: "is:unread has:attachment -label:AP-Processed",
    maxResults: 50,
  });

  const messages = listResp.data.messages ?? [];
  const attachments: GmailAttachment[] = [];
  const skipped: Array<{ subject: string; from: string; reason: string }> = [];

  for (const msg of messages) {
    if (!msg.id) continue;

    const full = await gmail.users.messages.get({
      userId,
      id: msg.id,
      format: "metadata",
      metadataHeaders: ["Subject", "From", "Date"],
    });

    const headers = full.data.payload?.headers ?? [];
    const subject = headers.find((h) => h.name === "Subject")?.value ?? "(no subject)";
    const from = headers.find((h) => h.name === "From")?.value ?? "";
    const date = headers.find((h) => h.name === "Date")?.value ?? "";

    const skipCheck = shouldSkipEmail(subject, from, settings);
    if (skipCheck.skip) {
      skipped.push({ subject, from, reason: skipCheck.reason! });
      continue;
    }

    // Look for attachment parts
    const parts = full.data.payload?.parts ?? [];
    for (const part of parts) {
      if (
        part.filename &&
        part.body?.attachmentId &&
        SUPPORTED_MIME_TYPES.includes(part.mimeType ?? "")
      ) {
        attachments.push({
          emailId: msg.id,
          subject,
          from,
          receivedAt: date,
          attachmentId: part.body.attachmentId,
          attachmentName: part.filename,
          mimeType: part.mimeType ?? "application/pdf",
          size: part.body.size ?? 0,
        });
      }
    }
  }

  return { attachments, skipped };
}

export async function getAttachmentData(
  accessToken: string,
  apEmail: string,
  emailId: string,
  attachmentId: string
): Promise<string> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth });

  const resp = await gmail.users.messages.attachments.get({
    userId: apEmail,
    messageId: emailId,
    id: attachmentId,
  });

  // Gmail returns URL-safe base64, convert to standard base64
  const data = resp.data.data ?? "";
  return data.replace(/-/g, "+").replace(/_/g, "/");
}

export async function labelAndArchiveEmail(
  accessToken: string,
  apEmail: string,
  emailId: string
): Promise<void> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth });

  // Get or create the AP-Processed label
  let labelId: string | undefined;

  try {
    const labelsResp = await gmail.users.labels.list({ userId: apEmail });
    const existing = labelsResp.data.labels?.find((l) => l.name === "AP-Processed");
    
    if (existing?.id) {
      labelId = existing.id;
    } else {
      const created = await gmail.users.labels.create({
        userId: apEmail,
        requestBody: {
          name: "AP-Processed",
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        },
      });
      labelId = created.data.id ?? undefined;
    }
  } catch {
    // Label creation failed, proceed without labeling
  }

  const addLabelIds = labelId ? [labelId] : [];
  
  await gmail.users.messages.modify({
    userId: apEmail,
    id: emailId,
    requestBody: {
      addLabelIds,
      removeLabelIds: ["UNREAD", "INBOX"],
    },
  });
}

export async function sendToYardi(
  accessToken: string,
  fromEmail: string,
  yardiEmail: string,
  invoiceInfo: {
    vendor: string;
    invoiceNumber: string;
    amount: string;
    property: string;
    dueDate: string;
    fileName: string;
    attachmentBase64: string;
    mimeType: string;
  }
): Promise<void> {
  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });

  const gmail = google.gmail({ version: "v1", auth });

  const subject = `Invoice: ${invoiceInfo.vendor} - ${invoiceInfo.invoiceNumber} - ${invoiceInfo.property}`;
  const body = `Please process the attached invoice:

Vendor: ${invoiceInfo.vendor}
Invoice #: ${invoiceInfo.invoiceNumber}
Amount: ${invoiceInfo.amount}
Property: ${invoiceInfo.property}
Due Date: ${invoiceInfo.dueDate}
File: ${invoiceInfo.fileName}

This invoice was processed automatically by Anchor AP Automation.`;

  // Build MIME message with attachment
  const boundary = "==boundary==";
  const mime = [
    `To: ${yardiEmail}`,
    `From: ${fromEmail}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    "",
    body,
    "",
    `--${boundary}`,
    `Content-Type: ${invoiceInfo.mimeType}; name="${invoiceInfo.fileName}"`,
    `Content-Disposition: attachment; filename="${invoiceInfo.fileName}"`,
    `Content-Transfer-Encoding: base64`,
    "",
    invoiceInfo.attachmentBase64,
    `--${boundary}--`,
  ].join("\n");

  const encoded = Buffer.from(mime)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  await gmail.users.messages.send({
    userId: "me",
    requestBody: { raw: encoded },
  });
}
