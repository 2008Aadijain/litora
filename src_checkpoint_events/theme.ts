export const theme = {
  color: {
    primary: "#1a1a2e",
    primarySoft: "#2d2d4a",
    accent: "#2d6a4f",
    accentSoft: "#d8e9de",
    accentHover: "#22543f",
    secondary: "#3d3d5c",
    ink: "#1a1a2e",
    inkSoft: "#3d3d5c",
    inkMuted: "#6b6b80",
    surface: "#ffffff",
    surfaceAlt: "#f5f3ee",
    surfaceWarm: "#faf6ef",
    line: "#e0ddd5",
    lineSoft: "#eeebe5",
    success: "#2d6a4f",
    warning: "#b8860b",
    danger: "#a83232",
    dangerSoft: "#f5e0e0",
  },
  font: {
    serif: "'Fraunces', Georgia, serif",
    sans: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  radius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
  },
  space: (n: number) => `${n * 8}px`,
} as const;

export type Theme = typeof theme;
