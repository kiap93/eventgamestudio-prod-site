import {
  Match3Tile,
  SpecialTileType,
  Match3ScoringConfig,
  DEFAULT_MATCH3_SCORING,
  type Match3EngineOptions,
} from './types';

export type { Match3EngineOptions };

export interface ResolveSwapConfig extends Match3EngineOptions {
  tileTypesCount?: number;
  scoring?: Match3ScoringConfig;
  scoringConfig?: Match3ScoringConfig;
  prng?: Prng;
}

export interface MatchGroup {
  tiles: { row: number; col: number }[];
  type: string;
  isSpecialCreate?: SpecialTileType;
  specialRow?: number;
  specialCol?: number;
}

export interface MatchDetectionResult {
  matches: MatchGroup[];
  matchedTileCoords: Set<string>; // 'r,c'
  specialsToCreate: {
    row: number;
    col: number;
    type: string;
    special: SpecialTileType;
  }[];
}

export interface CascadeStep {
  board: Match3Tile[][];
  clearedCoords: { row: number; col: number; special?: SpecialTileType }[];
  specialsCreated: { row: number; col: number; special: SpecialTileType }[];
  scoreGained: number;
  matchesCount: number;
  combo: number;
  clearedTileTypes?: Record<string, number>;
  hazardsClearedCount?: number;
}

export interface SpecialComboDetails {
  comboType: string;
  r1: number;
  c1: number;
  r2: number;
  c2: number;
  centerRow: number;
  centerCol: number;
  bombRow?: number;
  bombCol?: number;
  rocketRow?: number;
  rocketCol?: number;
  colorBombRow?: number;
  colorBombCol?: number;
  clearedRows?: number[];
  clearedCols?: number[];
  targetColor?: string;
  targetSpecial?: SpecialTileType;
  convertedCoords?: { row: number; col: number }[];
}

export interface SpecialComboResult {
  clearedCoords: Set<string>;
  comboType: string;
  details?: SpecialComboDetails;
}

export interface SwapResolution {
  isValid: boolean;
  isSpecialCombo: boolean;
  specialComboType?: string;
  specialComboDetails?: SpecialComboDetails;
  initialBoard: Match3Tile[][];
  steps: CascadeStep[];
  finalBoard: Match3Tile[][];
  totalScore: number;
  totalMatches: number;
  bestCombo: number;
  totalSpecialsCreated: number;
  totalClearedTileTypes?: Record<string, number>;
  totalHazardsCleared?: number;
}

/**
 * Deterministic PRNG helper or Math.random
 */
export type Prng = () => number;

let tileIdCounter = 0;
export function generateTileId(row: number, col: number): string {
  tileIdCounter++;
  return `tile_${row}_${col}_${tileIdCounter}_${Date.now().toString(36)}`;
}

export function getRandomTileType(tileTypesCount: number, prng: Prng = Math.random): string {
  const index = Math.floor(prng() * Math.max(1, tileTypesCount)) + 1;
  const numStr = index.toString().padStart(2, '0');
  return `tile-${numStr}`;
}

/**
 * Creates an initial board with:
 * 1. No matches of minimumMatch or more
 * 2. At least one valid move
 */
export function createInitialBoard(
  rows: number = 8,
  cols: number = 8,
  tileTypesCount: number = 6,
  prng: Prng = Math.random,
  options?: Match3EngineOptions
): Match3Tile[][] {
  const minMatch = Math.max(3, options?.minimumMatch ?? 3);
  const specialsEnabled = options?.specialTilesEnabled ?? true;

  let attempts = 0;
  while (attempts < 500) {
    attempts++;
    const board: Match3Tile[][] = [];

    for (let r = 0; r < rows; r++) {
      board[r] = [];
      for (let c = 0; c < cols; c++) {
        // Pick tile that doesn't create immediate 3 in a row
        const forbiddenTypes = new Set<string>();

        if (c >= 2 && board[r][c - 1]?.type === board[r][c - 2]?.type) {
          forbiddenTypes.add(board[r][c - 1].type);
        }
        if (r >= 2 && board[r - 1]?.[c]?.type === board[r - 2]?.[c]?.type) {
          forbiddenTypes.add(board[r - 1][c].type);
        }

        const candidateTypes: string[] = [];
        for (let i = 1; i <= tileTypesCount; i++) {
          const t = `tile-${i.toString().padStart(2, '0')}`;
          if (!forbiddenTypes.has(t)) {
            candidateTypes.push(t);
          }
        }

        const chosenType = candidateTypes.length > 0
          ? candidateTypes[Math.floor(prng() * candidateTypes.length)]
          : getRandomTileType(tileTypesCount, prng);

        board[r][c] = {
          id: generateTileId(r, c),
          row: r,
          col: c,
          type: chosenType,
        };
      }
    }

    // Verify there are no matches and that at least one valid move exists
    const matchRes = detectMatches(board, minMatch, undefined, specialsEnabled);
    if (matchRes.matches.length === 0 && hasValidMoves(board, options || minMatch, specialsEnabled)) {
      if (options?.hazardConfig?.enabled) {
        injectHazards(board, options.hazardConfig, prng, options);
      }
      return board;
    }
  }

  // Fallback safe board generator: manually inject a known valid move
  const fallback = createRawGrid(rows, cols, tileTypesCount, prng);
  ensureAtLeastOneMove(fallback, tileTypesCount, options);
  if (options?.hazardConfig?.enabled) {
    injectHazards(fallback, options.hazardConfig, prng, options);
  }
  return fallback;
}

/**
 * Injects non-deadlocking hazards into non-adjacent locations on the board.
 */
export function injectHazards(
  board: Match3Tile[][],
  hazardConfig: NonNullable<Match3EngineOptions['hazardConfig']>,
  prng: Prng = Math.random,
  options?: Match3EngineOptions
): void {
  if (!hazardConfig.enabled || hazardConfig.initialCount <= 0) return;
  const rows = board.length;
  const cols = board[0]?.length || 0;
  const count = Math.min(hazardConfig.initialCount, Math.floor((rows * cols) / 4));

  // Find candidate slots that preserve hasValidMoves
  const availableCoords: { r: number; c: number }[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      availableCoords.push({ r, c });
    }
  }

  // Shuffle candidate slots
  for (let i = availableCoords.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [availableCoords[i], availableCoords[j]] = [availableCoords[j], availableCoords[i]];
  }

  let placed = 0;
  for (const { r, c } of availableCoords) {
    if (placed >= count) break;
    const tile = board[r][c];
    if (tile.special) continue;

    // Tentatively assign hazard
    tile.hazard = hazardConfig.type;
    tile.hazardHealth = 1;

    // Verify board still has valid moves
    if (hasValidMoves(board, options)) {
      placed++;
    } else {
      // Revert if it created an impossible board
      tile.hazard = undefined;
      tile.hazardHealth = undefined;
    }
  }
}

