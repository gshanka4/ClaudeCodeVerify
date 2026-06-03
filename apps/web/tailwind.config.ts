import type { Config } from "tailwindcss";
import { tokens } from "./src/styles/tokens";

const config: Config = {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          base: tokens.color.bgBase,
          surface: tokens.color.bgSurface,
          panel: tokens.color.bgPanel,
          elevated: tokens.color.bgElevated,
        },
        border: {
          subtle: tokens.color.borderSubtle,
          muted: tokens.color.borderMuted,
          active: tokens.color.borderActive,
        },
        brand: {
          violet: tokens.color.violet,
          violetLight: tokens.color.violetLight,
          indigo: tokens.color.indigo,
          indigoDark: tokens.color.indigoDark,
        },
        status: {
          green: tokens.color.green,
          greenLight: tokens.color.greenLight,
          amber: tokens.color.amber,
          amberLight: tokens.color.amberLight,
          red: tokens.color.red,
        },
        text: {
          primary: tokens.color.textPrimary,
          secondary: tokens.color.textSecondary,
          muted: tokens.color.textMuted,
          dim: tokens.color.textDim,
          ghost: tokens.color.textGhost,
        },
      },
      fontFamily: {
        sans: [tokens.font.sans],
        mono: [tokens.font.mono],
      },
      borderRadius: {
        sm: tokens.radius.sm,
        md: tokens.radius.md,
        lg: tokens.radius.lg,
        xl: tokens.radius.xl,
        "2xl": tokens.radius["2xl"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 rgba(139, 92, 246, 0.4)" },
          "70%": { boxShadow: "0 0 0 8px rgba(139, 92, 246, 0)" },
          "100%": { boxShadow: "0 0 0 0 rgba(139, 92, 246, 0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 200ms ease-out",
        "pulse-ring": "pulse-ring 1.6s ease-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
