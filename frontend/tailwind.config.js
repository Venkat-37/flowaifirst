/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'ops-black':  '#030712',
        'ops-navy':   '#0d1b2e',
        'ops-card':   '#0f2235',
        'ops-border': '#1e4068',
        'ops-cyan':   '#00b4d8',
        'ops-cyan2':  '#0077a8',
        'ops-purple': '#7c3aed',
        'ops-green':  '#10b981',
        'ops-amber':  '#f59e0b',
        'ops-red':    '#dc2626',
        'ops-text':   '#e2e8f0',
        'ops-muted':  '#64748b',
      },
      fontFamily: {
        display: ['"Orbitron"', 'sans-serif'],
        mono:    ['"Share Tech Mono"', 'monospace'],
        body:    ['"Exo 2"', 'sans-serif'],
      },
      boxShadow: {
        'cyan-glow':   '0 0 20px rgba(0, 180, 216, 0.35)',
        'cyan-strong': '0 0 40px rgba(0, 180, 216, 0.6)',
        'red-glow':    '0 0 20px rgba(220, 38, 38, 0.4)',
        'amber-glow':  '0 0 20px rgba(245, 158, 11, 0.4)',
        'green-glow':  '0 0 20px rgba(16, 185, 129, 0.4)',
      },
      animation: {
        'scan':        'scan 4s linear infinite',
        'pulse-slow':  'pulse 3s ease-in-out infinite',
        'flicker':     'flicker 0.15s infinite',
        'fade-in':     'fadeIn 0.4s ease-out',
        'slide-up':    'slideUp 0.4s ease-out',
      },
      keyframes: {
        scan: {
          '0%':   { transform: 'translateY(-100%)' },
          '100%': { transform: 'translateY(100vh)' },
        },
        flicker: {
          '0%, 100%': { opacity: 1 },
          '50%':      { opacity: 0.92 },
        },
        fadeIn: {
          from: { opacity: 0 },
          to:   { opacity: 1 },
        },
        slideUp: {
          from: { opacity: 0, transform: 'translateY(16px)' },
          to:   { opacity: 1, transform: 'translateY(0)' },
        },
      },
      backgroundImage: {
        'grid-pattern': `linear-gradient(rgba(0,180,216,0.04) 1px, transparent 1px),
                          linear-gradient(90deg, rgba(0,180,216,0.04) 1px, transparent 1px)`,
      },
      backgroundSize: {
        'grid': '40px 40px',
      },
    },
  },
  plugins: [],
}