function createRawGrid(
  rows: number,
  cols: number,
  tileTypesCount: number,
  prng: Prng
): Match3Tile[][] {
  const board: Match3Tile[][] = [];
  for (let r = 0; r < rows; r++) {
    board[r] = [];
    for (let c = 0; c < cols; c++) {
      const forbidden = new Set<string>();
      if (c >= 2 && board[r][c - 1]?.type === board[r][c - 2]?.type) {
        forbidden.add(board[r][c - 1].type);
      }
      if (r >= 2 && board[r - 1]?.[c]?.type === board[r - 2]?.[c]?.type) {
        forbidden.add(board[r - 1][c].type);
      }
      const candidates: string[] = [];
      for (let i = 1; i <= tileTypesCount; i++) {
        const t = `tile-${i.toString().padStart(2, '0')}`;
        if (!forbidden.has(t)) candidates.push(t);
      }
      const chosen = candidates.length > 0
        ? candidates[Math.floor(prng() * candidates.length)]
        : `tile-01`;

      board[r][c] = {
        id: generateTileId(r, c),
        row: r,
        col: c,
        type: chosen,
      };
    }
  }
  return board;
}

function ensureAtLeastOneMove(
  board: Match3Tile[][],
  tileTypesCount: number,
  options?: Match3EngineOptions
) {
  const minMatch = Math.max(3, options?.minimumMatch ?? 3);
  const specialsEnabled = options?.specialTilesEnabled ?? true;
  if (hasValidMoves(board, options || minMatch, specialsEnabled)) return;

  const rows = board.length;
  const cols = board[0]?.length || 0;
  if (rows >= 2 && cols >= minMatch) {
    const targetType = 'tile-01';
    const otherType = 'tile-02';
    for (let c = 0; c < minMatch - 1; c++) {
      board[0][c].type = targetType;
    }
    board[0][minMatch - 1].type = otherType;
    board[1][minMatch - 1].type = targetType;
  }
}

/**
 * Deep clones the board tiles
 */
export function cloneBoard(board: Match3Tile[][]): Match3Tile[][] {
  return board.map((row) =>
    row.map((tile) => ({
      ...tile,
    }))
  );
}

/**
 * Detects all horizontal and vertical matches on the board.
 * Identifies special tile creations (when specialTilesEnabled is true):
 * - 5 or more in a line -> Color Bomb
 * - T or L shape -> Bomb
 * - 4 in a line -> Horizontal or Vertical Rocket
 */
