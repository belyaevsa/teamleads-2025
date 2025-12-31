import { motion } from 'framer-motion';
import { BentoCard } from './BentoCard';
import { topTopics } from '../data/mockData';

export function TopTopics() {
  const maxCount = Math.max(...topTopics.map((t) => t.count));

  return (
    <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
      <BentoCard span="triple">
        <h3 className="text-2xl md:text-3xl font-bold mb-6">Trending Topics</h3>
        <p className="text-slate-400 mb-8">
          What kept our community engaged and innovating
        </p>

        <div className="space-y-6">
          {topTopics.map((topic, index) => {
            const percentage = (topic.count / maxCount) * 100;

            return (
              <motion.div
                key={topic.name}
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-slate-200 font-medium">{topic.name}</span>
                  <span className="font-mono text-sm" style={{ color: topic.color }}>
                    {topic.count.toLocaleString()}
                  </span>
                </div>

                <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    whileInView={{ width: `${percentage}%` }}
                    viewport={{ once: true }}
                    transition={{ duration: 1, delay: index * 0.1 }}
                    className="h-full rounded-full"
                    style={{
                      background: `linear-gradient(90deg, ${topic.color} 0%, ${topic.color}80 100%)`,
                      boxShadow: `0 0 12px ${topic.color}60`,
                    }}
                  />
                </div>
              </motion.div>
            );
          })}
        </div>
      </BentoCard>
    </section>
  );
}
