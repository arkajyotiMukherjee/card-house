// Excalibur's ESM build reads `window` while the module loads. Vitest runs in Node.
const scope = globalThis as unknown as Record<string, unknown>;

if (scope.window === undefined) {
  scope.window = globalThis;
}
if (scope.document === undefined) {
  scope.document = { createElement: () => ({}) };
}
if (scope.Image === undefined) {
  scope.Image = class Image {
    src = '';
    setAttribute(): void {}
  };
}
if (scope.HTMLImageElement === undefined) {
  scope.HTMLImageElement = class HTMLImageElement {};
}
if (scope.HTMLCanvasElement === undefined) {
  scope.HTMLCanvasElement = class HTMLCanvasElement {};
}
