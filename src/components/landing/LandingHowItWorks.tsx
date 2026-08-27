import React from 'react';
import { motion } from 'motion/react';
import {
  Gamepad2,
  Palette,
  CalendarDays,
  QrCode,
  ArrowRight,
  Sparkles,
  CheckCircle,
} from 'lucide-react';

const steps = [
  {
    number: '01',
    title: 'Choose a Game',
    description: 'Start with an event-ready interactive game.',
    icon: Gamepad2,
    badge: 'Step 01',
    highlight: 'Instant Selection',
    visualDetails: ['High-throughput arcade mechanics', 'Touch, mouse, motion & keyboard', 'Optimized for event time limits'],
    accentColor: 'from-amber-500/20 to-amber-500/5',
    borderColor: 'border-amber-500/30',
    iconColor: 'text-amber-400',
  },
  {
    number: '02',
    title: 'Customize',
    description: "Add your client's branding, colors, artwork and theme.",
    icon: Palette,
    badge: 'Step 02',
    highlight: 'Full Brand Control',
    visualDetails: ['Custom logos & banner artwork', 'Catchable brand products', 'Branded start & game-over UI'],
    accentColor: 'from-emerald-500/20 to-emerald-500/5',
    borderColor: 'border-emerald-500/30',
    iconColor: 'text-emerald-400',
  },
  {
    number: '03',
    title: 'Create Your Event',
    description: 'Set your event details and generate a dedicated event experience.',
    icon: CalendarDays,
    badge: 'Step 03',
    highlight: 'Dedicated URL & QR',
    visualDetails: ['Unique event security token', 'Custom event dates & duration', 'Live spectator leaderboard'],
    accentColor: 'from-blue-500/20 to-blue-500/5',
    borderColor: 'border-blue-500/30',
    iconColor: 'text-blue-400',
  },
  {
    number: '04',
    title: 'Let Guests Play',
    description: 'Launch the game at your event and let guests interact.',
    icon: QrCode,
    badge: 'Step 04',
    highlight: 'Zero App Downloads',
    visualDetails: ['Scan QR on mobile or play on kiosks', 'Real-time high score competition', 'Instant crowd engagement'],
    accentColor: 'from-purple-500/20 to-purple-500/5',
    borderColor: 'border-purple-500/30',
    iconColor: 'text-purple-400',
  },
];

export const LandingHowItWorks: React.FC = () => {
  return (
    <section id="how-it-works" className="relative scroll-mt-16 sm:scroll-mt-20 py-20 md:py-32 bg-slate-950/80 border-t border-slate-900 overflow-hidden">
      {/* Background Accent Mesh */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-amber-500/5 via-emerald-500/5 to-transparent blur-3xl pointer-events-none rounded-full" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-bold text-amber-400 uppercase tracking-widest">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Simple 4-Step Process</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight">
            From Idea to Interactive Event
          </h2>
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed">
            Transform brand activations and corporate gatherings into engaging digital competitions in minutes.
          </p>
        </div>

        {/* Four Steps Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.1 }}
                className={`group relative rounded-3xl bg-gradient-to-b ${step.accentColor} p-px transition-all hover:-translate-y-1 hover:shadow-2xl hover:shadow-slate-900`}
              >
                {/* Step Card Container */}
                <div className="h-full rounded-[23px] bg-slate-900/90 border border-slate-800/80 p-6 flex flex-col justify-between space-y-6 group-hover:border-slate-700 transition-colors">
                  {/* Top Row: Step Number & Icon */}
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-2xl font-black text-slate-600 group-hover:text-amber-400/80 transition-colors font-mono">
                        {step.number}
                      </span>
                      <div className={`p-3 rounded-2xl bg-slate-950 border ${step.borderColor} ${step.iconColor} shadow-inner`}>
                        <Icon className="w-5 h-5" />
                      </div>
                    </div>

                    <div>
                      <h3 className="text-xl font-bold text-slate-100 group-hover:text-amber-300 transition-colors tracking-tight">
                        {step.title}
                      </h3>
                      <p className="mt-2 text-sm text-slate-400 leading-relaxed font-normal">
                        {step.description}
                      </p>
                    </div>
                  </div>

                  {/* Bullet points for event managers */}
                  <div className="pt-4 border-t border-slate-800/80 space-y-2">
                    {step.visualDetails.map((detail, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs text-slate-400">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        <span>{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
