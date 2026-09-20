-- Phase 6: ratings on summaries, the numbers behind the Metrics tab, and example selection.
--
-- The `feedback` table (created in the first migration) now holds one rating per person per summary,
-- which they can change. Rows stay private to their owner. Faculty additionally get *aggregates*
-- across everyone through `feedback_aggregates()`, never other people's rows or comments.

-- One rating per person per summary (NULL document ids, left behind when a summary is deleted,
-- stay distinct so history is kept).
alter table public.feedback
  add column updated_at timestamptz not null default now(),
  add constraint feedback_user_document_key unique (user_id, document_id),
  add constraint feedback_role_check check (role is null or role in ('student', 'researcher', 'faculty')),
  -- `params` is written by the browser; keep it small.
  add constraint feedback_params_size check (pg_column_size(params) <= 2048);

create trigger feedback_set_updated_at before update on public.feedback
  for each row execute function public.set_updated_at();

create policy "feedback: update own" on public.feedback
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (document_id is null or exists (select 1 from public.documents d where d.id = document_id))
  );

-- Used when picking examples (a user's own consented, well-rated summaries) and by the aggregates.
create index feedback_user_rating_idx on public.feedback (user_id, rating desc) where consent;

-- ---------------------------------------------------------------------------
-- Faculty-only aggregates
-- ---------------------------------------------------------------------------

-- Average rating and response count across all users, grouped by the model, mode, length,
-- language and role behind each rating (and by whether examples were used). Groups with fewer
-- than 3 responses are left out so that a figure can never describe a single person.
-- SECURITY DEFINER because it reads other users' rows; it returns only these grouped numbers and
-- refuses everyone who is not faculty. `profiles.role` can only be changed by an administrator.
create or replace function public.feedback_aggregates()
returns table (dimension text, value text, responses bigint, average_rating numeric)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'faculty') then
    raise exception 'Only faculty can see feedback across all users.' using errcode = '42501';
  end if;

  return query
  with f as (
    select
      rating,
      coalesce(nullif(model, ''), 'unknown') as model,
      coalesce(nullif(params ->> 'mode', ''), 'unknown') as mode,
      coalesce(nullif(params ->> 'length', ''), 'unknown') as length,
      coalesce(nullif(params ->> 'language', ''), 'unknown') as language,
      coalesce(role, 'unknown') as role,
      case when params ->> 'usedExamples' = 'true' then 'with examples' else 'without examples' end as examples
    from public.feedback
  ),
  unpivoted as (
    select 'all'::text as dimension, 'all'::text as value, rating from f
    union all select 'model', model, rating from f
    union all select 'mode', mode, rating from f
    union all select 'length', length, rating from f
    union all select 'language', language, rating from f
    union all select 'role', role, rating from f
    union all select 'examples', examples, rating from f
  )
  select u.dimension, u.value, count(*)::bigint, round(avg(u.rating)::numeric, 2)
  from unpivoted u
  group by u.dimension, u.value
  having count(*) >= 3
  order by u.dimension, u.value;
end;
$$;

revoke all on function public.feedback_aggregates() from public, anon;
grant execute on function public.feedback_aggregates() to authenticated;
