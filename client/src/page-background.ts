/** CSS variable for the letterbox and the phone rotate panel. */
export const PAGE_BACKGROUND_VAR = '--cardhouse-bg';

/** Paints the page behind the 960×540 frame. The default in `index.html` is green. */
export function applyPageBackground(
  hex: string,
  doc: Document = document,
): void {
  const root = doc.documentElement;
  root.style.setProperty(PAGE_BACKGROUND_VAR, hex);
  root.style.background = hex;
  doc.body.style.background = hex;
  const app = doc.querySelector('#app');
  if (app instanceof HTMLElement) {
    app.style.background = hex;
  }
}
