import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { getAttachmentData } from "@/lib/gmail";
import { extractInvoiceData } from "@/lib/anthropic";
import { getSettings } from "@/lib/settings";

export async function POST(request: Request) {
  const session = await getServerSession();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { emailId, attachmentId, attachmentName, mimeType } = body;

  if (!emailId || !attachmentId) {
    return NextResponse.json(
      { error: "emailId and attachmentId are required" },
      { status: 400 }
    );
  }

  const settings = await getSettings();

  try {
    // Fetch attachment data from Gmail (using AP inbox with delegated access)
    const base64Data = await getAttachmentData(
      session.accessToken as string,
      settings.apInboxEmail,
      emailId,
      attachmentId
    );

    // Extract invoice data via Claude
    const extractedData = await extractInvoiceData(base64Data, mimeType, attachmentName);

    return NextResponse.json({
      extractedData,
      attachmentBase64: base64Data, // Return for client-side use in processing step
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Extraction failed";
    return NextResponse.json(
      {
        error: errorMessage,
        extractedData: {
          vendor: "UNKNOWN",
          invoiceNumber: "UNKNOWN",
          amount: "UNKNOWN",
          property: "UNKNOWN",
          dueDate: "UNKNOWN",
          confidence: "low",
          notes: `Extraction failed: ${errorMessage}`,
        },
      },
      { status: 500 }
    );
  }
}
