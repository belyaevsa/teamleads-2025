import { motion } from 'framer-motion';
import { Heart, Sparkles } from 'lucide-react';
import { colors, gradients } from '../lib/designTokens';

export function Footer() {
  return (
    <footer className="relative py-20 px-4 md:px-8 overflow-hidden">
      <motion.div
        className="absolute inset-0 opacity-10"
        style={{
          background: gradients.aurora,
        }}
        animate={{
          backgroundPosition: ['0% 0%', '100% 100%'],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          repeatType: 'reverse',
        }}
      />

      <div className="relative z-10 max-w-7xl mx-auto text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mb-8"
        >
          <h3 className="text-3xl md:text-4xl font-bold mb-4">Here's to 2025</h3>
          <p className="text-slate-400 text-lg max-w-2xl mx-auto">
            Thank you to every contributor who made this year extraordinary. Your insights,
            questions, and code shaped the future together.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="flex items-center justify-center gap-2 mb-8"
        >
          <span className="text-slate-500">Made with</span>
          <Heart className="w-5 h-5 text-red-400 fill-red-400" />
          <span className="text-slate-500">and</span>
          <Sparkles className="w-5 h-5 text-purple-400" />
        </motion.div>

        <div className="text-sm text-slate-600 font-mono">
          Digital Garden of Intelligence © 2025
        </div>
      </div>
    </footer>
  );
}
