/** The KeyWitness mark: a doorway on its threshold, holding a keyhole whose slot turns up into a check. */
export function Mark({ size = 32, tile = true }: { size?: number; tile?: boolean }) {
  const line = tile ? "#f2ead8" : "currentColor";
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      {tile ? <rect width="64" height="64" rx="14" fill="#0e1a2b" /> : null}
      <path d="M19 51 V27 A13 13 0 0 1 45 27 V51" fill="none" stroke={line} strokeWidth="3.6"
        strokeLinecap="round" strokeLinejoin="round" />
      <path d="M13.5 51.5 H50.5" stroke={line} strokeWidth="3.6" strokeLinecap="round" />
      <circle cx="30.6" cy="26.4" r="5.6" fill="#2fb7a1" />
      <path d="M30.6 29.5 V42.2 L39.8 32.6" fill="none" stroke="#2fb7a1" strokeWidth="4.4" strokeLinecap="round"
        strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({ size = 32 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-3">
      <Mark size={size} />
      <span className="font-bold tracking-[-0.01em]" style={{ fontSize: Math.round(size * 0.62) }}>KeyWitness</span>
    </span>
  );
}