export function detectMatches(
  board: Match3Tile[][],
  minimumMatch: number = 3,
  preferredSpecialAnchor?: { row: number; col: number },
  specialTilesEnabled: boolean = true
): MatchDetectionResult {
  const rows = board.length;
  if (rows === 0) return { matches: [], matchedTileCoords: new Set(), specialsToCreate: [] };
  const cols = board[0].length;
  const effectiveMinMatch = Math.max(3, minimumMatch || 3);

  const horizontalMatches: { row: number; startCol: number; endCol: number; type: string }[] = [];
  const verticalMatches: { col: number; startRow: number; endRow: number; type: string }[] = [];

  // 1. Detect horizontal runs
  for (let r = 0; r < rows; r++) {
    let currentType = '';
    let matchStart = 0;
    let matchLen = 0;

    for (let c = 0; c < cols; c++) {
      const tile = board[r][c];
      const type = tile?.type;

      if (type && type === currentType) {
        matchLen++;
      } else {
        if (matchLen >= effectiveMinMatch && currentType) {
          horizontalMatches.push({
            row: r,
            startCol: matchStart,
            endCol: c - 1,
            type: currentType,
          });
        }
        currentType = type || '';
        matchStart = c;
        matchLen = 1;
      }
    }
    if (matchLen >= effectiveMinMatch && currentType) {
      horizontalMatches.push({
        row: r,
        startCol: matchStart,
        endCol: cols - 1,
        type: currentType,
      });
    }
  }

  // 2. Detect vertical runs
  for (let c = 0; c < cols; c++) {
    let currentType = '';
    let matchStart = 0;
    let matchLen = 0;

    for (let r = 0; r < rows; r++) {
      const tile = board[r][c];
      const type = tile?.type;

      if (type && type === currentType) {
        matchLen++;
      } else {
        if (matchLen >= effectiveMinMatch && currentType) {
          verticalMatches.push({
            col: c,
            startRow: matchStart,
            endRow: r - 1,
            type: currentType,
          });
        }
        currentType = type || '';
        matchStart = r;
        matchLen = 1;
      }
    }
    if (matchLen >= effectiveMinMatch && currentType) {
      verticalMatches.push({
        col: c,
        startRow: matchStart,
        endRow: rows - 1,
        type: currentType,
      });
    }
  }

  const matchedTileCoords = new Set<string>();
  const matches: MatchGroup[] = [];
  const specialsToCreate: { row: number; col: number; type: string; special: SpecialTileType }[] = [];

  // Track intersections between horizontal and vertical matches of the same type for T/L shapes
  const usedHoriz = new Set<number>();
  const usedVert = new Set<number>();

  // Check for T / L intersections
  for (let hIdx = 0; hIdx < horizontalMatches.length; hIdx++) {
    const h = horizontalMatches[hIdx];
    for (let vIdx = 0; vIdx < verticalMatches.length; vIdx++) {
      const v = verticalMatches[vIdx];

      if (h.type === v.type && h.row >= v.startRow && h.row <= v.endRow && v.col >= h.startCol && v.col <= h.endCol) {
        // Shared intersection tile at (h.row, v.col)
        usedHoriz.add(hIdx);
        usedVert.add(vIdx);

        const groupCoords: { row: number; col: number }[] = [];
        const seen = new Set<string>();

        for (let c = h.startCol; c <= h.endCol; c++) {
          const key = `${h.row},${c}`;
          if (!seen.has(key)) {
            seen.add(key);
            groupCoords.push({ row: h.row, col: c });
            matchedTileCoords.add(key);
          }
        }
        for (let r = v.startRow; r <= v.endRow; r++) {
          const key = `${r},${v.col}`;
          if (!seen.has(key)) {
            seen.add(key);
            groupCoords.push({ row: r, col: v.col });
            matchedTileCoords.add(key);
          }
        }

        // T/L shape creates Bomb only if specialTilesEnabled is true
        const specialCoord = preferredSpecialAnchor && seen.has(`${preferredSpecialAnchor.row},${preferredSpecialAnchor.col}`)
          ? preferredSpecialAnchor
          : { row: h.row, col: v.col };

        const isSpecialCreate: SpecialTileType = specialTilesEnabled ? 'bomb' : null;

        matches.push({
          tiles: groupCoords,
          type: h.type,
          isSpecialCreate,
          specialRow: isSpecialCreate ? specialCoord.row : undefined,
          specialCol: isSpecialCreate ? specialCoord.col : undefined,
        });

        if (specialTilesEnabled) {
          specialsToCreate.push({
            row: specialCoord.row,
            col: specialCoord.col,
            type: h.type,
            special: 'bomb',
          });
        }
      }
    }
  }

  // Process remaining horizontal matches
  for (let hIdx = 0; hIdx < horizontalMatches.length; hIdx++) {
    if (usedHoriz.has(hIdx)) continue;
    const h = horizontalMatches[hIdx];
    const groupCoords: { row: number; col: number }[] = [];
    const len = h.endCol - h.startCol + 1;

    for (let c = h.startCol; c <= h.endCol; c++) {
      groupCoords.push({ row: h.row, col: c });
      matchedTileCoords.add(`${h.row},${c}`);
    }

    let specialType: SpecialTileType = null;
    let anchorCol = Math.floor((h.startCol + h.endCol) / 2);

    if (preferredSpecialAnchor && preferredSpecialAnchor.row === h.row && preferredSpecialAnchor.col >= h.startCol && preferredSpecialAnchor.col <= h.endCol) {
      anchorCol = preferredSpecialAnchor.col;
    }

    if (specialTilesEnabled) {
      if (len >= 5) {
        specialType = 'color-bomb';
      } else if (len === 4) {
        // 4 horizontal -> Horizontal Rocket
        specialType = 'rocket-horizontal';
      }
    }

    matches.push({
      tiles: groupCoords,
      type: h.type,
      isSpecialCreate: specialType,
      specialRow: specialType ? h.row : undefined,
      specialCol: specialType ? anchorCol : undefined,
    });

    if (specialType) {
      specialsToCreate.push({
        row: h.row,
        col: anchorCol,
        type: h.type,
        special: specialType,
      });
    }
  }

  // Process remaining vertical matches
  for (let vIdx = 0; vIdx < verticalMatches.length; vIdx++) {
    if (usedVert.has(vIdx)) continue;
    const v = verticalMatches[vIdx];
    const groupCoords: { row: number; col: number }[] = [];
    const len = v.endRow - v.startRow + 1;

    for (let r = v.startRow; r <= v.endRow; r++) {
      groupCoords.push({ row: r, col: v.col });
      matchedTileCoords.add(`${r},${v.col}`);
    }

    let specialType: SpecialTileType = null;
    let anchorRow = Math.floor((v.startRow + v.endRow) / 2);

    if (preferredSpecialAnchor && preferredSpecialAnchor.col === v.col && preferredSpecialAnchor.row >= v.startRow && preferredSpecialAnchor.row <= v.endRow) {
      anchorRow = preferredSpecialAnchor.row;
    }

    if (specialTilesEnabled) {
      if (len >= 5) {
        specialType = 'color-bomb';
      } else if (len === 4) {
        // 4 vertical -> Vertical Rocket
        specialType = 'rocket-vertical';
      }
    }

    matches.push({
      tiles: groupCoords,
      type: v.type,
      isSpecialCreate: specialType,
      specialRow: specialType ? anchorRow : undefined,
      specialCol: specialType ? v.col : undefined,
    });

    if (specialType) {
      specialsToCreate.push({
        row: anchorRow,
        col: v.col,
        type: v.type,
        special: specialType,
      });
    }
  }

  return {
    matches,
    matchedTileCoords,
    specialsToCreate,
  };
}

/**
 * Checks if two tiles are adjacent (horizontally or vertically, not diagonally).
 */
export function areAdjacent(r1: number, c1: number, r2: number, c2: number): boolean {
  return Math.abs(r1 - r2) + Math.abs(c1 - c2) === 1;
}

/**
 * Checks if swapping tiles at (r1, c1) and (r2, c2) is a valid move.
 * Valid if:
 * 1. Adjacent
 * 2. Either tile is a Color Bomb (Color Bomb + anything is valid when special tiles enabled)
 * 3. Both tiles are special (Special + Special combo is valid when special tiles enabled)
 * 4. The swap results in at least one match of minimumMatch or more
 */
export function isValidSwap(
  board: Match3Tile[][],
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  minimumMatchOrOptions: number | Match3EngineOptions = 3,
  specialTilesEnabledOption: boolean = true
): boolean {
  if (!areAdjacent(r1, c1, r2, c2)) return false;

  const t1 = board[r1]?.[c1];
  const t2 = board[r2]?.[c2];
  if (!t1 || !t2) return false;

  let minimumMatch = 3;
  let specialTilesEnabled = true;
  let hazardConfig: NonNullable<Match3EngineOptions['hazardConfig']> | undefined;

  if (typeof minimumMatchOrOptions === 'object' && minimumMatchOrOptions !== null) {
    if (minimumMatchOrOptions.minimumMatch !== undefined) {
      minimumMatch = minimumMatchOrOptions.minimumMatch;
    }
    if (minimumMatchOrOptions.specialTilesEnabled !== undefined) {
      specialTilesEnabled = minimumMatchOrOptions.specialTilesEnabled;
    }
    if (minimumMatchOrOptions.hazardConfig !== undefined) {
      hazardConfig = minimumMatchOrOptions.hazardConfig;
    }
  } else if (typeof minimumMatchOrOptions === 'number') {
    minimumMatch = minimumMatchOrOptions;
    if (typeof specialTilesEnabledOption === 'boolean') {
      specialTilesEnabled = specialTilesEnabledOption;
    }
  }

  // Hazard swap restrictions:
  // If clearCondition is 'adjacent_match', obstacles (stone, ice, bubble) are immovable and cannot be swapped.
  // If clearCondition is 'direct_match', the hazard encases/marks a tile that CAN be swapped to form direct line matches!
  if (hazardConfig?.enabled) {
    if (hazardConfig.clearCondition === 'adjacent_match') {
      if (t1.hazard || t2.hazard) {
        return false;
      }
    }
  } else {
    // Default safe fallback if hazardConfig is not provided: stone and ice block swaps
    if (t1.hazard === 'stone' || t2.hazard === 'stone' || t1.hazard === 'ice' || t2.hazard === 'ice') {
      return false;
    }
  }

  if (specialTilesEnabled) {
    // Color Bomb swapped with any tile is valid
    if (t1.special === 'color-bomb' || t2.special === 'color-bomb') {
      return true;
    }

    // Any two special tiles swapped with each other is valid
    if (t1.special && t2.special) {
      return true;
    }
  }

  // Trial swap
  const trial = cloneBoard(board);
  const tempType = trial[r1][c1].type;
  trial[r1][c1].type = trial[r2][c2].type;
  trial[r2][c2].type = tempType;

  const tempSpecial = trial[r1][c1].special;
  trial[r1][c1].special = trial[r2][c2].special;
  trial[r2][c2].special = tempSpecial;

  const res = detectMatches(trial, minimumMatch, undefined, specialTilesEnabled);
  return res.matches.length > 0;
}

