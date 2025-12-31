import { ReactNode } from 'react';
import { motion } from 'framer-motion';

interface BentoCardProps {
  children: ReactNode;
  className?: string;
  span?: 'single' | 'double' | 'triple';
  glowColor?: string;
}

export function BentoCard({ children, className = '', span = 'single', glowColor }: BentoCardProps) {
  const spanClasses = {
    single: 'col-span-1',
    double: 'col-span-1 md:col-span-2',
    triple: 'col-span-1 md:col-span-2 lg:col-span-3',
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      whileHover={{ scale: 1.01 }}
      className={`${spanClasses[span]} ${className} relative rounded-3xl p-6 md:p-8`}
      style={{
        background: 'rgba(30, 41, 59, 0.7)',
        backdropFilter: 'blur(12px)',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: glowColor
          ? `0 0 40px ${glowColor}20, inset 0 1px 0 rgba(255, 255, 255, 0.1)`
          : 'inset 0 1px 0 rgba(255, 255, 255, 0.1)',
      }}
    >
      {children}
    </motion.div>
  );
}
