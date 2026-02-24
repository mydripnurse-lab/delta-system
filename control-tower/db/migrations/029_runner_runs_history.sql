create schema if not exists app;

create table if not exists app.runner_runs (
  run_id text primary key,
  tenant_id text null,
  job text null,
  state text null,
  mode text null,
  debug boolean not null default false,
  loc_id text null,
  kind text null,
  cmd text null,
  status text not null default 'running',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finished_at timestamptz null,
  stopped boolean not null default false,
  exit_code integer null,
  error text null,
  lines_count integer not null default 0,
  last_line text null,
  progress jsonb null
);

create index if not exists idx_runner_runs_tenant_created
  on app.runner_runs (tenant_id, created_at desc);

create index if not exists idx_runner_runs_status_created
  on app.runner_runs (status, created_at desc);

create table if not exists app.runner_run_events (
  id bigint generated always as identity primary key,
  run_id text not null references app.runner_runs(run_id) on delete cascade,
  created_at timestamptz not null default now(),
  event_type text not null default 'line',
  message text not null,
  payload jsonb null
);

create index if not exists idx_runner_run_events_run_id_id
  on app.runner_run_events (run_id, id desc);

