import { MessageSquare, Users, Hash, Code } from 'lucide-react';
import { BentoCard } from './BentoCard';
import { StatDisplay } from './StatDisplay';
import { yearStats } from '../data/mockData';
import { gradients, colors } from '../lib/designTokens';

export function KeyMetrics() {
  return (
    <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
      <h2 className="text-4xl md:text-5xl font-bold mb-12 text-center">
        By the Numbers
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <BentoCard glowColor={colors.ai.start}>
          <StatDisplay
            icon={<MessageSquare className="text-purple-400" />}
            value={yearStats.totalMessages.toLocaleString()}
            label="Total Messages"
            gradient={gradients.ai}
          />
        </BentoCard>

        <BentoCard glowColor={colors.management.start}>
          <StatDisplay
            icon={<Users className="text-orange-400" />}
            value={yearStats.activeUsers}
            label="Active Contributors"
            gradient={gradients.management}
          />
        </BentoCard>

        <BentoCard glowColor={colors.question}>
          <StatDisplay
            icon={<Hash className="text-blue-400" />}
            value={yearStats.topicsDiscussed.toLocaleString()}
            label="Topics Discussed"
            gradient={`linear-gradient(135deg, ${colors.question} 0%, ${colors.positive} 100%)`}
          />
        </BentoCard>

        <BentoCard glowColor={colors.positive}>
          <StatDisplay
            icon={<Code className="text-emerald-400" />}
            value={yearStats.codeSnippets.toLocaleString()}
            label="Code Snippets Shared"
            gradient={`linear-gradient(135deg, ${colors.positive} 0%, ${colors.question} 100%)`}
          />
        </BentoCard>
      </div>
    </section>
  );
}
