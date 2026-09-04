/**
 * Live Session / Video Room Loading Skeleton
 * Immersive dark canvas matching the video stage and bottom control toolbar.
 */

export default function SessionLoading() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#0b0f17] text-white animate-pulse">
      {/* Top Bar Skeleton */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white/10" />
          <div className="space-y-1">
            <div className="h-4 w-40 rounded bg-white/20" />
            <div className="h-3 w-24 rounded bg-white/10" />
          </div>
        </div>
        <div className="h-7 w-20 rounded-full bg-white/10" />
      </div>

      {/* Main Video Stage Skeleton */}
      <div className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl aspect-video rounded-2xl bg-white/5 border border-white/10 flex flex-col items-center justify-center space-y-4 shadow-2xl">
          <div className="w-20 h-20 rounded-full bg-white/10 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full border-2 border-[#0A84FF] border-t-transparent animate-spin" />
          </div>
          <div className="h-4 w-44 rounded bg-white/20" />
          <div className="h-3 w-32 rounded bg-white/10" />
        </div>
      </div>

      {/* Bottom Control Toolbar Skeleton */}
      <div className="p-4 border-t border-white/10 flex items-center justify-center gap-4 bg-white/5">
        <div className="w-12 h-12 rounded-full bg-white/10" />
        <div className="w-12 h-12 rounded-full bg-white/10" />
        <div className="w-12 h-12 rounded-full bg-white/10" />
        <div className="w-28 h-12 rounded-full bg-red-500/30 ml-4" />
      </div>
    </div>
  );
}