/**
 * Checks if the board contains at least one valid swap move.
 */
export function hasValidMoves(
  board: Match3Tile[][],
  minimumMatchOrOptions: number | Match3EngineOptions = 3,
  specialTilesEnabledOption: boolean = true
): boolean {
  const rows = board.length;
  if (rows === 0) return false;
  const cols = board[0].length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      // Check right swap
      if (c + 1 < cols && isValidSwap(board, r, c, r, c + 1, minimumMatchOrOptions, specialTilesEnabledOption)) {
        return true;
      }
      // Check down swap
      if (r + 1 < rows && isValidSwap(board, r, c, r + 1, c, minimumMatchOrOptions, specialTilesEnabledOption)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Shuffles the board tiles when no valid moves remain,
 * preserving special tile identities while randomizing positions.
 * Guarantees no initial matches and at least one valid move.
 */
export function shuffleBoard(
  board: Match3Tile[][],
  tileTypesCount: number = 6,
  prng: Prng = Math.random,
  options?: Match3EngineOptions
): Match3Tile[][] {
  const minMatch = Math.max(3, options?.minimumMatch ?? 3);
  const specialsEnabled = options?.specialTilesEnabled ?? true;
  const rows = board.length;
  const cols = board[0].length;
  const flatTiles: {
    type: string;
    special?: SpecialTileType;
    hazard?: Match3Tile['hazard'];
    hazardHealth?: number;
  }[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      flatTiles.push({
        type: board[r][c].type,
        special: specialsEnabled ? board[r][c].special : undefined,
        hazard: board[r][c].hazard,
        hazardHealth: board[r][c].hazardHealth,
      });
    }
  }

  let attempts = 0;
  while (attempts < 100) {
    attempts++;
    // Fisher-Yates shuffle
    for (let i = flatTiles.length - 1; i > 0; i--) {
      const j = Math.floor(prng() * (i + 1));
      [flatTiles[i], flatTiles[j]] = [flatTiles[j], flatTiles[i]];
    }

    const candidate: Match3Tile[][] = [];
    let idx = 0;
    for (let r = 0; r < rows; r++) {
      candidate[r] = [];
      for (let c = 0; c < cols; c++) {
        candidate[r][c] = {
          id: board[r][c].id,
          row: r,
          col: c,
          type: flatTiles[idx].type,
          special: flatTiles[idx].special,
          hazard: flatTiles[idx].hazard,
          hazardHealth: flatTiles[idx].hazardHealth,
        };
        idx++;
      }
    }

    const matchRes = detectMatches(candidate, minMatch, undefined, specialsEnabled);
    if (matchRes.matches.length === 0 && hasValidMoves(candidate, options || minMatch, specialsEnabled)) {
      return candidate;
    }
  }

  // Fallback: create fresh initial board
  return createInitialBoard(rows, cols, tileTypesCount, prng, options);
}

/**
 * Detonates special tile effects and returns all affected tile coordinates.
 */
export function resolveSpecialDetonation(
  board: Match3Tile[][],
  row: number,
  col: number,
  specialType: SpecialTileType,
  targetColor?: string
): Set<string> {
  const rows = board.length;
  const cols = board[0].length;
  const cleared = new Set<string>();

  const queue: { r: number; c: number; type: SpecialTileType; color?: string }[] = [
    { r: row, c: col, type: specialType, color: targetColor },
  ];

  while (queue.length > 0) {
    const item = queue.shift()!;
    const key = `${item.r},${item.c}`;
    cleared.add(key);

    if (item.type === 'rocket-horizontal') {
      // Clear entire row
      for (let c = 0; c < cols; c++) {
        const k = `${item.r},${c}`;
        if (!cleared.has(k)) {
          cleared.add(k);
          const t = board[item.r][c];
          if (t?.special && t.special !== 'rocket-horizontal') {
            queue.push({ r: item.r, c, type: t.special, color: t.type });
          }
        }
      }
    } else if (item.type === 'rocket-vertical') {
      // Clear entire column
      for (let r = 0; r < rows; r++) {
        const k = `${r},${item.c}`;
        if (!cleared.has(k)) {
          cleared.add(k);
          const t = board[r][item.c];
          if (t?.special && t.special !== 'rocket-vertical') {
            queue.push({ r, c: item.c, type: t.special, color: t.type });
          }
        }
      }
    } else if (item.type === 'bomb') {
      // Clear 3x3 surrounding
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr = item.r + dr;
          const nc = item.c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            const k = `${nr},${nc}`;
            if (!cleared.has(k)) {
              cleared.add(k);
              const t = board[nr][nc];
              if (t?.special && t.special !== 'bomb') {
                queue.push({ r: nr, c: nc, type: t.special, color: t.type });
              }
            }
          }
        }
      }
    } else if (item.type === 'color-bomb') {
      // Clear all tiles of targetColor
      const colorToClear = item.color || board[item.r]?.[item.c]?.type || 'tile-01';
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c]?.type === colorToClear) {
            const k = `${r},${c}`;
            if (!cleared.has(k)) {
              cleared.add(k);
              const t = board[r][c];
              if (t?.special && t.special !== 'color-bomb') {
                queue.push({ r, c, type: t.special, color: t.type });
              }
            }
          }
        }
      }
    }
  }

  return cleared;
}

