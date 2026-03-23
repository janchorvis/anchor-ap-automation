"use client";

import { useSession } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppSettings, DEFAULT_SETTINGS } from "@/lib/types";

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [newKeyword, setNewKeyword] = useState("");
  const [newSender, setNewSender] = useState("");

  useEffect(() => {
    if (status === "unauthenticated") router.push("/");
  }, [status, router]);

  useEffect(() => {
    if (session) {
      fetch("/api/settings")
        .then((r) => r.json())
        .then((data) => {
          setSettings(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    }
  }, [session]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } finally {
      setSaving(false);
    }
  };

  const addKeyword = () => {
    if (newKeyword.trim() && !settings.skipKeywords.includes(newKeyword.trim())) {
      setSettings({ ...settings, skipKeywords: [...settings.skipKeywords, newKeyword.trim()] });
      setNewKeyword("");
    }
  };

  const removeKeyword = (kw: string) => {
    setSettings({ ...settings, skipKeywords: settings.skipKeywords.filter((k) => k !== kw) });
  };

  const addSender = () => {
    if (newSender.trim() && !settings.skipSenders.includes(newSender.trim())) {
      setSettings({ ...settings, skipSenders: [...settings.skipSenders, newSender.trim()] });
      setNewSender("");
    }
  };

  const removeSender = (s: string) => {
    setSettings({ ...settings, skipSenders: settings.skipSenders.filter((x) => x !== s) });
  };

  if (loading || !session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100">
      {/* Header */}
      <header className="border-b border-slate-700 bg-slate-800/50 backdrop-blur">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center gap-4">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-slate-400 hover:text-white transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <h1 className="font-semibold text-white">Settings</h1>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {/* AP Inbox */}
        <Section title="AP Inbox" description="The Gmail mailbox to scan for invoices.">
          <Field label="AP Inbox Email">
            <input
              type="email"
              value={settings.apInboxEmail}
              onChange={(e) => setSettings({ ...settings, apInboxEmail: e.target.value })}
              placeholder="accountspayable@anchorinv.com"
              className={inputCls}
            />
          </Field>
          <p className="text-xs text-slate-500 mt-1">
            The logged-in user must have delegated access to this inbox in Google Workspace Admin.
          </p>
        </Section>

        {/* Yardi */}
        <Section title="Yardi Integration" description="Invoice forwarding destination.">
          <Field label="Yardi Email Address">
            <input
              type="email"
              value={settings.yardiEmail}
              onChange={(e) => setSettings({ ...settings, yardiEmail: e.target.value })}
              placeholder="yardi@yourdomain.com"
              className={inputCls}
            />
          </Field>
        </Section>

        {/* Google Drive */}
        <Section title="Google Drive" description="Folder IDs for invoice storage. Find IDs in the Drive folder URL.">
          <Field label="Staging Folder ID">
            <input
              type="text"
              value={settings.driveStagingFolderId}
              onChange={(e) => setSettings({ ...settings, driveStagingFolderId: e.target.value })}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
              className={inputCls}
            />
          </Field>
          <Field label="Final/Archive Folder ID">
            <input
              type="text"
              value={settings.driveFinalFolderId}
              onChange={(e) => setSettings({ ...settings, driveFinalFolderId: e.target.value })}
              placeholder="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs"
              className={inputCls}
            />
          </Field>
        </Section>

        {/* Skip Rules */}
        <Section title="Skip Rules" description="Emails matching these rules will be automatically skipped during scanning.">
          <Field label="Subject Keywords to Skip">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newKeyword}
                onChange={(e) => setNewKeyword(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addKeyword()}
                placeholder="e.g. hotel"
                className={`${inputCls} flex-1`}
              />
              <button onClick={addKeyword} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors">
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.skipKeywords.map((kw) => (
                <span key={kw} className="inline-flex items-center gap-1 bg-slate-700 text-slate-300 px-2 py-1 rounded-md text-xs">
                  {kw}
                  <button onClick={() => removeKeyword(kw)} className="text-slate-400 hover:text-red-400 transition-colors">×</button>
                </span>
              ))}
            </div>
          </Field>

          <Field label="Sender Addresses/Domains to Skip">
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newSender}
                onChange={(e) => setNewSender(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && addSender()}
                placeholder="e.g. @hotelchain.com"
                className={`${inputCls} flex-1`}
              />
              <button onClick={addSender} className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors">
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {settings.skipSenders.map((s) => (
                <span key={s} className="inline-flex items-center gap-1 bg-slate-700 text-slate-300 px-2 py-1 rounded-md text-xs">
                  {s}
                  <button onClick={() => removeSender(s)} className="text-slate-400 hover:text-red-400 transition-colors">×</button>
                </span>
              ))}
            </div>
          </Field>
        </Section>

        {/* Save button */}
        <div className="flex justify-end pt-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-sm font-semibold transition-colors"
          >
            {saving ? "Saving..." : saved ? "✓ Saved" : "Save Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}

const inputCls =
  "w-full bg-slate-900 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors";

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-5">
      <h2 className="font-semibold text-white mb-0.5">{title}</h2>
      <p className="text-slate-400 text-xs mb-4">{description}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
