"use client";

/**
 * Settings Page — Account management and student profiles
 */

import { useState } from "react";

export default function SettingsPage() {
  const [name, setName] = useState("Syed Amer");
  const [email] = useState("syedamer130@yahoo.com");
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="p-6 lg:p-10 max-w-3xl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
          Settings
        </h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
          Manage your account and student profiles
        </p>
      </div>

      {saved && (
        <div className="mb-6 px-4 py-3 rounded-xl text-sm font-medium" style={{ background: "#dcfce7", color: "#166534" }}>
          ✅ Settings saved successfully
        </div>
      )}

      {/* Account info */}
      <section className="card mb-6">
        <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Account
          </h2>
        </div>
        <div className="p-5 space-y-5">
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--text-secondary)" }}>Full Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none"
              style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--text-secondary)" }}>Email</label>
            <input
              type="email"
              value={email}
              disabled
              className="w-full px-4 py-2.5 rounded-xl text-sm outline-none opacity-60"
              style={{ background: "var(--bg-secondary)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
            />
            <p className="text-[11px] mt-1" style={{ color: "var(--text-tertiary)" }}>Contact support to change your email</p>
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1.5" style={{ color: "var(--text-secondary)" }}>Password</label>
            <button
              className="px-4 py-2 rounded-xl text-xs font-semibold transition-colors"
              style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}
            >
              Change Password
            </button>
          </div>
        </div>
      </section>

      {/* Student profiles */}
      <section className="card mb-6">
        <div className="p-5 flex items-center justify-between" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Student Profiles
          </h2>
          <button className="text-xs font-semibold px-3 py-1.5 rounded-lg text-white" style={{ background: "var(--accent)" }}>
            + Add Student
          </button>
        </div>
        <div className="divide-y" style={{ borderColor: "var(--border)" }}>
          {[
            { name: "Aisha", age: 8, track: "Noorani Qaidah" },
            { name: "Yusuf", age: 11, track: "Quran Reading" },
          ].map((student) => (
            <div key={student.name} className="p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold text-white" style={{ background: "var(--accent)" }}>
                  {student.name[0]}
                </div>
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{student.name}</div>
                  <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Age {student.age} • {student.track}</div>
                </div>
              </div>
              <button className="text-xs font-medium px-3 py-1.5 rounded-lg" style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)", border: "1px solid var(--border)" }}>
                Edit
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Notifications */}
      <section className="card mb-6">
        <div className="p-5" style={{ borderBottom: "1px solid var(--border)" }}>
          <h2 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--text-tertiary)" }}>
            Notifications
          </h2>
        </div>
        <div className="p-5 space-y-4">
          {[
            { label: "Class reminders", desc: "30 min before each session", defaultChecked: true },
            { label: "Weekly progress digest", desc: "Summary every Friday", defaultChecked: true },
            { label: "Payment receipts", desc: "After each billing cycle", defaultChecked: true },
            { label: "Promotional emails", desc: "New courses and offers", defaultChecked: false },
          ].map((pref) => (
            <label key={pref.label} className="flex items-center justify-between cursor-pointer">
              <div>
                <div className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{pref.label}</div>
                <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>{pref.desc}</div>
              </div>
              <input
                type="checkbox"
                defaultChecked={pref.defaultChecked}
                className="w-4 h-4 rounded accent-[#5C7C6F]"
              />
            </label>
          ))}
        </div>
      </section>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          className="px-6 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity"
          style={{ background: "var(--accent)" }}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
