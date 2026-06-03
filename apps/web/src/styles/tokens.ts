/**
 * Design tokens — single source of truth (mirror of `docs/05 §1`).
 * Registered with Tailwind via `theme.extend` in `tailwind.config.ts`.
 */
export const tokens = {
  color: {
    // Backgrounds
    bgBase: "#07080d",
    bgSurface: "#090a0f",
    bgPanel: "#11131a",
    bgElevated: "#1a1f2e",

    // Borders
    borderSubtle: "#1f2333",
    borderMuted: "#2a3050",
    borderActive: "#4a5578",

    // Brand
    violet: "#8b5cf6",
    violetLight: "#a78bfa",
    indigo: "#6366f1",
    indigoDark: "#4f46e5",

    // Status
    green: "#10b981",
    greenLight: "#34d399",
    amber: "#f59e0b",
    amberLight: "#fbbf24",
    red: "#ef4444",

    // Text
    textPrimary: "#ffffff",
    textSecondary: "#e2e8f0",
    textMuted: "#a1aab8",
    textDim: "#8b95a5",
    textGhost: "#4a5578",
  },
  font: {
    sans: '"Inter", system-ui, sans-serif',
    mono: '"JetBrains Mono", Consolas, monospace',
  },
  radius: {
    sm: "6px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    "2xl": "20px",
    full: "9999px",
  },
} as const;
