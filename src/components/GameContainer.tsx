import React from 'react';
import { GameShell, GameShellProps } from './shell/GameShell';

/**
 * GameContainer wraps GameShell for backward compatibility.
 * Can be used directly or configured with a specific gameType.
 */
export const GameContainer: React.FC<GameShellProps> = (props) => {
  return <GameShell {...props} />;
};

export default GameContainer;
