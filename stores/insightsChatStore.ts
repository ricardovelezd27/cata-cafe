import { create } from "zustand";
import type { AiChatBlock } from "@/lib/ai/chatTypes";

// Ephemeral (no persist middleware) client-only store for the insights "ask
// the data" chat. Ephemeral by design: the conversation survives SPA
// route/tab switches within /app/insights (the store instance lives for the
// life of the module, i.e. the browser tab) but resets on a hard reload —
// there is no expectation of durable chat history here.

export interface ChatUiMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  blocks?: AiChatBlock[];
  citations?: string[];
  /** True for an assistant-side failure bubble (styled differently, excluded from history sent back to the server action). */
  error?: boolean;
}

export interface ChatUsage {
  used: number;
  limit: number;
  remaining: number;
}

interface InsightsChatState {
  messages: ChatUiMessage[];
  usage: ChatUsage | null;
  pending: boolean;
  append: (msg: ChatUiMessage) => void;
  setUsage: (u: ChatUsage | null) => void;
  setPending: (p: boolean) => void;
  clear: () => void;
}

export const useInsightsChatStore = create<InsightsChatState>((set) => ({
  messages: [],
  usage: null,
  pending: false,
  append: (msg) => set((state) => ({ messages: [...state.messages, msg] })),
  setUsage: (u) => set({ usage: u }),
  setPending: (p) => set({ pending: p }),
  // Keeps `usage` (server-tracked daily quota — clearing the transcript
  // doesn't change it) but resets the visible conversation.
  clear: () => set({ messages: [] }),
}));
