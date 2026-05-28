/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Fraunces', 'ui-serif', 'Georgia', 'serif'],
        italic: ['"Instrument Serif"', 'ui-serif', 'Georgia', 'serif'],
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      colors: {
        paper: {
          DEFAULT: '#F3ECDE',
          light: '#F8F2E6',
          dark: '#E8DFC8',
          edge: '#D9CFB8',
        },
        ink: {
          DEFAULT: '#1C1814',
          soft: '#3A332B',
          muted: '#897C68',
          faint: '#B6AC97',
        },
        focus: {
          DEFAULT: '#B8472A',
          deep: '#8E3520',
          glow: '#E26A47',
        },
        rest: {
          DEFAULT: '#566B4A',
          deep: '#3F5135',
          glow: '#7B9268',
        },
        accent: {
          ochre: '#C99B5B',
          ink: '#1C1814',
        },
      },
      letterSpacing: {
        tightest: '-0.06em',
        editorial: '-0.04em',
      },
      boxShadow: {
        paper: '0 1px 0 #D9CFB8, 0 8px 24px -16px rgba(28,24,20,0.3)',
        ink: '0 2px 0 #1C1814',
      },
      animation: {
        'rise': 'rise 700ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'fade-in': 'fade 500ms ease-out both',
        'pulse-slow': 'pulseSlow 3s ease-in-out infinite',
        'marquee': 'marquee 30s linear infinite',
      },
      keyframes: {
        rise: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        fade: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        pulseSlow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
        marquee: {
          '0%': { transform: 'translateX(0)' },
          '100%': { transform: 'translateX(-50%)' },
        },
      },
    },
  },
  plugins: [],
};
