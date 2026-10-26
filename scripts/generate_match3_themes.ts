import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

// Base directory for Match-3 theme assets
const BASE_DIR = path.resolve(process.cwd(), 'public/assets/games/match-3/themes');

interface CharacterDef {
  filename: string;
  name: string;
  svg: string;
}

interface ThemeDef {
  id: string;
  name: string;
  characters: CharacterDef[];
}

// Helpers for SVG construction
const svgWrap = (content: string) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">
  <defs>
    <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="4" stdDeviation="3" flood-opacity="0.25"/>
    </filter>
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="2" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
    <linearGradient id="shine" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.4"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <g filter="url(#shadow)">
    ${content}
  </g>
</svg>`;

export const THEME_DEFINITIONS: ThemeDef[] = [
  // 1. CUTE ANIMALS
  {
    id: 'cute-animals',
    name: 'Cute Animals',
    characters: [
      {
        filename: 'bear.png',
        name: 'Caramel Bear',
        svg: svgWrap(`
          <!-- Bear Ears -->
          <circle cx="34" cy="34" r="16" fill="#8D5B36" />
          <circle cx="34" cy="34" r="9" fill="#E8A87C" />
          <circle cx="94" cy="34" r="16" fill="#8D5B36" />
          <circle cx="94" cy="34" r="9" fill="#E8A87C" />
          <!-- Head -->
          <circle cx="64" cy="68" r="44" fill="#A76D42" />
          <ellipse cx="64" cy="50" rx="30" ry="16" fill="url(#shine)" />
          <!-- Snout -->
          <ellipse cx="64" cy="78" rx="22" ry="16" fill="#FCE5CD" />
          <ellipse cx="64" cy="72" rx="9" ry="6" fill="#3D2314" />
          <path d="M64 78 Q64 85 64 86 M60 84 Q64 89 68 84" stroke="#3D2314" stroke-width="2.5" fill="none" stroke-linecap="round" />
          <!-- Eyes -->
          <circle cx="46" cy="62" r="5" fill="#24140A" />
          <circle cx="48" cy="60" r="1.8" fill="#FFFFFF" />
          <circle cx="82" cy="62" r="5" fill="#24140A" />
          <circle cx="84" cy="60" r="1.8" fill="#FFFFFF" />
          <!-- Cheeks -->
          <circle cx="35" cy="74" r="7" fill="#F4978E" opacity="0.6" />
          <circle cx="93" cy="74" r="7" fill="#F4978E" opacity="0.6" />
        `),
      },
      {
        filename: 'fox.png',
        name: 'Sunny Fox',
        svg: svgWrap(`
          <!-- Fox Ears -->
          <polygon points="26,18 48,50 16,52" fill="#E05615" />
          <polygon points="28,26 44,50 20,52" fill="#FCEADE" />
          <polygon points="102,18 112,52 80,50" fill="#E05615" />
          <polygon points="100,26 108,52 84,50" fill="#FCEADE" />
          <!-- Head -->
          <ellipse cx="64" cy="68" rx="42" ry="38" fill="#FF7832" />
          <!-- White Cheeks -->
          <path d="M24 72 Q36 102 64 104 Q92 102 104 72 Q92 76 64 68 Q36 76 24 72 Z" fill="#FFFFFF" />
          <!-- Nose -->
          <circle cx="64" cy="94" r="6" fill="#2A1B14" />
          <!-- Eyes -->
          <ellipse cx="45" cy="68" rx="5" ry="6" fill="#2A1B14" />
          <circle cx="47" cy="66" r="2" fill="#FFFFFF" />
          <ellipse cx="83" cy="68" rx="5" ry="6" fill="#2A1B14" />
          <circle cx="85" cy="66" r="2" fill="#FFFFFF" />
          <!-- Cheeks -->
          <ellipse cx="32" cy="78" rx="6" ry="4" fill="#FFAAA6" opacity="0.8" />
          <ellipse cx="96" cy="78" rx="6" ry="4" fill="#FFAAA6" opacity="0.8" />
        `),
      },
      {
        filename: 'rabbit.png',
        name: 'Sweet Bunny',
        svg: svgWrap(`
          <!-- Bunny Ears -->
          <ellipse cx="44" cy="30" rx="12" ry="26" fill="#FDFBF7" stroke="#E5D9D0" stroke-width="2" />
          <ellipse cx="44" cy="32" rx="7" ry="18" fill="#FFB7B2" />
          <ellipse cx="84" cy="30" rx="12" ry="26" fill="#FDFBF7" stroke="#E5D9D0" stroke-width="2" />
          <ellipse cx="84" cy="32" rx="7" ry="18" fill="#FFB7B2" />
          <!-- Head -->
          <ellipse cx="64" cy="76" rx="40" ry="36" fill="#FFFFFF" stroke="#E5D9D0" stroke-width="2" />
          <!-- Eyes -->
          <circle cx="46" cy="72" r="5.5" fill="#3A2C29" />
          <circle cx="48" cy="70" r="2" fill="#FFFFFF" />
          <circle cx="82" cy="72" r="5.5" fill="#3A2C29" />
          <circle cx="84" cy="70" r="2" fill="#FFFFFF" />
          <!-- Nose and Mouth -->
          <polygon points="64,82 60,78 68,78" fill="#FF85A1" />
          <path d="M64 82 Q60 88 56 86 M64 82 Q68 88 72 86" stroke="#3A2C29" stroke-width="2" fill="none" stroke-linecap="round" />
          <!-- Rosy Cheeks -->
          <circle cx="36" cy="80" r="8" fill="#FFB7B2" opacity="0.7" />
          <circle cx="92" cy="80" r="8" fill="#FFB7B2" opacity="0.7" />
        `),
      },
      {
        filename: 'penguin.png',
        name: 'Chubby Penguin',
        svg: svgWrap(`
          <!-- Body/Head -->
          <ellipse cx="64" cy="68" rx="42" ry="44" fill="#1E293B" />
          <!-- White Face/Tummy -->
          <ellipse cx="64" cy="72" rx="30" ry="34" fill="#FFFFFF" />
          <!-- Earmuffs/Tuft -->
          <ellipse cx="64" cy="24" rx="8" ry="6" fill="#38BDF8" />
          <!-- Eyes -->
          <circle cx="50" cy="64" r="5" fill="#0F172A" />
          <circle cx="52" cy="62" r="1.8" fill="#FFFFFF" />
          <circle cx="78" cy="64" r="5" fill="#0F172A" />
          <circle cx="80" cy="62" r="1.8" fill="#FFFFFF" />
          <!-- Orange Beak -->
          <path d="M54 74 Q64 86 74 74 Q64 71 54 74 Z" fill="#F97316" />
          <!-- Cheeks -->
          <circle cx="40" cy="74" r="6" fill="#F472B6" opacity="0.7" />
          <circle cx="88" cy="74" r="6" fill="#F472B6" opacity="0.7" />
        `),
      },
      {
        filename: 'panda.png',
        name: 'Happy Panda',
        svg: svgWrap(`
          <!-- Ears -->
          <circle cx="32" cy="34" r="15" fill="#18181B" />
          <circle cx="96" cy="34" r="15" fill="#18181B" />
          <!-- Head -->
          <circle cx="64" cy="68" r="42" fill="#FFFFFF" stroke="#E4E4E7" stroke-width="2" />
          <!-- Black Eye Patches tilted -->
          <ellipse cx="46" cy="64" rx="13" ry="16" fill="#18181B" transform="rotate(-15 46 64)" />
          <ellipse cx="82" cy="64" rx="13" ry="16" fill="#18181B" transform="rotate(15 82 64)" />
          <!-- Shiny Eyes -->
          <circle cx="47" cy="64" r="4.5" fill="#FFFFFF" />
          <circle cx="48" cy="64" r="3" fill="#18181B" />
          <circle cx="49" cy="63" r="1.2" fill="#FFFFFF" />
          <circle cx="81" cy="64" r="4.5" fill="#FFFFFF" />
          <circle cx="80" cy="64" r="3" fill="#18181B" />
          <circle cx="79" cy="63" r="1.2" fill="#FFFFFF" />
          <!-- Nose and Mouth -->
          <ellipse cx="64" cy="76" rx="7" ry="5" fill="#18181B" />
          <path d="M60 84 Q64 88 68 84" stroke="#18181B" stroke-width="2.5" fill="none" stroke-linecap="round" />
          <!-- Cheeks -->
          <circle cx="34" cy="80" r="7" fill="#FDA4AF" opacity="0.7" />
          <circle cx="94" cy="80" r="7" fill="#FDA4AF" opacity="0.7" />
        `),
      },
      {
        filename: 'chick.png',
        name: 'Sunny Chick',
        svg: svgWrap(`
          <!-- Feathery Tuft -->
          <ellipse cx="64" cy="22" rx="6" ry="10" fill="#FACC15" transform="rotate(15 64 22)" />
          <ellipse cx="60" cy="24" rx="5" ry="9" fill="#EAB308" transform="rotate(-15 60 24)" />
          <!-- Head -->
          <circle cx="64" cy="68" r="42" fill="#FDE047" />
          <circle cx="64" cy="68" r="42" fill="url(#shine)" />
          <!-- Wings -->
          <ellipse cx="20" cy="72" rx="7" ry="14" fill="#EAB308" />
          <ellipse cx="108" cy="72" rx="7" ry="14" fill="#EAB308" />
          <!-- Eyes -->
          <circle cx="48" cy="60" r="5" fill="#1C1917" />
          <circle cx="50" cy="58" r="1.8" fill="#FFFFFF" />
          <circle cx="80" cy="60" r="5" fill="#1C1917" />
          <circle cx="82" cy="58" r="1.8" fill="#FFFFFF" />
          <!-- Tiny Orange Beak -->
          <polygon points="64,68 56,76 72,76" fill="#EA580C" />
          <!-- Cheeks -->
          <circle cx="36" cy="72" r="8" fill="#FB923C" opacity="0.6" />
          <circle cx="92" cy="72" r="8" fill="#FB923C" opacity="0.6" />
        `),
      },
    ],
  },

  // 2. SUPER HEROES
  {
    id: 'super-heroes',
    name: 'Super Heroes',
    characters: [
      {
        filename: 'crimson-knight.png',
        name: 'Crimson Knight',
        svg: svgWrap(`
          <!-- Helmet Base -->
          <circle cx="64" cy="64" r="44" fill="#DC2626" />
          <!-- Golden Crest -->
          <polygon points="64,18 72,42 64,38 56,42" fill="#FBBF24" />
          <path d="M30 46 Q64 36 98 46" stroke="#F59E0B" stroke-width="4" fill="none" />
          <!-- Mask / Visor Area -->
          <path d="M26 62 Q64 56 102 62 L96 82 Q64 92 32 82 Z" fill="#991B1B" />
          <!-- Glowing Eyes -->
          <polygon points="40,66 58,68 54,76 42,74" fill="#FEF08A" />
          <polygon points="88,66 70,68 74,76 86,74" fill="#FEF08A" />
          <!-- Mouth guard / Chin -->
          <polygon points="56,88 72,88 68,98 60,98" fill="#FBBF24" />
        `),
      },
      {
        filename: 'aero-blue.png',
        name: 'Aero Blue',
        svg: svgWrap(`
          <!-- Cowl / Head -->
          <circle cx="64" cy="64" r="44" fill="#2563EB" />
          <!-- Ear Wings -->
          <polygon points="18,52 30,64 16,74" fill="#60A5FA" />
          <polygon points="110,52 98,64 112,74" fill="#60A5FA" />
          <!-- Goggles / Visor -->
          <rect x="32" y="52" width="64" height="24" rx="12" fill="#0284C7" stroke="#38BDF8" stroke-width="3" />
          <!-- Glowing Lenses -->
          <ellipse cx="48" cy="64" rx="10" ry="7" fill="#E0F2FE" />
          <ellipse cx="80" cy="64" rx="10" ry="7" fill="#E0F2FE" />
          <!-- Smirk -->
          <path d="M54 90 Q64 96 74 90" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'shadow-ninja.png',
        name: 'Shadow Ninja',
        svg: svgWrap(`
          <!-- Ninja Hood -->
          <circle cx="64" cy="64" r="44" fill="#1E1B4B" />
          <!-- Purple Headband -->
          <rect x="20" y="44" width="88" height="14" rx="3" fill="#8B5CF6" />
          <circle cx="64" cy="51" r="5" fill="#C4B5FD" />
          <!-- Mask Cutout -->
          <rect x="34" y="60" width="60" height="18" rx="6" fill="#0F172A" />
          <!-- Intense Purple Glowing Eyes -->
          <polygon points="42,66 54,67 52,72 44,72" fill="#E9D5FF" />
          <polygon points="86,66 74,67 76,72 84,72" fill="#E9D5FF" />
          <!-- Mask Face Fold -->
          <path d="M40 82 L64 94 L88 82" stroke="#4338CA" stroke-width="2.5" fill="none" />
        `),
      },
      {
        filename: 'solar-shield.png',
        name: 'Solar Shield',
        svg: svgWrap(`
          <!-- Golden Helmet -->
          <circle cx="64" cy="64" r="44" fill="#EAB308" />
          <!-- Sun Rays Horns -->
          <polygon points="64,16 68,30 60,30" fill="#F97316" />
          <polygon points="40,24 48,34 42,38" fill="#F97316" />
          <polygon points="88,24 80,34 86,38" fill="#F97316" />
          <!-- Visor -->
          <path d="M30 56 Q64 48 98 56 L94 76 Q64 84 34 76 Z" fill="#CA8A04" stroke="#FDE047" stroke-width="2" />
          <!-- Sun Emblem Visor -->
          <circle cx="64" cy="66" r="10" fill="#FEF08A" />
          <circle cx="64" cy="66" r="5" fill="#F97316" />
          <!-- Chin guard -->
          <path d="M52 90 Q64 96 76 90" stroke="#713F12" stroke-width="3" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'emerald-titan.png',
        name: 'Emerald Titan',
        svg: svgWrap(`
          <!-- Green Power Armor -->
          <circle cx="64" cy="64" r="44" fill="#059669" />
          <!-- Armor Plates -->
          <polygon points="34,26 64,36 94,26 64,18" fill="#10B981" />
          <!-- Cyber Visor -->
          <rect x="28" y="54" width="72" height="20" rx="6" fill="#064E3B" stroke="#34D399" stroke-width="2.5" />
          <!-- Neon Eye Line -->
          <rect x="34" y="62" width="60" height="4" rx="2" fill="#A7F3D0" />
          <!-- Metallic Jaw -->
          <polygon points="46,86 82,86 76,100 52,100" fill="#047857" />
          <line x1="56" y1="90" x2="56" y2="96" stroke="#064E3B" stroke-width="2" />
          <line x1="64" y1="90" x2="64" y2="96" stroke="#064E3B" stroke-width="2" />
          <line x1="72" y1="90" x2="72" y2="96" stroke="#064E3B" stroke-width="2" />
        `),
      },
      {
        filename: 'cyber-pink.png',
        name: 'Cyber Pink',
        svg: svgWrap(`
          <!-- Neon Pink Helm -->
          <circle cx="64" cy="64" r="44" fill="#DB2777" />
          <!-- Cat Ear Antennas -->
          <polygon points="30,22 44,44 24,44" fill="#F472B6" />
          <polygon points="98,22 104,44 84,44" fill="#F472B6" />
          <!-- Holographic Visor -->
          <ellipse cx="64" cy="66" rx="36" ry="16" fill="#831843" stroke="#F43F5E" stroke-width="2" />
          <!-- Anime Eyes in Visor -->
          <ellipse cx="48" cy="66" rx="8" ry="6" fill="#38BDF8" />
          <circle cx="50" cy="64" r="2.5" fill="#FFFFFF" />
          <ellipse cx="80" cy="66" rx="8" ry="6" fill="#38BDF8" />
          <circle cx="82" cy="64" r="2.5" fill="#FFFFFF" />
          <!-- Smile -->
          <path d="M58 92 Q64 97 70 92" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round" />
        `),
      },
    ],
  },

  // 3. FANTASY CREATURES
  {
    id: 'fantasy-creatures',
    name: 'Fantasy Creatures',
    characters: [
      {
        filename: 'dragon.png',
        name: 'Baby Dragon',
        svg: svgWrap(`
          <!-- Wings -->
          <path d="M20 54 Q10 40 24 38 Q30 50 34 58 Z" fill="#047857" />
          <path d="M108 54 Q118 40 104 38 Q98 50 94 58 Z" fill="#047857" />
          <!-- Horns -->
          <polygon points="40,24 46,38 34,38" fill="#FBBF24" />
          <polygon points="88,24 94,38 82,38" fill="#FBBF24" />
          <!-- Head -->
          <circle cx="64" cy="66" r="42" fill="#10B981" />
          <circle cx="64" cy="66" r="42" fill="url(#shine)" />
          <!-- Big Cute Eyes -->
          <circle cx="48" cy="60" r="7" fill="#064E3B" />
          <circle cx="50" cy="58" r="2.5" fill="#FFFFFF" />
          <circle cx="80" cy="60" r="7" fill="#064E3B" />
          <circle cx="82" cy="58" r="2.5" fill="#FFFFFF" />
          <!-- Snout / Fire Smoke -->
          <ellipse cx="64" cy="78" rx="20" ry="14" fill="#34D399" />
          <circle cx="58" cy="76" r="2.5" fill="#064E3B" />
          <circle cx="70" cy="76" r="2.5" fill="#064E3B" />
          <circle cx="78" cy="72" r="3" fill="#F97316" opacity="0.8" />
        `),
      },
      {
        filename: 'unicorn.png',
        name: 'Pastel Unicorn',
        svg: svgWrap(`
          <!-- Mane behind -->
          <path d="M30 40 Q40 20 64 22 Q50 48 38 60 Z" fill="#EC4899" />
          <path d="M78 22 Q94 30 98 56 Q86 44 76 34 Z" fill="#8B5CF6" />
          <!-- Golden Spiral Horn -->
          <polygon points="64,12 70,38 58,38" fill="#F59E0B" />
          <line x1="60" y1="32" x2="68" y2="28" stroke="#FEF08A" stroke-width="2" />
          <line x1="61" y1="24" x2="67" y2="20" stroke="#FEF08A" stroke-width="2" />
          <!-- Ears -->
          <polygon points="38,32 46,46 32,48" fill="#FDF2F8" stroke="#F472B6" />
          <polygon points="90,32 96,48 82,46" fill="#FDF2F8" stroke="#F472B6" />
          <!-- Head -->
          <circle cx="64" cy="68" r="40" fill="#FFFFFF" stroke="#FCE7F3" stroke-width="2" />
          <!-- Starry Eyes -->
          <circle cx="48" cy="64" r="6" fill="#4A044E" />
          <circle cx="50" cy="62" r="2" fill="#FFFFFF" />
          <circle cx="80" cy="64" r="6" fill="#4A044E" />
          <circle cx="82" cy="62" r="2" fill="#FFFFFF" />
          <!-- Muzzle & Smile -->
          <ellipse cx="64" cy="80" rx="16" ry="10" fill="#FCE7F3" />
          <path d="M60 84 Q64 88 68 84" stroke="#DB2777" stroke-width="2" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'slime-monster.png',
        name: 'Bouncy Slime',
        svg: svgWrap(`
          <!-- Slime Shape -->
          <path d="M64 22 C32 22 20 54 20 80 C20 104 40 108 64 108 C88 108 108 104 108 80 C108 54 96 22 64 22 Z" fill="#06B6D4" />
          <!-- Glossy Highlight -->
          <ellipse cx="48" cy="40" rx="14" ry="8" fill="#FFFFFF" opacity="0.6" transform="rotate(-20 48 40)" />
          <!-- Huge Anime Eyes -->
          <circle cx="46" cy="68" r="9" fill="#083344" />
          <circle cx="49" cy="65" r="3.5" fill="#FFFFFF" />
          <circle cx="44" cy="72" r="1.5" fill="#FFFFFF" />
          <circle cx="82" cy="68" r="9" fill="#083344" />
          <circle cx="85" cy="65" r="3.5" fill="#FFFFFF" />
          <circle cx="80" cy="72" r="1.5" fill="#FFFFFF" />
          <!-- Cute Smile -->
          <path d="M58 82 Q64 88 70 82" stroke="#083344" stroke-width="3" fill="none" stroke-linecap="round" />
          <!-- Bubbles -->
          <circle cx="36" cy="86" r="4" fill="#67E8F9" opacity="0.7" />
          <circle cx="92" cy="84" r="5" fill="#67E8F9" opacity="0.7" />
        `),
      },
      {
        filename: 'fairy.png',
        name: 'Sparkle Fairy',
        svg: svgWrap(`
          <!-- Glowing Wings -->
          <ellipse cx="32" cy="50" rx="20" ry="12" fill="#F472B6" opacity="0.7" transform="rotate(-30 32 50)" />
          <ellipse cx="96" cy="50" rx="20" ry="12" fill="#F472B6" opacity="0.7" transform="rotate(30 96 50)" />
          <!-- Face -->
          <circle cx="64" cy="66" r="38" fill="#FFEDD5" />
          <!-- Golden Hair -->
          <path d="M30 60 Q34 32 64 30 Q94 32 98 60 Q90 42 64 42 Q38 42 30 60 Z" fill="#FBBF24" />
          <!-- Tiara -->
          <polygon points="56,34 64,26 72,34" fill="#F59E0B" />
          <!-- Eyes -->
          <circle cx="50" cy="64" r="4.5" fill="#0284C7" />
          <circle cx="52" cy="62" r="1.5" fill="#FFFFFF" />
          <circle cx="78" cy="64" r="4.5" fill="#0284C7" />
          <circle cx="80" cy="62" r="1.5" fill="#FFFFFF" />
          <!-- Blush -->
          <circle cx="42" cy="72" r="5" fill="#FDA4AF" opacity="0.7" />
          <circle cx="86" cy="72" r="5" fill="#FDA4AF" opacity="0.7" />
          <!-- Smile -->
          <path d="M60 76 Q64 80 68 76" stroke="#9A3412" stroke-width="2" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'magical-cat.png',
        name: 'Mystic Cat',
        svg: svgWrap(`
          <!-- Ears -->
          <polygon points="30,22 48,50 20,48" fill="#4C1D95" />
          <polygon points="32,28 44,48 24,46" fill="#A78BFA" />
          <polygon points="98,22 108,48 80,50" fill="#4C1D95" />
          <polygon points="96,28 104,46 84,48" fill="#A78BFA" />
          <!-- Head -->
          <circle cx="64" cy="68" r="42" fill="#5B21B6" />
          <!-- Crescent Moon Forehead -->
          <path d="M64 40 A8 8 0 0 0 64 56 A6 6 0 0 1 64 40 Z" fill="#FDE047" />
          <!-- Big Glowing Gold Eyes -->
          <ellipse cx="46" cy="66" rx="7" ry="8" fill="#FBBF24" />
          <ellipse cx="46" cy="66" rx="2" ry="7" fill="#1E1B4B" />
          <circle cx="48" cy="63" r="1.8" fill="#FFFFFF" />
          <ellipse cx="82" cy="66" rx="7" ry="8" fill="#FBBF24" />
          <ellipse cx="82" cy="66" rx="2" ry="7" fill="#1E1B4B" />
          <circle cx="84" cy="63" r="1.8" fill="#FFFFFF" />
          <!-- Nose & Whiskers -->
          <polygon points="64,74 61,72 67,72" fill="#F472B6" />
          <line x1="28" y1="74" x2="42" y2="76" stroke="#DDD6FE" stroke-width="1.5" />
          <line x1="100" y1="74" x2="86" y2="76" stroke="#DDD6FE" stroke-width="1.5" />
        `),
      },
      {
        filename: 'owl.png',
        name: 'Mystic Owl',
        svg: svgWrap(`
          <!-- Feather Ears -->
          <polygon points="34,26 44,44 26,42" fill="#78350F" />
          <polygon points="94,26 102,42 84,44" fill="#78350F" />
          <!-- Head -->
          <ellipse cx="64" cy="68" rx="42" ry="40" fill="#92400E" />
          <!-- Huge Eye Rings -->
          <circle cx="46" cy="64" r="16" fill="#FEF3C7" />
          <circle cx="82" cy="64" r="16" fill="#FEF3C7" />
          <!-- Amber Eyes -->
          <circle cx="46" cy="64" r="10" fill="#D97706" />
          <circle cx="46" cy="64" r="5" fill="#1F2937" />
          <circle cx="48" cy="62" r="2" fill="#FFFFFF" />
          <circle cx="82" cy="64" r="10" fill="#D97706" />
          <circle cx="82" cy="64" r="5" fill="#1F2937" />
          <circle cx="84" cy="62" r="2" fill="#FFFFFF" />
          <!-- Small Beak -->
          <polygon points="64,68 60,78 68,78" fill="#F59E0B" />
        `),
      },
    ],
  },

  // 4. SPACE EXPLORERS
  {
    id: 'space-explorers',
    name: 'Space Explorers',
    characters: [
      {
        filename: 'astronaut.png',
        name: 'Astro Kid',
        svg: svgWrap(`
          <!-- Spacesuit Helmet -->
          <circle cx="64" cy="64" r="44" fill="#F1F5F9" stroke="#94A3B8" stroke-width="3" />
          <!-- Ear Comms -->
          <rect x="14" y="54" width="8" height="20" rx="4" fill="#0284C7" />
          <rect x="106" y="54" width="8" height="20" rx="4" fill="#0284C7" />
          <!-- Golden Reflective Visor -->
          <ellipse cx="64" cy="64" rx="32" ry="24" fill="#F59E0B" stroke="#D97706" stroke-width="2" />
          <!-- Visor Reflection Shine -->
          <path d="M42 54 Q64 46 84 52" stroke="#FEF08A" stroke-width="3" fill="none" stroke-linecap="round" />
          <!-- Helmet Decal Star -->
          <polygon points="64,28 66,32 70,32 67,35 68,39 64,37 60,39 61,35 58,32 62,32" fill="#EF4444" />
        `),
      },
      {
        filename: 'alien.png',
        name: 'Zippy Alien',
        svg: svgWrap(`
          <!-- Antennae -->
          <line x1="42" y1="36" x2="30" y2="20" stroke="#84CC16" stroke-width="3" stroke-linecap="round" />
          <circle cx="30" cy="20" r="5" fill="#A3E635" />
          <line x1="86" y1="36" x2="98" y2="20" stroke="#84CC16" stroke-width="3" stroke-linecap="round" />
          <circle cx="98" cy="20" r="5" fill="#A3E635" />
          <!-- Head -->
          <ellipse cx="64" cy="68" rx="42" ry="38" fill="#84CC16" />
          <!-- Three Eyes -->
          <circle cx="42" cy="62" r="7" fill="#1E293B" />
          <circle cx="44" cy="60" r="2.5" fill="#FFFFFF" />
          <circle cx="64" cy="56" r="8" fill="#1E293B" />
          <circle cx="66" cy="54" r="3" fill="#FFFFFF" />
          <circle cx="86" cy="62" r="7" fill="#1E293B" />
          <circle cx="88" cy="60" r="2.5" fill="#FFFFFF" />
          <!-- Happy Smile -->
          <path d="M52 82 Q64 92 76 82" stroke="#1E293B" stroke-width="3" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'rocket-mascot.png',
        name: 'Rusty Rocket',
        svg: svgWrap(`
          <!-- Fins -->
          <polygon points="26,82 40,78 34,104" fill="#DC2626" />
          <polygon points="102,82 88,78 94,104" fill="#DC2626" />
          <!-- Flame -->
          <polygon points="56,102 64,120 72,102" fill="#F97316" />
          <polygon points="60,102 64,114 68,102" fill="#FDE047" />
          <!-- Rocket Body -->
          <path d="M64 16 Q88 44 86 98 L42 98 Q40 44 64 16 Z" fill="#F8FAFC" stroke="#CBD5E1" stroke-width="2" />
          <!-- Red Nose Cone -->
          <path d="M64 16 Q76 34 80 44 L48 44 Q52 34 64 16 Z" fill="#EF4444" />
          <!-- Porthole Window with Cute Eyes -->
          <circle cx="64" cy="66" r="16" fill="#0284C7" stroke="#38BDF8" stroke-width="3" />
          <circle cx="59" cy="66" r="3" fill="#FFFFFF" />
          <circle cx="69" cy="66" r="3" fill="#FFFFFF" />
        `),
      },
      {
        filename: 'planet-creature.png',
        name: 'Pluto Pal',
        svg: svgWrap(`
          <!-- Background Planetary Ring -->
          <ellipse cx="64" cy="68" rx="54" ry="16" fill="none" stroke="#F59E0B" stroke-width="7" opacity="0.8" transform="rotate(-15 64 68)" />
          <!-- Planet Sphere -->
          <circle cx="64" cy="68" r="36" fill="#7C3AED" />
          <!-- Ring Front Overlay -->
          <path d="M12 68 Q64 88 116 68" stroke="#FDE047" stroke-width="6" fill="none" transform="rotate(-15 64 68)" />
          <!-- Face -->
          <circle cx="52" cy="64" r="4.5" fill="#FFFFFF" />
          <circle cx="53" cy="63" r="2.5" fill="#1E1B4B" />
          <circle cx="76" cy="64" r="4.5" fill="#FFFFFF" />
          <circle cx="75" cy="63" r="2.5" fill="#1E1B4B" />
          <!-- Cheeks & Smile -->
          <circle cx="44" cy="72" r="4" fill="#F472B6" opacity="0.8" />
          <circle cx="84" cy="72" r="4" fill="#F472B6" opacity="0.8" />
          <path d="M60 74 Q64 78 68 74" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'star-character.png',
        name: 'Nova Star',
        svg: svgWrap(`
          <!-- 5-Point Star -->
          <polygon points="64,18 76,46 106,48 82,68 90,98 64,82 38,98 46,68 22,48 52,46" fill="#FBBF24" stroke="#F59E0B" stroke-width="2" />
          <!-- Sparkle Highlights -->
          <circle cx="48" cy="40" r="3" fill="#FFFFFF" opacity="0.8" />
          <!-- Cute Eyes -->
          <circle cx="54" cy="60" r="4.5" fill="#78350F" />
          <circle cx="55" cy="58" r="1.5" fill="#FFFFFF" />
          <circle cx="74" cy="60" r="4.5" fill="#78350F" />
          <circle cx="75" cy="58" r="1.5" fill="#FFFFFF" />
          <!-- Cheeks & Wink -->
          <circle cx="46" cy="66" r="4" fill="#FB923C" opacity="0.8" />
          <circle cx="82" cy="66" r="4" fill="#FB923C" opacity="0.8" />
          <path d="M60 68 Q64 74 68 68" stroke="#78350F" stroke-width="2.5" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'cosmic-bot.png',
        name: 'Cosmo Drone',
        svg: svgWrap(`
          <!-- Solar Wings -->
          <rect x="14" y="56" width="16" height="16" rx="3" fill="#0284C7" stroke="#38BDF8" stroke-width="1.5" />
          <rect x="98" y="56" width="16" height="16" rx="3" fill="#0284C7" stroke="#38BDF8" stroke-width="1.5" />
          <!-- Center Sphere Body -->
          <circle cx="64" cy="64" r="36" fill="#0D9488" />
          <!-- Screen Face -->
          <rect x="42" y="48" width="44" height="32" rx="8" fill="#134E4A" stroke="#2DD4BF" stroke-width="2" />
          <!-- Glowing Cyan Pixels -->
          <rect x="48" y="58" width="8" height="8" rx="2" fill="#5EEAD4" />
          <rect x="72" y="58" width="8" height="8" rx="2" fill="#5EEAD4" />
          <path d="M56 72 Q64 76 72 72" stroke="#5EEAD4" stroke-width="2" fill="none" stroke-linecap="round" />
        `),
      },
    ],
  },

  // 5. FOOD CHARACTERS
  {
    id: 'food-characters',
    name: 'Food Characters',
    characters: [
      {
        filename: 'burger.png',
        name: 'Benny Burger',
        svg: svgWrap(`
          <!-- Top Bun -->
          <path d="M28 54 Q64 24 100 54 Z" fill="#F59E0B" stroke="#D97706" stroke-width="2" />
          <!-- Sesame Seeds -->
          <ellipse cx="50" cy="40" rx="2" ry="3" fill="#FEF3C7" transform="rotate(20 50 40)" />
          <ellipse cx="66" cy="36" rx="2" ry="3" fill="#FEF3C7" />
          <ellipse cx="80" cy="42" rx="2" ry="3" fill="#FEF3C7" transform="rotate(-20 80 42)" />
          <!-- Lettuce -->
          <path d="M24 54 Q34 60 44 54 Q54 60 64 54 Q74 60 84 54 Q94 60 104 54 L100 62 L28 62 Z" fill="#22C55E" />
          <!-- Cheese Triangle -->
          <polygon points="40,62 88,62 64,74" fill="#FACC15" />
          <!-- Patty -->
          <rect x="26" y="66" width="76" height="14" rx="7" fill="#78350F" />
          <!-- Bottom Bun -->
          <rect x="30" y="82" width="68" height="12" rx="6" fill="#F59E0B" />
          <!-- Cute Eyes on Top Bun -->
          <circle cx="50" cy="48" r="3.5" fill="#451A03" />
          <circle cx="51" cy="47" r="1.2" fill="#FFFFFF" />
          <circle cx="78" cy="48" r="3.5" fill="#451A03" />
          <circle cx="79" cy="47" r="1.2" fill="#FFFFFF" />
          <circle cx="42" cy="51" r="3" fill="#F43F5E" opacity="0.6" />
          <circle cx="86" cy="51" r="3" fill="#F43F5E" opacity="0.6" />
        `),
      },
      {
        filename: 'fries.png',
        name: 'Crispy Fries',
        svg: svgWrap(`
          <!-- French Fry Sticks -->
          <rect x="36" y="24" width="10" height="46" rx="3" fill="#FACC15" stroke="#EAB308" />
          <rect x="48" y="16" width="10" height="54" rx="3" fill="#FDE047" stroke="#EAB308" />
          <rect x="60" y="20" width="10" height="50" rx="3" fill="#FACC15" stroke="#EAB308" />
          <rect x="72" y="18" width="10" height="52" rx="3" fill="#FDE047" stroke="#EAB308" />
          <rect x="82" y="28" width="10" height="42" rx="3" fill="#FACC15" stroke="#EAB308" />
          <!-- Red Box Container -->
          <path d="M30 58 L38 108 L90 108 L98 58 Q64 68 30 58 Z" fill="#EF4444" stroke="#DC2626" stroke-width="2" />
          <!-- Box Smile & Eyes -->
          <circle cx="52" cy="80" r="4" fill="#FFFFFF" />
          <circle cx="53" cy="79" r="2.2" fill="#1E293B" />
          <circle cx="76" cy="80" r="4" fill="#FFFFFF" />
          <circle cx="77" cy="79" r="2.2" fill="#1E293B" />
          <path d="M58 92 Q64 98 70 92" stroke="#FFFFFF" stroke-width="2.5" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'pizza.png',
        name: 'Pip Pizza',
        svg: svgWrap(`
          <!-- Pizza Slice -->
          <path d="M64 108 L26 34 Q64 26 102 34 Z" fill="#F59E0B" stroke="#D97706" stroke-width="2" />
          <!-- Crust -->
          <path d="M24 34 Q64 24 104 34 Q64 20 24 34 Z" fill="#B45309" stroke="#78350F" stroke-width="2" />
          <!-- Pepperonis -->
          <circle cx="48" cy="50" r="7" fill="#DC2626" />
          <circle cx="78" cy="52" r="7" fill="#DC2626" />
          <circle cx="64" cy="82" r="6" fill="#DC2626" />
          <!-- Eyes -->
          <circle cx="54" cy="66" r="4" fill="#78350F" />
          <circle cx="55" cy="65" r="1.5" fill="#FFFFFF" />
          <circle cx="74" cy="66" r="4" fill="#78350F" />
          <circle cx="75" cy="65" r="1.5" fill="#FFFFFF" />
          <!-- Cheesy Smile -->
          <path d="M60 74 Q64 78 68 74" stroke="#78350F" stroke-width="2" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'bubble-tea.png',
        name: 'Boba Bliss',
        svg: svgWrap(`
          <!-- Straw -->
          <rect x="68" y="14" width="8" height="40" rx="3" fill="#F472B6" transform="rotate(15 68 14)" />
          <!-- Cup Lid -->
          <ellipse cx="64" cy="44" rx="32" ry="10" fill="#E2E8F0" stroke="#CBD5E1" stroke-width="2" />
          <!-- Plastic Cup Body -->
          <path d="M36 44 L44 108 Q64 112 84 108 L92 44 Z" fill="#DDD6FE" stroke="#C4B5FD" stroke-width="2" opacity="0.9" />
          <!-- Tapioca Pearls -->
          <circle cx="50" cy="98" r="5" fill="#4C1D95" />
          <circle cx="64" cy="100" r="5" fill="#4C1D95" />
          <circle cx="78" cy="98" r="5" fill="#4C1D95" />
          <circle cx="58" cy="88" r="5" fill="#4C1D95" />
          <circle cx="72" cy="88" r="5" fill="#4C1D95" />
          <!-- Cup Face -->
          <circle cx="52" cy="66" r="3.5" fill="#4C1D95" />
          <circle cx="76" cy="66" r="3.5" fill="#4C1D95" />
          <path d="M60 72 Q64 76 68 72" stroke="#4C1D95" stroke-width="2" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'donut.png',
        name: 'Dottie Donut',
        svg: svgWrap(`
          <!-- Dough Base -->
          <circle cx="64" cy="64" r="44" fill="#F59E0B" stroke="#D97706" stroke-width="2" />
          <!-- Pink Frosting -->
          <path d="M30 64 C30 40 48 26 64 26 C80 26 98 40 98 64 C98 76 90 84 84 80 C78 76 74 88 64 88 C54 88 50 78 44 82 C38 86 30 78 30 64 Z" fill="#EC4899" />
          <!-- Donut Hole -->
          <circle cx="64" cy="64" r="16" fill="#07130B" />
          <!-- Sprinkles -->
          <rect x="46" y="38" width="3" height="7" rx="1.5" fill="#38BDF8" transform="rotate(30 46 38)" />
          <rect x="76" y="38" width="3" height="7" rx="1.5" fill="#FACC15" transform="rotate(-40 76 38)" />
          <rect x="84" y="60" width="3" height="7" rx="1.5" fill="#4ADE80" transform="rotate(15 84 60)" />
          <rect x="40" y="62" width="3" height="7" rx="1.5" fill="#FFFFFF" transform="rotate(-20 40 62)" />
        `),
      },
      {
        filename: 'sushi.png',
        name: 'Sami Sushi',
        svg: svgWrap(`
          <!-- Rice Bed -->
          <rect x="28" y="62" width="72" height="34" rx="14" fill="#FFFFFF" stroke="#E2E8F0" stroke-width="2" />
          <!-- Salmon Sashimi -->
          <ellipse cx="64" cy="56" rx="42" ry="18" fill="#FB923C" stroke="#F97316" stroke-width="2" />
          <!-- Salmon Stripes -->
          <path d="M38 52 Q64 64 90 52" stroke="#FFFFFF" stroke-width="2.5" fill="none" opacity="0.8" />
          <path d="M44 60 Q64 70 84 60" stroke="#FFFFFF" stroke-width="2.5" fill="none" opacity="0.8" />
          <!-- Nori Belt -->
          <rect x="56" y="44" width="16" height="52" fill="#14532D" />
          <!-- Rice Eyes & Blush -->
          <circle cx="44" cy="78" r="3" fill="#1E293B" />
          <circle cx="84" cy="78" r="3" fill="#1E293B" />
          <circle cx="36" cy="82" r="3.5" fill="#FDA4AF" opacity="0.8" />
          <circle cx="92" cy="82" r="3.5" fill="#FDA4AF" opacity="0.8" />
        `),
      },
    ],
  },

  // 6. OCEAN FRIENDS
  {
    id: 'ocean-friends',
    name: 'Ocean Friends',
    characters: [
      {
        filename: 'dolphin.png',
        name: 'Splash Dolphin',
        svg: svgWrap(`
          <!-- Dolphin Body Curved -->
          <path d="M22 84 C20 48 56 30 88 32 C104 34 112 44 110 52 C108 58 98 56 88 56 C74 56 50 68 44 88 Z" fill="#38BDF8" />
          <path d="M88 32 Q96 20 84 18 Q86 28 88 32 Z" fill="#0284C7" />
          <!-- Belly -->
          <path d="M28 82 C34 68 56 62 82 58 C68 70 50 80 34 86 Z" fill="#E0F2FE" />
          <!-- Eye -->
          <circle cx="92" cy="46" r="3.5" fill="#0F172A" />
          <circle cx="93" cy="45" r="1.2" fill="#FFFFFF" />
          <!-- Water Splashes -->
          <circle cx="20" cy="50" r="3" fill="#BAE6FD" />
          <circle cx="16" cy="62" r="2.5" fill="#BAE6FD" />
        `),
      },
      {
        filename: 'whale.png',
        name: 'Bubbles Whale',
        svg: svgWrap(`
          <!-- Water Spout -->
          <path d="M64 26 Q60 14 52 16 M64 26 Q64 12 64 10 M64 26 Q68 14 76 16" stroke="#38BDF8" stroke-width="3" fill="none" stroke-linecap="round" />
          <!-- Whale Body -->
          <path d="M18 68 C18 42 48 34 86 36 C106 38 114 56 108 76 C96 86 78 92 46 92 C24 92 18 84 18 68 Z" fill="#1D4ED8" />
          <!-- White Underbelly with ridges -->
          <path d="M30 84 Q64 94 98 80 C84 92 56 94 30 84 Z" fill="#BFDBFE" />
          <!-- Tail Fin -->
          <polygon points="18,68 6,56 12,74 6,86" fill="#1E40AF" />
          <!-- Eye & Smile -->
          <circle cx="86" cy="56" r="4.5" fill="#FFFFFF" />
          <circle cx="87" cy="55" r="2.5" fill="#0F172A" />
          <path d="M78 68 Q86 74 92 68" stroke="#FFFFFF" stroke-width="2" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'octopus.png',
        name: 'Inky Octopus',
        svg: svgWrap(`
          <!-- Head / Bulb -->
          <circle cx="64" cy="50" r="34" fill="#C026D3" />
          <!-- Tentacles below -->
          <path d="M34 76 Q26 98 34 106 Q42 102 42 84 Q50 106 58 106 Q64 98 64 84 Q64 102 70 106 Q78 106 86 84 Q86 102 94 106 Q102 98 94 76 Z" fill="#A21CAF" />
          <!-- Suction Cups -->
          <circle cx="34" cy="98" r="3" fill="#F0ABFC" />
          <circle cx="58" cy="98" r="3" fill="#F0ABFC" />
          <circle cx="70" cy="98" r="3" fill="#F0ABFC" />
          <circle cx="94" cy="98" r="3" fill="#F0ABFC" />
          <!-- Big Anime Eyes -->
          <circle cx="50" cy="54" r="6" fill="#FFFFFF" />
          <circle cx="52" cy="53" r="3.5" fill="#3B0764" />
          <circle cx="78" cy="54" r="6" fill="#FFFFFF" />
          <circle cx="76" cy="53" r="3.5" fill="#3B0764" />
          <!-- Cute O Mouth -->
          <circle cx="64" cy="66" r="4" fill="#701A75" />
        `),
      },
      {
        filename: 'turtle.png',
        name: 'Shelly Turtle',
        svg: svgWrap(`
          <!-- Flippers -->
          <ellipse cx="28" cy="46" rx="14" ry="8" fill="#15803D" transform="rotate(-30 28 46)" />
          <ellipse cx="100" cy="46" rx="14" ry="8" fill="#15803D" transform="rotate(30 100 46)" />
          <ellipse cx="36" cy="86" rx="10" ry="6" fill="#15803D" transform="rotate(20 36 86)" />
          <ellipse cx="92" cy="86" rx="10" ry="6" fill="#15803D" transform="rotate(-20 92 86)" />
          <!-- Head -->
          <ellipse cx="64" cy="30" rx="14" ry="16" fill="#16A34A" />
          <circle cx="58" cy="26" r="2.5" fill="#052E16" />
          <circle cx="70" cy="26" r="2.5" fill="#052E16" />
          <!-- Shell -->
          <ellipse cx="64" cy="66" rx="36" ry="34" fill="#047857" stroke="#065F46" stroke-width="3" />
          <!-- Hexagon Shell Pattern -->
          <polygon points="64,52 74,58 74,70 64,76 54,70 54,58" fill="#10B981" />
        `),
      },
      {
        filename: 'clownfish.png',
        name: 'Nemo Clownfish',
        svg: svgWrap(`
          <!-- Tail -->
          <polygon points="26,64 12,46 16,64 12,82" fill="#EA580C" />
          <!-- Body -->
          <ellipse cx="66" cy="64" rx="42" ry="30" fill="#F97316" />
          <!-- White Stripes with black border -->
          <path d="M50 36 Q56 64 50 92 L60 90 Q66 64 60 38 Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.5" />
          <path d="M78 40 Q84 64 78 88 L86 86 Q92 64 86 42 Z" fill="#FFFFFF" stroke="#0F172A" stroke-width="1.5" />
          <!-- Eye -->
          <circle cx="94" cy="58" r="4.5" fill="#0F172A" />
          <circle cx="95" cy="57" r="1.5" fill="#FFFFFF" />
        `),
      },
      {
        filename: 'starfish.png',
        name: 'Stell Starfish',
        svg: svgWrap(`
          <!-- Star Arms with Rounded Caps -->
          <path d="M64 18 Q68 46 88 44 Q114 48 98 70 Q106 96 82 86 Q64 82 50 96 Q40 76 26 66 Q50 56 46 44 Z" fill="#F43F5E" stroke="#E11D48" stroke-width="2" />
          <!-- Texture Dots -->
          <circle cx="64" cy="34" r="2" fill="#FFE4E6" />
          <circle cx="90" cy="54" r="2" fill="#FFE4E6" />
          <circle cx="82" cy="78" r="2" fill="#FFE4E6" />
          <circle cx="48" cy="80" r="2" fill="#FFE4E6" />
          <circle cx="36" cy="58" r="2" fill="#FFE4E6" />
          <!-- Face in center -->
          <circle cx="56" cy="60" r="3.5" fill="#881337" />
          <circle cx="72" cy="60" r="3.5" fill="#881337" />
          <path d="M60 68 Q64 72 68 68" stroke="#881337" stroke-width="2" fill="none" stroke-linecap="round" />
        `),
      },
    ],
  },

  // 7. ROBOT FRIENDS
  {
    id: 'robot-friends',
    name: 'Robot Friends',
    characters: [
      {
        filename: 'retro-bot.png',
        name: 'Tin Toy Retro',
        svg: svgWrap(`
          <!-- Antenna -->
          <line x1="64" y1="28" x2="64" y2="16" stroke="#94A3B8" stroke-width="3" />
          <circle cx="64" cy="14" r="4" fill="#EF4444" />
          <!-- Square Head -->
          <rect x="28" y="28" width="72" height="68" rx="14" fill="#64748B" stroke="#475569" stroke-width="3" />
          <!-- Bolts / Ear Dials -->
          <rect x="20" y="52" width="8" height="20" rx="3" fill="#F59E0B" />
          <rect x="100" y="52" width="8" height="20" rx="3" fill="#F59E0B" />
          <!-- Eye Screen -->
          <rect x="38" y="44" width="52" height="24" rx="6" fill="#0F172A" />
          <circle cx="50" cy="56" r="6" fill="#38BDF8" />
          <circle cx="78" cy="56" r="6" fill="#38BDF8" />
          <!-- Meter / Mouth -->
          <rect x="42" y="76" width="44" height="10" rx="3" fill="#E2E8F0" />
          <line x1="48" y1="76" x2="48" y2="86" stroke="#475569" stroke-width="2" />
          <line x1="56" y1="76" x2="56" y2="86" stroke="#475569" stroke-width="2" />
          <line x1="64" y1="76" x2="64" y2="86" stroke="#475569" stroke-width="2" />
          <line x1="72" y1="76" x2="72" y2="86" stroke="#475569" stroke-width="2" />
          <line x1="80" y1="76" x2="80" y2="86" stroke="#475569" stroke-width="2" />
        `),
      },
      {
        filename: 'sparky.png',
        name: 'Sparky Bulb',
        svg: svgWrap(`
          <!-- Lightning Bulb Crown -->
          <polygon points="64,12 68,26 62,26 66,36 58,28 64,28" fill="#FACC15" />
          <!-- Round Head -->
          <circle cx="64" cy="66" r="40" fill="#EAB308" stroke="#CA8A04" stroke-width="3" />
          <!-- Big Blue Display -->
          <rect x="36" y="50" width="56" height="32" rx="10" fill="#0369A1" stroke="#38BDF8" stroke-width="2" />
          <!-- Happy Digital Eyes -->
          <path d="M44 64 Q50 56 56 64" stroke="#FDE047" stroke-width="3" fill="none" stroke-linecap="round" />
          <path d="M72 64 Q78 56 84 64" stroke="#FDE047" stroke-width="3" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'rusty.png',
        name: 'Rusty Cyclops',
        svg: svgWrap(`
          <!-- Industrial Dome -->
          <path d="M26 70 C26 36 44 26 64 26 C84 26 102 36 102 70 L98 94 L30 94 Z" fill="#EA580C" stroke="#C2410C" stroke-width="3" />
          <!-- Rivets -->
          <circle cx="36" cy="38" r="2.5" fill="#7C2D12" />
          <circle cx="92" cy="38" r="2.5" fill="#7C2D12" />
          <!-- Big Cyclops Eye -->
          <circle cx="64" cy="58" r="18" fill="#FEF08A" stroke="#7C2D12" stroke-width="3" />
          <circle cx="64" cy="58" r="8" fill="#DC2626" />
          <circle cx="66" cy="56" r="2.5" fill="#FFFFFF" />
          <!-- Vent Grate Mouth -->
          <line x1="46" y1="84" x2="82" y2="84" stroke="#431407" stroke-width="3" stroke-linecap="round" />
        `),
      },
      {
        filename: 'bleep.png',
        name: 'Bleep Egg',
        svg: svgWrap(`
          <!-- Sleek Egg Shape -->
          <ellipse cx="64" cy="64" rx="38" ry="44" fill="#F8FAFC" stroke="#E2E8F0" stroke-width="3" />
          <!-- Black Curved Visor -->
          <path d="M34 56 Q64 48 94 56 Q88 78 64 78 Q40 78 34 56 Z" fill="#0F172A" />
          <!-- Cyan Pixel Smile and Eyes -->
          <rect x="44" y="60" width="8" height="6" rx="2" fill="#22D3EE" />
          <rect x="76" y="60" width="8" height="6" rx="2" fill="#22D3EE" />
          <path d="M58 70 Q64 74 70 70" stroke="#22D3EE" stroke-width="2" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'cruncher.png',
        name: 'Cog Cruncher',
        svg: svgWrap(`
          <!-- Cog Ears -->
          <circle cx="22" cy="64" r="12" fill="#6B21A8" />
          <circle cx="106" cy="64" r="12" fill="#6B21A8" />
          <!-- Heavy Hex Head -->
          <polygon points="64,22 98,42 98,86 64,106 30,86 30,42" fill="#7E22CE" stroke="#581C87" stroke-width="3" />
          <!-- Eyes -->
          <circle cx="48" cy="58" r="7" fill="#FACC15" />
          <circle cx="48" cy="58" r="3" fill="#1E1B4B" />
          <circle cx="80" cy="58" r="7" fill="#FACC15" />
          <circle cx="80" cy="58" r="3" fill="#1E1B4B" />
          <!-- Tooth Gear Mouth -->
          <rect x="46" y="78" width="36" height="12" rx="2" fill="#3B0764" />
          <rect x="52" y="78" width="6" height="6" fill="#F3E8FF" />
          <rect x="66" y="78" width="6" height="6" fill="#F3E8FF" />
        `),
      },
      {
        filename: 'gizmo.png',
        name: 'CRT Gizmo',
        svg: svgWrap(`
          <!-- CRT Monitor Bezel -->
          <rect x="24" y="28" width="80" height="68" rx="16" fill="#0D9488" stroke="#115E59" stroke-width="3" />
          <!-- Phosphor Screen -->
          <rect x="34" y="38" width="60" height="48" rx="10" fill="#042F2C" />
          <!-- CRT Scanlines / Smile Face -->
          <circle cx="48" cy="56" r="5" fill="#34D399" />
          <circle cx="80" cy="56" r="5" fill="#34D399" />
          <path d="M54 70 Q64 78 74 70" stroke="#34D399" stroke-width="3" fill="none" stroke-linecap="round" />
          <!-- Floppy Slot -->
          <rect x="48" y="90" width="32" height="3" fill="#134E4A" />
        `),
      },
    ],
  },

  // 8. PRINCESS FAIRYTALE
  {
    id: 'princess-fairytale',
    name: 'Princess Fairytale',
    characters: [
      {
        filename: 'princess.png',
        name: 'Princess Rosella',
        svg: svgWrap(`
          <!-- Flowing Hair behind -->
          <path d="M26 60 Q20 100 36 106 Q46 88 40 70 Z" fill="#F59E0B" />
          <path d="M102 60 Q108 100 92 106 Q82 88 88 70 Z" fill="#F59E0B" />
          <!-- Face -->
          <circle cx="64" cy="66" r="38" fill="#FFF1F2" stroke="#FECDD3" stroke-width="1.5" />
          <!-- Golden Tiara -->
          <polygon points="46,36 52,24 64,18 76,24 82,36" fill="#FBBF24" stroke="#D97706" />
          <circle cx="64" cy="24" r="2.5" fill="#E11D48" />
          <!-- Front Hair Bangs -->
          <path d="M32 54 Q48 38 64 42 Q80 38 96 54 Q80 44 64 46 Q48 44 32 54 Z" fill="#F59E0B" />
          <!-- Eyes -->
          <circle cx="50" cy="64" r="5" fill="#1E293B" />
          <circle cx="52" cy="62" r="1.8" fill="#FFFFFF" />
          <circle cx="78" cy="64" r="5" fill="#1E293B" />
          <circle cx="80" cy="62" r="1.8" fill="#FFFFFF" />
          <!-- Rosy Cheeks -->
          <circle cx="40" cy="72" r="6" fill="#FDA4AF" opacity="0.8" />
          <circle cx="88" cy="72" r="6" fill="#FDA4AF" opacity="0.8" />
          <!-- Smile -->
          <path d="M58 76 Q64 82 70 76" stroke="#E11D48" stroke-width="2" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'royal-crown.png',
        name: 'Imperial Crown',
        svg: svgWrap(`
          <!-- Velvet Pillow base -->
          <ellipse cx="64" cy="94" rx="36" ry="10" fill="#9F1239" />
          <!-- Golden Crown Base -->
          <path d="M24 82 L32 42 L48 60 L64 30 L80 60 L96 42 L104 82 Z" fill="#FBBF24" stroke="#D97706" stroke-width="3" />
          <rect x="22" y="80" width="84" height="12" rx="4" fill="#F59E0B" />
          <!-- Jewels -->
          <circle cx="64" cy="30" r="5" fill="#E11D48" />
          <circle cx="32" cy="42" r="4" fill="#0284C7" />
          <circle cx="96" cy="42" r="4" fill="#0284C7" />
          <circle cx="44" cy="86" r="3" fill="#10B981" />
          <circle cx="64" cy="86" r="3" fill="#E11D48" />
          <circle cx="84" cy="86" r="3" fill="#10B981" />
        `),
      },
      {
        filename: 'magic-castle.png',
        name: 'Fairytale Castle',
        svg: svgWrap(`
          <!-- Main Tower Body -->
          <rect x="42" y="52" width="44" height="48" fill="#F3E8FF" stroke="#D8B4FE" stroke-width="2" />
          <!-- Center Turret Roof -->
          <polygon points="64,18 48,52 80,52" fill="#C084FC" />
          <polygon points="64,18 70,22 64,24" fill="#F43F5E" />
          <!-- Left Tower -->
          <rect x="20" y="60" width="22" height="40" fill="#EDE9FE" />
          <polygon points="31,34 18,60 44,60" fill="#A855F7" />
          <!-- Right Tower -->
          <rect x="86" y="60" width="22" height="40" fill="#EDE9FE" />
          <polygon points="97,34 84,60 110,60" fill="#A855F7" />
          <!-- Gate Door -->
          <path d="M54 100 L54 84 Q64 78 74 84 L74 100 Z" fill="#7E22CE" />
          <!-- Windows -->
          <circle cx="64" cy="64" r="5" fill="#FEF08A" />
        `),
      },
      {
        filename: 'royal-unicorn.png',
        name: 'Royal Unicorn',
        svg: svgWrap(`
          <!-- Mane -->
          <path d="M28 44 Q36 22 64 24 Q52 50 34 64 Z" fill="#FB7185" />
          <path d="M78 24 Q96 32 98 60 Q86 46 76 34 Z" fill="#F43F5E" />
          <!-- Golden Horn -->
          <polygon points="64,10 70,36 58,36" fill="#FBBF24" />
          <!-- Ears -->
          <polygon points="38,30 46,44 32,46" fill="#FFFFFF" stroke="#FDA4AF" />
          <polygon points="90,30 96,46 82,44" fill="#FFFFFF" stroke="#FDA4AF" />
          <!-- Head -->
          <circle cx="64" cy="68" r="40" fill="#FFF1F2" stroke="#FECDD3" stroke-width="2" />
          <!-- Starry Eyes -->
          <circle cx="48" cy="64" r="5.5" fill="#881337" />
          <circle cx="50" cy="62" r="2" fill="#FFFFFF" />
          <circle cx="80" cy="64" r="5.5" fill="#881337" />
          <circle cx="82" cy="62" r="2" fill="#FFFFFF" />
          <!-- Muzzle -->
          <ellipse cx="64" cy="80" rx="16" ry="10" fill="#FFE4E6" />
          <path d="M60 84 Q64 88 68 84" stroke="#BE123C" stroke-width="2" fill="none" stroke-linecap="round" />
        `),
      },
      {
        filename: 'frog-prince.png',
        name: 'Frog Prince',
        svg: svgWrap(`
          <!-- Tiny Crown -->
          <polygon points="52,24 58,34 64,28 70,34 76,24 74,40 54,40" fill="#FBBF24" stroke="#D97706" />
          <!-- Big Frog Eyes -->
          <circle cx="40" cy="48" r="16" fill="#22C55E" />
          <circle cx="40" cy="48" r="10" fill="#FEF08A" />
          <circle cx="40" cy="48" r="5" fill="#052E16" />
          <circle cx="42" cy="46" r="2" fill="#FFFFFF" />
          <circle cx="88" cy="48" r="16" fill="#22C55E" />
          <circle cx="88" cy="48" r="10" fill="#FEF08A" />
          <circle cx="88" cy="48" r="5" fill="#052E16" />
          <circle cx="90" cy="46" r="2" fill="#FFFFFF" />
          <!-- Frog Face -->
          <ellipse cx="64" cy="72" rx="42" ry="32" fill="#16A34A" />
          <!-- Wide Grin -->
          <path d="M38 72 Q64 96 90 72" stroke="#052E16" stroke-width="3" fill="none" stroke-linecap="round" />
          <!-- Blush -->
          <circle cx="34" cy="72" r="6" fill="#F472B6" opacity="0.7" />
          <circle cx="94" cy="72" r="6" fill="#F472B6" opacity="0.7" />
        `),
      },
      {
        filename: 'magic-mirror.png',
        name: 'Magic Mirror',
        svg: svgWrap(`
          <!-- Handle -->
          <rect x="58" y="90" width="12" height="30" rx="6" fill="#D97706" stroke="#92400E" stroke-width="2" />
          <circle cx="64" cy="118" r="6" fill="#F59E0B" />
          <!-- Mirror Outer Frame -->
          <ellipse cx="64" cy="54" rx="42" ry="46" fill="#F59E0B" stroke="#B45309" stroke-width="3" />
          <!-- Glass -->
          <ellipse cx="64" cy="54" rx="32" ry="36" fill="#0284C7" stroke="#38BDF8" stroke-width="2" />
          <!-- Mystical Eyes in Mirror -->
          <circle cx="52" cy="52" r="4.5" fill="#E0F2FE" />
          <circle cx="76" cy="52" r="4.5" fill="#E0F2FE" />
          <path d="M58 64 Q64 70 70 64" stroke="#E0F2FE" stroke-width="2" fill="none" stroke-linecap="round" />
          <!-- Sparkles -->
          <polygon points="40,36 42,30 44,36 50,38 44,40 42,46 40,40 34,38" fill="#FEF08A" />
        `),
      },
    ],
  },
];

async function generateAllThemes() {
  console.log(`Starting Match-3 theme assets generation in: ${BASE_DIR}`);

  let totalGenerated = 0;

  for (const theme of THEME_DEFINITIONS) {
    const themeDir = path.join(BASE_DIR, theme.id);
    if (!fs.existsSync(themeDir)) {
      fs.mkdirSync(themeDir, { recursive: true });
    }

    for (const char of theme.characters) {
      const outPath = path.join(themeDir, char.filename);
      const svgBuffer = Buffer.from(char.svg.trim());

      await sharp(svgBuffer)
        .resize(128, 128)
        .png({ compressionLevel: 9 })
        .toFile(outPath);

      totalGenerated++;
      console.log(`  ✓ Generated ${theme.id}/${char.filename} (${fs.statSync(outPath).size} bytes)`);
    }
  }

  console.log(`\nSuccessfully generated ${totalGenerated} character assets across ${THEME_DEFINITIONS.length} themes!`);
}

generateAllThemes().catch((err) => {
  console.error('Error generating theme assets:', err);
  process.exit(1);
});
