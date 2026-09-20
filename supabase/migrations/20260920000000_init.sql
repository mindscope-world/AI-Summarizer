-- LeaderForge Academic Summarizer: persistence, per-user isolation and roles.
--
-- Every table is owner-only under Row Level Security: a signed-in user can read and write only
-- their own rows, and the anonymous role can touch nothing. Roles (student / researcher /
-- faculty) live in `profiles.role` and are assigned by the database, never trusted from a token
-- or from the client. There is no sharing model yet, so no role gets extra read access.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role text not null default 'student' check (role in ('student', 'researcher', 'faculty')),
  institution text not null default '',
  student_id text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- A user may edit their own profile but never promote themselves: role changes must come from an
-- administrator (the SQL editor or the service role), where there is no signed-in user.
create or replace function public.protect_profile_role() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'Only an administrator can change a role.' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_profile_role();

-- Creates the profile when someone signs up (email or Google). Sign-up metadata is user-supplied,
-- so only the non-privileged roles can be requested; faculty accounts are granted by an admin.
create or replace function public.handle_new_user() returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  insert into public.profiles (id, full_name, role, institution, student_id, avatar_url)
  values (
    new.id,
    left(coalesce(nullif(meta ->> 'full_name', ''), nullif(meta ->> 'name', ''), split_part(coalesce(new.email, ''), '@', 1)), 120),
    case when meta ->> 'role' = 'researcher' then 'researcher' else 'student' end,
    left(coalesce(meta ->> 'institution', ''), 160),
    left(nullif(meta ->> 'student_id', ''), 60),
    coalesce(meta ->> 'avatar_url', meta ->> 'picture')
  );
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- documents: what a student ingested, plus their own notes
-- ---------------------------------------------------------------------------

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 300),
  category text not null default '' check (char_length(category) <= 100),
  category_color text not null default 'peach' check (category_color in ('peach', 'blue', 'purple', 'mint', 'amber')),
  tags text[] not null default '{}',
  excerpt text not null default '',
  prompt_question text,
  emotional_tone text not null default '',
  user_notes text not null default '',
  current_discussion_index integer not null default 0 check (current_discussion_index >= 0),
  /** Word counts, model, file name and so on, as recorded when the summary was made. */
  source_metadata jsonb not null default '{}'::jsonb,
  /** Path of the original upload in the `uploads` bucket, when one was kept. */
  original_file_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index documents_user_created_idx on public.documents (user_id, created_at desc);

create trigger documents_set_updated_at before update on public.documents
  for each row execute function public.set_updated_at();

-- The extracted text can be megabytes, so it lives apart and is fetched only when a document is opened.
create table public.document_sources (
  document_id uuid primary key references public.documents (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  text text not null
);

-- The structured summary. One row per document and language, so translations can be added later.
create table public.summaries (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  language text not null default 'English',
  mode text,
  length text,
  model text,
  /** contentParagraphs, bulletPoints (with review flags), discussionQuestions, warnings. */
  body jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (document_id, language)
);

create trigger summaries_set_updated_at before update on public.summaries
  for each row execute function public.set_updated_at();

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  author_name text not null default '',
  avatar_url text,
  body text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now()
);

create index comments_document_idx on public.comments (document_id, created_at);

create table public.review_progress (
  document_id uuid primary key references public.documents (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  progress jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger review_progress_set_updated_at before update on public.review_progress
  for each row execute function public.set_updated_at();

-- Ratings on summaries (collected and analysed in a later phase). `consent` says whether the
-- student allows the summary to be used as an example to improve results.
create table public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  document_id uuid references public.documents (id) on delete set null,
  rating smallint not null check (rating between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 5000),
  model text,
  params jsonb not null default '{}'::jsonb,
  role text,
  consent boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.user_preferences (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create trigger user_preferences_set_updated_at before update on public.user_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_sources enable row level security;
alter table public.summaries enable row level security;
alter table public.comments enable row level security;
alter table public.review_progress enable row level security;
alter table public.feedback enable row level security;
alter table public.user_preferences enable row level security;

-- The anonymous role gets nothing; signed-in users get exactly what the policies allow.
revoke all on public.profiles, public.documents, public.document_sources, public.summaries,
  public.comments, public.review_progress, public.feedback, public.user_preferences from anon, public;
grant select, insert, update, delete on public.documents, public.document_sources, public.summaries,
  public.comments, public.review_progress, public.feedback, public.user_preferences to authenticated;
-- Profiles are created by the sign-up trigger and never deleted directly (that happens with the account).
grant select, update on public.profiles to authenticated;

create policy "profiles: read own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "documents: read own" on public.documents
  for select to authenticated using (user_id = (select auth.uid()));
create policy "documents: insert own" on public.documents
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "documents: update own" on public.documents
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "documents: delete own" on public.documents
  for delete to authenticated using (user_id = (select auth.uid()));

-- Child rows must belong to the user AND hang off one of the user's own documents, so nobody can
-- attach rows to someone else's document by guessing its id. (The subquery is itself filtered by
-- the documents policy above.)
create policy "document_sources: read own" on public.document_sources
  for select to authenticated using (user_id = (select auth.uid()));
create policy "document_sources: insert own" on public.document_sources
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (select 1 from public.documents d where d.id = document_id)
  );
create policy "document_sources: update own" on public.document_sources
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "document_sources: delete own" on public.document_sources
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "summaries: read own" on public.summaries
  for select to authenticated using (user_id = (select auth.uid()));
create policy "summaries: insert own" on public.summaries
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (select 1 from public.documents d where d.id = document_id)
  );
create policy "summaries: update own" on public.summaries
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "summaries: delete own" on public.summaries
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "comments: read own" on public.comments
  for select to authenticated using (user_id = (select auth.uid()));
create policy "comments: insert own" on public.comments
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (select 1 from public.documents d where d.id = document_id)
  );
create policy "comments: update own" on public.comments
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "comments: delete own" on public.comments
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "review_progress: read own" on public.review_progress
  for select to authenticated using (user_id = (select auth.uid()));
create policy "review_progress: insert own" on public.review_progress
  for insert to authenticated with check (
    user_id = (select auth.uid()) and exists (select 1 from public.documents d where d.id = document_id)
  );
create policy "review_progress: update own" on public.review_progress
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "review_progress: delete own" on public.review_progress
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "feedback: read own" on public.feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy "feedback: insert own" on public.feedback
  for insert to authenticated with check (
    user_id = (select auth.uid())
    and (document_id is null or exists (select 1 from public.documents d where d.id = document_id))
  );
create policy "feedback: delete own" on public.feedback
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "user_preferences: read own" on public.user_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "user_preferences: insert own" on public.user_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "user_preferences: update own" on public.user_preferences
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "user_preferences: delete own" on public.user_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage: original uploads, private, one folder per user (`<user id>/<file>`)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'uploads',
  'uploads',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'text/markdown'
  ]
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "uploads: read own folder" on storage.objects
  for select to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "uploads: write own folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "uploads: delete own folder" on storage.objects
  for delete to authenticated
  using (bucket_id = 'uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
