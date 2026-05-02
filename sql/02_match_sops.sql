-- match_sops: vector similarity search RPC
-- Threshold defaults to 0.3 (lower than OpenB's 0.5 — v0 favors recall over precision).
-- Optional service_line filter narrows to one line; null = all lines.
-- v0 does NOT filter by visibility_tier (all callers see all rows).

create or replace function match_sops(
  query_embedding vector(1536),
  match_threshold float default 0.3,
  match_count int default 10,
  filter_service_line text default null
)
returns table (
  id uuid,
  file_path text,
  chunk_heading text,
  content text,
  title text,
  service_line text,
  visibility_tier text,
  status text,
  last_reviewed date,
  tags text[],
  created_but_never_updated boolean,
  similarity float
)
language plpgsql
as $$
begin
  return query
  select
    s.id,
    s.file_path,
    s.chunk_heading,
    s.content,
    s.title,
    s.service_line,
    s.visibility_tier,
    s.status,
    s.last_reviewed,
    s.tags,
    s.created_but_never_updated,
    1 - (s.embedding <=> query_embedding) as similarity
  from sops s
  where s.embedding is not null
    and 1 - (s.embedding <=> query_embedding) > match_threshold
    and (filter_service_line is null or s.service_line = filter_service_line)
  order by s.embedding <=> query_embedding
  limit match_count;
end;
$$;
