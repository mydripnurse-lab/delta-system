"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type ChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
};

type ThreadSummary = {
  threadId: string;
  title?: string;
  pinned?: boolean;
  pinOrder?: number;
  messageCount: number;
  lastTs: number;
  lastPreview: string;
};

type FeedEvent = {
  id?: string;
  ts: number;
  agent: string;
  kind: string;
  summary: string;
};

type Props = {
  agent: string;
  tenantId?: string;
  title?: string;
  context?: Record<string, unknown>;
  className?: string;
};

function fmtTs(ts: number) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}

function normalizeAssistantText(raw: string) {
  const text = String(raw || "").replace(/\r/g, "");
  return text
    .replace(/(^|\n)#{1,6}\s*/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseInlineMarkdown(text: string) {
  const src = String(text || "");
  const out: ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < src.length) {
    const bold = src.indexOf("**", i);
    const ital = src.indexOf("*", i);
    const code = src.indexOf("`", i);
    const linkOpen = src.indexOf("[", i);
    const candidates = [bold, ital, code, linkOpen].filter((n) => n >= 0);
    const next = candidates.length ? Math.min(...candidates) : -1;
    if (next < 0) {
      out.push(src.slice(i));
      break;
    }
    if (next > i) out.push(src.slice(i, next));
    if (next === bold) {
      const end = src.indexOf("**", bold + 2);
      if (end > bold + 1) {
        out.push(<strong key={`b-${key++}`}>{src.slice(bold + 2, end)}</strong>);
        i = end + 2;
        continue;
      }
    }
    if (next === code) {
      const end = src.indexOf("`", code + 1);
      if (end > code) {
        out.push(<code key={`c-${key++}`}>{src.slice(code + 1, end)}</code>);
        i = end + 1;
        continue;
      }
    }
    if (next === linkOpen) {
      const close = src.indexOf("]", linkOpen + 1);
      const oParen = src.indexOf("(", close + 1);
      const cParen = src.indexOf(")", oParen + 1);
      if (close > linkOpen && oParen === close + 1 && cParen > oParen + 1) {
        const label = src.slice(linkOpen + 1, close);
        const href = src.slice(oParen + 1, cParen);
        out.push(
          <a key={`l-${key++}`} href={href} target="_blank" rel="noreferrer">
            {label}
          </a>,
        );
        i = cParen + 1;
        continue;
      }
    }
    if (next === ital) {
      const end = src.indexOf("*", ital + 1);
      if (end > ital + 1 && src.slice(ital, ital + 2) !== "**") {
        out.push(<em key={`i-${key++}`}>{src.slice(ital + 1, end)}</em>);
        i = end + 1;
        continue;
      }
    }
    out.push(src.charAt(next));
    i = next + 1;
  }
  return out;
}

function renderMarkdown(content: string) {
  const text = String(content || "").replace(/\r/g, "");
  const lines = text.split("\n");
  const nodes: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) {
      i += 1;
      continue;
    }
    const h = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (h) {
      const level = Math.min(6, h[1].length);
      const body = h[2];
      const className = `aiMdH aiMdH${level}`;
      nodes.push(
        <div key={`h-${i}`} className={className}>
          {parseInlineMarkdown(body)}
        </div>,
      );
      i += 1;
      continue;
    }
    if (/^[-*]\s+/.test(trimmed)) {
      const items: ReactNode[] = [];
      let j = i;
      while (j < lines.length) {
        const t = lines[j].trim();
        if (!/^[-*]\s+/.test(t)) break;
        items.push(<li key={`ul-${j}`}>{parseInlineMarkdown(t.replace(/^[-*]\s+/, ""))}</li>);
        j += 1;
      }
      nodes.push(<ul key={`u-${i}`} className="aiMdList">{items}</ul>);
      i = j;
      continue;
    }
    if (/^\d+\.\s+/.test(trimmed)) {
      const items: ReactNode[] = [];
      let j = i;
      while (j < lines.length) {
        const t = lines[j].trim();
        if (!/^\d+\.\s+/.test(t)) break;
        items.push(<li key={`ol-${j}`}>{parseInlineMarkdown(t.replace(/^\d+\.\s+/, ""))}</li>);
        j += 1;
      }
      nodes.push(<ol key={`o-${i}`} className="aiMdList">{items}</ol>);
      i = j;
      continue;
    }
    const para: string[] = [trimmed];
    let j = i + 1;
    while (j < lines.length && lines[j].trim() && !/^(#{1,6}\s+|[-*]\s+|\d+\.\s+)/.test(lines[j].trim())) {
      para.push(lines[j].trim());
      j += 1;
    }
    nodes.push(
      <p key={`p-${i}`} className="aiMdP">
        {parseInlineMarkdown(para.join(" "))}
      </p>,
    );
    i = j;
  }
  return nodes.length ? nodes : normalizeAssistantText(content);
}

