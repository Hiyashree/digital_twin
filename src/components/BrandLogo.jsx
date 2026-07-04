const src = `${import.meta.env.BASE_URL}brand-logo.png`;

/** Square brand mark (plant + circuit) — used in headers next to title copy. */
export default function BrandLogo({ size = 40, alt = "", style, ...rest }) {
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      decoding="async"
      draggable={false}
      {...rest}
      style={{
        display: "block",
        flexShrink: 0,
        objectFit: "contain",
        ...style,
      }}
    />
  );
}
