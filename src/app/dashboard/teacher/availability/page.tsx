"use client";

import { useState, useEffect } from "react";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const SLOTS = ["8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM", "6:00 PM", "7:00 PM"];

export default function AvailabilityPage() {
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  // 1. Fetch initial availability
  useEffect(() => {
    async function fetchAvailability() {
      try {
        const res = await fetch("/api/teachers/availability");
        if (res.ok) {
          const data = await res.json();
          const mapped: Record<string, string[]> = {};
          data.forEach((slot: any) => {
            const dayName = DAYS[slot.dayOfWeek];
            if (!mapped[dayName]) mapped[dayName] = [];
            // Assuming startTime is exactly like our SLOTS list for now
            mapped[dayName].push(slot.startTime);
          });
          setAvailability(mapped);
        }
      } catch (err) {
        console.error("Failed to fetch availability:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchAvailability();
  }, []);

  const toggleSlot = (day: string, slot: string) => {
    setAvailability((prev) => {
      const daySlots = prev[day] || [];
      if (daySlots.includes(slot)) {
        return { ...prev, [day]: daySlots.filter((s) => s !== slot) };
      }
      return { ...prev, [day]: [...daySlots, slot].sort() };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Map back to API format
      const slots = Object.entries(availability).flatMap(([day, daySlots]) => 
        daySlots.map(s => ({
          dayOfWeek: DAYS.indexOf(day),
          startTime: s,
          endTime: s.replace(":00 ", ":50 ") // Simple 50-min class assumption
        }))
      );

      const res = await fetch("/api/teachers/availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slots }),
      });

      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      }
    } catch (err) {
      console.error("Failed to save availability:", err);
    } finally {
      setSaving(false);
    }
  };

  const totalSlots = Object.values(availability).flat().length;

  return (
    <div className="p-6 lg:p-10 max-w-6xl h-full flex flex-col">
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
          disabled={saving || loading}
          className="px-5 py-2 rounded-xl text-sm font-semibold text-white transition-opacity disabled:opacity-50"
          style={{ background: "var(--accent)" }}
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>

      {saved && (
        <div className="mb-6 px-4 py-3 rounded-xl text-sm font-medium" style={{ background: "#dcfce7", color: "#166534" }}>
          ✅ Availability saved successfully
        </div>
      )}

      <div className="card overflow-hidden flex-1 flex flex-col">
        {/* Header */}
        <div className="grid grid-cols-8 sticky top-0 z-10" style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-elevated)" }}>
          <div className="p-3 text-xs font-semibold" style={{ color: "var(--text-tertiary)", borderRight: "1px solid var(--border)" }}>
            Time
          </div>
          {DAYS.map((day, i) => (
            <div key={day} className="p-3 text-center text-xs font-semibold" style={{
              color: "var(--text-primary)",
              borderRight: i < 6 ? "1px solid var(--border)" : undefined,
            }}>
              {day.slice(0, 3)}
            </div>
          ))}
        </div>

        {/* Time slots */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-accent" />
            </div>
          ) : (
            SLOTS.map((slot) => (
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
            ))
          )}
        </div>
      </div>

      <p className="text-xs mt-4 text-center" style={{ color: "var(--text-tertiary)" }}>
        Click on a time slot to toggle availability. Students can only book times you&apos;ve marked as available.
      </p>
    </div>
  );
}