function makeThreadId() {
  return `chat-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function threadLabel(thread: ThreadSummary) {
  const custom = String(thread.title || "").trim();
  if (custom) return custom;
  if (thread.threadId === "default") return "General";
  const preview = String(thread.lastPreview || "").trim();
  if (!preview) return thread.threadId;
  return preview.length > 38 ? `${preview.slice(0, 38)}...` : preview;
}

export default function AiAgentChatPanel({
  agent,
  tenantId = "",
  title = "AI Copilot Chat",
  context = {},
  className = "",
}: Props) {
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [events, setEvents] = useState<FeedEvent[]>([]);
  const [threads, setThreads] = useState<ThreadSummary[]>([]);
  const [activeThread, setActiveThread] = useState("default");
  const [renamingThreadId, setRenamingThreadId] = useState("");
  const [renameValue, setRenameValue] = useState("");
  const [threadQuery, setThreadQuery] = useState("");
  const [dragPinnedThreadId, setDragPinnedThreadId] = useState("");
  const [dragOverPinnedThreadId, setDragOverPinnedThreadId] = useState("");
  const [streamingAssistantVisible, setStreamingAssistantVisible] = useState(false);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  async function loadHistory(targetThread?: string) {
    const threadId = String(targetThread || activeThread || "default").trim() || "default";
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(
        `/api/ai/chat/history?agent=${encodeURIComponent(agent)}&threadId=${encodeURIComponent(threadId)}&tenantId=${encodeURIComponent(tenantId)}`,
        { cache: "no-store" },
      );
      const json = await res.json();
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || `HTTP ${res.status}`);
      }
      setMessages(Array.isArray(json.history) ? json.history : []);
      setEvents(Array.isArray(json.events) ? json.events : []);
      const nextThreads = Array.isArray(json.threads) ? json.threads : [];
      const withFallback = nextThreads.length
        ? nextThreads
        : [{ threadId: "default", messageCount: Array.isArray(json.history) ? json.history.length : 0, lastTs: Date.now(), lastPreview: "" }];
      const hasCurrent = withFallback.some((t) => t?.threadId === threadId);
      setThreads(
        hasCurrent
          ? withFallback
          : [{ threadId, messageCount: 0, lastTs: Date.now(), lastPreview: "" }, ...withFallback],
      );
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load chat history");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory("default");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent]);

  useEffect(() => {
    void loadHistory(activeThread);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThread]);

  useEffect(() => {
    if (!listRef.current) return;
    listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, sending]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    const optimisticTs = Date.now();
    setMessages((prev) => prev.concat({ role: "user", content: text, ts: optimisticTs }));
    setSending(true);
    setStreamingAssistantVisible(false);
    setErr("");
    setInput("");
    try {
      const res = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent,
          threadId: activeThread,
          tenantId,
          message: text,
          context,
        }),
      });
      if (!res.ok || !res.body) {
        const msg = await res.text().catch(() => "");
        throw new Error(msg || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let assistantStarted = false;
      let assistantText = "";
      let donePayload: any = null;
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() || "";
        for (const chunk of chunks) {
          const lines = chunk.split("\n");
          let eventName = "";
          let dataRaw = "";
          for (const line of lines) {
            if (line.startsWith("event:")) eventName = line.slice(6).trim();
            if (line.startsWith("data:")) {
              const part = line.startsWith("data: ") ? line.slice(6) : line.slice(5);
              dataRaw += part;
            }
          }
          if (!eventName) continue;
          const payload = dataRaw ? JSON.parse(dataRaw) : {};
            if (eventName === "delta") {
              const delta = String(payload?.delta || "");
              if (!assistantStarted) {
                assistantStarted = true;
                setStreamingAssistantVisible(true);
                setMessages((prev) => prev.concat({ role: "assistant", content: "", ts: Date.now() + 1 }));
              }
            assistantText += delta;
            setMessages((prev) => {
              const next = prev.slice();
              for (let i = next.length - 1; i >= 0; i -= 1) {
                if (next[i].role === "assistant") {
                  next[i] = { ...next[i], content: assistantText };
                  break;
                }
              }
              return next;
            });
          } else if (eventName === "done") {
            donePayload = payload;
          } else if (eventName === "error") {
            throw new Error(String(payload?.error || "Streaming failed"));
          }
        }
      }
      if (donePayload?.history && Array.isArray(donePayload.history)) {
        setMessages(donePayload.history);
      }
      await loadHistory(activeThread);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to send message");
      setMessages((prev) => prev.filter((m) => !(m.role === "user" && m.ts === optimisticTs)));
    } finally {
      setSending(false);
      setStreamingAssistantVisible(false);
    }
  }

  const recentEvents = useMemo(() => {
    return (events || [])
      .slice()
      .reverse()
      .filter((e) => e.agent !== agent || e.kind === "insight_run")
      .slice(0, 8);
  }, [events, agent]);

  const assistantTs = useMemo(() => {
    const set = new Set<number>();
    for (const m of messages) {
      if (m.role === "assistant") set.add(Number(m.ts || 0));
    }
    return set;
  }, [messages]);

  function isReadMessage(ts: number) {
    const t = Number(ts || 0);
    if (!t) return false;
    for (const at of assistantTs.values()) {
      if (at > t) return true;
    }
    return false;
  }

  function startNewChat() {
    const threadId = makeThreadId();
    setThreads((prev) => [{ threadId, title: "", messageCount: 0, lastTs: Date.now(), lastPreview: "" }, ...prev]);
    setActiveThread(threadId);
    setMessages([]);
    setErr("");
    void fetch("/api/ai/chat/threads", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent, threadId, tenantId }),
    }).catch(() => null);
  }

  function startRename(t: ThreadSummary) {
    setRenamingThreadId(t.threadId);
    setRenameValue(threadLabel(t));
  }

  async function saveRename(threadId: string) {
    const title = renameValue.trim();
    if (!title) return;
    await fetch("/api/ai/chat/threads", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent, threadId, title, tenantId }),
    }).catch(() => null);
    setRenamingThreadId("");
    setRenameValue("");
    await loadHistory(activeThread);
  }

  async function deleteThread(threadId: string) {
    if (threadId === "default") return;
    await fetch(`/api/ai/chat/threads?agent=${encodeURIComponent(agent)}&threadId=${encodeURIComponent(threadId)}&tenantId=${encodeURIComponent(tenantId)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (activeThread === threadId) setActiveThread("default");
    await loadHistory(activeThread === threadId ? "default" : activeThread);
  }

  async function togglePinned(threadId: string, pinned: boolean) {
    await fetch("/api/ai/chat/threads", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent, threadId, pinned, tenantId }),
    }).catch(() => null);
    await loadHistory(activeThread);
  }

  function sortedWithPinnedOrder(prev: ThreadSummary[], orderedPinnedIds: string[]) {
    const idxMap = new Map<string, number>();
    prev.forEach((t, idx) => idxMap.set(t.threadId, idx));
    const orderMap = new Map<string, number>();
    orderedPinnedIds.forEach((id, idx) => orderMap.set(id, idx));
    return prev.slice().sort((a, b) => {
      const ap = a.pinned === true;
      const bp = b.pinned === true;
      if (ap !== bp) return ap ? -1 : 1;
      if (ap && bp) {
        const ao = Number(orderMap.get(a.threadId) ?? 999999);
        const bo = Number(orderMap.get(b.threadId) ?? 999999);
        if (ao !== bo) return ao - bo;
      }
      return (idxMap.get(a.threadId) ?? 0) - (idxMap.get(b.threadId) ?? 0);
    });
  }

  async function reorderPinned(dragId: string, targetId: string) {
    if (!dragId || !targetId || dragId === targetId) return;
    const currentPinned = (threads || []).filter((t) => t.pinned === true).map((t) => t.threadId);
    const from = currentPinned.indexOf(dragId);
    const to = currentPinned.indexOf(targetId);
    if (from < 0 || to < 0) return;
    const nextPinned = currentPinned.slice();
    const [moved] = nextPinned.splice(from, 1);
    nextPinned.splice(to, 0, moved);
    setThreads((prev) => sortedWithPinnedOrder(prev, nextPinned));
    await fetch("/api/ai/chat/threads", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent, reorderPinnedThreadIds: nextPinned, tenantId }),
    }).catch(() => null);
    await loadHistory(activeThread);
  }

  const filteredThreads = useMemo(() => {
    const q = threadQuery.trim().toLowerCase();
    if (!q) return threads;
    return (threads || []).filter((t) => {
      const label = threadLabel(t).toLowerCase();
      const preview = String(t.lastPreview || "").toLowerCase();
      return label.includes(q) || preview.includes(q) || String(t.threadId).toLowerCase().includes(q);
    });
  }, [threads, threadQuery]);

  return (
    <div className={`aiChatCard ${className}`}>
      <div className="aiChatTop">
        <div>
          <div className="aiTitle">{title}</div>
          <div className="mini" style={{ opacity: 0.85 }}>
            Agent: <b>{agent}</b> · Thread: <b>{activeThread === "default" ? "General" : activeThread}</b>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className="smallBtn" type="button" onClick={startNewChat} disabled={loading || sending}>
            + New Chat
          </button>
          <button
            className="smallBtn"
            type="button"
            onClick={() => void loadHistory(activeThread)}
            disabled={loading || sending}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      <div className="aiChatBody">
        <aside className="aiThreadRail">
          <div className="mini aiThreadTitle">Conversations</div>
          <input
            className="input aiThreadSearch"
            placeholder="Search chats..."
            value={threadQuery}
            onChange={(e) => setThreadQuery(e.target.value)}
          />
          <div className="aiThreadList">
            {(filteredThreads || []).map((t) => (
              <div
                key={t.threadId}
                className={`aiThreadItem ${activeThread === t.threadId ? "aiThreadItemActive" : ""} ${dragOverPinnedThreadId === t.threadId ? "aiThreadDragOver" : ""}`}
                draggable={t.pinned === true}
                onDragStart={() => {
                  if (t.pinned !== true) return;
                  setDragPinnedThreadId(t.threadId);
                }}
                onDragOver={(e) => {
                  if (!dragPinnedThreadId || t.pinned !== true) return;
                  e.preventDefault();
                  setDragOverPinnedThreadId(t.threadId);
                }}
                onDragLeave={() => {
                  if (dragOverPinnedThreadId === t.threadId) setDragOverPinnedThreadId("");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dragId = dragPinnedThreadId;
                  setDragPinnedThreadId("");
                  setDragOverPinnedThreadId("");
                  void reorderPinned(dragId, t.threadId);
                }}
                onDragEnd={() => {
                  setDragPinnedThreadId("");
                  setDragOverPinnedThreadId("");
                }}
              >
                <button
                  type="button"
                  className="aiThreadMainBtn"
                  onClick={() => setActiveThread(t.threadId)}
                >
                  <div className="aiThreadHead">
                    <span>{t.pinned ? `★ ${threadLabel(t)}` : threadLabel(t)}</span>
                    <span>{t.messageCount || 0}</span>
                  </div>
                  <div className="aiThreadMeta">{t.lastTs ? fmtTs(t.lastTs) : "No messages yet"}</div>
                </button>
                {renamingThreadId === t.threadId ? (
                  <div className="aiThreadRename">
                    <input
                      className="input"
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                    />
                    <button className="smallBtn" type="button" onClick={() => void saveRename(t.threadId)}>
                      Save
                    </button>
                    <button className="smallBtn" type="button" onClick={() => setRenamingThreadId("")}>
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="aiThreadActions">
                    <button
                      className="smallBtn"
                      type="button"
                      onClick={() => void togglePinned(t.threadId, !(t.pinned === true))}
                    >
                      {t.pinned ? "Unpin" : "Pin"}
                    </button>
                    <button className="smallBtn" type="button" onClick={() => startRename(t)}>
                      Rename
                    </button>
                    {t.threadId !== "default" ? (
                      <button className="smallBtn" type="button" onClick={() => void deleteThread(t.threadId)}>
                        Archive
                      </button>
                    ) : null}
                  </div>
                )}
              </div>
            ))}
            {filteredThreads.length === 0 ? (
              <div className="mini">No conversations found.</div>
            ) : null}
          </div>
        </aside>

        <div className="aiChatMessages">
          <div ref={listRef}>
          {messages.length ? (
            messages.map((m, i) => (
              <div
                key={`${m.ts}_${i}`}
                className={`aiMsg ${m.role === "user" ? "aiMsgUser" : "aiMsgAssistant"}`}
              >
                <div className="aiMsgMeta">
                    <span>{m.role === "user" ? "You" : "AI"}</span>
                    <span>
                      {m.role === "user" ? (isReadMessage(m.ts) ? "read" : "sent") : fmtTs(m.ts)}
                    </span>
                </div>
                <div className="aiMsgText">
                  {m.role === "assistant" ? renderMarkdown(m.content) : m.content}
                </div>
              </div>
            ))
          ) : (
            <div className="mini">No messages yet.</div>
          )}
          {sending && !streamingAssistantVisible ? (
            <div className="aiMsg aiMsgAssistant">
              <div className="aiMsgMeta">
                <span>AI</span>
                <span>typing</span>
              </div>
              <div className="aiTyping" aria-hidden="true">
                <span />
                <span />
                <span />
              </div>
            </div>
          ) : null}
          </div>
        </div>

        <aside className="aiFeed">
          <div className="mini" style={{ opacity: 0.8, marginBottom: 8 }}>
            Recent AI feed (all agents)
          </div>
          {recentEvents.length ? (
            <div className="aiFeedList">
              {recentEvents.map((e, i) => (
                <div className="aiFeedItem" key={`${e.ts}_${i}`}>
                  <div className="aiFeedMeta">
                    <span>{e.agent}</span>
                    <span>{fmtTs(e.ts)}</span>
                  </div>
                  <div className="aiFeedText">{e.summary}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mini">No feed events yet.</div>
          )}
        </aside>
      </div>

      <div className="aiChatComposer">
        <textarea
          className="input aiChatInput"
          placeholder="Ask the AI agent about business issues, root causes, and action plans..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={sending}
          rows={3}
        />
        <button className="btn btnPrimary" type="button" onClick={send} disabled={sending || !input.trim()}>
          {sending ? "Sending..." : "Send"}
        </button>
      </div>

      {err ? (
        <div className="mini" style={{ color: "var(--danger)", marginTop: 8 }}>
          X {err}
        </div>
      ) : null}
    </div>
  );
}
