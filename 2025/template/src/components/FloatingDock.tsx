import { motion } from 'framer-motion';
import { Home, TrendingUp, Users, Network, Heart } from 'lucide-react';
import { useState } from 'react';
import { colors } from '../lib/designTokens';

const navItems = [
  { icon: Home, label: 'Home', href: '#hero' },
  { icon: TrendingUp, label: 'Metrics', href: '#metrics' },
  { icon: Users, label: 'Top Contributors', href: '#big-four' },
  { icon: Network, label: 'Network', href: '#network' },
  { icon: Heart, label: 'Sentiment', href: '#sentiment' },
];

export function FloatingDock() {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  return (
    <motion.nav
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 1, duration: 0.5 }}
      className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 hidden md:block"
    >
      <div
        className="flex items-end gap-2 px-4 py-3 rounded-2xl"
        style={{
          background: colors.glass.panel,
          backdropFilter: 'blur(12px)',
          border: `1px solid ${colors.glass.border}`,
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.3)',
        }}
      >
        {navItems.map((item, index) => {
          const Icon = item.icon;
          const isHovered = hoveredIndex === index;

          return (
            <motion.a
              key={item.label}
              href={item.href}
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
              className="relative flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-colors"
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              style={{
                background: isHovered ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
              }}
            >
              <motion.div
                animate={{
                  y: isHovered ? -8 : 0,
                  scale: isHovered ? 1.2 : 1,
                }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              >
                <Icon
                  className="w-5 h-5"
                  style={{
                    color: isHovered ? colors.telegramBlue : colors.starlightText,
                  }}
                />
              </motion.div>

              {isHovered && (
                <motion.span
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="absolute -top-10 text-xs font-mono whitespace-nowrap px-2 py-1 rounded-lg"
                  style={{
                    background: colors.glass.panel,
                    border: `1px solid ${colors.glass.border}`,
                  }}
                >
                  {item.label}
                </motion.span>
              )}
            </motion.a>
          );
        })}
      </div>
    </motion.nav>
  );
}
