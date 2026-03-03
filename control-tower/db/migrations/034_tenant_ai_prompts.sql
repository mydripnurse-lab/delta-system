create table if not exists app.organization_ai_prompts (
  id bigserial primary key,
  organization_id uuid not null references app.organizations(id) on delete cascade,
  integration_key text not null default 'default',
  prompt_key text not null,
  name text not null,
  module text not null default 'ai',
  route_path text not null default '',
  description text not null default '',
  prompt_text text not null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint organization_ai_prompts_org_integration_key_ck check (length(trim(integration_key)) > 0),
  constraint organization_ai_prompts_prompt_key_ck check (length(trim(prompt_key)) > 0)
);

create unique index if not exists organization_ai_prompts_org_integration_prompt_uidx
  on app.organization_ai_prompts (organization_id, integration_key, prompt_key);

create index if not exists organization_ai_prompts_org_module_idx
  on app.organization_ai_prompts (organization_id, module, updated_at desc);
