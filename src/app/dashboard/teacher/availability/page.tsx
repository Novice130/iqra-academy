"use client";

/**
 * Teacher Availability — Set weekly available time slots
 */

import { useState } from "react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SLOTS = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM"];

// Demo initial availability
const INITIAL: Record<string, string[]> = {
  Monday: ["9:00 AM", "10:00 AM", "2:00 PM", "4:00 PM", "5:00 PM"],
  Tuesday: ["9:00 AM", "10:00 AM", "11:00 AM"],
  Wednesday: ["2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM"],
  Thursday: ["9:00 AM", "10:00 AM", "2:00 PM", "3:00 PM"],
  Friday: ["10:00 AM", "11:00 AM"],
  Saturday: ["9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM"],
};

export default function AvailabilityPage() {
  const [availability, setAvailability] = useState<Record<string, string[]>>(INITIAL);
  const [saved, setSaved] = useState(false);

  const toggleSlot = (day: string, slot: string) => {
    setAvailability((prev) => {
      const daySlots = prev[day] || [];
      if (daySlots.includes(slot)) {
        return { ...prev, [day]: daySlots.filter((s) => s !== slot) };
      }
      return { ...prev, [day]: [...daySlots, slot].sort() };
    });
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const totalSlots = Object.values(availability).flat().length;

  return (
    <div className="p-6 lg:p-10 max-w-6xl">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Availability
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>
            Set your weekly teaching schedule • {totalSlots} slots selected
          </p>
        </div>
        <button
          onClick={handleSave}
          className="px-5 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: "var(--accent)" }}
        >
          Save Changes
        </button>
      </div>

      {saved && (
        <div className="mb-6 px-4 py-3 rounded-xl text-sm font-medium" style={{ background: "#dcfce7", color: "#166534" }}>
          ✅ Availability saved successfully
        </div>
      )}

      <div className="card overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-8" style={{ borderBottom: "1px solid var(--border)" }}>
          <div className="p-3 text-xs font-semibold" style={{ color: "var(--text-tertiary)", borderRight: "1px solid var(--border)" }}>
            Time
          </div>
          {DAYS.map((day, i) => (
            <div key={day} className="p-3 text-center text-xs font-semibold" style={{
              color: "var(--text-primary)",
              borderRight: i < 6 ? "1px solid var(--border)" : undefined,
              background: day === "Sunday" || day === "Friday" ? "var(--bg-secondary)" : undefined,
            }}>
              {day.slice(0, 3)}
            </div>
          ))}
        </div>

        {/* Time slots */}
        {SLOTS.map((slot) => (
          <div key={slot} className="grid grid-cols-8" style={{ borderBottom: "1px solid var(--border)" }}>
            <div className="p-2.5 text-xs font-mono" style={{ color: "var(--text-tertiary)", borderRight: "1px solid var(--border)" }}>
              {slot}
            </div>
            {DAYS.map((day, i) => {
              const isSelected = (availability[day] || []).includes(slot);
              return (
                <div
                  key={day}
                  className="p-1.5 flex items-center justify-center cursor-pointer transition-colors"
                  style={{
                    borderRight: i < 6 ? "1px solid var(--border)" : undefined,
                    background: day === "Sunday" || day === "Friday" ? "var(--bg-secondary)" : undefined,
                  }}
                  onClick={() => toggleSlot(day, slot)}
                >
                  <div
                    className="w-full h-8 rounded-md flex items-center justify-center text-xs font-semibold transition-all"
                    style={{
                      background: isSelected ? "var(--accent)" : "transparent",
                      color: isSelected ? "#fff" : "var(--text-tertiary)",
                      border: isSelected ? "none" : "1px dashed var(--border)",
                    }}
                  >
                    {isSelected ? "✓" : ""}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      <p className="text-xs mt-4 text-center" style={{ color: "var(--text-tertiary)" }}>
        Click on a time slot to toggle availability. Students can only book times you&apos;ve marked as available.
      </p>
    </div>
  );
}
