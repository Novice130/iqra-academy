/**
 * A spinner for buttons and blocking overlays.
 *
 * Text alone ("Signing in…") is not enough feedback on a phone: it does not
 * move, so a slow network is indistinguishable from a tap that missed. A
 * turning ring is the difference between "it is working" and "it is broken".
 *
 * `currentColor`, so it inherits whatever it is placed on.
 */
export default function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${Math.max(2, Math.round(size / 8))}px solid currentColor`,
        borderTopColor: "transparent",
        animation: "nt-spin 0.7s linear infinite",
        verticalAlign: "-0.15em",
      }}
    />
  );
}
