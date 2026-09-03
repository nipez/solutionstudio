/**
 * Email adapter stub — records follow-up emails on the conversation.
 * No SendGrid / Mailgun keys required.
 */

import { appendConversationMessage, createConversation } from "../conversations";
import type { JobRecord, ShopState } from "../types";

export function sendBookingFollowUpEmail(
  state: ShopState,
  job: JobRecord,
  atIso = new Date().toISOString(),
): { state: ShopState; conversationId: string; body: string } {
  const customer = state.customers.find((c) => c.id === job.customerId);
  const toEmail = customer?.email ?? `${job.fromPhone.replace(/\D/g, "")}@sms.local`;
  const appointment = job.appointmentStartIso
    ? new Intl.DateTimeFormat("en-US", {
        timeZone: state.shop.timezone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date(job.appointmentStartIso))
    : "TBD";

  const body = [
    `Hi ${job.customerName},`,
    ``,
    `Thanks for choosing ${state.shop.name}. This confirms your ${job.jobType.replace(/_/g, " ")} visit.`,
    job.technicianName
      ? `Technician: ${job.technicianName} · ${appointment}`
      : `We'll follow up with timing shortly.`,
    job.propertyAddress ? `Service address: ${job.propertyAddress}` : "",
    ``,
    `Reply to this email if you need to reschedule. — ${state.shop.name}`,
  ]
    .filter(Boolean)
    .join("\n");

  let next = state;
  let conversationId = job.conversationId;

  if (conversationId) {
    next = appendConversationMessage(
      next,
      conversationId,
      "ai",
      body,
      "email",
      atIso,
      { to: toEmail, subject: `Booking confirmation — ${state.shop.name}` },
    );
  } else {
    const created = createConversation(next, {
      channel: "email",
      fromPhone: job.fromPhone,
      fromName: job.customerName,
      fromEmail: toEmail,
      subject: `Booking confirmation — ${state.shop.name}`,
      atIso,
      customerId: job.customerId,
      openingMessage: { role: "ai", body, channel: "email" },
    });
    next = created.state;
    conversationId = created.conversation.id;
    next = {
      ...next,
      jobs: next.jobs.map((j) =>
        j.id === job.id ? { ...j, conversationId } : j,
      ),
    };
  }

  return { state: next, conversationId: conversationId!, body };
}