/**
 * Handles special tile combination swap effects (e.g. Color Bomb + Bomb, Rocket + Rocket).
 */
export function resolveSpecialCombination(
  board: Match3Tile[][],
  r1: number,
  c1: number,
  r2: number,
  c2: number
): SpecialComboResult {
  const rows = board.length;
  const cols = board[0].length;
  const t1 = board[r1][c1];
  const t2 = board[r2][c2];
  const s1 = t1.special;
  const s2 = t2.special;
  const cleared = new Set<string>();

  cleared.add(`${r1},${c1}`);
  cleared.add(`${r2},${c2}`);

  // 1. Color Bomb + Color Bomb: Clears whole board!
  if (s1 === 'color-bomb' && s2 === 'color-bomb') {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        cleared.add(`${r},${c}`);
      }
    }
    return {
      clearedCoords: cleared,
      comboType: 'double-color-bomb',
      details: { comboType: 'double-color-bomb', r1, c1, r2, c2, centerRow: r2, centerCol: c2 },
    };
  }

  // 2. Color Bomb + Rocket / Bomb
  if (s1 === 'color-bomb' || s2 === 'color-bomb') {
    const specialPartner = s1 === 'color-bomb' ? s2 : s1;
    const partnerTile = s1 === 'color-bomb' ? t2 : t1;
    const targetColor = partnerTile.type;

    // Color Bomb + Horizontal Rocket: Converts all eligible tiles of targetColor to Horizontal Rockets and detonates all affected rows
    if (specialPartner === 'rocket-horizontal') {
      const convertedCoords: { row: number; col: number }[] = [];
      const clearedRowsSet = new Set<number>();
      clearedRowsSet.add(r1);
      clearedRowsSet.add(r2);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c].type === targetColor) {
            convertedCoords.push({ row: r, col: c });
            clearedRowsSet.add(r);
          }
        }
      }

      for (const r of clearedRowsSet) {
        for (let c = 0; c < cols; c++) {
          cleared.add(`${r},${c}`);
        }
      }

      const clearedRows = Array.from(clearedRowsSet).sort((a, b) => a - b);
      return {
        clearedCoords: cleared,
        comboType: 'color-bomb-rocket-horizontal',
        details: {
          comboType: 'color-bomb-rocket-horizontal',
          r1,
          c1,
          r2,
          c2,
          centerRow: r2,
          centerCol: c2,
          rocketRow: s1 === 'rocket-horizontal' ? r1 : r2,
          rocketCol: s1 === 'rocket-horizontal' ? c1 : c2,
          colorBombRow: s1 === 'color-bomb' ? r1 : r2,
          colorBombCol: s1 === 'color-bomb' ? c1 : c2,
          targetColor,
          targetSpecial: 'rocket-horizontal',
          convertedCoords,
          clearedRows,
        },
      };
    }

    // Color Bomb + Vertical Rocket: Converts all eligible tiles of targetColor to Vertical Rockets and detonates all affected columns
    if (specialPartner === 'rocket-vertical') {
      const convertedCoords: { row: number; col: number }[] = [];
      const clearedColsSet = new Set<number>();
      clearedColsSet.add(c1);
      clearedColsSet.add(c2);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c].type === targetColor) {
            convertedCoords.push({ row: r, col: c });
            clearedColsSet.add(c);
          }
        }
      }

      for (const c of clearedColsSet) {
        for (let r = 0; r < rows; r++) {
          cleared.add(`${r},${c}`);
        }
      }

      const clearedCols = Array.from(clearedColsSet).sort((a, b) => a - b);
      return {
        clearedCoords: cleared,
        comboType: 'color-bomb-rocket-vertical',
        details: {
          comboType: 'color-bomb-rocket-vertical',
          r1,
          c1,
          r2,
          c2,
          centerRow: r2,
          centerCol: c2,
          rocketRow: s1 === 'rocket-vertical' ? r1 : r2,
          rocketCol: s1 === 'rocket-vertical' ? c1 : c2,
          colorBombRow: s1 === 'color-bomb' ? r1 : r2,
          colorBombCol: s1 === 'color-bomb' ? c1 : c2,
          targetColor,
          targetSpecial: 'rocket-vertical',
          convertedCoords,
          clearedCols,
        },
      };
    }

    // Color Bomb + Explosive Bomb: Converts all eligible tiles of targetColor to Bombs and detonates (3x3 explosions + mega explosion)
    if (specialPartner === 'bomb') {
      const convertedCoords: { row: number; col: number }[] = [];

      // Primary mega explosion: 3x3 blast centered around both swapped combination positions
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const nr1 = r1 + dr;
          const nc1 = c1 + dc;
          if (nr1 >= 0 && nr1 < rows && nc1 >= 0 && nc1 < cols) cleared.add(`${nr1},${nc1}`);
          const nr2 = r2 + dr;
          const nc2 = c2 + dc;
          if (nr2 >= 0 && nr2 < rows && nc2 >= 0 && nc2 < cols) cleared.add(`${nr2},${nc2}`);
        }
      }

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (board[r][c].type === targetColor) {
            convertedCoords.push({ row: r, col: c });
            for (let dr = -1; dr <= 1; dr++) {
              for (let dc = -1; dc <= 1; dc++) {
                const nr = r + dr;
                const nc = c + dc;
                if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
                  cleared.add(`${nr},${nc}`);
                }
              }
            }
          }
        }
      }
      return {
        clearedCoords: cleared,
        comboType: 'color-bomb-bomb',
        details: {
          comboType: 'color-bomb-bomb',
          r1,
          c1,
          r2,
          c2,
          centerRow: r2,
          centerCol: c2,
          bombRow: s1 === 'bomb' ? r1 : r2,
          bombCol: s1 === 'bomb' ? c1 : c2,
          colorBombRow: s1 === 'color-bomb' ? r1 : r2,
          colorBombCol: s1 === 'color-bomb' ? c1 : c2,
          targetColor,
          targetSpecial: 'bomb',
          convertedCoords,
        },
      };
    }

    // Color Bomb + normal tile: Clears all of normal tile's color
    const colorToClear = s1 === 'color-bomb' ? t2.type : t1.type;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (board[r][c].type === colorToClear) {
          cleared.add(`${r},${c}`);
        }
      }
    }
    return {
      clearedCoords: cleared,
      comboType: 'color-bomb-normal',
      details: { comboType: 'color-bomb-normal', r1, c1, r2, c2, centerRow: r2, centerCol: c2 },
    };
  }

  // 3. Rocket + Rocket: Clears both row and column in a cross
  if (
    (s1 === 'rocket-horizontal' || s1 === 'rocket-vertical') &&
    (s2 === 'rocket-horizontal' || s2 === 'rocket-vertical')
  ) {
    const centerRow = r2;
    const centerCol = c2;
    for (let c = 0; c < cols; c++) cleared.add(`${centerRow},${c}`);
    for (let r = 0; r < rows; r++) cleared.add(`${r},${centerCol}`);
    return {
      clearedCoords: cleared,
      comboType: 'double-rocket',
      details: { comboType: 'double-rocket', r1, c1, r2, c2, centerRow, centerCol },
    };
  }

  // 4. Rocket + Bomb: Clears 3 rows and 3 columns centered on Bomb's resolved position!
  if (
    (s1 === 'bomb' && (s2 === 'rocket-horizontal' || s2 === 'rocket-vertical')) ||
    (s2 === 'bomb' && (s1 === 'rocket-horizontal' || s1 === 'rocket-vertical'))
  ) {
    const bombRow = s1 === 'bomb' ? r1 : r2;
    const bombCol = s1 === 'bomb' ? c1 : c2;
    const rocketRow = s1 === 'bomb' ? r2 : r1;
    const rocketCol = s1 === 'bomb' ? c2 : c1;
    const centerRow = bombRow;
    const centerCol = bombCol;
    const clearedRows: number[] = [];
    const clearedCols: number[] = [];

    for (let dr = -1; dr <= 1; dr++) {
      const r = centerRow + dr;
      if (r >= 0 && r < rows) {
        clearedRows.push(r);
        for (let c = 0; c < cols; c++) cleared.add(`${r},${c}`);
      }
    }
    for (let dc = -1; dc <= 1; dc++) {
      const c = centerCol + dc;
      if (c >= 0 && c < cols) {
        clearedCols.push(c);
        for (let r = 0; r < rows; r++) cleared.add(`${r},${c}`);
      }
    }

    // Resolve any chained specials caught in the blast area (excluding the two swapped tiles)
    const toCheck = Array.from(cleared);
    for (const key of toCheck) {
      const [r, c] = key.split(',').map(Number);
      if ((r === r1 && c === c1) || (r === r2 && c === c2)) continue;
      const t = board[r]?.[c];
      if (t?.special) {
        const chained = resolveSpecialDetonation(board, r, c, t.special, t.type);
        chained.forEach((k) => cleared.add(k));
      }
    }

    return {
      clearedCoords: cleared,
      comboType: 'rocket-bomb',
      details: {
        comboType: 'rocket-bomb',
        r1,
        c1,
        r2,
        c2,
        centerRow,
        centerCol,
        bombRow,
        bombCol,
        rocketRow,
        rocketCol,
        clearedRows,
        clearedCols,
      },
    };
  }

  // 5. Bomb + Bomb: 5x5 explosion
  if (s1 === 'bomb' && s2 === 'bomb') {
    const centerRow = r2;
    const centerCol = c2;
    for (let dr = -2; dr <= 2; dr++) {
      for (let dc = -2; dc <= 2; dc++) {
        const nr = centerRow + dr;
        const nc = centerCol + dc;
        if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
          cleared.add(`${nr},${nc}`);
        }
      }
    }
    return {
      clearedCoords: cleared,
      comboType: 'double-bomb',
      details: { comboType: 'double-bomb', r1, c1, r2, c2, centerRow, centerCol },
    };
  }

  return { clearedCoords: cleared, comboType: 'unknown-combo' };
}

