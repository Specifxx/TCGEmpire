// The trial is off by default since 2026-10-26 (Pro is bought straight, like
// Collectr PRO), but the trial-offer email and its guards still exist for the
// day it returns. A test of that machinery imports this FIRST, so the trial
// config (read once, at import) sees a free 30-day trial, as an env would set it.
process.env.PREMIUM_TRIAL_DAYS ??= "30";
process.env.PREMIUM_TRIAL_FEE_CENTS ??= "0";
