import { motion } from 'framer-motion';
import { colors } from '../lib/designTokens';

interface StatDisplayProps {
  value: string | number;
  label: string;
  gradient?: string;
  icon?: React.ReactNode;
}

export function StatDisplay({ value, label, gradient, icon }: StatDisplayProps) {
  return (
    <div className="flex flex-col gap-2">
      {icon && <div className="text-2xl">{icon}</div>}
      <motion.div
        initial={{ opacity: 0, scale: 0.5 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8, type: 'spring' }}
        className="text-5xl md:text-6xl font-bold font-mono tracking-tight"
        style={{
          background: gradient || colors.starlightText,
          WebkitBackgroundClip: gradient ? 'text' : 'unset',
          WebkitTextFillColor: gradient ? 'transparent' : 'unset',
          backgroundClip: gradient ? 'text' : 'unset',
        }}
      >
        {value}
      </motion.div>
      <p className="text-slate-400 text-sm uppercase tracking-wider font-medium">
        {label}
      </p>
    </div>
  );
}