/**
 * Calculates score for a cascade step based on scoring config and combo multiplier.
 */
export function calculateStepScore(
  clearedCount: number,
  matches: MatchGroup[],
  specialsCreated: { special: SpecialTileType }[],
  combo: number,
  config: Match3ScoringConfig = DEFAULT_MATCH3_SCORING,
  comboEnabled: boolean = true,
  hazardsClearedCount: number = 0,
  hazardPointsPenalty: number = 0
): number {
  let baseScore = 0;

  for (const m of matches) {
    const len = m.tiles.length;
    if (len === 3) {
      baseScore += config.match3Points;
    } else if (len === 4) {
      baseScore += config.match4Points;
    } else if (len >= 5) {
      baseScore += config.match5Points;
    }
  }

  // If tiles were cleared by special detonations or cascades
  if (matches.length === 0 && clearedCount > 0) {
    baseScore += clearedCount * 30;
  }

  for (const s of specialsCreated) {
    if (s.special === 'rocket-horizontal' || s.special === 'rocket-vertical') {
      baseScore += config.rocketPoints;
    } else if (s.special === 'bomb') {
      baseScore += config.bombPoints;
    } else if (s.special === 'color-bomb') {
      baseScore += config.colorBombPoints;
    }
  }

  if (hazardsClearedCount > 0 && hazardPointsPenalty > 0) {
    baseScore = Math.max(0, baseScore - hazardsClearedCount * hazardPointsPenalty);
  }

  const effectiveCombo = comboEnabled ? combo : 1;
  const multiplierKey = Math.min(5, Math.max(1, effectiveCombo));
  const multiplier = comboEnabled ? (config.comboMultipliers[multiplierKey] || 1.0) : 1.0;

  return Math.round(baseScore * multiplier);
}

/**
 * Applies gravity and spawns new tiles at the top.
 */
