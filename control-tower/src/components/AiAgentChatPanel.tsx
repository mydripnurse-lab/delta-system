"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ChatMsg = {
  role: "user" | "assistant" | "system";
  content: string;
  ts: number;
};

type ThreadSummary = {
  threadId: string;
  title?: string;
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
  title?: string;
  context?: Record<string, unknown>;
  className?: string;
};

function fmtTs(ts: number) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
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
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement | null>(null);

  async function loadHistory(targetThread?: string) {
    const threadId = String(targetThread || activeThread || "default").trim() || "default";
    setLoading(true);
    setErr("");
    try {
      const res = await fetch(
        `/api/ai/chat/history?agent=${encodeURIComponent(agent)}&threadId=${encodeURIComponent(threadId)}`,
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
    setErr("");
    setInput("");
    try {
      const res = await fetch("/api/ai/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          agent,
          threadId: activeThread,
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
            if (line.startsWith("data:")) dataRaw += line.slice(5).trim();
          }
          if (!eventName) continue;
          const payload = dataRaw ? JSON.parse(dataRaw) : {};
          if (eventName === "delta") {
            const delta = String(payload?.delta || "");
            if (!assistantStarted) {
              assistantStarted = true;
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
      body: JSON.stringify({ agent, threadId }),
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
      body: JSON.stringify({ agent, threadId, title }),
    }).catch(() => null);
    setRenamingThreadId("");
    setRenameValue("");
    await loadHistory(activeThread);
  }

  async function deleteThread(threadId: string) {
    if (threadId === "default") return;
    await fetch(`/api/ai/chat/threads?agent=${encodeURIComponent(agent)}&threadId=${encodeURIComponent(threadId)}`, {
      method: "DELETE",
    }).catch(() => null);
    if (activeThread === threadId) setActiveThread("default");
    await loadHistory(activeThread === threadId ? "default" : activeThread);
  }

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
          <div className="aiThreadList">
            {(threads || []).map((t) => (
              <div
                key={t.threadId}
                className={`aiThreadItem ${activeThread === t.threadId ? "aiThreadItemActive" : ""}`}
              >
                <button
                  type="button"
                  className="aiThreadMainBtn"
                  onClick={() => setActiveThread(t.threadId)}
                >
                  <div className="aiThreadHead">
                    <span>{threadLabel(t)}</span>
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
                <div className="aiMsgText">{m.content}</div>
              </div>
            ))
          ) : (
            <div className="mini">No messages yet.</div>
          )}
          {sending ? (
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
