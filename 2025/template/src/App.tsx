import { Hero } from './components/Hero';
import { KeyMetrics } from './components/KeyMetrics';
import { BigFour } from './components/BigFour';
import { ActivityTimeline } from './components/ActivityTimeline';
import { TopTopics } from './components/TopTopics';
import { SentimentRing } from './components/SentimentRing';
import { NetworkViz } from './components/NetworkViz';
import { FloatingDock } from './components/FloatingDock';
import { Footer } from './components/Footer';
import { colors } from './lib/designTokens';

function App() {
  return (
    <div
      className="min-h-screen text-slate-100 relative overflow-x-hidden"
      style={{ backgroundColor: colors.deepSpace }}
    >
      <div
        className="fixed inset-0 opacity-5 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(${colors.glass.grid} 1px, transparent 1px),
                           linear-gradient(90deg, ${colors.glass.grid} 1px, transparent 1px)`,
          backgroundSize: '50px 50px',
        }}
      />

      <div id="hero">
        <Hero />
      </div>

      <div id="metrics">
        <KeyMetrics />
      </div>

      <div id="big-four">
        <BigFour />
      </div>

      <ActivityTimeline />

      <TopTopics />

      <div id="sentiment">
        <SentimentRing />
      </div>

      <div id="network">
        <NetworkViz />
      </div>

      <Footer />

      <FloatingDock />
    </div>
  );
}

export default App;
