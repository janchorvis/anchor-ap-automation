import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { scanAPInbox, getAttachmentData } from "@/lib/gmail";
import { getSettings, appendRunHistory } from "@/lib/settings";
import { Invoice } from "@/lib/types";

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export async function POST() {
  const session = await getServerSession();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await getSettings();

  if (!settings.apInboxEmail) {
    return NextResponse.json(
      { error: "AP inbox email not configured" },
      { status: 400 }
    );
  }

  const runId = generateId();
  const startedAt = new Date().toISOString();

  try {
    const { attachments, skipped } = await scanAPInbox(
      session.accessToken as string,
      settings
    );

    const invoices: Invoice[] = [];

    for (const att of attachments) {
      const invoice: Invoice = {
        id: generateId(),
        emailId: att.emailId,
        subject: att.subject,
        from: att.from,
        receivedAt: att.receivedAt,
        attachmentName: att.attachmentName,
        attachmentMimeType: att.mimeType,
        status: "pending",
      };
      invoices.push(invoice);
    }

    await appendRunHistory({
      id: runId,
      startedAt,
      completedAt: new Date().toISOString(),
      triggeredBy: session.user?.email ?? "unknown",
      emailsScanned: attachments.length + skipped.length,
      invoicesFound: attachments.length,
      invoicesProcessed: 0,
      invoicesSkipped: skipped.length,
      invoicesErrored: 0,
      status: "completed",
    });

    return NextResponse.json({
      invoices,
      skipped,
      runId,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";

    await appendRunHistory({
      id: runId,
      startedAt,
      completedAt: new Date().toISOString(),
      triggeredBy: session.user?.email ?? "unknown",
      emailsScanned: 0,
      invoicesFound: 0,
      invoicesProcessed: 0,
      invoicesSkipped: 0,
      invoicesErrored: 0,
      status: "failed",
      errorMessage,
    });

    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
