// Global Browser DOM Polyfills for SSR / Bun Tests
const g = globalThis as any;
g.window = g;
g.Image = class Image {};
g.HTMLCanvasElement = class HTMLCanvasElement {};
g.HTMLVideoElement = class HTMLVideoElement {};

const mockContext = {
  fillStyle: '',
  fillRect: () => {},
  putImageData: () => {},
  getImageData: () => ({ data: [0, 0, 0, 0] }),
  drawImage: () => {},
};

g.document = {
  createElement: () => ({ getContext: () => mockContext }),
  documentElement: {},
  addEventListener: () => {},
  removeEventListener: () => {},
};

g.navigator = { userAgent: 'node' };

export {};
