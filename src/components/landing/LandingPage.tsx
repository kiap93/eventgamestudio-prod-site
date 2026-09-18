import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ArrowUp } from 'lucide-react';
import { LandingHeader } from './LandingHeader';
import { LandingHero } from './LandingHero';
import { LandingHowItWorks } from './LandingHowItWorks';
import { LandingGameShowcase } from './LandingGameShowcase';
import { LandingBrandYourGame } from './LandingBrandYourGame';
import { LandingEventShowcase } from './LandingEventShowcase';
import { LandingAgencies } from './LandingAgencies';
import { LandingFinalCta } from './LandingFinalCta';
import { LandingFooter } from './LandingFooter';
import { GameCatalogModal } from '../studio/GameCatalogModal';
import { LandingDemoModal } from './LandingDemoModal';

export const LandingPage: React.FC = () => {
  const [catalogModalOpen, setCatalogModalOpen] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [demoGameId, setDemoGameId] = useState<string>('catch-brand');
  const [showBackToTop, setShowBackToTop] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY || document.documentElement.scrollTop;
      setShowBackToTop(scrollPosition > 300);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  const scrollToHeader = () => {
    const header = document.getElementById('landing-header');
    if (header) {
      header.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleLaunchDemo = (gameId: string = 'catch-brand') => {
    setDemoGameId(gameId);
    setDemoModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-white text-slate-900 flex flex-col font-sans selection:bg-amber-100 selection:text-amber-900">
      {/* Sticky Global Brand Header */}
      <LandingHeader onExploreGames={() => setCatalogModalOpen(true)} />

      {/* 7 Core Landing Sections in Exact Requested Sequence */}
      <main className="flex-1">
        {/* 1. HERO */}
        <LandingHero onExploreGames={() => setCatalogModalOpen(true)} />

        {/* 2. HOW IT WORKS */}
        <LandingHowItWorks />

        {/* 3. GAME SHOWCASE */}
        <LandingGameShowcase
          onTryDemo={(id) => handleLaunchDemo(id)}
          onExploreAll={() => setCatalogModalOpen(true)}
        />

        {/* 4. BRAND YOUR GAME */}
        <LandingBrandYourGame />

        {/* 5. EVENT SHOWCASE */}
        <LandingEventShowcase />

        {/* 6. BUILT FOR EVENT AGENCIES */}
        <LandingAgencies />

        {/* 7. FINAL CTA */}
        <LandingFinalCta />
      </main>

      {/* Global Landing Footer */}
      <LandingFooter />

      {/* Landing Page Back-to-Top Floating Button */}
      <AnimatePresence>
        {showBackToTop && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 16 }}
            transition={{ duration: 0.2 }}
            onClick={scrollToHeader}
            aria-label="Back to top of landing page"
            className="fixed bottom-6 right-6 z-40 p-3 rounded-2xl bg-white hover:bg-slate-50 text-slate-700 hover:text-amber-600 border border-slate-200 hover:border-amber-400 shadow-xl shadow-slate-900/10 backdrop-blur-md cursor-pointer transition-all active:scale-95 group focus:outline-none focus:ring-2 focus:ring-amber-400/50"
          >
            <ArrowUp className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Full Game Catalog Modal */}
      <GameCatalogModal
        isOpen={catalogModalOpen}
        onClose={() => setCatalogModalOpen(false)}
      />

      {/* Live Interactive Game Demo Runner */}
      <LandingDemoModal
        isOpen={demoModalOpen}
        onClose={() => setDemoModalOpen(false)}
        gameTitle="Catch the Brand (Carnival Fiesta)"
      />
    </div>
  );
};
