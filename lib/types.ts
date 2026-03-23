export type InvoiceStatus =
  | "pending"
  | "extracting"
  | "extracted"
  | "needs_review"
  | "approved"
  | "processing"
  | "processed"
  | "skipped"
  | "error";

export interface InvoiceData {
  vendor: string;
  invoiceNumber: string;
  amount: string;
  property: string;
  dueDate: string;
  confidence: "high" | "medium" | "low";
  notes?: string;
}

export interface Invoice {
  id: string;
  emailId: string;
  subject: string;
  from: string;
  receivedAt: string;
  attachmentName: string;
  attachmentMimeType: string;
  attachmentData?: string; // base64, only in memory
  status: InvoiceStatus;
  extractedData?: InvoiceData;
  editedData?: InvoiceData;
  driveFileId?: string;
  driveStagingUrl?: string;
  driveFinalUrl?: string;
  yardiSentAt?: string;
  processedAt?: string;
  errorMessage?: string;
  skipReason?: string;
}

export interface RunHistoryEntry {
  id: string;
  startedAt: string;
  completedAt?: string;
  triggeredBy: string;
  emailsScanned: number;
  invoicesFound: number;
  invoicesProcessed: number;
  invoicesSkipped: number;
  invoicesErrored: number;
  status: "running" | "completed" | "failed";
  errorMessage?: string;
}

export interface AppSettings {
  yardiEmail: string;
  driveStagingFolderId: string;
  driveFinalFolderId: string;
  apInboxEmail: string;
  skipKeywords: string[];
  skipSenders: string[];
}

export const DEFAULT_SETTINGS: AppSettings = {
  yardiEmail: "",
  driveStagingFolderId: "",
  driveFinalFolderId: "",
  apInboxEmail: "accountspayable@anchorinv.com",
  skipKeywords: [
    "hotel",
    "hilton",
    "marriott",
    "hyatt",
    "holiday inn",
    "hampton inn",
    "courtyard",
    "residence inn",
    "westin",
    "sheraton",
  ],
  skipSenders: [],
};