export function applyGravityAndSpawn(
  board: Match3Tile[][],
  clearedCoords: Set<string>,
  specialsToCreate: { row: number; col: number; type: string; special: SpecialTileType }[],
  tileTypesCount: number = 6,
  prng: Prng = Math.random
): Match3Tile[][] {
  const rows = board.length;
  const cols = board[0].length;
  const nextBoard: Match3Tile[][] = [];

  for (let r = 0; r < rows; r++) {
    nextBoard[r] = new Array(cols);
  }

  // Create a lookup for specials to create
  const specialMap = new Map<string, { type: string; special: SpecialTileType }>();
  for (const s of specialsToCreate) {
    specialMap.set(`${s.row},${s.col}`, { type: s.type, special: s.special });
  }

  // For each column, collapse non-cleared tiles downwards
  for (let c = 0; c < cols; c++) {
    const remainingTiles: Match3Tile[] = [];

    for (let r = 0; r < rows; r++) {
      const key = `${r},${c}`;
      if (specialMap.has(key)) {
        // This tile transformed into a special tile
        const spec = specialMap.get(key)!;
        remainingTiles.push({
          id: generateTileId(r, c),
          row: r,
          col: c,
          type: spec.type,
          special: spec.special,
        });
      } else if (!clearedCoords.has(key)) {
        remainingTiles.push(board[r][c]);
      }
    }

    const emptySlots = rows - remainingTiles.length;

    // Fill new tiles at the top
    for (let r = 0; r < emptySlots; r++) {
      nextBoard[r][c] = {
        id: generateTileId(r, c),
        row: r,
        col: c,
        type: getRandomTileType(tileTypesCount, prng),
        isNew: true,
      };
    }

    // Place remaining tiles below
    for (let i = 0; i < remainingTiles.length; i++) {
      const r = emptySlots + i;
      nextBoard[r][c] = {
        ...remainingTiles[i],
        row: r,
        col: c,
      };
    }
  }

  return nextBoard;
}

/**
 * Executes a full player swap and resolves all cascading matches until board is stable.
 * Fully honours minimumMatch, comboEnabled, specialTilesEnabled, and cascadeEnabled settings.
 */
