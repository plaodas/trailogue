import { useEffect, useRef, useState } from "react";
import type { DashboardPhase, DashboardStatus } from "../capture/status";
import { transition, type SessionEvent, type SessionState } from "../capture/session";
import { normalize } from "../domain/normalize";
import type { CaptureFailureCode, Conversation, MessageRole, ProviderId } from "../domain/types";
import type { ConversationRepository } from "../storage/repository";
import type { CapturePort, CaptureRead } from "./capturePort";
import { copy, failureCopy } from "./copy";

const RETRY_INTERVAL_MS = 2000;
const RETRY_WINDOW_MS = 10000;

type Props = {
  repository: ConversationRepository;
  capture: CapturePort;
};

export function Dashboard({ repository, capture }: Props) {
  const [session, setSession] = useState<SessionState>("idle");
  const [phase, setPhase] = useState<DashboardPhase | null>(null);
  const [records, setRecords] = useState<Conversation[]>([]);
  const [draft, setDraft] = useState<Conversation | null>(null);
  const [existing, setExisting] = useState<Conversation | null>(null);
  const [failure, setFailure] = useState<CaptureFailureCode | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const [changed, setChanged] = useState(false);
  const [reading, setReading] = useState<Conversation | null>(null);
  const [domWaitExpired, setDomWaitExpired] = useState(false);

  const sessionRef = useRef<SessionState>("idle");
  const tabIdRef = useRef<number | null>(null);
  const attempt = useRef(0);
  const seen = useRef("");
  const waitStarted = useRef<number | null>(null);
  const repositoryRef = useRef(repository);
  const captureRef = useRef(capture);
  const onStatusRef = useRef<(status: DashboardStatus) => void>(() => {});
  const readTab = useRef<(tabId: number) => Promise<void>>(async () => {});
  repositoryRef.current = repository;
  captureRef.current = capture;

  function move(event: SessionEvent) {
    const next = transition(sessionRef.current, event);
    sessionRef.current = next;
    setSession(next);
    return next;
  }

  async function refresh() {
    setRecords(await repositoryRef.current.list());
  }

  readTab.current = async (tabId: number) => {
    const current = ++attempt.current;
    let result: CaptureRead;
    try {
      result = await captureRef.current.read(tabId);
    } catch {
      result = { ok: false, code: "not_ready" };
    }
    if (current !== attempt.current || sessionRef.current !== "inspecting") return;
    if (isTabClosed(result)) {
      move({ type: "tab_closed" });
      return;
    }
    if (!result.ok) {
      setFailure(result.code);
      move({ type: "result", code: result.code });
      return;
    }
    const normalized = await normalize(result.capture, {
      id: "preview",
      capturedAt: "1970-01-01T00:00:00.000Z",
    });
    if (current !== attempt.current || sessionRef.current !== "inspecting") return;
    const [stored, all] = await Promise.all([
      repositoryRef.current.findByHash(normalized.contentHash),
      repositoryRef.current.list(),
    ]);
    if (current !== attempt.current || sessionRef.current !== "inspecting") return;
    setRecords(all);
    setChanged(
      all.some(
        (item) => item.sourceId === normalized.sourceId && item.contentHash !== normalized.contentHash,
      ),
    );
    setDraft(normalized);
    setExisting(stored ?? null);
    setSaveFailed(false);
    setFailure(null);
    const preview = transition(sessionRef.current, { type: "captured" });
    sessionRef.current = stored ? transition(preview, { type: "same_hash" }) : preview;
    setSession(sessionRef.current);
  };

  onStatusRef.current = (status) => {
    if (status.generation === 0) return;
    const key = `${status.generation}:${status.phase}`;
    if (seen.current === key) return;
    seen.current = key;
    attempt.current += 1;
    tabIdRef.current = status.tabId;
    waitStarted.current = null;
    setDomWaitExpired(false);
    setDraft(null);
    setExisting(null);
    setReading(null);
    setSaveFailed(false);
    setChanged(false);
    setFailure(null);
    setPhase(status.phase);
    if (!status.allowed) {
      sessionRef.current = transition("idle", { type: "begin", allowed: false });
      setSession(sessionRef.current);
      return;
    }
    sessionRef.current = transition("idle", { type: "begin", allowed: true });
    if (status.phase === "closed") {
      sessionRef.current = transition(sessionRef.current, { type: "tab_closed" });
    }
    setSession(sessionRef.current);
    if (status.phase === "ready" && status.tabId !== null) {
      void readTab.current(status.tabId);
    }
  };

  useEffect(() => {
    void refresh();
  }, [repository]);

  useEffect(() => {
    let alive = true;
    const unsubscribe = capture.watch((status) => {
      if (!alive) return;
      onStatusRef.current(status);
    });
    return () => {
      alive = false;
      attempt.current += 1;
      unsubscribe();
    };
  }, [capture]);

  useEffect(() => {
    if (session !== "waiting_for_dom" || domWaitExpired || tabIdRef.current === null) return;
    if (waitStarted.current === null) waitStarted.current = Date.now();
    const started = waitStarted.current;
    const tabId = tabIdRef.current;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let resolveWait: (() => void) | undefined;

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        resolveWait = resolve;
        timer = setTimeout(resolve, ms);
      });

    void (async () => {
      while (!cancelled) {
        const elapsed = Date.now() - started;
        if (elapsed >= RETRY_WINDOW_MS) {
          setDomWaitExpired(true);
          return;
        }
        await wait(Math.min(RETRY_INTERVAL_MS, RETRY_WINDOW_MS - elapsed));
        if (cancelled) return;
        if (Date.now() - started >= RETRY_WINDOW_MS) {
          setDomWaitExpired(true);
          return;
        }
        if (sessionRef.current !== "waiting_for_dom") return;
        move({ type: "retry" });
        await readTab.current(tabId);
        if (cancelled || sessionRef.current !== "waiting_for_dom") return;
      }
    })();

    return () => {
      cancelled = true;
      if (timer !== undefined) clearTimeout(timer);
      resolveWait?.();
    };
  }, [session, domWaitExpired]);

  async function save() {
    const raw = draft;
    const live = () => sessionRef.current;
    if (!raw || live() !== "preview") return;
    move({ type: "save" });
    try {
      const conversation = await normalize(captureOf(raw), {
        id: crypto.randomUUID(),
        capturedAt: new Date().toISOString(),
      });
      const stored = await repositoryRef.current.insert(conversation);
      if (live() !== "saving") return;
      const all = await repositoryRef.current.list();
      if (live() !== "saving") return;
      setRecords(all);
      setDraft(stored);
      setSaveFailed(false);
      setReading(stored);
      move({ type: "stored" });
    } catch {
      if (live() !== "saving") return;
      setSaveFailed(true);
      move({ type: "store_failed" });
    }
  }

  function retryNow() {
    const id = tabIdRef.current;
    if (id === null) return;
    waitStarted.current = null;
    setDomWaitExpired(false);
    if (sessionRef.current === "failed") {
      move({ type: "dismiss" });
      move({ type: "begin", allowed: true });
    } else {
      move({ type: "retry" });
    }
    void readTab.current(id);
  }

  function discard() {
    if (sessionRef.current !== "preview") return;
    setDraft(null);
    move({ type: "discard" });
    void refresh();
  }

  async function openExisting() {
    if (!existing || sessionRef.current !== "duplicate") return;
    const stored = await repositoryRef.current.findById(existing.id);
    if (sessionRef.current !== "duplicate") return;
    setReading(stored ?? existing);
    move({ type: "open_existing" });
  }

  function cancel() {
    attempt.current += 1;
    move({ type: "cancel" });
  }

  function dismiss() {
    setFailure(null);
    move({ type: "dismiss" });
    void refresh();
  }

  async function openRecord(id: string) {
    const stored = await repositoryRef.current.findById(id);
    if (stored) setReading(stored);
  }

  const busy = session !== "idle" && session !== "saved";
  const emptyCount = draft?.messages.filter((message) => message.content.length === 0).length ?? 0;

  return (
    <main>
      <h1>Trailogue</h1>
      {busy ? (
        <CaptureView
          session={session}
          phase={phase}
          draft={draft}
          failure={failure}
          saveFailed={saveFailed}
          changed={changed}
          emptyCount={emptyCount}
          domWaitExpired={domWaitExpired}
          onSave={() => void save()}
          onDiscard={discard}
          onRetry={retryNow}
          onCancel={cancel}
          onDismiss={dismiss}
          onOpenExisting={() => void openExisting()}
        />
      ) : reading ? (
        <Reader conversation={reading} onBack={() => setReading(null)} />
      ) : (
        <RecordList records={records} onOpen={(id) => void openRecord(id)} />
      )}
    </main>
  );
}

