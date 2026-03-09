const trustItems = [
  { icon: "🎓", text: "Teachers with Ijazah & Tajweed certification" },
  { icon: "🕐", text: "US time-zone friendly schedules" },
  { icon: "👨‍👩‍👧‍👦", text: "500+ families enrolled" },
  { icon: "🛡️", text: "Safe, camera-on classrooms for kids" },
  { icon: "💰", text: "Money-back guarantee on your first month" },
];

export default function TrustBar() {
  return (
    <section className="bg-white border-y border-stone-100">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-5">
        <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
          {trustItems.map((item) => (
            <div key={item.text} className="flex items-center gap-2 text-sm text-gray-600">
              <span className="text-base">{item.icon}</span>
              <span className="font-medium">{item.text}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
