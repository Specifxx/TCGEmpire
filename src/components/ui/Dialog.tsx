"use client";

import { useEffect, useRef, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { usePresence, DUR } from "@/lib/motion";

// ── Shared, refcounted body-level side effects ──────────────────────────────
// Both hooks are exported so CinematicNavMenu — the one overlay that stays
// permanently mounted and toggles via classes instead of mount/unmount — can
// opt into the SAME scroll lock and the SAME `rcDialog` flag every Dialog
// instance uses, rather than keeping its own separate copies (which is how it
// used to work, and why the phone nav menu never made the corner nudges yield
// the way every other overlay did).
//
// Refcounted, not a plain boolean: two overlays can legitimately be open at
// once (a PriceAlertModal opened from inside the still-open phone nav menu),
// so the lock/flag must only clear once the LAST one closes, not the first.
let scrollLockCount = 0;
let prevBodyOverflow = "";
export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (scrollLockCount === 0) {
      prevBodyOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
    }
    scrollLockCount++;
    return () => {
      scrollLockCount = Math.max(0, scrollLockCount - 1);
      if (scrollLockCount === 0) document.body.style.overflow = prevBodyOverflow;
    };
  }, [active]);
}

let modalFlagCount = 0;
/**
 * Sets `document.body.dataset.rcDialog = "1"` while ANY Dialog-based overlay
 * is mounted — the signal the three corner nudges (PremiumSlideIn,
 * SignupPromoPopup, AnnualSwitchNudge) check before showing themselves, so a
 * nudge never pops up over an open dialog.
 */
export function useModalFlag(active: boolean) {
  useEffect(() => {
    if (!active) return;
    if (modalFlagCount === 0) document.body.dataset.rcDialog = "1";
    modalFlagCount++;
    return () => {
      modalFlagCount = Math.max(0, modalFlagCount - 1);
      if (modalFlagCount === 0) delete document.body.dataset.rcDialog;
    };
  }, [active]);
}

export type DialogSize = "md" | "lg" | "xl" | "2xl" | "3xl";
export type DialogPlacement = "center" | "top" | "sheet";
export type DialogZ = "overlay" | "modal" | "sheet";

// Literal strings, not `max-w-${size}` — Tailwind's content scanner only picks
// up class names it can see verbatim in source, so an interpolated utility
// name would silently never be generated.
const SIZE_CLASS: Record<DialogSize, string> = {
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
  "3xl": "max-w-3xl",
};
const Z_CLASS: Record<DialogZ, string> = {
  overlay: "z-overlay",
  modal: "z-modal",
  sheet: "z-sheet",
};

/**
 * The overlay shell every dialog/sheet on the site should be built on —
 * introduced to replace seven hand-rolled modals (QuickView, SealedQuickView,
 * PremiumDialog, CommandLauncher, PriceAlertModal, ReportPriceButton,
 * FeedbackWidget) that each reimplemented scroll lock, Escape and (in six of
 * the seven cases) had no focus trap and no focus restore at all.
 *
 * Owns: mount/unmount + enter/exit timing (usePresence), scroll lock, the
 * `rcDialog` flag, Escape-to-close, a Tab focus trap, and focus save/restore.
 * Does NOT own header/body/footer chrome, backdrop click semantics beyond
 * "closes", or business logic — those stay with each caller.
 *
 * `placement="center"` reuses the scroll-safe shape PremiumDialog introduced
 * (see its own history): the OVERLAY scrolls, not the card, `h-[100dvh]` +
 * safe-area padding so iOS Safari's browser chrome never eats the close
 * button on a short phone. `placement="top"` is the same shell anchored near
 * the top instead of vertically centered (CommandLauncher's shape — a long
 * result list reads better anchored than centered). `placement="sheet"` is a
 * true bottom sheet below `sm`, a centred dialog from `sm` up.
 */
export function Dialog({
  open,
  onClose,
  children,
  label,
  labelledBy,
  size = "md",
  placement = "center",
  z = "modal",
  initialFocusRef,
  className = "",
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label?: string;
  labelledBy?: string;
  size?: DialogSize;
  placement?: DialogPlacement;
  z?: DialogZ;
  initialFocusRef?: RefObject<HTMLElement>;
  className?: string;
}) {
  const { mounted, entered } = usePresence(open, DUR.fast);
  const panelRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  useScrollLock(mounted);
  useModalFlag(mounted);

  // Escape-to-close + focus save/restore bracket the whole MOUNTED lifetime,
  // not just `open` — so the exit transition can still play with focus
  // already back on the trigger, and a second dialog opening mid-exit can't
  // steal the restore target.
  useEffect(() => {
    if (!mounted) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Move focus in once the panel exists and has finished entering. Defers to
  // whatever already grabbed focus (a consumer's native `autoFocus` input,
  // e.g. CommandLauncher's search field) rather than stealing it back — and
  // otherwise honours the same `[data-autofocus]` marker CinematicNavMenu
  // already used before Dialog existed.
  useEffect(() => {
    if (!entered) return;
    const panel = panelRef.current;
    if (!panel) return;
    if (panel.contains(document.activeElement)) return;
    const target = initialFocusRef?.current ?? panel.querySelector<HTMLElement>("[data-autofocus]") ?? panel;
    target?.focus();
  }, [entered, initialFocusRef]);

  // Same Tab-loop algorithm as CinematicNavMenu, the site's one existing
  // focus-trapped overlay before this file.
  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const focusables = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (!focusables || focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  if (!mounted) return null;

  const ariaProps = labelledBy ? { "aria-labelledby": labelledBy } : { "aria-label": label };

  if (placement === "sheet") {
    return (
      <div className={`fixed inset-0 ${Z_CLASS[z]} flex items-end justify-center p-0 sm:items-center sm:p-4`} role="dialog" aria-modal="true" {...ariaProps}>
        <div
          className={`absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-base ${entered ? "opacity-100" : "motion-safe:opacity-0"}`}
          onClick={onClose}
          aria-hidden
        />
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className={`card-surface relative max-h-[92vh] w-full ${SIZE_CLASS[size]} overflow-y-auto rounded-b-none transition-[opacity,transform] ease-out sm:rounded-xl ${
            entered
              ? "duration-base translate-y-0 opacity-100 sm:scale-100"
              : "duration-fast motion-safe:translate-y-full motion-safe:opacity-0 sm:motion-safe:translate-y-2 sm:motion-safe:scale-[0.98]"
          } ${className}`}
        >
          {children}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 ${Z_CLASS[z]} h-[100dvh] overflow-y-auto p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]`}
      role="dialog"
      aria-modal="true"
      {...ariaProps}
    >
      <div
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-base ${entered ? "opacity-100" : "motion-safe:opacity-0"}`}
        onClick={onClose}
        aria-hidden
      />
      <div className={`relative flex min-h-full justify-center ${placement === "top" ? "items-start pt-[7vh]" : "items-center"}`}>
        <div
          ref={panelRef}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={onKeyDown}
          className={`relative w-full ${SIZE_CLASS[size]} transition-[opacity,transform] ease-out ${
            entered
              ? "duration-base translate-y-0 scale-100 opacity-100"
              : "duration-fast motion-safe:translate-y-2 motion-safe:scale-[0.98] motion-safe:opacity-0"
          } ${className}`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
