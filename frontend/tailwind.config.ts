import type { Config } from 'tailwindcss'

const config: Config = {
  // One glob over src, deliberately. This used to list pages/, components/
  // and app/ individually, which silently excluded src/features/ — every
  // class used ONLY in a features/ file was never generated, so those screens
  // rendered half-styled: shared utilities worked, anything unique to them
  // (grid templates, arbitrary widths, text sizes) did not. Listing
  // directories by hand means any new one is broken until someone notices.
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
        },
        teal: {
          50: '#f0fdfa',
          100: '#ccfbf1',
          200: '#99f6e4',
          300: '#5eead4',
          400: '#2dd4bf',
          500: '#14b8a6',
          600: '#0d9488',
          700: '#0f766e',
          800: '#115e59',
          900: '#134e4a',
        },
        gray: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        }
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      keyframes: {
        'fade-in-up': {
          '0%': { opacity: '0', transform: 'translateY(16px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.96)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        // A slow red breath for something that needs attention but is not an
        // emergency — the Warnings Centre when work is sitting with us.
        'alert-glow': {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(239, 68, 68, 0.10), 0 0 14px 0 rgba(239, 68, 68, 0.10)' },
          '50%':      { boxShadow: '0 0 0 4px rgba(239, 68, 68, 0.13), 0 0 22px 3px rgba(239, 68, 68, 0.20)' },
        },
      },
      animation: {
        'fade-in-up': 'fade-in-up 0.5s ease-out forwards',
        'fade-in': 'fade-in 0.2s ease-out forwards',
        'scale-in': 'scale-in 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'alert-glow': 'alert-glow 2.8s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}
export default config
