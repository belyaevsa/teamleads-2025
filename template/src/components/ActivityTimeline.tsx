import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { BentoCard } from './BentoCard';
import { monthlyActivity } from '../data/mockData';
import { colors } from '../lib/designTokens';

export function ActivityTimeline() {
  return (
    <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <BentoCard span="triple" glowColor={colors.ai.start}>
          <h3 className="text-2xl font-bold mb-6">Monthly Activity Pulse</h3>
          <p className="text-slate-400 mb-8">
            Message volume and community sentiment throughout the year
          </p>

          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={monthlyActivity}>
              <defs>
                <linearGradient id="messageGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={colors.ai.start} stopOpacity={0.8} />
                  <stop offset="95%" stopColor={colors.ai.end} stopOpacity={0} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                stroke={colors.glass.border}
                style={{ fontSize: '12px', fontFamily: 'monospace' }}
              />
              <YAxis
                stroke={colors.glass.border}
                style={{ fontSize: '12px', fontFamily: 'monospace' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: colors.glass.panel,
                  border: `1px solid ${colors.glass.border}`,
                  borderRadius: '12px',
                  backdropFilter: 'blur(12px)',
                }}
                labelStyle={{ color: colors.starlightText }}
              />
              <Area
                type="monotone"
                dataKey="messages"
                stroke={colors.ai.start}
                strokeWidth={3}
                fill="url(#messageGradient)"
                style={{
                  filter: `drop-shadow(0 0 8px ${colors.ai.start})`,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </BentoCard>
      </div>
    </section>
  );
}
