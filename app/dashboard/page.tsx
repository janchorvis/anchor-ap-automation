"use client";

import { useSession, signOut } from "next-auth/react";
import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Invoice, InvoiceData, RunHistoryEntry } from "@/lib/types";

type Tab = "invoices" | "history";

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [tab, setTab] = useState<Tab>("invoices");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [runHistory, setRunHistory] = useState<RunHistoryEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [editingData, setEditingData] = useState<InvoiceData | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 4000);
  };

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/run-history");
      if (res.ok) {
        const data = await res.json();
        setRunHistory(data);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (session) loadHistory();
  }, [session, loadHistory]);

  const handleScan = async () => {
    setScanning(true);
    try {
      const res = await fetch("/api/invoices/scan", { method: "POST" });
      const data = await res.json();

      if (!res.ok) {
        showNotification("error", data.error || "Scan failed");
        return;
      }

      const newInvoices: Invoice[] = data.invoices;
      setInvoices((prev) => {
        const existingIds = new Set(prev.map((i) => i.emailId + i.attachmentName));
        const fresh = newInvoices.filter((i) => !existingIds.has(i.emailId + i.attachmentName));
        return [...fresh, ...prev];
      });

      showNotification("success", `Found ${data.invoices.length} invoice(s). ${data.skipped.length} skipped.`);
      await loadHistory();
    } catch (err) {
      showNotification("error", "Network error during scan");
    } finally {
      setScanning(false);
    }
  };

  const handleExtract = async (invoice: Invoice) => {
    setInvoices((prev) =>
      prev.map((i) => (i.id === invoice.id ? { ...i, status: "extracting" } : i))
    );

    try {
      const res = await fetch("/api/invoices/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId: invoice.emailId,
          attachmentId: (invoice as unknown as { attachmentId: string }).attachmentId,
          attachmentName: invoice.attachmentName,
          mimeType: invoice.attachmentMimeType,
        }),
      });

      const data = await res.json();

      setInvoices((prev) =>
        prev.map((i) =>
          i.id === invoice.id
            ? {
                ...i,
                status: res.ok ? (data.extractedData.confidence === "low" ? "needs_review" : "extracted") : "needs_review",
                extractedData: data.extractedData,
                editedData: data.extractedData,
                attachmentData: data.attachmentBase64,
              }
            : i
        )
      );

      if (!res.ok) {
        showNotification("error", `Extraction failed: ${data.error}`);
      }
    } catch (err) {
      setInvoices((prev) =>
        prev.map((i) =>
          i.id === invoice.id ? { ...i, status: "error", errorMessage: "Network error" } : i
        )
      );
    }
  };

  const handleApprove = (invoice: Invoice) => {
    setInvoices((prev) =>
      prev.map((i) =>
        i.id === invoice.id
          ? { ...i, status: "approved", editedData: editingData ?? i.extractedData }
          : i
      )
    );
    setSelectedInvoice(null);
    setEditingData(null);
  };

  const handleProcess = async (invoice: Invoice) => {
    const data = invoice.editedData ?? invoice.extractedData;
    if (!data) {
      showNotification("error", "No invoice data to process");
      return;
    }

    setProcessingIds((prev) => new Set(prev).add(invoice.id));
    setInvoices((prev) =>
      prev.map((i) => (i.id === invoice.id ? { ...i, status: "processing" } : i))
    );

    try {
      const res = await fetch("/api/invoices/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          emailId: invoice.emailId,
          invoiceData: data,
          attachmentBase64: (invoice as unknown as { attachmentData: string }).attachmentData,
          attachmentMimeType: invoice.attachmentMimeType,
          attachmentName: invoice.attachmentName,
        }),
      });

      const result = await res.json();

      setInvoices((prev) =>
        prev.map((i) =>
          i.id === invoice.id
            ? {
                ...i,
                status: res.ok ? "processed" : "error",
                driveStagingUrl: result.stagingUrl,
                driveFinalUrl: result.finalUrl,
                yardiSentAt: result.yardiSentAt,
                processedAt: result.archivedAt,
                errorMessage: result.error,
              }
            : i
        )
      );

      if (res.ok) {
        showNotification("success", `Processed: ${result.fileName}`);
      } else {
        showNotification("error", result.error ?? "Processing failed");
      }
    } catch {
      setInvoices((prev) =>
        prev.map((i) =>
          i.id === invoice.id ? { ...i, status: "error", errorMessage: "Network error" } : i
        )
      );
      showNotification("error", "Network error during processing");
    } finally {
      setProcessingIds((prev) => {
        const next = new Set(prev);
        next.delete(invoice.id);
        return next;
      });
    }
  };

  const openEditor = (invoice: Invoice) => {
    setSelectedInvoice(invoice);
    setEditingData(invoice.editedData ?? invoice.extractedData ?? null);
  };

  if (status === "loading" || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  const pendingCount = invoices.filter((i) => ["pending", "extracted", "needs_review", "approved"].includes(i.status)).length;
  const processedCount = invoices.filter((i) => i.status === "processed").length;

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Notification */}
      {notification && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
            notification.type === "success"
              ? "bg-emerald-600 text-white"
              : "bg-red-600 text-white"
          }`}
        >
          {notification.type === "success" ? "✓ " : "✕ "}
          {notification.message}
        </div>
      )}

      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <span className="font-semibold text-white">AP Automation</span>
            <span className="text-slate-500 text-sm hidden sm:inline">· Anchor Investments</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-slate-400 text-sm hidden sm:inline">{session.user?.email}</span>
            <button
              onClick={() => router.push("/settings")}
              className="text-slate-400 hover:text-white transition-colors p-1"
              title="Settings"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-slate-400 hover:text-red-400 transition-colors text-sm"
            >
              Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <StatCard label="Pending" value={invoices.filter(i => i.status === "pending").length} color="yellow" />
          <StatCard label="Ready to Process" value={invoices.filter(i => i.status === "approved").length} color="blue" />
          <StatCard label="Needs Review" value={invoices.filter(i => i.status === "needs_review").length} color="orange" />
          <StatCard label="Processed" value={processedCount} color="green" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-slate-800 p-1 rounded-xl w-fit">
          <button
            onClick={() => setTab("invoices")}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "invoices"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Invoices {pendingCount > 0 && <span className="ml-1 bg-blue-500/30 text-blue-300 rounded-full px-1.5 py-0.5 text-xs">{pendingCount}</span>}
          </button>
          <button
            onClick={() => { setTab("history"); loadHistory(); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "history"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            Run History
          </button>
        </div>

        {tab === "invoices" && (
          <>
            {/* Action bar */}
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Invoice Queue</h2>
              <button
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              >
                {scanning ? (
                  <>
                    <span className="animate-spin inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Scan AP Inbox
                  </>
                )}
              </button>
            </div>

            {invoices.length === 0 ? (
              <div className="text-center py-20 text-slate-500">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-30" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                </svg>
                <p className="font-medium">No invoices yet</p>
                <p className="text-sm mt-1">Click "Scan AP Inbox" to find new invoices</p>
              </div>
            ) : (
              <div className="space-y-2">
                {invoices.map((invoice) => (
                  <InvoiceRow
                    key={invoice.id}
                    invoice={invoice}
                    onExtract={handleExtract}
                    onEdit={openEditor}
                    onApprove={(inv) => { openEditor(inv); }}
                    onProcess={handleProcess}
                    processing={processingIds.has(invoice.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {tab === "history" && (
          <RunHistoryTab history={runHistory} />
        )}
      </div>

      {/* Edit Modal */}
      {selectedInvoice && editingData && (
        <EditModal
          invoice={selectedInvoice}
          data={editingData}
          onChange={setEditingData}
          onApprove={() => handleApprove(selectedInvoice)}
          onClose={() => { setSelectedInvoice(null); setEditingData(null); }}
        />
      )}
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  const colorMap: Record<string, string> = {
    yellow: "text-yellow-400",
    blue: "text-blue-400",
    orange: "text-orange-400",
    green: "text-emerald-400",
  };
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
      <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-2xl font-bold ${colorMap[color]}`}>{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: Invoice["status"] }) {
  const map: Record<string, { label: string; cls: string }> = {
    pending: { label: "Pending", cls: "bg-slate-700 text-slate-300" },
    extracting: { label: "Extracting...", cls: "bg-blue-900/40 text-blue-300 animate-pulse" },
    extracted: { label: "Extracted", cls: "bg-cyan-900/40 text-cyan-300" },
    needs_review: { label: "Needs Review", cls: "bg-orange-900/40 text-orange-300" },
    approved: { label: "Approved", cls: "bg-blue-900/40 text-blue-300" },
    processing: { label: "Processing...", cls: "bg-purple-900/40 text-purple-300 animate-pulse" },
    processed: { label: "Processed", cls: "bg-emerald-900/40 text-emerald-300" },
    skipped: { label: "Skipped", cls: "bg-slate-700 text-slate-400" },
    error: { label: "Error", cls: "bg-red-900/40 text-red-300" },
  };
  const { label, cls } = map[status] ?? { label: status, cls: "bg-slate-700 text-slate-300" };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

function InvoiceRow({
  invoice,
  onExtract,
  onEdit,
  onApprove,
  onProcess,
  processing,
}: {
  invoice: Invoice;
  onExtract: (i: Invoice) => void;
  onEdit: (i: Invoice) => void;
  onApprove: (i: Invoice) => void;
  onProcess: (i: Invoice) => void;
  processing: boolean;
}) {
  const data = invoice.editedData ?? invoice.extractedData;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors">
      <div className="flex flex-col sm:flex-row sm:items-start gap-3">
        {/* Main info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <StatusBadge status={invoice.status} />
            {data?.confidence === "low" && (
              <span className="text-xs text-orange-400">⚠ Low confidence</span>
            )}
          </div>
          <p className="text-sm font-medium text-white truncate">{invoice.subject}</p>
          <p className="text-xs text-slate-400 mt-0.5">{invoice.from} · {invoice.attachmentName}</p>

          {data && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-5 gap-x-4 gap-y-1 text-xs">
              <DataCell label="Vendor" value={data.vendor} />
              <DataCell label="Invoice #" value={data.invoiceNumber} />
              <DataCell label="Amount" value={data.amount} />
              <DataCell label="Property" value={data.property} />
              <DataCell label="Due" value={data.dueDate} />
            </div>
          )}

          {invoice.errorMessage && (
            <p className="mt-1 text-xs text-red-400">Error: {invoice.errorMessage}</p>
          )}
          {invoice.processedAt && (
            <p className="mt-1 text-xs text-emerald-400">
              Processed {new Date(invoice.processedAt).toLocaleString()}
              {invoice.driveFinalUrl && (
                <a href={invoice.driveFinalUrl} target="_blank" rel="noopener noreferrer"
                  className="ml-2 underline hover:text-emerald-300">View in Drive</a>
              )}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {invoice.status === "pending" && (
            <button
              onClick={() => onExtract(invoice)}
              className="px-3 py-1.5 bg-cyan-700 hover:bg-cyan-600 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Extract
            </button>
          )}
          {(invoice.status === "extracted" || invoice.status === "needs_review") && (
            <>
              <button
                onClick={() => onEdit(invoice)}
                className="px-3 py-1.5 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-medium transition-colors"
              >
                Review & Approve
              </button>
            </>
          )}
          {invoice.status === "approved" && (
            <button
              onClick={() => onProcess(invoice)}
              disabled={processing}
              className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-600 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
            >
              {processing ? "Processing..." : "Process"}
            </button>
          )}
          {invoice.status === "error" && (
            <button
              onClick={() => onExtract(invoice)}
              className="px-3 py-1.5 bg-red-800 hover:bg-red-700 text-white rounded-lg text-xs font-medium transition-colors"
            >
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function DataCell({ label, value }: { label: string; value: string }) {
  const isUnknown = value === "UNKNOWN" || !value;
  return (
    <div>
      <span className="text-slate-500">{label}: </span>
      <span className={isUnknown ? "text-orange-400" : "text-slate-200"}>{value || "—"}</span>
    </div>
  );
}

function EditModal({
  invoice,
  data,
  onChange,
  onApprove,
  onClose,
}: {
  invoice: Invoice;
  data: InvoiceData;
  onChange: (d: InvoiceData) => void;
  onApprove: () => void;
  onClose: () => void;
}) {
  const fields: { key: keyof InvoiceData; label: string }[] = [
    { key: "vendor", label: "Vendor" },
    { key: "invoiceNumber", label: "Invoice Number" },
    { key: "amount", label: "Amount" },
    { key: "property", label: "Property" },
    { key: "dueDate", label: "Due Date" },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between p-5 border-b border-slate-700">
          <div>
            <h3 className="font-semibold text-white">Review Invoice Data</h3>
            <p className="text-xs text-slate-400 mt-0.5 truncate max-w-sm">{invoice.attachmentName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-3">
          {data.confidence !== "high" && (
            <div className="bg-orange-900/20 border border-orange-700/40 rounded-lg p-3 text-xs text-orange-300">
              <strong>Confidence: {data.confidence}</strong>
              {data.notes && <p className="mt-1 opacity-80">{data.notes}</p>}
            </div>
          )}

          {fields.map(({ key, label }) => (
            <div key={key}>
              <label className="block text-xs text-slate-400 mb-1">{label}</label>
              <input
                type="text"
                value={(data[key] as string) || ""}
                onChange={(e) => onChange({ ...data, [key]: e.target.value })}
                className="w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
              />
            </div>
          ))}
        </div>

        <div className="p-5 border-t border-slate-700 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={onApprove}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Approve & Queue
          </button>
        </div>
      </div>
    </div>
  );
}

function RunHistoryTab({ history }: { history: RunHistoryEntry[] }) {
  if (history.length === 0) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p className="font-medium">No runs yet</p>
        <p className="text-sm mt-1">Scan history will appear here after your first scan</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <h2 className="text-lg font-semibold text-white mb-4">Run History</h2>
      {history.map((run) => (
        <div key={run.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span
                  className={`inline-block w-2 h-2 rounded-full ${
                    run.status === "completed" ? "bg-emerald-400" :
                    run.status === "failed" ? "bg-red-400" : "bg-yellow-400 animate-pulse"
                  }`}
                />
                <span className="text-sm font-medium text-white">
                  {new Date(run.startedAt).toLocaleString()}
                </span>
                <span className="text-xs text-slate-500">by {run.triggeredBy}</span>
              </div>
              {run.errorMessage && (
                <p className="text-xs text-red-400">{run.errorMessage}</p>
              )}
            </div>
            <div className="flex gap-4 text-xs text-slate-400">
              <span>{run.emailsScanned} scanned</span>
              <span className="text-cyan-400">{run.invoicesFound} found</span>
              <span className="text-emerald-400">{run.invoicesProcessed} processed</span>
              {run.invoicesSkipped > 0 && <span>{run.invoicesSkipped} skipped</span>}
              {run.invoicesErrored > 0 && <span className="text-red-400">{run.invoicesErrored} errors</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
