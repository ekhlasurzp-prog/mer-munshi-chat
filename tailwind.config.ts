import type { Config } from 'tailwindcss'
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: { 950: '#050B1E', 900: '#08153A', 800: '#0B1F4A', 700: '#142C63' },
        gold: { 200: '#FFE08A', 400: '#F5B800', 600: '#C98F00' },
        bubble: '#1E90FF',
        emerald: { 500: '#14A02C', 600: '#0E7A1F' },
        silver: { 100: '#E8ECF4', 300: '#AEB8CC', 500: '#6F7C96' },
      },
      fontFamily: {
        display: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        gold: '0 0 0 2px #F5B800, 0 0 40px 6px rgba(245,184,0,.35), 0 0 90px 20px rgba(30,144,255,.25)',
      },
    },
  },
  plugins: [],
} satisfies Config
