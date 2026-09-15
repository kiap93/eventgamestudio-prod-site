import React from 'react';
import { motion } from 'motion/react';
import { ArrowRight, Sparkles, Gamepad2, CheckCircle2 } from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';

export const LandingFinalCta: React.FC = () => {
  const { isAuthenticated } = useAuth();

  const handleCreateEvent = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login');
    }
  };

  return (
    <section className="relative py-24 md:py-36 bg-slate-950 border-t border-slate-900 overflow-hidden">
      {/* Dynamic Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[900px] h-[450px] bg-gradient-to-r from-amber-500/15 via-emerald-500/10 to-amber-500/15 blur-3xl pointer-events-none rounded-full" />

      {/* Grid Pattern */}
      <div
        className="absolute inset-0 opacity-[0.025] pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)`,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-3xl p-1 bg-gradient-to-b from-amber-500/30 via-slate-800 to-emerald-500/20 shadow-2xl"
        >
          <div className="rounded-[22px] bg-slate-950/95 border border-slate-800/80 px-6 py-12 sm:px-12 sm:py-16 md:py-20 space-y-8">
            {/* Top Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-900 border border-amber-500/30 text-xs font-bold text-amber-400 uppercase tracking-widest shadow-lg shadow-amber-500/5">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Transform Your Next Activation</span>
            </div>

            {/* Main Headline */}
            <h2 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight max-w-3xl mx-auto leading-tight">
              Your Next Event Deserves More Than a Backdrop.
            </h2>

            {/* Supporting Text */}
            <p className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-amber-400 via-amber-300 to-emerald-400 bg-clip-text text-transparent max-w-xl mx-auto">
              Make it playable.
            </p>

            {/* Action CTA Button */}
            <div className="pt-4 flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={handleCreateEvent}
                className="w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-amber-500 via-amber-400 to-amber-500 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-base uppercase tracking-wider rounded-2xl shadow-xl shadow-amber-500/25 hover:shadow-amber-500/40 transition-all transform hover:-translate-y-1 active:translate-y-0 flex items-center justify-center gap-3 group"
              >
                <Gamepad2 className="w-5 h-5" />
                <span>Create Your First Event</span>
                <ArrowRight className="w-5 h-5 transform group-hover:translate-x-1 transition-transform" />
              </button>
            </div>

            {/* Reassurance Features */}
            <div className="pt-6 flex flex-wrap items-center justify-center gap-y-2 gap-x-6 text-xs text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Zero Coding Required
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-amber-400" />
                Instant Stage & Kiosk Setup
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Ready for Live Stages & Kiosks
              </span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};
