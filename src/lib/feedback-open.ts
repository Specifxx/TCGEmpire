// The window event that opens the feedback panel (FeedbackWidget). Its own
// file so the footer's FeedbackLink and the "Rate us" strip do not pull the
// panel into every page. `detail.rating` preselects that many stars.
export const FEEDBACK_OPEN_EVENT = "rc:feedback-open";

export function openFeedback(rating?: number): void {
  window.dispatchEvent(new CustomEvent(FEEDBACK_OPEN_EVENT, { detail: { rating } }));
}
