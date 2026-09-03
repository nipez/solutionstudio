/**
 * Post-booking orchestration: CRM writeback + journey kickoff.
 * Keeps booking/engine focused on rules; channels call this after book/escalate.
 */

import { defaultCrmAdapter } from "./bridge/crm";
import {
  advanceJourney,
  maybeStartAfterHoursEmergencyJourney,
} from "./journeys/runner";
import type { JobRecord, JourneyRun, ShopState } from "./types";

export function afterJobCommitted(
  state: ShopState,
  job: JobRecord,
  opts?: { runImmediateJourneySteps?: boolean; nowIso?: string },
): { state: ShopState; job: JobRecord; crmId?: string; journeyRun?: JourneyRun } {
  const nowIso = opts?.nowIso ?? new Date().toISOString();
  const crm = defaultCrmAdapter.writeJob(state, job);
  let next = crm.state;
  let updatedJob =
    next.jobs.find((j) => j.id === job.id) ?? { ...job, crmRecordId: crm.record.id };

  let journeyRun: JourneyRun | undefined;
  if (job.conversationId && job.status === "booked") {
    const started = maybeStartAfterHoursEmergencyJourney(
      next,
      updatedJob,
      job.conversationId,
      nowIso,
    );
    next = started.state;
    journeyRun = started.run;

    if (journeyRun && opts?.runImmediateJourneySteps !== false) {
      // Fire system + SMS confirm immediately; leave morning reminder pending.
      let run = journeyRun;
      for (let i = 0; i < 2; i++) {
        const advanced = advanceJourney(next, run.id, nowIso, { force: true });
        next = advanced.state;
        run = advanced.run;
        if (run.status !== "running") break;
      }
      journeyRun = run;
      updatedJob = next.jobs.find((j) => j.id === job.id) ?? updatedJob;
    }
  }

  return {
    state: next,
    job: updatedJob,
    crmId: crm.record.id,
    journeyRun,
  };
}

export function afterEscalationCommitted(
  state: ShopState,
  job: JobRecord,
): { state: ShopState; job: JobRecord; crmId: string } {
  const crm = defaultCrmAdapter.writeJob(state, job);
  return {
    state: crm.state,
    job: crm.state.jobs.find((j) => j.id === job.id) ?? {
      ...job,
      crmRecordId: crm.record.id,
    },
    crmId: crm.record.id,
  };
}
