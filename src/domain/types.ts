export type ProviderId = "copilot" | "chatgpt";
export type SourceKind = "conversation" | "shared";
export type MessageRole = "user" | "assistant" | "unknown";

export type RawMessage = {
  ordinal: number;
  role: MessageRole;
  content: string;
  providerMessageId?: string;
};

export type RawCapture = {
  provider: ProviderId;
  sourceUrl: string;
  sourceId: string;
  sourceKind: SourceKind;
  title: string | null;
  parserVersion: string;
  messages: RawMessage[];
};

export type Message = {
  id: string;
  ordinal: number;
  role: MessageRole;
  content: string;
  providerMessageId?: string;
};

export type Conversation = {
  id: string;
  provider: ProviderId;
  sourceUrl: string;
  sourceId: string;
  sourceKind: SourceKind;
  title: string;
  capturedAt: string;
  parserVersion: string;
  contentHash: string;
  messages: Message[];
};

export type ThoughtNode = {
  id: string;
  ordinal: number;
  role: MessageRole;
  messageId: string;
};

export type CaptureFailureCode =
  | "login_required"
  | "not_ready"
  | "empty_conversation"
  | "incomplete_conversation"
  | "unrecognized_structure"
  | "unsupported_page";

export type ParseResult =
  | { ok: true; capture: RawCapture }
  | { ok: false; code: CaptureFailureCode };