function captureOf(conversation: Conversation) {
  return {
    provider: conversation.provider,
    sourceUrl: conversation.sourceUrl,
    sourceId: conversation.sourceId,
    sourceKind: conversation.sourceKind,
    title: conversation.title,
    parserVersion: conversation.parserVersion,
    messages: conversation.messages.map((message) => ({
      ordinal: message.ordinal,
      role: message.role,
      content: message.content,
      ...(message.providerMessageId ? { providerMessageId: message.providerMessageId } : {}),
    })),
  };
}

function isTabClosed(result: CaptureRead): result is { closed: true } {
  return "closed" in result && result.closed === true;
}

function CaptureView({
  session,
  phase,
  draft,
  failure,
  saveFailed,
  changed,
  emptyCount,
  domWaitExpired,
  onSave,
  onDiscard,
  onRetry,
  onCancel,
  onDismiss,
  onOpenExisting,
}: {
  session: SessionState;
  phase: DashboardPhase | null;
  draft: Conversation | null;
  failure: CaptureFailureCode | null;
  saveFailed: boolean;
  changed: boolean;
  emptyCount: number;
  domWaitExpired: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onOpenExisting: () => void;
}) {
  return (
    <section>
      <StatusCopy
        session={session}
        phase={phase}
        failure={failure}
        saveFailed={saveFailed}
        changed={changed}
        domWaitExpired={domWaitExpired}
      />
      {emptyCount > 0 ? <p className="warning">{copy.emptyMessages(emptyCount)}</p> : null}
      {draft && (session === "preview" || session === "duplicate" || session === "saving") ? (
        <Transcript conversation={draft} />
      ) : null}
      <div className="actions">
        <StatusActions
          session={session}
          saveFailed={saveFailed}
          domWaitExpired={domWaitExpired}
          onSave={onSave}
          onDiscard={onDiscard}
          onRetry={onRetry}
          onCancel={onCancel}
          onDismiss={onDismiss}
          onOpenExisting={onOpenExisting}
        />
      </div>
    </section>
  );
}

