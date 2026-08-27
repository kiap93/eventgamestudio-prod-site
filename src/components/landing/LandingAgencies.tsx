import React from 'react';
import { motion } from 'motion/react';
import {
  Palette,
  Zap,
  CalendarDays,
  Repeat,
  Sparkles,
  BarChart3,
  Building2,
  CheckCircle2,
} from 'lucide-react';

const benefits = [
  {
    title: 'Brand Every Game',
    description: "Replace logos, background artwork, collectibles, hazards, and color palettes to mirror your client's exact brand identity.",
    icon: Palette,
    accent: 'text-amber-400',
    border: 'border-amber-500/30',
    bgGlow: 'from-amber-500/10 to-transparent',
  },
  {
    title: 'Launch in Minutes',
    description: 'No custom code development or lengthy software cycles. Pick a game, customize theme assets, and produce an event link in under 5 minutes.',
    icon: Zap,
    accent: 'text-emerald-400',
    border: 'border-emerald-500/30',
    bgGlow: 'from-emerald-500/10 to-transparent',
  },
  {
    title: 'Manage Multiple Events',
    description: 'Organize simultaneous roadshows, annual dinners, conferences, and weekend brand activations from a single unified agency workspace.',
    icon: CalendarDays,
    accent: 'text-blue-400',
    border: 'border-blue-500/30',
    bgGlow: 'from-blue-500/10 to-transparent',
  },
  {
    title: 'Reuse Your Games',
    description: 'Retain your custom themes, asset libraries, and setups. Clone and adapt existing high-performing games for future pitches and activations.',
    icon: Repeat,
    accent: 'text-purple-400',
    border: 'border-purple-500/30',
    bgGlow: 'from-purple-500/10 to-transparent',
  },
  {
    title: 'Create Client Experiences',
    description: 'Deliver high-engagement experiential tech that wows corporate stakeholders, VIP guests, and audience crowds.',
    icon: Sparkles,
    accent: 'text-amber-300',
    border: 'border-amber-500/30',
    bgGlow: 'from-amber-500/10 to-transparent',
  },
  {
    title: 'Track Event Results',
    description: 'View real-time gameplay participation, high scores, leaderboards, and guest activity counts throughout your event.',
    icon: BarChart3,
    accent: 'text-cyan-400',
    border: 'border-cyan-500/30',
    bgGlow: 'from-cyan-500/10 to-transparent',
  },
];

export const LandingAgencies: React.FC = () => {
  return (
    <section id="agencies" className="relative scroll-mt-16 sm:scroll-mt-20 py-20 md:py-32 bg-slate-950/80 border-t border-slate-900 overflow-hidden">
      {/* Ambient Lighting */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-b from-amber-500/5 via-emerald-500/5 to-transparent blur-3xl pointer-events-none rounded-full" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-bold text-amber-400 uppercase tracking-widest">
            <Building2 className="w-3.5 h-3.5" />
            <span>Event Production & Agency Ready</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            Built for Event Agencies
          </h2>
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed">
            Everything your agency needs to pitch, customize, and execute interactive game activations for demanding corporate clients.
          </p>
        </div>

        {/* 6 Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 sm:gap-8">
          {benefits.map((b, idx) => {
            const Icon = b.icon;
            return (
              <motion.div
                key={b.title}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.08 }}
                className="group relative rounded-3xl bg-slate-900/80 border border-slate-800/80 p-8 flex flex-col justify-between space-y-6 hover:border-slate-700 hover:bg-slate-900 transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-950"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className={`p-3.5 rounded-2xl bg-slate-950 border ${b.border} ${b.accent} shadow-inner`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <span className="text-[11px] font-mono font-bold text-slate-500 group-hover:text-slate-400">
                      0{idx + 1}
                    </span>
                  </div>

                  <h3 className="text-xl font-bold text-slate-100 group-hover:text-amber-300 transition-colors tracking-tight">
                    {b.title}
                  </h3>

                  <p className="text-sm text-slate-400 leading-relaxed font-normal">
                    {b.description}
                  </p>
                </div>

                <div className="pt-4 border-t border-slate-800/80 flex items-center gap-2 text-xs text-slate-500 font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>Production Tested</span>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
