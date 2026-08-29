import type { Config } from 'tailwindcss';

// Design tokens lifted 1:1 from reader-prototype.html so the production build
// matches the approved visual reference exactly.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: '#FBF3EE',
        blush: '#F2C9C2',
        peach: '#F0B79A',
        lavender: '#C8BFE7',
        burgundy: '#4A1B2F',
        gold: '#C9A063',
        ink: '#3A2E30',
        paper: '#F6EFE0',
        night: {
          DEFAULT: '#2C2140',
          deep: '#1F1730',
          text: '#EDE6F5',
        },
        pixel: {
          bg: '#0D1321',
          bg2: '#1B2340',
          mint: '#7CF7C4',
          pink: '#FF6FB5',
          gold: '#FFD86B',
          text: '#EAF6FF',
        },
      },
      fontFamily: {
        serif: ['"Cormorant Garamond"', 'serif'],
        sans: ['"DM Sans"', 'sans-serif'],
        script: ['"Caveat"', 'cursive'],
        pixel: ['"Press Start 2P"', 'monospace'],
        mono: ['"VT323"', 'monospace'],
      },
      maxWidth: {
        page: '430px',
      },
      keyframes: {
        fall: { to: { transform: 'translateY(110vh) rotate(360deg)' } },
        pxbeat: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.18)' },
        },
      },
      animation: {
        fall: 'fall linear infinite',
        pxbeat: 'pxbeat 1s steps(2) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
