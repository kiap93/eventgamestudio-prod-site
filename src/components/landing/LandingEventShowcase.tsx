import React from 'react';
import { motion } from 'motion/react';
import {
  Tv,
  QrCode,
  Smartphone,
  Trophy,
  Sparkles,
  Camera,
  Layers,
  ArrowRight,
  Upload,
  Coins,
  Radio,
  Users,
  Play,
  Monitor,
  Zap,
} from 'lucide-react';
import { navigateTo } from '../../hooks/useRouteContext';
import { useAuth } from '../../context/AuthContext';

export const LandingEventShowcase: React.FC = () => {
  const { isAuthenticated } = useAuth();

  const handleLaunchEvent = () => {
    if (isAuthenticated) {
      navigateTo('/events');
    } else {
      navigateTo('/login');
    }
  };

  return (
    <section id="event-showcase" className="relative py-20 md:py-32 bg-slate-950 border-t border-slate-900 overflow-hidden">
      {/* Background Accent Mesh */}
      <div className="absolute top-1/3 right-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-4 mb-16 md:mb-20">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-black text-amber-400 uppercase tracking-widest">
            <Camera className="w-3.5 h-3.5" />
            <span>Event Production Formats</span>
          </div>
          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.1]">
            See It In Action
          </h2>
          <p className="text-base sm:text-lg text-slate-400 leading-relaxed font-normal">
            From 50-foot LED arena screens to compact booth touch totems and crowd smartphones, EventGameStudio powers live venue engagement at any scale.
          </p>
        </div>

        {/* 3 Core Production Formats Visual Grid - Large Immersive Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-16 sm:mb-20">
          {/* Format 1: Giant Mainstage LED Screens */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="rounded-3xl bg-slate-900/90 border border-slate-800/90 overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all group shadow-2xl"
          >
            {/* Visual Stage Simulation Header */}
            <div className="p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-amber-500/30 text-amber-400 shadow-inner group-hover:scale-105 transition-transform">
                  <Tv className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-slate-950 text-amber-400 border border-slate-800 flex items-center gap-1.5">
                  <Radio className="w-3 h-3 animate-pulse text-rose-500" />
                  16:9 4K Mainstage
                </span>
              </div>

              <h3 className="text-2xl font-bold text-slate-100 group-hover:text-amber-300 transition-colors tracking-tight">
                Mainstage LED & Video Walls
              </h3>

              <p className="text-sm text-slate-400 leading-relaxed font-normal">
                Connect any AV laptop via HDMI to beam high-FPS arcade action directly onto convention center video walls and stage backdrops.
              </p>
            </div>

            {/* Immersive Visual Screen Representation */}
            <div className="px-6 pb-6">
              <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden relative aspect-[16/9] shadow-inner group/screen">
                {/* Stage Background with Lighting Rig */}
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-700 group-hover/screen:scale-105"
                  style={{ backgroundImage: `url('/public/assets/background.png')` }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-slate-950/60" />

                {/* Stage Lighting Flares */}
                <div className="absolute -top-10 left-1/4 w-32 h-32 bg-amber-500/30 blur-2xl rounded-full" />
                <div className="absolute -top-10 right-1/4 w-32 h-32 bg-emerald-500/30 blur-2xl rounded-full" />

                {/* Stage Overlay Graphics */}
                <div className="absolute inset-0 p-3.5 flex flex-col justify-between">
                  <div className="flex items-center justify-between">
                    <span className="px-2 py-0.5 rounded bg-rose-500 text-white font-black text-[9px] uppercase tracking-wider flex items-center gap-1">
                      <Zap className="w-2.5 h-2.5" /> STAGE LIVE
                    </span>
                    <span className="text-[10px] font-mono text-amber-300 font-bold bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
                      HALL A • AUDIENCE: 800+
                    </span>
                  </div>

                  <div className="text-center space-y-1 my-auto">
                    <div className="text-xs uppercase font-black text-amber-400 tracking-widest">
                      FINALS ARENA MATCH
                    </div>
                    <div className="text-xl sm:text-2xl font-black text-white font-mono drop-shadow-md">
                      18,450 PTS
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-slate-300 bg-slate-950/80 backdrop-blur-sm p-1.5 rounded-lg border border-slate-800">
                    <span className="font-semibold text-emerald-400">Zero Latency Browser Mode</span>
                    <span className="text-slate-400">60 FPS Sync</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Format 2: Booth Touchscreen Kiosks */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="rounded-3xl bg-slate-900/90 border border-slate-800/90 overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all group shadow-2xl"
          >
            {/* Visual Header */}
            <div className="p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-emerald-500/30 text-emerald-400 shadow-inner group-hover:scale-105 transition-transform">
                  <Layers className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-slate-950 text-emerald-400 border border-slate-800">
                  Touch Kiosks & iPads
                </span>
              </div>

              <h3 className="text-2xl font-bold text-slate-100 group-hover:text-emerald-300 transition-colors tracking-tight">
                Exhibition Booth Kiosks
              </h3>

              <p className="text-sm text-slate-400 leading-relaxed font-normal">
                Deploy 20-second fast-throughput games on vertical touch totems or iPads to stop aisle traffic and gather qualified brand leads.
              </p>
            </div>

            {/* Immersive Visual Screen Representation */}
            <div className="px-6 pb-6">
              <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden relative aspect-[16/9] shadow-inner group/screen">
                <div className="absolute inset-0 bg-gradient-to-br from-emerald-950/40 via-slate-950 to-slate-950" />

                {/* Vertical Kiosk Totem Mock Inside Card */}
                <div className="absolute inset-0 flex items-center justify-center p-3">
                  <div className="w-44 h-full bg-slate-900 rounded-xl border border-slate-700 p-2 flex flex-col justify-between shadow-2xl">
                    <div className="flex items-center justify-between text-[8px] text-slate-400 border-b border-slate-800 pb-1">
                      <span className="font-bold text-emerald-400">TOUCH TOTEM #03</span>
                      <span>AUTO-RESET</span>
                    </div>

                    <div className="text-center space-y-1 my-auto">
                      <span className="text-[9px] font-bold text-slate-300 block">TAP TO START</span>
                      <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/20 border border-emerald-500/50 flex items-center justify-center text-emerald-400 text-xs font-bold animate-bounce">
                        20s
                      </div>
                      <span className="text-[8px] text-amber-300 font-mono block">Average Queue: 12s</span>
                    </div>

                    <div className="text-[8px] bg-slate-950 p-1 rounded text-center text-slate-400 font-mono">
                      Over 450 plays / day
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Format 3: Mobile Web QR Crowd Play */}
          <motion.div
            initial={{ opacity: 0, y: 25 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="rounded-3xl bg-slate-900/90 border border-slate-800/90 overflow-hidden flex flex-col justify-between hover:border-slate-700 transition-all group shadow-2xl"
          >
            {/* Visual Header */}
            <div className="p-6 sm:p-8 space-y-4">
              <div className="flex items-center justify-between">
                <div className="p-3.5 rounded-2xl bg-slate-950 border border-cyan-500/30 text-cyan-400 shadow-inner group-hover:scale-105 transition-transform">
                  <QrCode className="w-6 h-6" />
                </div>
                <span className="text-[11px] font-mono font-bold px-3 py-1 rounded-full bg-slate-950 text-cyan-400 border border-slate-800">
                  Instant Smartphone QR
                </span>
              </div>

              <h3 className="text-2xl font-bold text-slate-100 group-hover:text-cyan-300 transition-colors tracking-tight">
                Crowd QR Code Play
              </h3>

              <p className="text-sm text-slate-400 leading-relaxed font-normal">
                Print QR codes on badges, flyers, or stage screens. Attendees scan with their camera to play in Safari or Chrome without installing apps.
              </p>
            </div>

            {/* Immersive Visual Screen Representation */}
            <div className="px-6 pb-6">
              <div className="rounded-2xl bg-slate-950 border border-slate-800 overflow-hidden relative aspect-[16/9] shadow-inner group/screen">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-950/40 via-slate-950 to-slate-950" />

                {/* Smartphone Mock */}
                <div className="absolute inset-0 flex items-center justify-center p-3">
                  <div className="w-48 h-full bg-slate-900 rounded-2xl border border-slate-700 p-2.5 flex flex-col justify-between shadow-2xl">
                    <div className="flex items-center justify-between text-[8px] text-slate-400 border-b border-slate-800 pb-1">
                      <span className="font-bold text-cyan-400">MOBILE BROWSER</span>
                      <span className="text-emerald-400">ONLINE</span>
                    </div>

                    <div className="flex items-center justify-center gap-3 my-auto">
                      <div className="p-2 bg-white rounded-lg shadow">
                        <QrCode className="w-9 h-9 text-slate-950" />
                      </div>
                      <div className="text-left">
                        <div className="text-[10px] font-black text-white">SCAN & PLAY</div>
                        <div className="text-[8px] text-slate-400">iOS & Android</div>
                        <div className="text-[8px] text-amber-400 font-bold mt-0.5">No App Store</div>
                      </div>
                    </div>

                    <div className="text-[8px] bg-slate-950 p-1 rounded text-center text-slate-400 font-mono">
                      Direct Web Link Activated
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>

        {/* Authentic Community Event Showcase Area */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="rounded-3xl bg-gradient-to-b from-slate-900 to-slate-950 border border-slate-800 p-8 sm:p-12 text-center max-w-4xl mx-auto space-y-6 shadow-2xl"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 mx-auto shadow-inner">
            <Camera className="w-7 h-7" />
          </div>

          <div className="space-y-2 max-w-lg mx-auto">
            <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Community Event Showcase
            </h3>
            <p className="text-sm text-slate-400 leading-relaxed font-normal">
              Have you run an event with EventGameStudio? Share photos or video of your stage setup and booth activation to get featured on the platform.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 pt-1">
            <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-amber-300 font-medium shadow-inner">
              <Coins className="w-4 h-4 text-amber-400" />
              <span>Earn RM 50 platform credits on approved showcase review</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              onClick={handleLaunchEvent}
              className="min-h-[44px] px-8 py-3.5 bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl shadow-lg shadow-amber-500/20 transition-all inline-flex items-center gap-2 cursor-pointer hover:-translate-y-0.5"
            >
              <span>Create Event & Submit Showcase</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

