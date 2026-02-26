import fs from "fs/promises";
import path from "path";
import os from "os";
import { getDbPool } from "@/lib/db";

export type AiRole = "user" | "assistant" | "system";

export type AiMessage = {
    role: AiRole;
    content: string;
    ts: number;
};

export type AiEvent = {
    id: string;
    ts: number;
    agent: string;
    kind: "insight_run" | "chat_turn";
    summary: string;
    metadata?: Record<string, unknown>;
};

type MemoryStore = {
    version: 1;
    updatedAt: number;
    conversations: Record<string, AiMessage[]>;
    threads?: Record<
        string,
        {
            title?: string;
            archived?: boolean;
            pinned?: boolean;
            pinOrder?: number;
            createdAt?: number;
            updatedAt?: number;
        }
    >;
    events: AiEvent[];
};

const MAX_EVENTS = 1500;
const MAX_MESSAGES_PER_AGENT = 200;
const THREAD_SEPARATOR = "::";
const DEFAULT_SCOPE = "global";

function useDbStorage() {
    return Boolean(String(process.env.DATABASE_URL || "").trim());
}

function scopeFromTenantId(tenantId?: string | null) {
    const v = String(tenantId || "").trim();
    return v || DEFAULT_SCOPE;
}

function memoryPath() {
    const explicit = String(process.env.AI_MEMORY_FILE || "").trim();
    if (explicit) return path.resolve(explicit);

    // Serverless environments (e.g. Vercel) cannot write under /var/task.
    // Use OS tmp as writable storage.
    if (
        process.env.VERCEL === "1" ||
        process.env.AWS_LAMBDA_FUNCTION_NAME ||
        process.cwd().startsWith("/var/task")
    ) {
        return path.join(os.tmpdir(), "control-tower", "storage", "ai-memory.json");
    }

    return path.join(process.cwd(), "storage", "ai-memory.json");
}

function nowTs() {
    return Date.now();
}

function uid() {
    return `${nowTs()}_${Math.random().toString(36).slice(2, 10)}`;
}

function defaultStore(): MemoryStore {
    return {
        version: 1,
        updatedAt: nowTs(),
        conversations: {},
        threads: {},
        events: [],
    };
}

async function ensureDir() {
    const p = memoryPath();
    await fs.mkdir(path.dirname(p), { recursive: true });
}

export async function readAiMemory(): Promise<MemoryStore> {
    const p = memoryPath();
    try {
        const raw = await fs.readFile(p, "utf8");
        const parsed = JSON.parse(raw) as Partial<MemoryStore>;
        return {
            version: 1,
            updatedAt: Number(parsed.updatedAt || nowTs()),
            conversations: parsed.conversations || {},
            threads: parsed.threads || {},
            events: Array.isArray(parsed.events) ? parsed.events : [],
        };
    } catch {
        return defaultStore();
    }
}

async function writeAiMemory(store: MemoryStore) {
    await ensureDir();
    store.updatedAt = nowTs();
    await fs.writeFile(memoryPath(), JSON.stringify(store, null, 2), "utf8");
}

async function dbEnsureThread(
    tenantScope: string,
    agent: string,
    threadId: string,
    opts?: { title?: string },
) {
    const pool = getDbPool();
    await pool.query(
        `
        insert into public.ai_conversation_threads
          (tenant_scope, agent, thread_id, title, archived, pinned, pin_order, created_at, updated_at)
        values
          ($1, $2, $3, $4, false, false, 0, now(), now())
        on conflict (tenant_scope, agent, thread_id)
        do update set updated_at = now()
        `,
        [tenantScope, agent, threadId, String(opts?.title || "")],
    );
}

export async function appendAiEvent(event: Omit<AiEvent, "id" | "ts"> & { tenantId?: string | null }) {
    if (useDbStorage()) {
        const pool = getDbPool();
        const ts = nowTs();
        const tenantScope = scopeFromTenantId(event.tenantId);
        const result = await pool.query<{
            id: number;
            ts: string;
            agent: string;
            kind: string;
            summary: string;
            metadata: Record<string, unknown> | null;
        }>(
            `
            insert into public.ai_events
              (tenant_scope, ts, agent, kind, summary, metadata, created_at)
            values
              ($1, $2, $3, $4, $5, $6::jsonb, now())
            returning id, ts, agent, kind, summary, metadata
            `,
            [
                tenantScope,
                ts,
                event.agent,
                event.kind,
                event.summary,
                JSON.stringify(event.metadata || {}),
            ],
        );
        const row = result.rows[0];
        return {
            id: String(row?.id || uid()),
            ts: Number(row?.ts || ts),
            agent: String(row?.agent || event.agent),
            kind: String(row?.kind || event.kind) as AiEvent["kind"],
            summary: String(row?.summary || event.summary),
            metadata: (row?.metadata || {}) as Record<string, unknown>,
        };
    }
    const store = await readAiMemory();
    const next: AiEvent = {
        id: uid(),
        ts: nowTs(),
        agent: event.agent,
        kind: event.kind,
        summary: event.summary,
        metadata: event.metadata || {},
    };
    store.events.push(next);
    if (store.events.length > MAX_EVENTS) {
        store.events = store.events.slice(store.events.length - MAX_EVENTS);
    }
    await writeAiMemory(store);
    return next;
}

