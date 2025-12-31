import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { BentoCard } from './BentoCard';
import { sentimentBreakdown } from '../data/mockData';
import { colors } from '../lib/designTokens';

export function SentimentRing() {
  return (
    <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <BentoCard glowColor={colors.positive}>
          <h3 className="text-2xl font-bold mb-4">Community Sentiment</h3>
          <p className="text-slate-400 mb-8">
            The emotional pulse of our conversations
          </p>

          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={sentimentBreakdown}
                cx="50%"
                cy="50%"
                innerRadius={70}
                outerRadius={110}
                paddingAngle={5}
                dataKey="value"
                strokeWidth={0}
              >
                {sentimentBreakdown.map((entry) => (
                  <Cell
                    key={entry.name}
                    fill={entry.color}
                    style={{
                      filter: `drop-shadow(0 0 8px ${entry.color})`,
                    }}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.glass.panel,
                  border: `1px solid ${colors.glass.border}`,
                  borderRadius: '12px',
                  backdropFilter: 'blur(12px)',
                }}
              />
            </PieChart>
          </ResponsiveContainer>

          <div className="flex justify-center gap-6 mt-6">
            {sentimentBreakdown.map((item) => (
              <div key={item.name} className="text-center">
                <div className="flex items-center gap-2 mb-1">
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="text-sm text-slate-400">{item.name}</span>
                </div>
                <div className="text-2xl font-bold font-mono" style={{ color: item.color }}>
                  {item.value}%
                </div>
              </div>
            ))}
          </div>
        </BentoCard>

        <BentoCard glowColor={colors.telegramBlue}>
          <h3 className="text-2xl font-bold mb-4">Key Insights</h3>

          <div className="space-y-6">
            <div className="p-4 rounded-xl" style={{ background: 'rgba(16, 185, 129, 0.1)' }}>
              <div className="text-3xl font-bold text-emerald-400 mb-2">68%</div>
              <p className="text-slate-300">
                of conversations carried a positive tone, reflecting strong team morale and
                collaborative spirit
              </p>
            </div>

            <div className="p-4 rounded-xl" style={{ background: 'rgba(59, 130, 246, 0.1)' }}>
              <div className="text-3xl font-bold text-blue-400 mb-2">24%</div>
              <p className="text-slate-300">
                neutral discussions focused on technical problem-solving and knowledge sharing
              </p>
            </div>

            <div className="p-4 rounded-xl" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
              <div className="text-3xl font-bold text-red-400 mb-2">8%</div>
              <p className="text-slate-300">
                constructive concerns that led to process improvements and better practices
              </p>
            </div>
          </div>
        </BentoCard>
      </div>
    </section>
  );
}
