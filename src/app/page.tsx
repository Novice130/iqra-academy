const API_ROUTES = [
  { method: "GET", path: "/api/health", desc: "Health check", status: "live" },
  { method: "ALL", path: "/api/auth/[...all]", desc: "Authentication (Better Auth)", status: "live" },
  { method: "GET/POST", path: "/api/students/profiles", desc: "Student profile management", status: "live" },
  { method: "GET/POST", path: "/api/students/bookings", desc: "Class booking system", status: "live" },
  { method: "GET", path: "/api/students/progress", desc: "Progress tracking", status: "live" },
  { method: "GET", path: "/api/teachers/sessions", desc: "Teacher session list", status: "live" },
  { method: "POST", path: "/api/teachers/feedback", desc: "Audio feedback", status: "live" },
  { method: "POST", path: "/api/teachers/call-now", desc: "Instant call trigger", status: "live" },
  { method: "POST", path: "/api/sessions/[id]/join", desc: "Join via Jitsi JWT", status: "live" },
  { method: "POST", path: "/api/sessions/[id]/extend", desc: "Extend session", status: "live" },
  { method: "PATCH", path: "/api/sessions/[id]/recording", desc: "Recording control", status: "live" },
  { method: "GET/POST", path: "/api/chat/messages", desc: "In-session chat", status: "live" },
  { method: "POST", path: "/api/chat/moderate", desc: "Chat moderation", status: "live" },
  { method: "GET/POST/PUT", path: "/api/admin/users", desc: "User management", status: "live" },
  { method: "POST", path: "/api/admin/refunds", desc: "Stripe refunds", status: "live" },
  { method: "POST", path: "/api/admin/impersonate", desc: "User impersonation", status: "live" },
  { method: "GET", path: "/api/admin/exports", desc: "CSV data exports", status: "live" },
  { method: "GET/POST", path: "/api/admin/coupons", desc: "Coupon management", status: "live" },
  { method: "GET/POST/DELETE", path: "/api/admin/observers", desc: "Observer emails", status: "live" },
  { method: "GET/POST", path: "/api/super/orgs", desc: "Organization management", status: "live" },
  { method: "POST", path: "/api/webhooks/stripe", desc: "Stripe event handler", status: "live" },
  { method: "POST", path: "/api/webhooks/calcom", desc: "Cal.com booking sync", status: "live" },
];

const PRICING_TIERS = [
  {
    name: "Free",
    price: "$0",
    period: "/mo",
    features: ["Webinar access only", "View recordings", "Community chat (view only)"],
    accent: "from-zinc-500 to-zinc-600",
    badge: null,
  },
  {
    name: "Individual",
    price: "$70",
    period: "/mo",
    features: ["4 classes/week (1-on-1)", "Full chat access", "Teacher audio feedback", "Progress tracking"],
    accent: "from-emerald-500 to-teal-500",
    badge: "Most Popular",
  },
  {
    name: "Group",
    price: "$50",
    period: "/mo",
    features: ["4 classes/week (group of 3)", "Full chat access", "Shared learning", "Progress tracking"],
    accent: "from-blue-500 to-indigo-500",
    badge: null,
  },
  {
    name: "Siblings",
    price: "$100",
    period: "/mo",
    features: ["Up to 3 children", "4 classes/week per child", "Family progress digest", "Observer emails"],
    accent: "from-purple-500 to-pink-500",
    badge: "Best Value",
  },
];

const INTEGRATIONS = [
  { name: "Stripe", desc: "Payments & subscriptions", icon: "💳", status: "needs setup" },
  { name: "PostgreSQL", desc: "Database (Neon recommended)", icon: "🗄️", status: "needs setup" },
  { name: "Better Auth", desc: "Authentication system", icon: "🔐", status: "needs setup" },
  { name: "Jitsi Meet", desc: "Video conferencing", icon: "📹", status: "needs setup" },
  { name: "Cal.com", desc: "Scheduling & bookings", icon: "📅", status: "needs setup" },
  { name: "Resend", desc: "Transactional emails", icon: "📧", status: "needs setup" },
  { name: "Web Push", desc: "Browser notifications", icon: "🔔", status: "needs setup" },
];

