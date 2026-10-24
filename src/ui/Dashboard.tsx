import { useEffect, useRef, useState } from "react";
import type { ArchiveConnection, ConversationArchive } from "../archive/fileSystemArchive";
import {
  cancelBatch,
  idleBatch,
  resumeBatch,
  startBatch,
  type BatchState,
} from "../capture/batch";
import { runBatch } from "../capture/runBatch";
import type { SidebarConversation } from "../capture/sidebar";
import type { DashboardPhase, DashboardStatus } from "../capture/status";
import { transition, type SessionEvent, type SessionState } from "../capture/session";
import { normalize } from "../domain/normalize";
import { deriveThoughtPath } from "../domain/thoughtPath";
import type { CaptureFailureCode, Conversation, MessageRole, ProviderId } from "../domain/types";
import { alignCache } from "../storage/alignCache";
import type { ConversationRepository } from "../storage/repository";
import type { CapturePort, CaptureRead } from "./capturePort";
import { copy, failureCopy } from "./copy";
import { downloadMarkdown } from "./downloadMarkdown";
import type { SidebarBatchPort } from "./extensionBatch";
import { storeCapturedConversation } from "./storeCapture";

const RETRY_INTERVAL_MS = 2000;
const RETRY_WINDOW_MS = 10000;

type Props = {
  repository: ConversationRepository;
  archive: ConversationArchive;
  capture: CapturePort;
  sidebar?: SidebarBatchPort;
};

