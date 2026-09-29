import assert from 'node:assert';
import { parseRoute } from '../src/hooks/useRouteContext';
import { getPageSeo } from '../src/lib/seo';
import { matchesMainSection } from '../src/lib/navigation';

console.log('--- RUNNING GAME SHOWCASE ROUTE ARCHITECTURE TESTS ---');

// Test 1: Correctly classifies /game-showcase as public_games
console.log('Test 1: Correctly classifies /game-showcase as public_games');
const routeCatalog = parseRoute('/game-showcase');
assert.strictEqual(routeCatalog.mode, 'public_games');
assert.strictEqual(routeCatalog.isPublicGameRoute, false);
assert.strictEqual(routeCatalog.isStudioRoute, false);

// Test 2: Correctly classifies /game-showcase/:slug as public_game_detail
console.log('Test 2: Correctly classifies /game-showcase/:slug as public_game_detail');
const catchRoute = parseRoute('/game-showcase/catch-the-brand');
assert.strictEqual(catchRoute.mode, 'public_game_detail');
assert.strictEqual(catchRoute.publicGameSlug, 'catch-the-brand');
assert.strictEqual(catchRoute.isStudioRoute, false);

const memoryRoute = parseRoute('/game-showcase/memory-match');
assert.strictEqual(memoryRoute.mode, 'public_game_detail');
assert.strictEqual(memoryRoute.publicGameSlug, 'memory-match');
assert.strictEqual(memoryRoute.isStudioRoute, false);

const reactionRoute = parseRoute('/game-showcase/reaction-challenge');
assert.strictEqual(reactionRoute.mode, 'public_game_detail');
assert.strictEqual(reactionRoute.publicGameSlug, 'reaction-challenge');
assert.strictEqual(reactionRoute.isStudioRoute, false);

// Test 3: /games is reserved for authenticated Game Studio (mode: studio)
console.log('Test 3: /games is reserved for authenticated Game Studio (mode: studio)');
const routeGames = parseRoute('/games');
assert.strictEqual(routeGames.mode, 'studio', '/games must NOT be public_games; it is Game Studio');
assert.strictEqual(routeGames.isStudioRoute, true);

// Test 4: /games/:gameId is reserved for Game Studio detail (mode: studio)
console.log('Test 4: /games/:gameId is reserved for Game Studio detail (mode: studio)');
const routeGameDetail = parseRoute('/games/catch-brand');
assert.strictEqual(routeGameDetail.mode, 'studio', '/games/:gameId must NOT be public_game_detail');
assert.strictEqual(routeGameDetail.isStudioRoute, true);

// Test 5: /games/:gameId/themes/:themeId/edit is reserved for Theme Editor (mode: studio)
console.log('Test 5: /games/:gameId/themes/:themeId/edit is reserved for Theme Editor (mode: studio)');
const routeThemeEdit = parseRoute('/games/catch-brand/themes/carnival/edit');
assert.strictEqual(routeThemeEdit.mode, 'studio');
assert.strictEqual(routeThemeEdit.isStudioRoute, true);

// Test 6: matchesMainSection for /games matches authenticated game studio routes
console.log('Test 6: matchesMainSection for /games matches authenticated game studio routes');
assert.strictEqual(matchesMainSection('/games', '/games'), true);
assert.strictEqual(matchesMainSection('/games/catch-brand', '/games'), true);
assert.strictEqual(matchesMainSection('/games/catch-brand/themes/carnival/edit', '/games'), true);
assert.strictEqual(matchesMainSection('/game-themes', '/games'), true);
assert.strictEqual(matchesMainSection('/studio', '/games'), true);

// Ensure /game-showcase does NOT falsely activate the studio tab
assert.strictEqual(matchesMainSection('/game-showcase', '/games'), false);
assert.strictEqual(matchesMainSection('/game-showcase/catch-the-brand', '/games'), false);

// Test 7: SEO metadata resolves correctly for /game-showcase routes
console.log('Test 7: SEO metadata resolves correctly for /game-showcase routes');
const catalogSeo = getPageSeo('/game-showcase');
assert.strictEqual(catalogSeo.canonical, 'https://eventgamestudio.com/game-showcase');
assert.ok(catalogSeo.title.includes('Interactive Event Games Catalog'));

const catchSeo = getPageSeo('/game-showcase/catch-the-brand');
assert.strictEqual(catchSeo.canonical, 'https://eventgamestudio.com/game-showcase/catch-the-brand');

const memorySeo = getPageSeo('/game-showcase/memory-match');
assert.strictEqual(memorySeo.canonical, 'https://eventgamestudio.com/game-showcase/memory-match');

const reactionSeo = getPageSeo('/game-showcase/reaction-challenge');
assert.strictEqual(reactionSeo.canonical, 'https://eventgamestudio.com/game-showcase/reaction-challenge');

// Test 8: Aliases resolve properly to canonical /game-showcase pages
console.log('Test 8: Aliases resolve properly to canonical /game-showcase pages');
const catchAlias = getPageSeo('/game-showcase/catch-brand');
assert.strictEqual(catchAlias.canonical, 'https://eventgamestudio.com/game-showcase/catch-the-brand');

const reactionAlias = getPageSeo('/game-showcase/reaction-tap');
assert.strictEqual(reactionAlias.canonical, 'https://eventgamestudio.com/game-showcase/reaction-challenge');

console.log('--- ALL GAME SHOWCASE ROUTE ARCHITECTURE TESTS PASSED SUCCESSFULLY! ---');
