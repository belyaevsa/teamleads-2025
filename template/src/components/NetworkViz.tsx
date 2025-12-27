import { motion } from 'framer-motion';
import { BentoCard } from './BentoCard';
import { colors } from '../lib/designTokens';

const nodes = [
  { id: 1, x: 50, y: 50, size: 20, color: colors.ai.start, label: 'AI/ML' },
  { id: 2, x: 20, y: 30, size: 16, color: colors.management.start, label: 'Management' },
  { id: 3, x: 80, y: 35, size: 14, color: colors.question, label: 'Architecture' },
  { id: 4, x: 35, y: 70, size: 12, color: colors.positive, label: 'DevOps' },
  { id: 5, x: 65, y: 75, size: 12, color: colors.negative, label: 'Security' },
  { id: 6, x: 15, y: 60, size: 10, color: colors.telegramBlue, label: 'Testing' },
  { id: 7, x: 85, y: 65, size: 10, color: '#8B5CF6', label: 'Frontend' },
  { id: 8, x: 45, y: 25, size: 8, color: '#EC4899', label: 'Backend' },
];

const connections = [
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 6],
  [3, 5],
  [3, 7],
  [4, 5],
  [1, 8],
];

export function NetworkViz() {
  return (
    <section className="py-20 px-4 md:px-8 max-w-7xl mx-auto">
      <BentoCard span="triple" glowColor={colors.ai.start}>
        <h3 className="text-2xl md:text-3xl font-bold mb-4">Community Constellation</h3>
        <p className="text-slate-400 mb-8">
          How topics interconnect and influence each other
        </p>

        <div className="relative w-full h-96 rounded-2xl overflow-hidden" style={{ background: 'rgba(15, 23, 42, 0.5)' }}>
          <svg className="absolute inset-0 w-full h-full">
            {connections.map(([from, to], index) => {
              const fromNode = nodes.find((n) => n.id === from);
              const toNode = nodes.find((n) => n.id === to);
              if (!fromNode || !toNode) return null;

              return (
                <motion.line
                  key={`${from}-${to}`}
                  x1={`${fromNode.x}%`}
                  y1={`${fromNode.y}%`}
                  x2={`${toNode.x}%`}
                  y2={`${toNode.y}%`}
                  stroke="rgba(255, 255, 255, 0.1)"
                  strokeWidth="1"
                  initial={{ pathLength: 0, opacity: 0 }}
                  whileInView={{ pathLength: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: index * 0.1 }}
                />
              );
            })}

            {nodes.map((node, index) => (
              <g key={node.id}>
                <motion.circle
                  cx={`${node.x}%`}
                  cy={`${node.y}%`}
                  r={node.size}
                  fill={node.color}
                  initial={{ scale: 0, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 0.3 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  style={{ filter: `blur(8px)` }}
                />

                <motion.circle
                  cx={`${node.x}%`}
                  cy={`${node.y}%`}
                  r={node.size / 2}
                  fill={node.color}
                  initial={{ scale: 0, opacity: 0 }}
                  whileInView={{ scale: 1, opacity: 1 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                  whileHover={{ scale: 1.5 }}
                  style={{ cursor: 'pointer' }}
                />

                <motion.text
                  x={`${node.x}%`}
                  y={`${node.y}%`}
                  dy={node.size + 15}
                  textAnchor="middle"
                  fill={colors.starlightText}
                  fontSize="12"
                  fontFamily="monospace"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 0.8 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 + 0.5 }}
                >
                  {node.label}
                </motion.text>
              </g>
            ))}
          </svg>
        </div>

        <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-4">
          {nodes.slice(0, 4).map((node) => (
            <div key={node.id} className="flex items-center gap-3">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: node.color, boxShadow: `0 0 8px ${node.color}` }}
              />
              <span className="text-sm text-slate-400">{node.label}</span>
            </div>
          ))}
        </div>
      </BentoCard>
    </section>
  );
}
