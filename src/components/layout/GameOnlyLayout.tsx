import React from 'react';
import { GameShell } from '../shell/GameShell';
import { useRouteContext } from '../../hooks/useRouteContext';

export const GameOnlyLayout: React.FC = () => {
  const { gameType } = useRouteContext();

  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden flex items-center justify-center p-0 m-0">
      <GameShell gameType={gameType} />
    </div>
  );
};
