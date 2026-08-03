/**
 * The image size budget, in one place.
 *
 * It was declared twice — once in optimize-images.ts as the encoder's target and
 * once in check-images.ts as the build gate's ceiling — kept in sync by a comment.
 * Raise one without the other and you get either a build that fails on files the
 * optimiser considers finished, or a gate that waves through files the optimiser
 * never shrank.
 */

/** Hard ceiling from the SEO audit: nothing served out of public/ may exceed it. */
export const MAX_BYTES = 150 * 1024;

/** What the optimiser aims for — headroom so a later re-encode can't tip over. */
export const TARGET_BYTES = 120 * 1024;
