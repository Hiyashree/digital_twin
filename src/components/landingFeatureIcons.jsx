/** Inline SVGs for landing feature strip — neon lime + glow (distinct from body brand green). */

const neon = "#39FF14";

const svgBase = {
  width: 48,
  height: 48,
  viewBox: "0 0 24 24",
  fill: "none",
  xmlns: "http://www.w3.org/2000/svg",
  "aria-hidden": true,
};

export function IconBrain() {
  return (
    <svg {...svgBase} stroke={neon} strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588 4 4 0 0 0 7.315 4.147 4 4 0 0 0 2.959-4.147 4 4 0 0 0-.556-6.588A4 4 0 0 0 15.997 5.125 3 3 0 0 0 12 5Z" />
      <path d="M12 5v14" opacity={0.35} />
      <path d="M8 10h.01M16 10h.01M9.5 14a3.5 3.5 0 0 0 5 0" />
    </svg>
  );
}

/** Map pin centered in a circle */
export function IconMapPinCircle() {
  return (
    <svg {...svgBase} stroke={neon} strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="11" r="8" />
      <path d="M12 18s4-3.2 4-7a4 4 0 1 0-8 0c0 3.8 4 7 4 7Z" fill="none" />
      <circle cx="12" cy="11" r="2" fill={neon} stroke="none" />
    </svg>
  );
}

/** Universal recycling symbol — Bootstrap Icons recycle (filled), scaled to 24×24 */
export function IconRecycle() {
  return (
    <svg {...svgBase} viewBox="0 0 16 16" fill={neon} stroke="none" aria-hidden>
      <path d="M9.302 1.256a1.5 1.5 0 0 0-2.604 0l-1.704 2.98a.5.5 0 0 0 .869.497l1.703-2.981a.5.5 0 0 1 .868 0l2.54 4.444-1.256-.337a.5.5 0 1 0-.26.966l2.415.647a.5.5 0 0 0 .613-.353l.647-2.415a.5.5 0 1 0-.966-.259l-.333 1.242-2.532-4.431zM2.973 7.773l-1.255.337a.5.5 0 1 1-.26-.966l2.416-.647a.5.5 0 0 1 .612.353l.647 2.415a.5.5 0 0 1-.966.259l-.333-1.242-2.545 4.454a.5.5 0 0 0 .434.748H5a.5.5 0 0 1 0 1H1.723A1.5 1.5 0 0 1 .421 12.24l2.552-4.467zm10.89 1.463a.5.5 0 1 0-.868.496l1.716 3.004a.5.5 0 0 1-.434.748h-5.57l.647-.646a.5.5 0 1 0-.708-.707l-1.5 1.5a.498.498 0 0 0 0 .707l1.5 1.5a.5.5 0 1 0 .708-.707l-.647-.647h5.57a1.5 1.5 0 0 0 1.302-2.244l-1.716-3.004z" />
    </svg>
  );
}

/** Three ascending bars */
export function IconBarChart() {
  return (
    <svg {...svgBase} stroke={neon} strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 20V10" />
      <path d="M12 20V4" />
      <path d="M20 20v-8" />
      <path d="M4 20h16" opacity={0.35} />
    </svg>
  );
}

export function IconLeaf() {
  return (
    <svg {...svgBase} stroke={neon} strokeWidth={1.65} strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C11.5 4.5 14 4 16 5c2 1 3 3.5 3 6a7 7 0 1 1-8 9Z" />
      <path d="M12 20v-7" opacity={0.5} />
    </svg>
  );
}
