import type { Config } from 'tailwindcss';

// Design tokens lifted 1:1 from reader-prototype.html so the production build
// matches the approved visual reference exactly.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        cream: 'rgb(from var(--cream) r g b / <alpha-value>)',
        blush: 'rgb(from var(--blush) r g b / <alpha-value>)',
        peach: 'rgb(from var(--peach) r g b / <alpha-value>)',
        lavender: 'rgb(from var(--lavender) r g b / <alpha-value>)',
        burgundy: 'rgb(from var(--burgundy) r g b / <alpha-value>)',
        gold: 'rgb(from var(--gold) r g b / <alpha-value>)',
        ink: 'rgb(from var(--ink) r g b / <alpha-value>)',
        paper: 'rgb(from var(--paper) r g b / <alpha-value>)',
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
        literata: ['"Literata"', 'serif'],
        yeseva: ['"Yeseva One"', 'serif'],
        comfort: ['"Comfortaa"', 'sans-serif'],
        badscript: ['"Bad Script"', 'cursive'],
        marck: ['"Marck Script"', 'cursive'],
        pacifico: ['"Pacifico"', 'cursive'],
        neucha: ['"Neucha"', 'cursive'],
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
