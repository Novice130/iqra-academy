const footerLinks = [
  { label: "About", href: "#" },
  { label: "For Teachers", href: "#" },
  { label: "Blog", href: "#" },
  { label: "Privacy Policy", href: "#" },
  { label: "Terms of Service", href: "#" },
  { label: "Contact", href: "mailto:hello@iqraacademy.com" },
];

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-400 py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col md:flex-row items-center md:items-start justify-between gap-8">
          {/* Brand */}
          <div className="flex flex-col items-center md:items-start gap-3 max-w-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white font-bold text-base">
                ق
              </div>
              <span className="text-white font-bold text-lg">Iqra Academy</span>
            </div>
            <p className="text-sm text-gray-500 text-center md:text-left leading-relaxed">
              Online Quran classes for kids in the US — structured, safe, and teacher-led.
            </p>
            {/* Quranic quote */}
            <p className="text-xs text-emerald-600 italic text-center md:text-left">
              &ldquo;اقْرَأْ بِاسْمِ رَبِّكَ الَّذِي خَلَقَ&rdquo;
              <span className="block text-gray-600 not-italic mt-0.5">
                &ldquo;Read in the name of your Lord who created.&rdquo; — Quran 96:1
              </span>
            </p>
          </div>

          {/* Links */}
          <div className="flex flex-wrap justify-center md:justify-end gap-x-6 gap-y-2">
            {footerLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="text-sm text-gray-500 hover:text-emerald-400 transition-colors"
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-600">
          <span>© {new Date().getFullYear()} Iqra Academy. All rights reserved.</span>
          <span>Built with ❤️ for Muslim families in the US</span>
        </div>
      </div>
    </footer>
  );
}
