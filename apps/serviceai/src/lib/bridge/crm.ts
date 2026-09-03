/**
 * Data Bridge — CRM / field-service adapters.
 *
 * Today: InAppCrmStub writes customer / property / job / appointment into
 * shop state (`crmRecords`). Later: implement CrmAdapter for ServiceTitan,
 * Housecall Pro, Jobber without changing the booking engine.
 */

import type { CrmRecord, JobRecord, ShopState } from "../types";

export interface CrmAdapter {
  readonly system: string;
  writeJob(state: ShopState, job: JobRecord): { state: ShopState; record: CrmRecord };
}

export class InAppCrmStub implements CrmAdapter {
  readonly system = "in_app_stub";

  writeJob(state: ShopState, job: JobRecord): { state: ShopState; record: CrmRecord } {
    const record: CrmRecord = {
      id: `crm_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      externalSystem: "in_app_stub",
      customerId: job.customerId ?? "unknown",
      customerName: job.customerName,
      phone: job.fromPhone,
      propertyId: job.propertyId,
      propertyAddress: job.propertyAddress,
      jobId: job.id,
      jobType: job.jobType,
      urgency: job.urgency,
      status: job.status,
      appointmentStartIso: job.appointmentStartIso,
      appointmentEndIso: job.appointmentEndIso,
      technicianName: job.technicianName,
      writtenAtIso: new Date().toISOString(),
      notes: [...job.notes],
    };

    const jobs = state.jobs.map((j) =>
      j.id === job.id ? { ...j, crmRecordId: record.id } : j,
    );
    const next: ShopState = {
      ...state,
      jobs,
      crmRecords: [record, ...state.crmRecords],
    };
    return { state: next, record };
  }
}

export const defaultCrmAdapter: CrmAdapter = new InAppCrmStub();

/**
 * How production connectors would plug in later (not implemented):
 *
 * - ServiceTitan: OAuth app → Customers / Locations / Jobs / Appointments APIs
 * - Housecall Pro: API key → customers, jobs, schedule
 * - Jobber: GraphQL → clients, requests, visits
 *
 * Map JobRecord → provider payload in a thin adapter; keep booking/engine pure.
 */
export const BRIDGE_PROVIDER_NOTES = {
  serviceTitan:
    "Implement CrmAdapter.writeJob with ST Jobs + Appointments create; store external IDs on CrmRecord.",
  housecallPro:
    "Implement with HCP jobs endpoint; map propertyAddress → address fields.",
  jobber:
    "Implement with Jobber GraphQL request + visit; use after OAuth.",
} as const;
