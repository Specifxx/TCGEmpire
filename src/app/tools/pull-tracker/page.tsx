import { permanentRedirect } from "next/navigation";

// The tracker lives per set; the bare path goes to the newest set.
export default function PullTrackerIndex() {
  permanentRedirect("/tools/pull-tracker/radiance");
}
