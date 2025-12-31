import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';
import { BentoCard } from './BentoCard';
import { bigFour } from '../data/mockData';

export function BigFour() {
  return (
    <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="text-center mb-12">
        <h2 className="text-4xl md:text-5xl font-bold mb-4">The Big Four</h2>
        <p className="text-slate-400 text-lg">
          Celebrating our most active community members
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {bigFour.map((person, index) => (
          <BentoCard key={person.name} glowColor={person.color}>
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="relative"
            >
              <div className="flex items-start gap-6 mb-6">
                <div
                  className="w-20 h-20 rounded-2xl flex items-center justify-center text-4xl"
                  style={{
                    background: `linear-gradient(135deg, ${person.color}40 0%, ${person.color}20 100%)`,
                    border: `2px solid ${person.color}60`,
                  }}
                >
                  {person.avatar}
                </div>

                <div className="flex-1">
                  <h3 className="text-2xl font-bold mb-1">{person.name}</h3>
                  <p className="text-slate-400 text-sm mb-3">{person.role}</p>
                  <div
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-mono"
                    style={{
                      background: `${person.color}20`,
                      border: `1px solid ${person.color}40`,
                      color: person.color,
                    }}
                  >
                    <TrendingUp className="w-3 h-3" />
                    {person.topTopic}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-3xl font-bold font-mono" style={{ color: person.color }}>
                    {person.messages.toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500 uppercase tracking-wider">
                    Messages
                  </div>
                </div>

                <div>
                  <div className="text-3xl font-bold font-mono" style={{ color: person.color }}>
                    {(person.sentiment * 100).toFixed(0)}%
                  </div>
                  <div className="text-sm text-slate-500 uppercase tracking-wider">
                    Positive Impact
                  </div>
                </div>
              </div>

              <div
                className="absolute -top-4 -right-4 w-24 h-24 rounded-full opacity-20 blur-2xl"
                style={{ background: person.color }}
              />
            </motion.div>
          </BentoCard>
        ))}
      </div>
    </section>
  );
}