export async function appendConversationMessage(agent: string, msg: Omit<AiMessage, "ts">, tenantId?: string | null) {
    if (useDbStorage()) {
        return appendConversationMessageForThread(agent, "default", msg, tenantId);
    }
    const store = await readAiMemory();
    if (!store.conversations[agent]) store.conversations[agent] = [];
    store.conversations[agent].push({
        role: msg.role,
        content: msg.content,
        ts: nowTs(),
    });
    if (store.conversations[agent].length > MAX_MESSAGES_PER_AGENT) {
        store.conversations[agent] = store.conversations[agent].slice(
            store.conversations[agent].length - MAX_MESSAGES_PER_AGENT,
        );
    }
    await writeAiMemory(store);
    return store.conversations[agent];
}

export async function getConversation(agent: string, limit = 60, tenantId?: string | null) {
    if (useDbStorage()) {
        return getConversationForThread(agent, "default", limit, tenantId);
    }
    const store = await readAiMemory();
    const msgs = store.conversations[agent] || [];
    return msgs.slice(Math.max(0, msgs.length - Math.max(1, limit)));
}

function threadSafe(v: string) {
    return String(v || "")
        .trim()
        .replace(/[^a-zA-Z0-9_-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64) || "default";
}

function conversationKey(agent: string, threadId?: string) {
    const base = String(agent || "").trim() || "overview";
    const thread = threadSafe(String(threadId || "default"));
    return thread === "default" ? base : `${base}${THREAD_SEPARATOR}${thread}`;
}

function parseConversationKey(key: string) {
    const raw = String(key || "");
    const idx = raw.indexOf(THREAD_SEPARATOR);
    if (idx <= 0) return { agent: raw, threadId: "default" };
    return {
        agent: raw.slice(0, idx),
        threadId: threadSafe(raw.slice(idx + THREAD_SEPARATOR.length)),
    };
}

function normalizeThreadTitle(v: string) {
    return String(v || "").trim().slice(0, 120);
}

function ensureThreadMeta(store: MemoryStore, agent: string, threadId: string) {
    const key = conversationKey(agent, threadId);
    if (!store.threads) store.threads = {};
    const now = nowTs();
    if (!store.threads[key]) {
        store.threads[key] = {
            title: threadId === "default" ? "General" : "",
            archived: false,
            pinned: false,
            pinOrder: 0,
            createdAt: now,
            updatedAt: now,
        };
    }
    if (store.threads[key]?.archived) {
        store.threads[key]!.archived = false;
    }
    store.threads[key]!.updatedAt = now;
    return key;
}

export async function appendConversationMessageForThread(
    agent: string,
    threadId: string,
    msg: Omit<AiMessage, "ts">,
    tenantId?: string | null,
) {
    if (useDbStorage()) {
        const pool = getDbPool();
        const tenantScope = scopeFromTenantId(tenantId);
        const safeThread = threadSafe(threadId);
        await dbEnsureThread(tenantScope, agent, safeThread);
        const ts = nowTs();
        await pool.query(
            `
            insert into public.ai_conversation_messages
              (tenant_scope, agent, thread_id, role, content, ts, created_at)
            values
              ($1, $2, $3, $4, $5, $6, now())
            `,
            [tenantScope, agent, safeThread, msg.role, msg.content, ts],
        );
        if (msg.role === "user") {
            await pool.query(
                `
                update public.ai_conversation_threads
                set title = case
                      when coalesce(title, '') = '' then left($4, 60)
                      else title
                    end,
                    updated_at = now()
                where tenant_scope = $1 and agent = $2 and thread_id = $3
                `,
                [tenantScope, agent, safeThread, normalizeThreadTitle(msg.content)],
            );
        }
        const rows = await getConversationForThread(agent, safeThread, MAX_MESSAGES_PER_AGENT, tenantId);
        return rows;
    }
    const key = conversationKey(agent, threadId);
    const store = await readAiMemory();
    ensureThreadMeta(store, agent, threadId);
    if (!store.conversations[key]) store.conversations[key] = [];
    store.conversations[key].push({
        role: msg.role,
        content: msg.content,
        ts: nowTs(),
    });
    if (store.conversations[key].length > MAX_MESSAGES_PER_AGENT) {
        store.conversations[key] = store.conversations[key].slice(
            store.conversations[key].length - MAX_MESSAGES_PER_AGENT,
        );
    }
    const meta = store.threads?.[key];
    if (meta && !meta.title && msg.role === "user") {
        meta.title = normalizeThreadTitle(msg.content).slice(0, 60);
    }
    await writeAiMemory(store);
    return store.conversations[key];
}

export async function getConversationForThread(
    agent: string,
    threadId: string,
    limit = 60,
    tenantId?: string | null,
) {
    if (useDbStorage()) {
        const pool = getDbPool();
        const tenantScope = scopeFromTenantId(tenantId);
        const safeThread = threadSafe(threadId);
        const result = await pool.query<{
            role: AiRole;
            content: string;
            ts: string;
        }>(
            `
            select role, content, ts
            from (
              select role, content, ts, id
              from public.ai_conversation_messages
              where tenant_scope = $1 and agent = $2 and thread_id = $3
              order by ts desc, id desc
              limit $4
            ) x
            order by ts asc
            `,
            [tenantScope, agent, safeThread, Math.max(1, limit)],
        );
        return result.rows.map((r) => ({
            role: r.role,
            content: String(r.content || ""),
            ts: Number(r.ts || 0),
        }));
    }
    const key = conversationKey(agent, threadId);
    const store = await readAiMemory();
    const msgs = store.conversations[key] || [];
    return msgs.slice(Math.max(0, msgs.length - Math.max(1, limit)));
}

export async function listConversationThreads(agent: string, limit = 30, tenantId?: string | null) {
    if (useDbStorage()) {
        const pool = getDbPool();
        const tenantScope = scopeFromTenantId(tenantId);
        const result = await pool.query<{
            thread_id: string;
            title: string;
            pinned: boolean;
            pin_order: number;
            message_count: string;
            last_ts: string | null;
            last_preview: string | null;
        }>(
            `
            select
              t.thread_id,
              coalesce(t.title, '') as title,
              coalesce(t.pinned, false) as pinned,
              coalesce(t.pin_order, 0) as pin_order,
              coalesce(msg_stats.message_count, 0) as message_count,
              msg_stats.last_ts,
              msg_stats.last_preview
            from public.ai_conversation_threads t
            left join lateral (
              select
                count(*)::bigint as message_count,
                max(m.ts)::bigint as last_ts,
                (array_agg(m.content order by m.ts desc, m.id desc))[1] as last_preview
              from public.ai_conversation_messages m
              where m.tenant_scope = t.tenant_scope
                and m.agent = t.agent
                and m.thread_id = t.thread_id
            ) msg_stats on true
            where t.tenant_scope = $1
              and t.agent = $2
              and coalesce(t.archived, false) = false
            order by
              case when coalesce(t.pinned, false) then 0 else 1 end asc,
              coalesce(t.pin_order, 0) asc,
              coalesce(msg_stats.last_ts, 0) desc,
              t.updated_at desc
            limit $3
            `,
            [tenantScope, agent, Math.max(1, limit)],
        );
        return result.rows.map((r) => ({
            threadId: String(r.thread_id || "default"),
            title: String(r.title || ""),
            pinned: r.pinned === true,
            pinOrder: Number(r.pin_order || 0),
            messageCount: Number(r.message_count || 0),
            lastTs: Number(r.last_ts || 0),
            lastPreview: String(r.last_preview || "").slice(0, 120),
        }));
    }
    const target = String(agent || "").trim() || "overview";
    const store = await readAiMemory();
    const all = Object.entries(store.conversations || {});
    const rows = all
        .map(([key, messages]) => {
            const parsed = parseConversationKey(key);
            if (parsed.agent !== target) return null;
            const meta = store.threads?.[key];
            if (meta?.archived) return null;
            const arr = Array.isArray(messages) ? messages : [];
            const last = arr[arr.length - 1] || null;
            return {
                threadId: parsed.threadId || "default",
                title: normalizeThreadTitle(String(meta?.title || "")),
                pinned: meta?.pinned === true,
                pinOrder: Number(meta?.pinOrder || 0),
                messageCount: arr.length,
                lastTs: Number(last?.ts || 0),
                lastPreview: String(last?.content || "").slice(0, 120),
            };
        })
        .filter((x): x is { threadId: string; title: string; pinned: boolean; pinOrder: number; messageCount: number; lastTs: number; lastPreview: string } => Boolean(x))
        .sort((a, b) => {
            if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
            if (a.pinned && b.pinned && a.pinOrder !== b.pinOrder) return a.pinOrder - b.pinOrder;
            return b.lastTs - a.lastTs;
        });
    return rows.slice(0, Math.max(1, limit));
}

export async function createConversationThread(agent: string, threadId: string, title?: string, tenantId?: string | null) {
    if (useDbStorage()) {
        const pool = getDbPool();
        const tenantScope = scopeFromTenantId(tenantId);
        const safeThread = threadSafe(threadId);
        const safeTitle = normalizeThreadTitle(String(title || ""));
        await pool.query(
            `
            insert into public.ai_conversation_threads
              (tenant_scope, agent, thread_id, title, archived, pinned, pin_order, created_at, updated_at)
            values
              ($1, $2, $3, $4, false, false, 0, now(), now())
            on conflict (tenant_scope, agent, thread_id)
            do update set archived = false, updated_at = now()
            `,
            [tenantScope, agent, safeThread, safeTitle],
        );
        return {
            threadId: safeThread,
            title: safeTitle,
            pinned: false,
        };
    }
    const store = await readAiMemory();
    const key = ensureThreadMeta(store, agent, threadId);
    if (!store.conversations[key]) store.conversations[key] = [];
    if (title) store.threads![key]!.title = normalizeThreadTitle(title);
    store.threads![key]!.updatedAt = nowTs();
    await writeAiMemory(store);
    return {
        threadId: parseConversationKey(key).threadId,
        title: store.threads![key]!.title || "",
        pinned: store.threads![key]!.pinned === true,
    };
}

export async function renameConversationThread(agent: string, threadId: string, title: string, tenantId?: string | null) {
    if (useDbStorage()) {
        const pool = getDbPool();
        const tenantScope = scopeFromTenantId(tenantId);
        const safeThread = threadSafe(threadId);
        const safeTitle = normalizeThreadTitle(title);
        await dbEnsureThread(tenantScope, agent, safeThread);
        const result = await pool.query<{ pinned: boolean }>(
            `
            update public.ai_conversation_threads
            set title = $4, updated_at = now()
            where tenant_scope = $1 and agent = $2 and thread_id = $3
            returning pinned
            `,
            [tenantScope, agent, safeThread, safeTitle],
        );
        return {
            threadId: safeThread,
            title: safeTitle,
            pinned: result.rows[0]?.pinned === true,
        };
    }
    const store = await readAiMemory();
    const key = ensureThreadMeta(store, agent, threadId);
    store.threads![key]!.title = normalizeThreadTitle(title);
    store.threads![key]!.updatedAt = nowTs();
    await writeAiMemory(store);
    return {
        threadId: parseConversationKey(key).threadId,
        title: store.threads![key]!.title || "",
        pinned: store.threads![key]!.pinned === true,
    };
}

export async function setConversationThreadPinned(
    agent: string,
    threadId: string,
    pinned: boolean,
    tenantId?: string | null,
) {
    if (useDbStorage()) {
        const pool = getDbPool();
        const tenantScope = scopeFromTenantId(tenantId);
        const safeThread = threadSafe(threadId);
        await dbEnsureThread(tenantScope, agent, safeThread);
        if (pinned === true) {
            const maxOrderRes = await pool.query<{ max_order: string | null }>(
                `
                select max(pin_order)::bigint as max_order
                from public.ai_conversation_threads
                where tenant_scope = $1 and agent = $2 and pinned = true
                `,
                [tenantScope, agent],
            );
            const nextOrder = Number(maxOrderRes.rows[0]?.max_order || 0) + 1;
            await pool.query(
                `
                update public.ai_conversation_threads
                set pinned = true, pin_order = $4, updated_at = now()
                where tenant_scope = $1 and agent = $2 and thread_id = $3
                `,
                [tenantScope, agent, safeThread, nextOrder],
            );
        } else {
            await pool.query(
                `
                update public.ai_conversation_threads
                set pinned = false, pin_order = 0, updated_at = now()
                where tenant_scope = $1 and agent = $2 and thread_id = $3
                `,
                [tenantScope, agent, safeThread],
            );
        }
        const t = await pool.query<{ title: string; pinned: boolean }>(
            `
            select title, pinned
            from public.ai_conversation_threads
            where tenant_scope = $1 and agent = $2 and thread_id = $3
            `,
            [tenantScope, agent, safeThread],
        );
        return {
            threadId: safeThread,
            title: String(t.rows[0]?.title || ""),
            pinned: t.rows[0]?.pinned === true,
        };
    }
    const store = await readAiMemory();
    const key = ensureThreadMeta(store, agent, threadId);
    if (pinned === true) {
        const prefix = `${String(agent || "").trim() || "overview"}${THREAD_SEPARATOR}`;
        const maxOrder = Object.entries(store.threads || {})
            .filter(([k, v]) => (k === agent || k.startsWith(prefix)) && v?.pinned === true)
            .reduce((acc, [, v]) => Math.max(acc, Number(v?.pinOrder || 0)), 0);
        store.threads![key]!.pinned = true;
        store.threads![key]!.pinOrder = maxOrder + 1;
    } else {
        store.threads![key]!.pinned = false;
        store.threads![key]!.pinOrder = 0;
    }
    store.threads![key]!.updatedAt = nowTs();
    await writeAiMemory(store);
    return {
        threadId: parseConversationKey(key).threadId,
        title: store.threads![key]!.title || "",
        pinned: store.threads![key]!.pinned === true,
    };
}

export async function reorderPinnedThreads(agent: string, orderedThreadIds: string[], tenantId?: string | null) {
    if (useDbStorage()) {
        const pool = getDbPool();
        const tenantScope = scopeFromTenantId(tenantId);
        const clean = Array.from(new Set((orderedThreadIds || []).map((x) => threadSafe(x)).filter(Boolean)));
        const client = await pool.connect();
        try {
            await client.query("begin");
            for (let i = 0; i < clean.length; i += 1) {
                await dbEnsureThread(tenantScope, agent, clean[i]);
                await client.query(
                    `
                    update public.ai_conversation_threads
                    set pinned = true, pin_order = $4, updated_at = now()
                    where tenant_scope = $1 and agent = $2 and thread_id = $3
                    `,
                    [tenantScope, agent, clean[i], i + 1],
                );
            }
            await client.query("commit");
            return { ok: true };
        } catch (e) {
            await client.query("rollback");
            throw e;
        } finally {
            client.release();
        }
    }
    const store = await readAiMemory();
    const clean = Array.from(new Set((orderedThreadIds || []).map((x) => threadSafe(x)).filter(Boolean)));
    clean.forEach((threadId, idx) => {
        const key = conversationKey(agent, threadId);
        ensureThreadMeta(store, agent, threadId);
        store.threads![key]!.pinned = true;
        store.threads![key]!.pinOrder = idx + 1;
        store.threads![key]!.updatedAt = nowTs();
    });
    await writeAiMemory(store);
    return { ok: true };
}

export async function archiveConversationThread(agent: string, threadId: string, tenantId?: string | null) {
    if (useDbStorage()) {
        const pool = getDbPool();
        const tenantScope = scopeFromTenantId(tenantId);
        const safeThread = threadSafe(threadId);
        await dbEnsureThread(tenantScope, agent, safeThread);
        await pool.query(
            `
            update public.ai_conversation_threads
            set archived = true, pinned = false, pin_order = 0, updated_at = now()
            where tenant_scope = $1 and agent = $2 and thread_id = $3
            `,
            [tenantScope, agent, safeThread],
        );
        return { ok: true };
    }
    const store = await readAiMemory();
    const key = ensureThreadMeta(store, agent, threadId);
    store.threads![key]!.archived = true;
    store.threads![key]!.updatedAt = nowTs();
    await writeAiMemory(store);
    return { ok: true };
}

export async function getRecentEvents(limit = 120, tenantId?: string | null) {
    if (useDbStorage()) {
        const pool = getDbPool();
        const tenantScope = scopeFromTenantId(tenantId);
        const result = await pool.query<{
            id: string;
            ts: string;
            agent: string;
            kind: string;
            summary: string;
            metadata: Record<string, unknown> | null;
        }>(
            `
            select id::text, ts, agent, kind, summary, metadata
            from public.ai_events
            where tenant_scope = $1 or tenant_scope = $2
            order by ts desc, id desc
            limit $3
            `,
            [tenantScope, DEFAULT_SCOPE, Math.max(1, limit)],
        );
        return result.rows
            .slice()
            .reverse()
            .map((r) => ({
                id: String(r.id || ""),
                ts: Number(r.ts || 0),
                agent: String(r.agent || ""),
                kind: String(r.kind || "chat_turn") as AiEvent["kind"],
                summary: String(r.summary || ""),
                metadata: (r.metadata || {}) as Record<string, unknown>,
            }));
    }
    const store = await readAiMemory();
    const events = store.events || [];
    return events.slice(Math.max(0, events.length - Math.max(1, limit)));
}