export function Dashboard({ repository, archive, capture, sidebar }: Props) {
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
  const [archiveConnection, setArchiveConnection] = useState<ArchiveConnection | null>(null);
  const [unreadable, setUnreadable] = useState(0);
  const [batch, setBatch] = useState<BatchState>(idleBatch());
  const [batchMessage, setBatchMessage] = useState<string | null>(null);
  const [batchFailures, setBatchFailures] = useState<readonly SidebarConversation[]>([]);

  const sessionRef = useRef<SessionState>("idle");
  const tabIdRef = useRef<number | null>(null);
  const attempt = useRef(0);
  const seen = useRef("");
  const waitStarted = useRef<number | null>(null);
  const repositoryRef = useRef(repository);
  const archiveRef = useRef(archive);
  const captureRef = useRef(capture);
  const batchRef = useRef(batch);
  const batchRun = useRef(0);
  const batchPhase = useRef(batch.phase);
  const batchTab = useRef<number | null>(null);
  const refreshRun = useRef(0);
  const turn = useRef(Promise.resolve());
  const onStatusRef = useRef<(status: DashboardStatus) => void>(() => {});
  const readTab = useRef<(tabId: number) => Promise<void>>(async () => {});
  repositoryRef.current = repository;
  archiveRef.current = archive;
  captureRef.current = capture;
  batchRef.current = batch;

  function move(event: SessionEvent) {
    const next = transition(sessionRef.current, event);
    sessionRef.current = next;
    setSession(next);
    return next;
  }

  function enqueue(work: () => Promise<void>): Promise<void> {
    const run = turn.current.then(work, work);
    turn.current = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async function refresh() {
    await enqueue(() => loadRecords());
  }

  async function loadRecords() {
    const id = ++refreshRun.current;
    const currentArchive = archiveRef.current;
    const currentRepository = repositoryRef.current;
    try {
      let connection: ArchiveConnection;
      try {
        connection = await currentArchive.connection();
      } catch {
        connection = "missing";
      }
      if (id !== refreshRun.current) return;
      setArchiveConnection(connection);
      if (connection !== "ready") {
        const stored = await currentRepository.list();
        if (id !== refreshRun.current) return;
        setUnreadable(0);
        setRecords(stored);
        return;
      }
      const listing = await currentArchive.list();
      if (id !== refreshRun.current) return;
      await alignCache(currentRepository, listing.conversations);
      if (id !== refreshRun.current) return;
      setUnreadable(listing.unreadable);
      setRecords(listing.conversations);
    } catch {
      if (id !== refreshRun.current) return;
      try {
        setUnreadable(0);
        setRecords(await currentRepository.list());
      } catch {
        return;
      }
    }
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
    const fromDexie = await repositoryRef.current.findByHash(normalized.contentHash);
    const cached = await repositoryRef.current.list();
    let stored = fromDexie;
    let all = cached;
    try {
      if ((await archiveRef.current.connection()) === "ready") {
        const [fromArchive, listing] = await Promise.all([
          archiveRef.current.findByHash(normalized.contentHash),
          archiveRef.current.list(),
        ]);
        if (current !== attempt.current || sessionRef.current !== "inspecting") return;
        await alignCache(repositoryRef.current, listing.conversations);
        if (current !== attempt.current || sessionRef.current !== "inspecting") return;
        stored = fromArchive;
        all = listing.conversations;
        setUnreadable(listing.unreadable);
      }
    } catch {
      stored = fromDexie;
      all = cached;
    }
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
    if (batchPhase.current === "running" || batchPhase.current === "paused") return;
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
  }, [repository, archive]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [repository, archive]);

  useEffect(() => {
    return () => {
      batchRun.current += 1;
    };
  }, []);

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
      if ((await archiveRef.current.connection()) !== "ready") {
        const opened = await archiveRef.current.openFolder();
        if (opened !== "ready") throw new Error("archive unavailable");
      }
      if (live() !== "saving") return;
      const before = await archiveRef.current.list();
      if (live() !== "saving") return;
      await alignCache(repositoryRef.current, before.conversations);
      if (live() !== "saving") return;
      const conversation = await normalize(captureOf(raw), {
        id: crypto.randomUUID(),
        capturedAt: new Date().toISOString(),
      });
      if (live() !== "saving") return;
      await archiveRef.current.write(conversation);
      const onDisk = await archiveRef.current.findByHash(conversation.contentHash);
      if (!onDisk) throw new Error("archive missing");
      await repositoryRef.current.mirror(onDisk);
      if (live() !== "saving") return;
      const listing = await archiveRef.current.list();
      if (live() !== "saving") return;
      setRecords(listing.conversations);
      setUnreadable(listing.unreadable);
      setArchiveConnection("ready");
      setDraft(onDisk);
      setSaveFailed(false);
      setReading(onDisk);
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

  function showList() {
    const state = sessionRef.current;
    if (state !== "inspecting" && state !== "preview" && state !== "duplicate") return;
    attempt.current += 1;
    setDraft(null);
    setExisting(null);
    setReading(null);
    move({ type: "show_list" });
    void refresh();
  }

  async function openArchiveFolder() {
    try {
      await archiveRef.current.openFolder();
    } catch {
      // フォルダを開けないときも、作業用の一覧は残す。
    }
    await refresh();
  }

  async function openExisting() {
    if (!existing || sessionRef.current !== "duplicate") return;
    const stored = await repositoryRef.current.mirror(existing);
    if (sessionRef.current !== "duplicate") return;
    setReading(stored);
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

  function publishBatch(next: BatchState) {
    batchRef.current = next;
    batchPhase.current = next.phase;
    setBatch(next);
  }

  async function startSidebarBatch(continued: boolean) {
    const port = sidebar;
    if (!port) return;
    const id = ++batchRun.current;
    setBatchMessage(null);
    try {
      if ((await archiveRef.current.connection()) !== "ready") {
        const opened = await archiveRef.current.openFolder();
        if (opened !== "ready") {
          setBatchMessage(copy.batchFolder);
          return;
        }
      }
    } catch {
      setBatchMessage(copy.batchFolder);
      return;
    }
    if (id !== batchRun.current) return;

    let state = continued ? resumeBatch(batchRef.current) : idleBatch();
    if (!continued) {
      const tabId = await port.findTab();
      if (id !== batchRun.current) return;
      if (tabId === null) {
        setBatchMessage(copy.batchNoTab);
        return;
      }
      const listed = await port.listIds(tabId);
      if (id !== batchRun.current) return;
      if (listed === "closed") {
        setBatchMessage(copy.batchNoTab);
        return;
      }
      if (listed.length === 0) {
        setBatchMessage(copy.batchEmpty);
        return;
      }
      batchTab.current = tabId;
      state = startBatch(listed);
    }
    if (state.phase !== "running" || batchTab.current === null) {
      setBatchMessage(copy.batchEmpty);
      return;
    }
    if (!continued) setBatchFailures([]);
    publishBatch(state);
    const finished = await runBatch({
      state,
      cancelled: () => id !== batchRun.current,
      onUpdate: (next) => {
        if (id !== batchRun.current) return;
        publishBatch(next);
      },
      driver: {
        open: (conversationId) => port.open(batchTab.current ?? -1, conversationId),
        read: () => captureRef.current.read(batchTab.current ?? -1),
        save: (captured) =>
          storeCapturedConversation(captured, archiveRef.current, repositoryRef.current),
        sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
        now: () => Date.now(),
      },
    });
    if (id !== batchRun.current) {
      await refresh();
      return;
    }
    if (finished.phase === "done") {
      setBatchMessage(batchSummary(finished));
      setBatchFailures(finished.failures);
      publishBatch(idleBatch());
      await refresh();
      return;
    }
    publishBatch(finished);
    await refresh();
  }

  function stopSidebarBatch() {
    batchRun.current += 1;
    publishBatch(cancelBatch(batchRef.current));
  }

  function leaveBatch() {
    batchRun.current += 1;
    setBatchMessage(batchSummary(batchRef.current));
    setBatchFailures(batchRef.current.failures);
    publishBatch(idleBatch());
    void refresh();
  }

  async function deleteRecord(conversation: Conversation) {
    if ((await archiveRef.current.connection()) !== "ready") return;
    const confirmed = window.confirm(copy.confirmDelete(conversation.title, conversation.provider));
    if (!confirmed) return;
    await enqueue(async () => {
      if ((await archiveRef.current.connection()) !== "ready") return;
      await repositoryRef.current.removeByHash(conversation.contentHash);
      let removed: boolean;
      try {
        removed = await archiveRef.current.remove(conversation);
      } catch {
        removed = false;
      }
      await loadRecords();
      if (!removed) return;
      setReading((current) => (current?.contentHash === conversation.contentHash ? null : current));
    });
  }

  async function openRecord(id: string) {
    const known = records.find((record) => record.id === id);
    if (known) {
      setReading(known);
      return;
    }
    const stored = await repositoryRef.current.findById(id);
    if (stored) setReading(stored);
  }

  const batchVisible =
    batch.phase === "running" || batch.phase === "paused" || batch.phase === "cancelled";
  const busy = !batchVisible && session !== "idle" && session !== "saved";
  const emptyCount = draft?.messages.filter((message) => message.content.length === 0).length ?? 0;

  return (
    <main>
      <h1>Trailogue</h1>
      {batchVisible ? (
        <BatchPanel
          state={batch}
          onCancel={stopSidebarBatch}
          onResume={() => void startSidebarBatch(true)}
          onBack={leaveBatch}
        />
      ) : busy ? (
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
          onExport={() => {
            if (draft) downloadMarkdown(draft, "");
          }}
          onShowList={showList}
          onRetry={retryNow}
          onCancel={cancel}
          onDismiss={dismiss}
          onOpenExisting={() => void openExisting()}
        />
      ) : reading ? (
        <Reader
          conversation={reading}
          canDelete={archiveConnection === "ready"}
          onBack={() => setReading(null)}
          onDelete={() => void deleteRecord(reading)}
        />
      ) : (
        <RecordList
          records={records}
          connection={archiveConnection}
          unreadable={unreadable}
          onOpen={(id) => void openRecord(id)}
          onDelete={(record) => void deleteRecord(record)}
          onOpenFolder={() => void openArchiveFolder()}
          message={batchMessage}
          failures={batchFailures}
          onImport={sidebar ? () => void startSidebarBatch(false) : undefined}
        />
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
  onExport,
  onShowList,
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
  onExport: () => void;
  onShowList: () => void;
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
          onExport={onExport}
          onShowList={onShowList}
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
  onExport,
  onShowList,
  onRetry,
  onCancel,
  onDismiss,
  onOpenExisting,
}: {
  session: SessionState;
  saveFailed: boolean;
  domWaitExpired: boolean;
  onSave: () => void;
  onExport: () => void;
  onShowList: () => void;
  onRetry: () => void;
  onCancel: () => void;
  onDismiss: () => void;
  onOpenExisting: () => void;
}) {
  if (session === "inspecting") {
    return <button type="button" onClick={onShowList}>一覧へ戻る</button>;
  }
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
    return (
      <>
        <button type="button" onClick={onOpenExisting}>既存を開く</button>
        <button type="button" onClick={onShowList}>一覧へ戻る</button>
      </>
    );
  }
  if (session === "preview" && saveFailed) {
    return (
      <>
        <button type="button" onClick={onSave}>保存を再試行</button>
        <button type="button" onClick={onExport}>Markdownを書き出す</button>
      </>
    );
  }
  if (session === "preview") {
    return (
      <>
        <button type="button" onClick={onSave}>保存</button>
        <button type="button" onClick={onShowList}>一覧へ戻る</button>
      </>
    );
  }
  if (session === "saving") {
    return <button type="button" onClick={onSave} disabled>保存</button>;
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

function Reader({
  conversation,
  canDelete,
  onBack,
  onDelete,
}: {
  conversation: Conversation;
  canDelete: boolean;
  onBack: () => void;
  onDelete: () => void;
}) {
  const [view, setView] = useState<"original" | "path">("original");
  return (
    <section>
      <h2>{conversation.title}</h2>
      <p>{conversation.provider}</p>
      <time dateTime={conversation.capturedAt}>{conversation.capturedAt}</time>
      <div className="actions">
        <button type="button" onClick={() => setView("original")}>原文</button>
        <button type="button" onClick={() => setView("path")}>思考経路</button>
        <button type="button" onClick={() => downloadMarkdown(conversation)}>Markdownを書き出す</button>
        <button type="button" onClick={onDelete} disabled={!canDelete}>{copy.deleteRecord}</button>
      </div>
      {view === "original" ? (
        <Transcript conversation={conversation} />
      ) : (
        <ThoughtPath conversation={conversation} />
      )}
      <button type="button" onClick={onBack}>一覧へ戻る</button>
    </section>
  );
}

function ThoughtPath({ conversation }: { conversation: Conversation }) {
  const messages = new Map(conversation.messages.map((message) => [message.id, message]));
  return (
    <ol>
      {deriveThoughtPath(conversation).map((node) => (
        <li key={node.id}>
          <p>{roleLabel(conversation.provider, node.role)}</p>
          <pre className="message" style={{ whiteSpace: "pre-wrap" }}>{messages.get(node.messageId)?.content ?? ""}</pre>
        </li>
      ))}
    </ol>
  );
}

function RecordList({
  records,
  connection,
  unreadable,
  onOpen,
  onDelete,
  onOpenFolder,
  message,
  failures,
  onImport,
}: {
  records: Conversation[];
  connection: ArchiveConnection | null;
  unreadable: number;
  onOpen: (id: string) => void;
  onDelete: (conversation: Conversation) => void;
  onOpenFolder: () => void;
  message: string | null;
  failures: readonly SidebarConversation[];
  onImport?: () => void;
}) {
  return (
    <section>
      <ArchiveBanner connection={connection} onOpenFolder={onOpenFolder} />
      <h2>保存した会話</h2>
      {message ? <p>{message}</p> : null}
      <FailedConversations failures={failures} />
      {onImport ? (
        <button type="button" onClick={onImport}>{copy.batchStart}</button>
      ) : null}
      {unreadable > 0 ? <p className="warning">{copy.unreadable(unreadable)}</p> : null}
      {records.length === 0 ? <p>保存した会話はまだありません。</p> : null}
      <ul>
        {records.map((record) => (
          <li key={record.id} className="record-row">
            <button type="button" className="record" onClick={() => onOpen(record.id)}>
              <span>{record.title}</span>
              <span>{record.provider}</span>
              <time dateTime={record.capturedAt}>{record.capturedAt}</time>
              <span>{record.messages.length}件</span>
            </button>
            <button
              type="button"
              onClick={() => onDelete(record)}
              disabled={connection !== "ready"}
            >
              {copy.deleteRecord}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function BatchPanel({
  state,
  onCancel,
  onResume,
  onBack,
}: {
  state: BatchState;
  onCancel: () => void;
  onResume: () => void;
  onBack: () => void;
}) {
  const pausedForStructure = state.phase === "paused" && state.unrecognizedStreak >= 3;
  return (
    <section>
      <h2>サイドバーの会話</h2>
      <p>{copy.batchProgress(state.cursor, state.items.length)}</p>
      <p>{copy.batchStored(state.stored)}</p>
      <p>{copy.batchSkipped(state.skipped)}</p>
      <p>{copy.batchFailed(state.failed)}</p>
      <FailedConversations failures={state.failures} />
      {pausedForStructure ? <p>{copy.batchPaused}</p> : null}
      {state.phase === "paused" && !pausedForStructure ? <p>{copy.batchTabClosed}</p> : null}
      {state.phase === "cancelled" ? <p>{copy.batchCancelled}</p> : null}
      <div className="actions">
        {state.phase === "paused" ? (
          <button type="button" onClick={onResume}>{copy.batchResume}</button>
        ) : null}
        {state.phase === "running" || state.phase === "paused" ? (
          <button type="button" onClick={onCancel}>中止</button>
        ) : null}
        {state.phase === "cancelled" ? (
          <button type="button" onClick={onBack}>{copy.batchBack}</button>
        ) : null}
      </div>
    </section>
  );
}

function batchSummary(state: BatchState): string {
  const head = state.phase === "cancelled" ? copy.batchCancelled : copy.batchDone;
  return `${head}。${copy.batchProgress(state.cursor, state.items.length)}。${copy.batchStored(state.stored)}、${copy.batchSkipped(state.skipped)}、${copy.batchFailed(state.failed)}`;
}

function FailedConversations({ failures }: { failures: readonly SidebarConversation[] }) {
  if (failures.length === 0) return null;
  return (
    <section>
      <h3>{copy.batchFailedHeading}</h3>
      <ul>
        {failures.map((failure) => (
          <li key={failure.id}>
            {failure.title ? <span>{failure.title}</span> : null}
            <span>{failure.id}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ArchiveBanner({
  connection,
  onOpenFolder,
}: {
  connection: ArchiveConnection | null;
  onOpenFolder: () => void;
}) {
  if (connection !== "missing" && connection !== "needs_permission") return null;
  const closed = connection === "needs_permission";
  return (
    <div className="archive-banner">
      <p>{closed ? copy.folderClosed : copy.folderMissing}</p>
      <button type="button" onClick={onOpenFolder}>{closed ? copy.reopenFolder : copy.chooseFolder}</button>
    </div>
  );
}

function roleLabel(provider: ProviderId, role: MessageRole): string {
  if (role === "user") return "ユーザー";
  if (role === "unknown") return "不明";
  return provider === "copilot" ? "Copilot" : "ChatGPT";
}
