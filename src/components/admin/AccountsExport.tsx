"use client";

import { useState } from "react";

export type ExportUser = {
  name: string;
  email: string;
  registered: string;
  lastActive: string;
  activeDays: number;
  verified: boolean;
  // The active tier, or "none" — a bare premium yes/no can't tell a $4.99
  // member from a $9.99 one, which is the whole point of exporting it.
  plan: "plus" | "premium" | "none";
};

// Copy/CSV export for the admin accounts list, so you can paste emails straight into
// a BCC or an email tool without touching the database.
export function AccountsExport({ users }: { users: ExportUser[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  const downloadCsv = () => {
    const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
    const header = "name,email,registered,last_active,active_days,verified,plan";
    const lines = users.map((u) =>
      [u.name, u.email, u.registered, u.lastActive, String(u.activeDays), u.verified ? "yes" : "no", u.plan].map(esc).join(","),
    );
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "riftcompare-users.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const emailsComma = users.map((u) => u.email).join(", ");
  const emailsList = users.map((u) => u.email).join("\n");

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => copy(emailsComma, "comma")} className="btn-ghost text-xs">
        {copied === "comma" ? "✓ Copied" : "Copy emails (BCC)"}
      </button>
      <button onClick={() => copy(emailsList, "list")} className="btn-ghost text-xs">
        {copied === "list" ? "✓ Copied" : "Copy emails (one per line)"}
      </button>
      <button onClick={downloadCsv} className="btn-ghost text-xs">Download CSV</button>
      <span className="text-xs text-slate-500">{users.length} loaded</span>
    </div>
  );
}