function StatusCopy({
  session,
  phase,
  failure,
  saveFailed,
  changed,
  domWaitExpired,
}: {
  session: SessionState;
  phase: DashboardPhase | null;
  failure: CaptureFailureCode | null;
  saveFailed: boolean;
  changed: boolean;
  domWaitExpired: boolean;
}) {
  if (session === "unsupported") return <p>{copy.unsupported}</p>;
  if (session === "inspecting") return <p>{phase === "reloading" ? copy.reloading : copy.capturing}</p>;
  if (session === "awaiting_login") return <p>{copy.login}</p>;
  if (session === "waiting_for_dom") return <p>{domWaitExpired ? copy.waitingExpired : copy.waiting}</p>;
  if (session === "failed") return <p>{failureCopy(failure)}</p>;
  if (session === "cancelled") return <p>{copy.cancelled}</p>;
  if (session === "duplicate") return <p>{copy.duplicate}</p>;
  if (session === "preview" || session === "saving") {
    return (
      <>
        {saveFailed ? <p>{copy.saveFailed}</p> : null}
        <p>{changed ? copy.changed : copy.preview}</p>
      </>
    );
  }
  return null;
}

function StatusActions({
  session,
  saveFailed,
  domWaitExpired,
  onSave,
  onDiscard,
  onRetry,
  onCancel,
  onDismiss,
  onOpenExisting,
}: {
  session: SessionState;
  saveFailed: boolean;
  domWaitExpired: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onOpenExisting: () => void;
}) {
  if (session === "unsupported") {
    return <button type="button" onClick={onDismiss}>一覧へ戻る</button>;
  }
  if (session === "awaiting_login" || (session === "waiting_for_dom" && domWaitExpired)) {
    return (
      <>
        <button type="button" onClick={onRetry}>再取得</button>
        <button type="button" onClick={onCancel}>中止</button>
      </>
    );
  }
  if (session === "waiting_for_dom") {
    return <button type="button" onClick={onCancel}>中止</button>;
  }
  if (session === "failed") {
    return (
      <>
        <button type="button" onClick={onRetry}>再取得</button>
        <button type="button" onClick={onDismiss}>中止</button>
      </>
    );
  }
  if (session === "cancelled") {
    return <button type="button" onClick={onDismiss}>最初からやり直す</button>;
  }
  if (session === "duplicate") {
    return <button type="button" onClick={onOpenExisting}>既存を開く</button>;
  }
  if (session === "preview" && saveFailed) {
    return <button type="button" onClick={onSave}>保存を再試行</button>;
  }
  if (session === "preview" || session === "saving") {
    return (
      <>
        <button type="button" onClick={onSave} disabled={session === "saving"}>保存</button>
        <button type="button" onClick={onDiscard} disabled={session === "saving"}>破棄</button>
      </>
    );
  }
  return null;
}

function Transcript({ conversation }: { conversation: Conversation }) {
  return (
    <ol>
      {conversation.messages.map((message) => (
        <li key={message.id}>
          <p>{roleLabel(conversation.provider, message.role)}</p>
          <pre className="message" style={{ whiteSpace: "pre-wrap" }}>{message.content}</pre>
        </li>
      ))}
    </ol>
  );
}

function Reader({ conversation, onBack }: { conversation: Conversation; onBack: () => void }) {
  return (
    <section>
      <h2>{conversation.title}</h2>
      <p>{conversation.provider}</p>
      <time dateTime={conversation.capturedAt}>{conversation.capturedAt}</time>
      <Transcript conversation={conversation} />
      <button type="button" onClick={onBack}>一覧へ戻る</button>
    </section>
  );
}

function RecordList({
  records,
  onOpen,
}: {
  records: Conversation[];
  onOpen: (id: string) => void;
}) {
  return (
    <section>
      <h2>保存した会話</h2>
      {records.length === 0 ? <p>保存した会話はまだありません。</p> : null}
      <ul>
        {records.map((record) => (
          <li key={record.id}>
            <button type="button" className="record" onClick={() => onOpen(record.id)}>
              <span>{record.title}</span>
              <span>{record.provider}</span>
              <time dateTime={record.capturedAt}>{record.capturedAt}</time>
              <span>{record.messages.length}件</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function roleLabel(provider: ProviderId, role: MessageRole): string {
  if (role === "user") return "ユーザー";
  if (role === "unknown") return "不明";
  return provider === "copilot" ? "Copilot" : "ChatGPT";
}
