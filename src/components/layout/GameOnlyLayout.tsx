import React from 'react';
import { GameContainer } from '../GameContainer';

export const GameOnlyLayout: React.FC = () => {
  return (
    <div className="w-screen h-screen bg-slate-950 overflow-hidden flex items-center justify-center p-0 m-0">
      <GameContainer />
    </div>
  );
};
