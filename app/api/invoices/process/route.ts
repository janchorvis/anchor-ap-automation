import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { labelAndArchiveEmail, sendToYardi } from "@/lib/gmail";
import { uploadToDrive, moveFileToDrive } from "@/lib/drive";
import { buildFileName } from "@/lib/anthropic";
import { getSettings } from "@/lib/settings";
import { InvoiceData } from "@/lib/types";
import path from "path";

export async function POST(request: Request) {
  const session = await getServerSession();

  if (!session?.accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    emailId,
    invoiceData,
    attachmentBase64,
    attachmentMimeType,
    attachmentName,
  }: {
    emailId: string;
    invoiceData: InvoiceData;
    attachmentBase64: string;
    attachmentMimeType: string;
    attachmentName: string;
  } = body;

  const settings = await getSettings();
  const accessToken = session.accessToken as string;

  const results: {
    fileName: string;
    stagingFileId?: string;
    stagingUrl?: string;
    finalFileId?: string;
    finalUrl?: string;
    yardiSentAt?: string;
    archivedAt?: string;
    error?: string;
  } = { fileName: "" };

  try {
    // 1. Build the renamed filename
    const ext = path.extname(attachmentName) || ".pdf";
    const renamedFile = buildFileName(invoiceData, ext);
    results.fileName = renamedFile;

    // 2. Upload to Drive staging folder
    if (settings.driveStagingFolderId) {
      const staged = await uploadToDrive(
        accessToken,
        settings.driveStagingFolderId,
        renamedFile,
        attachmentMimeType,
        attachmentBase64
      );
      results.stagingFileId = staged.fileId;
      results.stagingUrl = staged.webViewLink;

      // 3. Send to Yardi via email
      if (settings.yardiEmail) {
        await sendToYardi(accessToken, session.user?.email ?? "me", settings.yardiEmail, {
          vendor: invoiceData.vendor,
          invoiceNumber: invoiceData.invoiceNumber,
          amount: invoiceData.amount,
          property: invoiceData.property,
          dueDate: invoiceData.dueDate,
          fileName: renamedFile,
          attachmentBase64,
          mimeType: attachmentMimeType,
        });
        results.yardiSentAt = new Date().toISOString();
      }

      // 4. Move to final Drive folder
      if (settings.driveFinalFolderId && staged.fileId) {
        await moveFileToDrive(
          accessToken,
          staged.fileId,
          settings.driveFinalFolderId,
          settings.driveStagingFolderId
        );
        results.finalFileId = staged.fileId;
      }
    }

    // 5. Label and archive original email
    await labelAndArchiveEmail(accessToken, settings.apInboxEmail, emailId);
    results.archivedAt = new Date().toISOString();

    return NextResponse.json({ success: true, ...results });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Processing failed";
    return NextResponse.json(
      { success: false, error: errorMessage, ...results },
      { status: 500 }
    );
  }
}
