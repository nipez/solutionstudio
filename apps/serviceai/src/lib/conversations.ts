import { normalizePhone } from "./booking/engine";
import type {
  Channel,
  Conversation,
  ConversationMessage,
  MessageRole,
  ShopState,
} from "./types";

function id(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
}

export function createConversation(
  state: ShopState,
  opts: {
    channel: Channel;
    fromPhone: string;
    fromName?: string;
    fromEmail?: string;
    subject?: string;
    atIso: string;
    customerId?: string;
    openingMessage?: { role: MessageRole; body: string; channel?: Channel };
  },
): { state: ShopState; conversation: Conversation } {
  const messages: ConversationMessage[] = [];
  if (opts.openingMessage) {
    messages.push({
      id: id("msg"),
      role: opts.openingMessage.role,
      channel: opts.openingMessage.channel ?? opts.channel,
      body: opts.openingMessage.body,
      atIso: opts.atIso,
    });
  }
  const conversation: Conversation = {
    id: id("conv"),
    channel: opts.channel,
    fromPhone: normalizePhone(opts.fromPhone),
    fromEmail: opts.fromEmail,
    fromName: opts.fromName,
    subject: opts.subject,
    status: "in_progress",
    customerId: opts.customerId,
    humanTakeover: false,
    createdAtIso: opts.atIso,
    updatedAtIso: opts.atIso,
    messages,
  };
  return {
    state: { ...state, conversations: [conversation, ...state.conversations] },
    conversation,
  };
}

export function appendConversationMessage(
  state: ShopState,
  conversationId: string,
  role: MessageRole,
  body: string,
  channel: Channel,
  atIso = new Date().toISOString(),
  meta?: Record<string, string>,
): ShopState {
  return {
    ...state,
    conversations: state.conversations.map((c) =>
      c.id === conversationId
        ? {
            ...c,
            updatedAtIso: atIso,
            messages: [
              ...c.messages,
              { id: id("msg"), role, channel, body, atIso, meta },
            ],
          }
        : c,
    ),
  };
}

export function setHumanTakeover(
  state: ShopState,
  conversationId: string,
  takeover: boolean,
  note?: string,
): ShopState {
  const atIso = new Date().toISOString();
  let next = {
    ...state,
    conversations: state.conversations.map((c) =>
      c.id === conversationId
        ? { ...c, humanTakeover: takeover, updatedAtIso: atIso }
        : c,
    ),
  };
  if (note) {
    next = appendConversationMessage(
      next,
      conversationId,
      "human",
      note,
      next.conversations.find((c) => c.id === conversationId)?.channel ?? "voice",
      atIso,
    );
  } else {
    next = appendConversationMessage(
      next,
      conversationId,
      "system",
      takeover ? "Human takeover enabled" : "AI resumed",
      "voice",
      atIso,
    );
  }
  return next;
}

export function findOrCreateSmsThread(
  state: ShopState,
  fromPhone: string,
  atIso: string,
  fromName?: string,
): { state: ShopState; conversation: Conversation } {
  const phone = normalizePhone(fromPhone);
  const existing = state.conversations.find(
    (c) => c.channel === "sms" && c.fromPhone === phone && c.status === "in_progress",
  );
  if (existing) return { state, conversation: existing };
  return createConversation(state, {
    channel: "sms",
    fromPhone: phone,
    fromName,
    atIso,
  });
}
