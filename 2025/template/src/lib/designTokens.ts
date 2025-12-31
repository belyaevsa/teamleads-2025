export const colors = {
  deepSpace: '#0F172A',
  telegramBlue: '#2481CC',
  starlightText: '#F8FAFC',

  ai: {
    start: '#A855F7',
    end: '#D946EF',
  },
  management: {
    start: '#F97316',
    end: '#FDBA74',
  },
  positive: '#10B981',
  negative: '#EF4444',
  question: '#3B82F6',

  glass: {
    panel: 'rgba(30, 41, 59, 0.7)',
    border: 'rgba(255, 255, 255, 0.1)',
    grid: 'rgba(148, 163, 184, 0.05)',
  },
};

export const gradients = {
  ai: `linear-gradient(135deg, ${colors.ai.start} 0%, ${colors.ai.end} 100%)`,
  management: `linear-gradient(135deg, ${colors.management.start} 0%, ${colors.management.end} 100%)`,
  aurora: `linear-gradient(135deg, ${colors.ai.start} 0%, ${colors.management.start} 50%, ${colors.ai.end} 100%)`,
};

export const fonts = {
  heading: '"Inter", system-ui, sans-serif',
  data: '"JetBrains Mono", "Fira Code", monospace',
  body: '"Inter", system-ui, sans-serif',
};
