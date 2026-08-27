import React, { useState } from 'react';
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

  const handleLaunchDemo = (gameId: string = 'catch-brand') => {
    setDemoGameId(gameId);
    setDemoModalOpen(true);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
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
