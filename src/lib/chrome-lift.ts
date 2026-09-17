/**
 * How far to lift the phone's bottom tab bar so a browser's own collapsible
 * chrome cannot sit on top of it — as pure arithmetic, with no DOM in sight.
 *
 * WHY IT LIVES HERE RATHER THAN INSIDE THE COMPONENT. This is the third bug in
 * a row on the same few lines of maths (see BottomTabBar.tsx's doc comment for
 * the first two), and every test written against it so far could only read the
 * source and assert that certain WORDS appeared. That catches a deletion; it
 * cannot catch a wrong number. A `position: fixed` bar under a collapsing URL
 * bar is also not reproducible in headless Chromium, which has no chrome to
 * collapse — so a real browser was never going to be the answer either. Pulling
 * the decision out into a function that takes three numbers and returns one
 * makes every case a unit test: see tests/mobile-bottom-bar.test.ts.
 *
 * THE MEASUREMENT. `visualViewport.height` is the screen minus whatever the
 * browser is currently covering it with. The tallest value seen is therefore the
 * screen with the chrome fully retracted, and the difference between that and
 * the current value is how much chrome is out right now. Both numbers come from
 * the same API, so they cannot disagree about what "the viewport" means the way
 * two different CSS units did in the first version of this.
 *
 * THE TWO THINGS THAT ARE NOT CHROME, both of which shipped as bugs:
 *
 *   1. PINCH-ZOOM shrinks the visual viewport without any chrome appearing.
 *      Treating that as chrome lifted the bar by hundreds of pixels into the
 *      middle of the page. `scale` is how you tell the difference.
 *   2. A GEOMETRY CHANGE — unfolding a foldable, rotating — retires the old
 *      maximum. It belongs to a screen that no longer exists, and since the
 *      maximum only ever grows, every later reading sits below it and the bar
 *      lifts by the difference between two devices, permanently. The layout
 *      viewport's WIDTH is the signal, because it ignores both chrome and zoom
 *      and changes exactly when the device does.
 */

/** `visualViewport.scale` is a float and settles a hair off 1 after a gesture. */
export const ZOOM_EPSILON = 0.01;

/**
 * No mobile browser's chrome covers a quarter of the screen.
 *
 * Belt and braces over the two named fixes above: whatever produces a lift that
 * large, it is a misreading, and the failure this prevents (the bar stranded
 * mid-page, which is what the visitor photographed) is far worse than the one it
 * risks (the bar sitting a little low under unusually tall chrome).
 */
export const MAX_LIFT_RATIO = 0.25;

export interface ChromeLiftState {
  /** Tallest `visualViewport.height` seen for the CURRENT layout viewport. */
  maxHeight: number;
  /** The layout viewport width that `maxHeight` was learned against. */
  layoutWidth: number;
}

export interface ViewportReading {
  /** `visualViewport.height`. */
  height: number;
  /** `visualViewport.scale` — 1 unless the visitor has pinch-zoomed. */
  scale: number;
  /**
   * `document.documentElement.clientWidth` — the LAYOUT viewport width.
   *
   * Deliberately not `window.innerHeight`: that tracks the chrome on iOS
   * Safari, so using it as the geometry signal would reset the maximum on every
   * scroll and reinstate the original "bar hidden until you scroll" bug.
   */
  layoutWidth: number;
}

/**
 * The next state and the lift to apply, in CSS pixels. Pure — same inputs, same
 * outputs, no reads of anything global.
 */
export function nextChromeLift(
  state: ChromeLiftState,
  reading: ViewportReading
): { state: ChromeLiftState; lift: number } {
  // A different layout viewport is a different screen: the old maximum cannot
  // describe it, so it is replaced rather than carried forward.
  let { maxHeight } = state;
  if (reading.layoutWidth !== state.layoutWidth) maxHeight = reading.height;

  const next: ChromeLiftState = { maxHeight, layoutWidth: reading.layoutWidth };

  // Zoomed: the missing height is the visitor's own doing. No lift, and the
  // maximum is NOT learned from a reading that does not mean what it usually
  // means — it stays valid for when they zoom back out.
  if (Math.abs(reading.scale - 1) > ZOOM_EPSILON) return { state: next, lift: 0 };

  if (reading.height > maxHeight) next.maxHeight = reading.height;
  const measured = Math.max(0, Math.round(next.maxHeight - reading.height));
  return { state: next, lift: Math.min(measured, Math.round(next.maxHeight * MAX_LIFT_RATIO)) };
}