export function resolveSwap(
  currentBoard: Match3Tile[][],
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  tileTypesCountOrConfig: number | ResolveSwapConfig = 6,
  scoringConfig: Match3ScoringConfig = DEFAULT_MATCH3_SCORING,
  prng: Prng = Math.random,
  options?: Match3EngineOptions
): SwapResolution {
  let tileTypesCount = 6;
  let scoring: Match3ScoringConfig = DEFAULT_MATCH3_SCORING;
  let activePrng: Prng = Math.random;
  let minimumMatch = 3;
  let comboEnabled = true;
  let specialTilesEnabled = true;
  let cascadeEnabled = true;
  let hazardConfig = options?.hazardConfig;

  if (typeof tileTypesCountOrConfig === 'object' && tileTypesCountOrConfig !== null) {
    if (tileTypesCountOrConfig.tileTypesCount !== undefined) tileTypesCount = tileTypesCountOrConfig.tileTypesCount;
    if (tileTypesCountOrConfig.scoring !== undefined) scoring = tileTypesCountOrConfig.scoring;
    else if (tileTypesCountOrConfig.scoringConfig !== undefined) scoring = tileTypesCountOrConfig.scoringConfig;
    if (tileTypesCountOrConfig.prng !== undefined) activePrng = tileTypesCountOrConfig.prng;
    if (tileTypesCountOrConfig.minimumMatch !== undefined) minimumMatch = Math.max(3, tileTypesCountOrConfig.minimumMatch);
    if (tileTypesCountOrConfig.comboEnabled !== undefined) comboEnabled = Boolean(tileTypesCountOrConfig.comboEnabled);
    if (tileTypesCountOrConfig.specialTilesEnabled !== undefined) specialTilesEnabled = Boolean(tileTypesCountOrConfig.specialTilesEnabled);
    if (tileTypesCountOrConfig.cascadeEnabled !== undefined) cascadeEnabled = Boolean(tileTypesCountOrConfig.cascadeEnabled);
    if (tileTypesCountOrConfig.hazardConfig !== undefined) hazardConfig = tileTypesCountOrConfig.hazardConfig;
  } else {
    if (typeof tileTypesCountOrConfig === 'number') tileTypesCount = tileTypesCountOrConfig;
    if (scoringConfig) scoring = scoringConfig;
    if (prng) activePrng = prng;
    if (options) {
      if (options.minimumMatch !== undefined) minimumMatch = Math.max(3, options.minimumMatch);
      if (options.comboEnabled !== undefined) comboEnabled = Boolean(options.comboEnabled);
      if (options.specialTilesEnabled !== undefined) specialTilesEnabled = Boolean(options.specialTilesEnabled);
      if (options.cascadeEnabled !== undefined) cascadeEnabled = Boolean(options.cascadeEnabled);
      if (options.hazardConfig !== undefined) hazardConfig = options.hazardConfig;
    }
  }

  const engineOptions: Match3EngineOptions = {
    minimumMatch,
    comboEnabled,
    specialTilesEnabled,
    cascadeEnabled,
    hazardConfig,
  };

  if (!isValidSwap(currentBoard, r1, c1, r2, c2, engineOptions)) {
    return {
      isValid: false,
      isSpecialCombo: false,
      initialBoard: currentBoard,
      steps: [],
      finalBoard: currentBoard,
      totalScore: 0,
      totalMatches: 0,
      bestCombo: 0,
      totalSpecialsCreated: 0,
      totalClearedTileTypes: {},
      totalHazardsCleared: 0,
    };
  }

  const initialBoard = cloneBoard(currentBoard);

  // Perform swap
  const tempTile1 = { ...initialBoard[r1][c1] };
  const tempTile2 = { ...initialBoard[r2][c2] };
  initialBoard[r1][c1] = { ...tempTile2, row: r1, col: c1 };
  initialBoard[r2][c2] = { ...tempTile1, row: r2, col: c2 };

  let activeBoard = cloneBoard(initialBoard);
  const steps: CascadeStep[] = [];
  let currentCombo = 0;
  let totalScore = 0;
  let totalMatches = 0;
  let bestCombo = 0;
  let totalSpecialsCreated = 0;
  const totalClearedTileTypes: Record<string, number> = {};
  let totalHazardsCleared = 0;

  // Check special combination swap first (only when specialTilesEnabled is true)
  const isSpecialSwap = Boolean(
    specialTilesEnabled &&
    ((tempTile1.special && tempTile2.special) ||
      tempTile1.special === 'color-bomb' ||
      tempTile2.special === 'color-bomb')
  );

  let specialComboResult: SpecialComboResult | undefined;

  if (isSpecialSwap && (tempTile1.special || tempTile2.special)) {
    currentCombo = 1;
    bestCombo = 1;
    specialComboResult = resolveSpecialCombination(initialBoard, r1, c1, r2, c2);
    const comboRes = specialComboResult;

    const stepCleared: { row: number; col: number; special?: SpecialTileType }[] = [];
    const stepTileTypes: Record<string, number> = {};
    let stepHazardsCleared = 0;

    comboRes.clearedCoords.forEach((key) => {
      const [r, c] = key.split(',').map(Number);
      const tile = activeBoard[r]?.[c];
      if (tile) {
        if (!tile.hazard) {
          stepTileTypes[tile.type] = (stepTileTypes[tile.type] || 0) + 1;
          totalClearedTileTypes[tile.type] = (totalClearedTileTypes[tile.type] || 0) + 1;
        } else {
          stepHazardsCleared++;
          totalHazardsCleared++;
        }
      }
      stepCleared.push({ row: r, col: c, special: tile?.special });
    });

    const stepScore = calculateStepScore(
      comboRes.clearedCoords.size,
      [],
      [],
      currentCombo,
      scoring,
      comboEnabled,
      stepHazardsCleared,
      hazardConfig?.pointsPenalty || 0
    );
    totalScore += stepScore;
    totalMatches += 1;

    activeBoard = applyGravityAndSpawn(
      activeBoard,
      comboRes.clearedCoords,
      [],
      tileTypesCount,
      activePrng
    );

    steps.push({
      board: cloneBoard(activeBoard),
      clearedCoords: stepCleared,
      specialsCreated: [],
      scoreGained: stepScore,
      matchesCount: 1,
      combo: currentCombo,
      clearedTileTypes: stepTileTypes,
      hazardsClearedCount: stepHazardsCleared,
    });
  }

  // Cascade loop:
  // When cascadeEnabled is false, do not cascade beyond the initial match resulting from the player's move.
  const maxIterations = !cascadeEnabled ? (isSpecialSwap ? 0 : 1) : 20;
  let cascadeIteration = 0;
  while (cascadeIteration < maxIterations) {
    cascadeIteration++;
    // Preferred anchor for special tile creation is the player swapped tile in step 1
    const anchor = cascadeIteration === 1 ? { row: r2, col: c2 } : undefined;
    const matchRes = detectMatches(activeBoard, minimumMatch, anchor, specialTilesEnabled);

    if (matchRes.matches.length === 0) {
      break;
    }

    if (comboEnabled) {
      currentCombo++;
    } else {
      currentCombo = 1;
    }
    bestCombo = Math.max(bestCombo, currentCombo);
    totalMatches += matchRes.matches.length;
    totalSpecialsCreated += matchRes.specialsToCreate.length;

    // Expand cleared coordinates with any special detonations triggered by matched tiles
    const allClearedCoords = new Set<string>(matchRes.matchedTileCoords);
    if (specialTilesEnabled) {
      for (const key of matchRes.matchedTileCoords) {
        const [r, c] = key.split(',').map(Number);
        const t = activeBoard[r]?.[c];
        if (t?.special) {
          const specialDetonations = resolveSpecialDetonation(activeBoard, r, c, t.special, t.type);
          specialDetonations.forEach((k) => allClearedCoords.add(k));
        }
      }
    }

    // Check adjacent tiles of cleared coords (matches and special blasts) to damage/clear obstacle hazards if clearCondition is adjacent_match
    if (hazardConfig?.enabled && hazardConfig.clearCondition !== 'direct_match') {
      const coordsToCheck = new Set<string>([...matchRes.matchedTileCoords, ...allClearedCoords]);
      for (const key of coordsToCheck) {
        const [mr, mc] = key.split(',').map(Number);
        const neighbors = [
          { r: mr - 1, c: mc },
          { r: mr + 1, c: mc },
          { r: mr, c: mc - 1 },
          { r: mr, c: mc + 1 },
        ];
        for (const n of neighbors) {
          if (n.r >= 0 && n.r < activeBoard.length && n.c >= 0 && n.c < (activeBoard[0]?.length || 0)) {
            const neighborTile = activeBoard[n.r]?.[n.c];
            if (neighborTile?.hazard) {
              allClearedCoords.add(`${n.r},${n.c}`);
            }
          }
        }
      }
    }

    // Do NOT delete the coordinate where a new special tile is being created
    for (const s of matchRes.specialsToCreate) {
      allClearedCoords.delete(`${s.row},${s.col}`);
    }

    const stepCleared: { row: number; col: number; special?: SpecialTileType }[] = [];
    const stepTileTypes: Record<string, number> = {};
    let stepHazardsCleared = 0;

    allClearedCoords.forEach((key) => {
      const [r, c] = key.split(',').map(Number);
      const tile = activeBoard[r]?.[c];
      if (tile) {
        if (!tile.hazard) {
          stepTileTypes[tile.type] = (stepTileTypes[tile.type] || 0) + 1;
          totalClearedTileTypes[tile.type] = (totalClearedTileTypes[tile.type] || 0) + 1;
        } else {
          stepHazardsCleared++;
          totalHazardsCleared++;
        }
      }
      stepCleared.push({ row: r, col: c, special: tile?.special });
    });

    const stepScore = calculateStepScore(
      allClearedCoords.size,
      matchRes.matches,
      matchRes.specialsToCreate,
      currentCombo,
      scoring,
      comboEnabled,
      stepHazardsCleared,
      hazardConfig?.pointsPenalty || 0
    );
    totalScore += stepScore;

    activeBoard = applyGravityAndSpawn(
      activeBoard,
      allClearedCoords,
      matchRes.specialsToCreate,
      tileTypesCount,
      activePrng
    );

    steps.push({
      board: cloneBoard(activeBoard),
      clearedCoords: stepCleared,
      specialsCreated: matchRes.specialsToCreate.map((s) => ({
        row: s.row,
        col: s.col,
        special: s.special,
      })),
      scoreGained: stepScore,
      matchesCount: matchRes.matches.length,
      combo: currentCombo,
      clearedTileTypes: stepTileTypes,
      hazardsClearedCount: stepHazardsCleared,
    });
  }

  return {
    isValid: true,
    isSpecialCombo: isSpecialSwap,
    specialComboType: isSpecialSwap ? (specialComboResult?.comboType || 'special') : undefined,
    specialComboDetails: isSpecialSwap ? specialComboResult?.details : undefined,
    initialBoard,
    steps,
    finalBoard: activeBoard,
    totalScore,
    totalMatches,
    bestCombo,
    totalSpecialsCreated,
    totalClearedTileTypes,
    totalHazardsCleared,
  };
}
