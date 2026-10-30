import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import type { Conversation, MessageRole, ProviderId } from "../src/domain/types";
import {
  coversOnDay,
  daysInMonth,
  groupCovers,
  latestDay,
  localDay,
  monthsDescending,
  openedCovers,
  reunionCover,
  unopenedCovers,
  type Cover,
  type DeskRecord,
  type OpenedMarks,
} from "../src/desk/album";
import { markQuery, matchingLines, type TextMatch } from "../src/search/text";
import type { SemanticMatch } from "../src/search/rank";

type Album = {
  unreadable: number;
  timeZone: string;
  opened: OpenedMarks;
  records: DeskRecord[];
};

type Flip = {
  covers: Cover[];
  index: number;
  ring: number;
};

type ReadingOrigin =
  | { kind: "flip"; flip: Flip }
  | { kind: "search"; search: SearchScreen; highlightQuery: string | null };

type ExactSearchState =
  | { kind: "loading" }
  | { kind: "success"; matches: TextMatch[] }
  | { kind: "failed" };

type SemanticSearchState =
  | { kind: "idle" }
  | { kind: "indexing" }
  | { kind: "searching" }
  | { kind: "success"; matches: SemanticMatch[] }
  | { kind: "failed"; message: string };

type SearchScreen = {
  kind: "search";
  query: string;
  exact: ExactSearchState;
  semantic: SemanticSearchState;
};

type Screen =
  | { kind: "home" }
  | { kind: "month"; month: string }
  | { kind: "flip"; flip: Flip }
  | SearchScreen
  | {
      kind: "reading";
      origin: ReadingOrigin;
      conversation: Conversation;
      focusMessageId: string | null;
    };

export function Desk() {
  const [album, setAlbum] = useState<Album | null>(null);
  const [screen, setScreen] = useState<Screen>({ kind: "home" });
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch("/api/album")
      .then(async (response) => {
        if (!response.ok) throw new Error("机を読めませんでした");
        setAlbum((await response.json()) as Album);
      })
      .catch(() => setError("机を読めませんでした"));
  }, []);

  if (error) return <p className="stage warning">{error}</p>;
  if (!album) return <p className="stage quiet">フォルダを読んでいます</p>;

  const covers = groupCovers(album.records, album.timeZone);
  const months = monthsDescending(covers);
  const recentDay = latestDay(covers);
  const recent = recentDay ? coversOnDay(covers, recentDay) : [];
  const reunion = reunionCover(covers, album.opened);
  const opened = openedCovers(covers, album.opened);
  const unread = unopenedCovers(covers, album.opened);

  function home() {
    setQuery("");
    setScreen({ kind: "home" });
  }

  function openMonth(month: string) {
    setQuery("");
    setScreen((current) =>
      current.kind === "month" && current.month === month ? { kind: "home" } : { kind: "month", month },
    );
  }

  function onQuery(next: string) {
    setQuery(next);
    if (next.trim() === "") {
      setScreen({ kind: "home" });
      return;
    }
    setScreen({ kind: "search", query: next, exact: { kind: "loading" }, semantic: { kind: "idle" } });
  }

  function startFlip(next: Cover[]) {
    const first = next[0];
    if (!first) return;
    setScreen({ kind: "flip", flip: { covers: next, index: 0, ring: first.rings.length - 1 } });
  }

  async function openSaved(id: string, contentHash: string): Promise<Conversation | null> {
    const marked = await fetch("/api/opened", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contentHash }),
    });
    if (!marked.ok) {
      setError("開いた印を置けませんでした");
      return null;
    }
    const payload = (await marked.json()) as { opened: OpenedMarks };
    const read = await fetch(`/api/conversations/${encodeURIComponent(id)}`);
    if (!read.ok) {
      setError("本文を読めませんでした");
      return null;
    }
    const conversation = (await read.json()) as Conversation;
    setAlbum((current) => (current ? { ...current, opened: payload.opened } : current));
    return conversation;
  }

  async function openBody(flip: Flip) {
    const cover = flip.covers[flip.index];
    const ring = cover?.rings[flip.ring];
    if (!ring) return;
    const conversation = await openSaved(ring.id, ring.contentHash);
    if (!conversation) return;
    setScreen({ kind: "reading", origin: { kind: "flip", flip }, conversation, focusMessageId: null });
  }

  async function openMatch(
    match: TextMatch | SemanticMatch,
    search: SearchScreen,
    highlightQuery: string | null,
  ) {
    const conversation = await openSaved(match.conversationId, match.contentHash);
    if (!conversation) return;
    setScreen({
      kind: "reading",
      origin: { kind: "search", search, highlightQuery },
      conversation,
      focusMessageId: match.messageId,
    });
  }

  function updateSearch(searchQuery: string, update: (search: SearchScreen) => SearchScreen) {
    setScreen((current) => (current.kind === "search" && current.query === searchQuery ? update(current) : current));
  }

  const selectedMonth = screen.kind === "month" ? screen.month : null;
  const showSeek = screen.kind === "home" || screen.kind === "month" || screen.kind === "search";

  return (
    <div className="desk">
      <nav className="months" aria-label="地層">
        {months.map((month) => (
          <button
            key={month}
            type="button"
            aria-current={selectedMonth === month ? "true" : undefined}
            onClick={() => openMonth(month)}
          >
            {month}
          </button>
        ))}
      </nav>
      <main className="stage">
        {album.unreadable > 0 ? (
          <p className="warning">読めなかったファイルが{album.unreadable}件あります。</p>
        ) : null}
        {showSeek ? <Seek query={query} onQuery={onQuery} /> : null}
        {screen.kind === "reading" ? (
          <Reading
            conversation={screen.conversation}
            focusMessageId={screen.focusMessageId}
            fromSearch={screen.origin.kind === "search"}
            highlightQuery={screen.origin.kind === "search" ? screen.origin.highlightQuery : null}
            backLabel={screen.origin.kind === "search" ? "結果へ戻る" : "表紙へ戻る"}
            onBack={() => {
              if (screen.origin.kind === "search") {
                setQuery(screen.origin.search.query);
                setScreen(screen.origin.search);
                return;
              }
              setScreen({ kind: "flip", flip: screen.origin.flip });
            }}
            onHome={home}
          />
        ) : screen.kind === "flip" ? (
          <FlipView
            flip={screen.flip}
            timeZone={album.timeZone}
            onChange={setScreen}
            onOpen={() => void openBody(screen.flip)}
            onHome={home}
          />
        ) : screen.kind === "search" ? (
          <SearchResults
            search={screen}
            timeZone={album.timeZone}
            onChange={(update) => updateSearch(screen.query, update)}
            onOpenExact={(match) => void openMatch(match, screen, screen.query)}
            onOpenSemantic={(match) => void openMatch(match, screen, null)}
          />
        ) : (
          <Entrance
            month={selectedMonth}
            covers={covers}
            recent={recent}
            recentDay={recentDay}
            reunion={reunion}
            opened={opened}
            unread={unread}
            onFlip={startFlip}
          />
        )}
      </main>
    </div>
  );
}