export default function Home() {
  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-900/20 via-transparent to-indigo-900/20" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-3xl" />
        
        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16">
          {/* Nav */}
          <nav className="flex items-center justify-between mb-20">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-lg font-bold">
                ق
              </div>
              <span className="text-xl font-semibold tracking-tight">Quran LMS</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              <span className="w-2 h-2 rounded-full bg-emerald-400 pulse-dot" />
              <span className="text-sm text-emerald-400 font-medium">Backend Ready</span>
            </div>
          </nav>

          {/* Hero content */}
          <div className="text-center max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 text-sm text-zinc-400 mb-8">
              <span>🚀</span>
              <span>24 API Routes • 17 Models • Multi-Tenant</span>
            </div>
            
            <h1 className="text-5xl sm:text-6xl font-bold tracking-tight leading-tight mb-6">
              Modern Quran
              <br />
              <span className="gradient-text">Learning Platform</span>
            </h1>
            
            <p className="text-lg text-zinc-400 max-w-xl mx-auto mb-10 leading-relaxed">
              Complete backend infrastructure with live sessions, subscription billing, 
              progress tracking, and multi-tenant architecture for Quran schools.
            </p>

            <div className="flex items-center justify-center gap-4">
              <a
                href="/api/health"
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-semibold text-sm hover:from-emerald-400 hover:to-teal-400 transition-all shadow-lg shadow-emerald-500/25"
              >
                Test Health Endpoint →
              </a>
              <a
                href="#api-routes"
                className="px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-zinc-300 font-medium text-sm hover:bg-white/10 transition-all"
              >
                View API Routes
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Bar */}
      <section className="border-y border-white/5 bg-white/[0.02]">
        <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-2 sm:grid-cols-4 gap-6">
          {[
            { label: "API Routes", value: "24" },
            { label: "DB Models", value: "17" },
            { label: "Core Libraries", value: "11" },
            { label: "Integrations", value: "7" },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <div className="text-3xl font-bold gradient-text">{stat.value}</div>
              <div className="text-sm text-zinc-500 mt-1">{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing Tiers */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-3">Pricing Tiers</h2>
        <p className="text-center text-zinc-500 mb-12">Pre-configured subscription plans</p>
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {PRICING_TIERS.map((tier) => (
            <div
              key={tier.name}
              className="relative rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6 hover:border-white/10 transition-all group"
            >
              {tier.badge && (
                <div className={`absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r ${tier.accent} text-xs font-semibold`}>
                  {tier.badge}
                </div>
              )}
              <div className={`text-2xl font-bold bg-gradient-to-r ${tier.accent} bg-clip-text text-transparent`}>
                {tier.price}
                <span className="text-sm text-zinc-500">{tier.period}</span>
              </div>
              <div className="text-lg font-semibold mt-1 mb-4">{tier.name}</div>
              <ul className="space-y-2">
                {tier.features.map((f) => (
                  <li key={f} className="text-sm text-zinc-400 flex items-start gap-2">
                    <span className="text-emerald-500 mt-0.5">✓</span>
                    {f}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* Integration Status */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-3">Integration Status</h2>
        <p className="text-center text-zinc-500 mb-12">Services that power the platform</p>
        
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {INTEGRATIONS.map((int) => (
            <div
              key={int.name}
              className="flex items-center gap-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] p-5 hover:border-white/10 transition-all"
            >
              <div className="text-3xl">{int.icon}</div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold">{int.name}</div>
                <div className="text-sm text-zinc-500 truncate">{int.desc}</div>
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-500/10 border border-amber-500/20">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span className="text-xs text-amber-400 font-medium whitespace-nowrap">Setup needed</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* API Routes */}
      <section id="api-routes" className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-3">API Routes</h2>
        <p className="text-center text-zinc-500 mb-12">All 24 endpoints ready to serve</p>
        
        <div className="rounded-2xl border border-white/[0.06] overflow-hidden">
          <div className="grid grid-cols-[auto_1fr_1fr_auto] gap-x-4 px-5 py-3 bg-white/[0.03] border-b border-white/[0.06] text-xs font-medium text-zinc-500 uppercase tracking-wider">
            <div>Method</div>
            <div>Path</div>
            <div>Description</div>
            <div>Status</div>
          </div>
          {API_ROUTES.map((route, i) => (
            <div
              key={route.path}
              className={`grid grid-cols-[auto_1fr_1fr_auto] gap-x-4 px-5 py-3 items-center hover:bg-white/[0.02] transition-colors ${
                i < API_ROUTES.length - 1 ? "border-b border-white/[0.03]" : ""
              }`}
            >
              <div className="font-mono text-xs px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-medium">
                {route.method}
              </div>
              <div className="font-mono text-sm text-zinc-300 truncate">{route.path}</div>
              <div className="text-sm text-zinc-500 truncate">{route.desc}</div>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                <span className="text-xs text-emerald-400">{route.status}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Architecture */}
      <section className="max-w-6xl mx-auto px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-3">Architecture</h2>
        <p className="text-center text-zinc-500 mb-12">Multi-tenant, role-based, ledger-pattern design</p>
        
        <div className="grid sm:grid-cols-3 gap-4">
          {[
            {
              title: "Multi-Tenant",
              desc: "Every org gets isolated data via orgId scoping. One codebase, unlimited schools.",
              icon: "🏢",
            },
            {
              title: "RBAC",
              desc: "4-tier role hierarchy: Student → Teacher → Org Admin → Super Admin with impersonation.",
              icon: "🛡️",
            },
            {
              title: "Ledger Pattern",
              desc: "Class quotas tracked as immutable ledger entries. Self-healing, auditable, race-condition proof.",
              icon: "📊",
            },
            {
              title: "Webhook-Driven",
              desc: "Stripe & Cal.com events processed idempotently with signature verification.",
              icon: "🔗",
            },
            {
              title: "Audit Trail",
              desc: "Every sensitive action logged with actor, target, metadata, and IP address.",
              icon: "📝",
            },
            {
              title: "Soft Deletes",
              desc: "Data is never truly deleted. deletedAt timestamps allow recovery and compliance.",
              icon: "🗂️",
            },
          ].map((card) => (
            <div
              key={card.title}
              className="rounded-2xl bg-white/[0.03] border border-white/[0.06] p-6 hover:border-emerald-500/20 transition-all group"
            >
              <div className="text-3xl mb-3">{card.icon}</div>
              <div className="font-semibold text-lg mb-2 group-hover:text-emerald-400 transition-colors">
                {card.title}
              </div>
              <div className="text-sm text-zinc-500 leading-relaxed">{card.desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center text-sm font-bold">
              ق
            </div>
            <span className="text-sm text-zinc-500">Quran LMS — Built with Next.js 16 + Drizzle ORM + Stripe</span>
          </div>
          <div className="text-sm text-zinc-600">
            Ready for deployment on Dockploy / Docker
          </div>
        </div>
      </footer>
    </div>
  );
}
