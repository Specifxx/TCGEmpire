"use client";

import { Component, type ReactNode } from "react";

// Component-scoped error boundary for the games. A crash inside a game must
// never take down the whole page (the route-level boundary replaces ads,
// newsletter and nav too) — instead we contain it, SHOW THE ERROR MESSAGE so
// bug reports identify the exact crash, and offer an in-place retry that
// remounts the game fresh.
export class GameBoundary extends Component<
  { children: ReactNode },
  { error: Error | null; attempt: number }
> {
  state = { error: null as Error | null, attempt: 0 };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("[game-boundary]", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="card-surface mx-auto max-w-2xl p-6 text-center">
          <p className="text-lg font-bold text-white">The game hit a snag</p>
          <p className="mx-auto mt-1 max-w-md break-words text-xs text-slate-500">
            {String(this.state.error?.message ?? this.state.error)}
          </p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button
              onClick={() => this.setState((s) => ({ error: null, attempt: s.attempt + 1 }))}
              className="btn-primary text-sm"
            >
              Try again
            </button>
            <button
              onClick={() => {
                // Saved game state is the most common crash source — clear this
                // game's keys and remount fresh.
                try {
                  for (const k of Object.keys(localStorage)) {
                    if (/^riftle/i.test(k)) localStorage.removeItem(k);
                  }
                } catch {
                  /* storage unavailable */
                }
                this.setState((s) => ({ error: null, attempt: s.attempt + 1 }));
              }}
              className="btn-ghost text-sm"
            >
              Reset saved game
            </button>
          </div>
        </div>
      );
    }
    // Bump the key on retry so the child remounts with clean state.
    return <div key={this.state.attempt}>{this.props.children}</div>;
  }
}
