import type { IncomingCallContext, Urgency } from "../types";

/** Lightweight SMS / form intent parser — same shape the voice NLU would emit. */
export function parseSmsIntent(
  text: string,
  fromPhone: string,
  calledAtIso: string,
  extras?: {
    newCallerName?: string;
    newCallerAddress?: string;
  },
): IncomingCallContext {
  const lower = text.toLowerCase();
  let jobType = "general_service";
  let urgency: Urgency = "routine";
  let requestHuman = false;

  if (/gas\s*smell|smell\s*gas/.test(lower)) {
    jobType = "gas_smell";
    urgency = "emergency";
  } else if (/carbon\s*monoxide|\bco\b\s*detector/.test(lower)) {
    jobType = "carbon_monoxide";
    urgency = "emergency";
  } else if (/no\s*heat|not\s*heating|furnace.*(cold|dead|out)|freezing/.test(lower)) {
    jobType = "no_heat";
    urgency = "emergency";
  } else if (/no\s*cool|ac\s*(out|broke|broken)|not\s*cooling/.test(lower)) {
    jobType = "no_cool";
    urgency = "same_day";
  } else if (/tune[\s-]*up|maintenance|filter/.test(lower)) {
    jobType = "tune_up";
    urgency = "routine";
  }

  if (/speak to (a )?person|talk to (a )?human|real person|call me/.test(lower)) {
    requestHuman = true;
  }

  return {
    fromPhone,
    calledAtIso,
    problemSummary: text.trim(),
    jobType,
    urgency,
    newCallerName: extras?.newCallerName,
    newCallerAddress: extras?.newCallerAddress,
    requestHuman,
    channel: "sms",
  };
}
