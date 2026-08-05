-- Intake scanner ledger (2026-08-05). Applied via management API; kept here
-- as the record. One row per household; roster jsonb carries the declared
-- adults with submitted/pending state. intake_applicants makes runs
-- idempotent by Buildium applicant id.
create table if not exists intake_households (
  id bigserial primary key,
  unit_id bigint not null,
  property_id bigint,
  task_gid text not null,
  address text,
  roster jsonb not null default '[]'::jsonb,
  complete boolean not null default false,
  last_nudge_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists intake_households_unit on intake_households(unit_id) where not complete;
create table if not exists intake_applicants (
  applicant_id bigint primary key,
  household_id bigint references intake_households(id),
  created_at timestamptz not null default now()
);
-- Cron: job 'application-intake' runs every 15 minutes via pg_cron + pg_net,
-- POSTing {"action":"intake"} to the screening-proxy with the team key.
