-- Ask Aster v0 schema
-- Run after: enable pgvector extension (Database → Extensions → vector → ON)

create extension if not exists vector;

create table if not exists sops (
  id uuid default gen_random_uuid() primary key,

  -- chunk identity
  file_path text not null,                  -- e.g. "sops/utilities/pse-puget-sound-energy.md"
  chunk_index int not null,                 -- 0-based, ordered within a file
  chunk_heading text,                       -- H2 text, or null for whole-file chunks

  -- content + embedding
  content text not null,
  embedding vector(1536),

  -- frontmatter columns (broken out for filtering / display)
  title text not null,
  service_line text not null,
  sop_owner text,
  status text not null default 'active' check (status in ('active','draft','deprecated')),
  last_reviewed date,
  visibility_tier text not null check (visibility_tier in ('ic','director')),
  version int not null default 1,
  tags text[] not null default '{}',
  created_but_never_updated boolean not null default false,

  created_at timestamptz default now(),
  updated_at timestamptz default now(),

  unique (file_path, chunk_index)
);

-- Vector similarity index (cosine distance, hnsw)
create index if not exists sops_embedding_idx
  on sops using hnsw (embedding vector_cosine_ops);

-- Filter indexes for common query shapes
create index if not exists sops_service_line_idx on sops (service_line);
create index if not exists sops_status_idx on sops (status);
create index if not exists sops_visibility_tier_idx on sops (visibility_tier);
create index if not exists sops_tags_idx on sops using gin (tags);

-- Auto-update updated_at on row changes
create or replace function sops_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists sops_updated_at on sops;
create trigger sops_updated_at
  before update on sops
  for each row
  execute function sops_set_updated_at();