function Seek({ query, onQuery }: { query: string; onQuery: (query: string) => void }) {
  return (
    <label className="seek">
      <span>本文から探す</span>
      <input
        type="search"
        value={query}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onQuery(event.target.value)}
      />
    </label>
  );
}

function SearchResults({
  search,
  timeZone,
  onChange,
  onOpenExact,
  onOpenSemantic,
}: {
  search: SearchScreen;
  timeZone: string;
  onChange: (update: (search: SearchScreen) => SearchScreen) => void;
  onOpenExact: (match: TextMatch) => void;
  onOpenSemantic: (match: SemanticMatch) => void;
}) {
  const semanticRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    if (search.exact.kind !== "loading") return;
    const controller = new AbortController();
    void fetch(`/api/search?q=${encodeURIComponent(search.query)}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("search failed");
        const body = (await response.json()) as { matches: TextMatch[] };
        onChange((current) => ({ ...current, exact: { kind: "success", matches: body.matches } }));
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        onChange((current) => ({ ...current, exact: { kind: "failed" } }));
      });
    return () => controller.abort();
  }, [onChange, search.exact.kind, search.query]);

  useEffect(() => {
    return () => semanticRequest.current?.abort();
  }, [search.query]);

  async function findSemantic(): Promise<void> {
    semanticRequest.current?.abort();
    const controller = new AbortController();
    semanticRequest.current = controller;
    onChange((current) => ({ ...current, semantic: { kind: "indexing" } }));
    try {
      const indexed = await fetch("/api/search/semantic/index", { method: "POST", signal: controller.signal });
      if (!indexed.ok) throw new Error(await responseError(indexed));
      onChange((current) => ({ ...current, semantic: { kind: "searching" } }));
      const response = await fetch("/api/search/semantic", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ query: search.query }),
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = (await response.json()) as { matches: SemanticMatch[] };
      onChange((current) => ({ ...current, semantic: { kind: "success", matches: body.matches } }));
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      const message = error instanceof Error && error.message ? error.message : "似た言葉を探せませんでした";
      onChange((current) => ({ ...current, semantic: { kind: "failed", message } }));
    } finally {
      if (semanticRequest.current === controller) semanticRequest.current = null;
    }
  }

  return (
    <section className="search-results">
      <h1>一致する本文</h1>
      <ExactResults state={search.exact} query={search.query} timeZone={timeZone} onOpen={onOpenExact} />
      <section className="semantic-results">
        <h2>似た言葉</h2>
        {search.semantic.kind === "idle" ? (
          <button type="button" className="semantic-action" onClick={() => void findSemantic()}>
            似た言葉でも探す
          </button>
        ) : search.semantic.kind === "indexing" ? (
          <p className="quiet">保存した発言を索引にしています</p>
        ) : search.semantic.kind === "searching" ? (
          <p className="quiet">似た言葉を探しています</p>
        ) : search.semantic.kind === "failed" ? (
          <div>
            <p className="warning">{search.semantic.message}</p>
            <button type="button" className="semantic-action" onClick={() => void findSemantic()}>
              もう一度探す
            </button>
          </div>
        ) : search.semantic.matches.length === 0 ? (
          <p className="quiet">近い発言はありません</p>
        ) : (
          <SemanticResults matches={search.semantic.matches} timeZone={timeZone} onOpen={onOpenSemantic} />
        )}
      </section>
    </section>
  );
}

function ExactResults({
  state,
  query,
  timeZone,
  onOpen,
}: {
  state: ExactSearchState;
  query: string;
  timeZone: string;
  onOpen: (match: TextMatch) => void;
}) {
  if (state.kind === "loading") return <p className="quiet">本文を探しています</p>;
  if (state.kind === "failed") return <p className="warning">本文を探せませんでした</p>;
  if (state.matches.length === 0) return <p className="quiet">この文字列を含む発言はありません</p>;
  return (
    <ul className="hits">
      {state.matches.map((match) => (
        <li key={`${match.contentHash}:${match.messageId}`}>
          <button type="button" className="hit" onClick={() => onOpen(match)}>
            <span className="hit-title">{match.title}</span>
            <span className="hit-meta">
              {roleLabel(match.provider, match.role)} {localDay(match.capturedAt, timeZone)}
            </span>
            {matchingLines(match.content, query).map((line, index) => (
              <span key={index} className="hit-line">
                <MarkedText text={line} query={query} />
              </span>
            ))}
          </button>
        </li>
      ))}
    </ul>
  );
}

function SemanticResults({
  matches,
  timeZone,
  onOpen,
}: {
  matches: SemanticMatch[];
  timeZone: string;
  onOpen: (match: SemanticMatch) => void;
}) {
  return (
    <ul className="hits">
      {matches.map((match) => (
        <li key={`${match.contentHash}:${match.messageId}`}>
          <button type="button" className="hit" onClick={() => onOpen(match)}>
            <span className="hit-title">{match.title}</span>
            <span className="hit-meta">
              {roleLabel(match.provider, match.role)} {localDay(match.capturedAt, timeZone)}
            </span>
            <span className="hit-line">{match.content}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error !== "") return body.error;
  } catch {
    // The server may have failed before it could produce its JSON error shape.
  }
  return "似た言葉を探せませんでした";
}

function MarkedText({ text, query }: { text: string; query: string }) {
  return markQuery(text, query).map((span, index) =>
    span.match ? <mark key={index}>{span.text}</mark> : <span key={index}>{span.text}</span>,
  );
}

function Entrance({
  month,
  covers,
  recent,
  recentDay,
  reunion,
  opened,
  unread,
  onFlip,
}: {
  month: string | null;
  covers: Cover[];
  recent: Cover[];
  recentDay: string | null;
  reunion: Cover | null;
  opened: Cover[];
  unread: Cover[];
  onFlip: (covers: Cover[]) => void;
}) {
  const days = month ? daysInMonth(covers, month) : [];
  return (
    <section className="entrance">
      <div>
        {month ? (
          <div className="days">
            {days.map((day) => {
              const stack = coversOnDay(covers, day);
              const face = stack[0];
              if (!face) return null;
              return (
                <button key={day} type="button" className="day-face" style={stackStyle(stack.length)} onClick={() => onFlip(stack)}>
                  {face.title}
                  <small>{day}</small>
                </button>
              );
            })}
          </div>
        ) : recent[0] && recentDay ? (
          <button type="button" className="face" style={stackStyle(recent.length)} onClick={() => onFlip(recent)}>
            {recent[0].title}
            <small>{recentDay}</small>
          </button>
        ) : (
          <p className="quiet">保存した会話はまだありません。</p>
        )}
      </div>
      {reunion ? (
        <button type="button" className="back-card" onClick={() => onFlip(opened)}>
          {reunion.title}
          <small>久しぶりの再会</small>
        </button>
      ) : unread.length > 0 ? (
        <button type="button" className="back-card" onClick={() => onFlip(unread)}>
          まだ開いていない
        </button>
      ) : null}
    </section>
  );
}

function FlipView({
  flip,
  timeZone,
  onChange,
  onOpen,
  onHome,
}: {
  flip: Flip;
  timeZone: string;
  onChange: (screen: Screen) => void;
  onOpen: () => void;
  onHome: () => void;
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const followIndex = useRef(true);

  function settle(index: number) {
    const next = flip.covers[index];
    if (!next || index === flip.index) return;
    onChange({ kind: "flip", flip: { covers: flip.covers, index, ring: next.rings.length - 1 } });
  }

  useLayoutEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    if (!followIndex.current) {
      followIndex.current = true;
      return;
    }
    scroller.scrollTop = scroller.clientHeight * flip.index;
  }, [flip.index]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      settle(event.key === "ArrowLeft" ? flip.index - 1 : flip.index + 1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flip.index, flip.covers]);

  function onScroll() {
    const scroller = scrollerRef.current;
    const page = scroller?.clientHeight ?? 0;
    if (!scroller || page <= 0) return;
    const index = Math.min(flip.covers.length - 1, Math.max(0, Math.round(scroller.scrollTop / page)));
    if (index === flip.index) return;
    followIndex.current = false;
    settle(index);
  }

  if (flip.covers.length === 0) return null;

  return (
    <section className="flip">
      <div className="actions">
        <button type="button" onClick={onHome}>玄関</button>
      </div>
      <div className="riffle" ref={scrollerRef} onScroll={onScroll} aria-label="表紙">
        {flip.covers.map((cover, index) => {
          const active = index === flip.index;
          const ring = active ? cover.rings[flip.ring] ?? cover.rings.at(-1) : cover.rings.at(-1);
          if (!ring) return null;
          return (
            <article key={cover.sourceId} className="riffle-item" aria-current={active ? "true" : undefined}>
              <h1 className="flip-title">{ring.title}</h1>
              <p className="flip-meta">
                {cover.provider} {localDay(ring.capturedAt, timeZone)}
              </p>
              {active && cover.rings.length > 1 ? (
                <div className="rings">
                  {cover.rings.map((item, ringIndex) => (
                    <button
                      key={item.contentHash}
                      type="button"
                      aria-current={ringIndex === flip.ring ? "true" : undefined}
                      onClick={() => onChange({ kind: "flip", flip: { ...flip, ring: ringIndex } })}
                    >
                      {`年輪 ${item.messageCount}件 ${item.parserVersion}`}
                    </button>
                  ))}
                </div>
              ) : null}
              {active ? (
                <div className="actions">
                  <button type="button" onClick={onOpen}>開く</button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>
    </section>
  );
}

function Reading({
  conversation,
  focusMessageId,
  fromSearch,
  highlightQuery,
  backLabel,
  onBack,
  onHome,
}: {
  conversation: Conversation;
  focusMessageId: string | null;
  fromSearch: boolean;
  highlightQuery: string | null;
  backLabel: string;
  onBack: () => void;
  onHome: () => void;
}) {
  const focusRef = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    focusRef.current?.scrollIntoView({ block: "start" });
  }, [conversation.id, focusMessageId]);

  return (
    <section className={fromSearch ? "reading-from-search" : undefined}>
      <div className="actions">
        <button type="button" onClick={onHome}>玄関</button>
        {fromSearch ? null : <button type="button" onClick={onBack}>{backLabel}</button>}
      </div>
      {fromSearch ? (
        <button type="button" className="back-float" onClick={onBack}>{backLabel}</button>
      ) : null}
      <h1 className="flip-title">{conversation.title}</h1>
      {conversation.messages.map((message) => {
        const focused = message.id === focusMessageId;
        return (
          <article
            key={message.id}
            ref={focused ? focusRef : undefined}
            className={focused ? "reading-focus" : undefined}
          >
            <p className="message-role">{roleLabel(conversation.provider, message.role)}</p>
            <pre className="message">
              {focused && highlightQuery ? (
                <MarkedText text={message.content} query={highlightQuery} />
              ) : (
                message.content
              )}
            </pre>
          </article>
        );
      })}
    </section>
  );
}

function stackStyle(count: number): CSSProperties {
  const layers = count <= 1 ? 0 : count < 5 ? 1 : count < 20 ? 2 : count < 80 ? 4 : 6;
  if (layers === 0) return {};
  const shadows = Array.from({ length: layers }, (_, index) => {
    const offset = (index + 1) * 6;
    return `${offset}px ${offset}px 0 #e7e5e4`;
  });
  return { "--stack": shadows.join(", ") } as CSSProperties;
}

function roleLabel(provider: ProviderId, role: MessageRole): string {
  if (role === "user") return "ユーザー";
  if (role === "unknown") return "不明";
  return provider === "copilot" ? "Copilot" : "ChatGPT";
}
