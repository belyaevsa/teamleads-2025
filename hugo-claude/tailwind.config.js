/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './layouts/**/*.html',
    './content/**/*.md'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        'deep-space': '#0F172A',
        'telegram-blue': '#2481CC',
        'starlight': '#F8FAFC',
        'ai-purple': {
          start: '#A855F7',
          end: '#D946EF'
        },
        'management-orange': {
          start: '#F97316',
          end: '#FDBA74'
        },
        positive: '#10B981',
        negative: '#EF4444',
        question: '#3B82F6',
        glass: {
          panel: 'rgba(30, 41, 59, 0.7)',
          border: 'rgba(255, 255, 255, 0.1)',
          grid: 'rgba(148, 163, 184, 0.05)'
        }
      },
      fontFamily: {
        'heading': ['Inter', 'system-ui', 'sans-serif'],
        'data': ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
        'body': ['Inter', 'system-ui', 'sans-serif']
      },
      backdropBlur: {
        glass: '12px'
      },
      borderRadius: {
        'bento': '24px'
      }
    }
  },
  plugins: []
}
