create table if not exists public.ai_conversation_threads (
  id bigserial primary key,
  tenant_scope text not null default 'global',
  agent text not null,
  thread_id text not null,
  title text not null default '',
  archived boolean not null default false,
  pinned boolean not null default false,
  pin_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists ai_conversation_threads_scope_agent_thread_uidx
  on public.ai_conversation_threads (tenant_scope, agent, thread_id);

create index if not exists ai_conversation_threads_scope_agent_idx
  on public.ai_conversation_threads (tenant_scope, agent, archived, pinned, pin_order, updated_at desc);

create table if not exists public.ai_conversation_messages (
  id bigserial primary key,
  tenant_scope text not null default 'global',
  agent text not null,
  thread_id text not null,
  role text not null,
  content text not null,
  ts bigint not null,
  created_at timestamptz not null default now()
);

create index if not exists ai_conversation_messages_scope_agent_thread_ts_idx
  on public.ai_conversation_messages (tenant_scope, agent, thread_id, ts desc, id desc);

create table if not exists public.ai_events (
  id bigserial primary key,
  tenant_scope text not null default 'global',
  ts bigint not null,
  agent text not null,
  kind text not null,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_events_scope_ts_idx
  on public.ai_events (tenant_scope, ts desc, id desc);

