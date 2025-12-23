-- 🏰 星妍秘密小屋 v7（纯邀请码联机）
-- 在 Supabase → SQL Editor 里整段粘贴运行即可。
-- 目标：两台设备同步 ①记录/评论/贴纸/聊天室 ②宠物 ③自定义背景 ④语音/图片等媒体（Storage）

-- =====================================================
-- 0) 基础表：Entries / Comments / Reactions / Chat
-- =====================================================

-- 1) Entries
create table if not exists public.dc_entries (
  id text primary key,
  room_code text not null,
  author text not null check (author in ('star','yan')),
  type text not null check (type in ('daily','study','reading','note','voice')),
  content jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists dc_entries_room_time on public.dc_entries(room_code, created_at desc);

-- 2) Comments (+ reply)
create table if not exists public.dc_comments (
  id text primary key,
  entry_id text not null references public.dc_entries(id) on delete cascade,
  room_code text not null,
  author text not null check (author in ('star','yan')),
  content text not null,
  created_at timestamptz not null default now()
);
alter table public.dc_comments add column if not exists reply_to text;
alter table public.dc_comments add column if not exists reply_to_author text;
alter table public.dc_comments add column if not exists reply_preview text;
create index if not exists dc_comments_room_time on public.dc_comments(room_code, created_at desc);
create index if not exists dc_comments_entry on public.dc_comments(entry_id, created_at asc);
create index if not exists dc_comments_reply on public.dc_comments(reply_to);

-- 3) Reactions
create table if not exists public.dc_reactions (
  id text primary key,
  entry_id text not null references public.dc_entries(id) on delete cascade,
  room_code text not null,
  author text not null check (author in ('star','yan')),
  emoji text not null,
  created_at timestamptz not null default now(),
  unique(entry_id, author, emoji)
);
create index if not exists dc_reactions_room_time on public.dc_reactions(room_code, created_at desc);

-- 4) Chat
create table if not exists public.dc_chat (
  id text primary key,
  room_code text not null,
  author text not null check (author in ('star','yan')),
  content text not null,
  reply_to text,
  reply_to_author text,
  reply_preview text,
  created_at timestamptz not null default now()
);
create index if not exists dc_chat_room_time on public.dc_chat(room_code, created_at asc);
create index if not exists dc_chat_reply on public.dc_chat(reply_to);

-- =====================================================
-- 1) v7：宠物（每人一只）
-- =====================================================

create table if not exists public.dc_pets (
  room_code text not null,
  owner text not null check (owner in ('star','yan')),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  primary key(room_code, owner)
);
create index if not exists dc_pets_room_time on public.dc_pets(room_code, updated_at desc);

-- =====================================================
-- 2) v7：自定义背景元数据（保存 publicUrl/path，便于另一台设备拉取）
-- =====================================================

create table if not exists public.dc_bg (
  room_code text not null,
  owner text not null check (owner in ('star','yan')),
  url text,
  path text,
  updated_at timestamptz not null default now(),
  primary key(room_code, owner)
);
create index if not exists dc_bg_room_time on public.dc_bg(room_code, updated_at desc);

-- =====================================================
-- 3) Storage：dc_media（语音/背景等）
-- =====================================================

-- 3.1 创建 bucket（public=TRUE：允许 getPublicUrl 直接播放/显示）
insert into storage.buckets (id, name, public)
values ('dc_media', 'dc_media', true)
on conflict (id) do nothing;

-- 3.2 允许匿名（anon key）上传/读取：
-- 说明：这是“纯邀请码”最省心的方案；如果你们后面要更私密（只允许两个账号），我可以再给你做 RLS 版本。
-- 注意：Storage 的策略表是 storage.objects（不是 public schema）。

-- 读（public bucket 其实已经可读，但加上策略更稳）
do $$ begin
  create policy "dc_media_read" on storage.objects
    for select
    using (bucket_id = 'dc_media');
exception when duplicate_object then null; end $$;

-- 写（上传/更新）
do $$ begin
  create policy "dc_media_write" on storage.objects
    for insert
    with check (bucket_id = 'dc_media');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "dc_media_update" on storage.objects
    for update
    using (bucket_id = 'dc_media')
    with check (bucket_id = 'dc_media');
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "dc_media_delete" on storage.objects
    for delete
    using (bucket_id = 'dc_media');
exception when duplicate_object then null; end $$;

-- =====================================================
-- 4) Realtime（可选，但强烈推荐）
-- =====================================================
-- Supabase Dashboard → Database → Replication
-- 打开 Realtime：dc_entries / dc_comments / dc_reactions / dc_chat / dc_pets / dc_bg

-- =====================================================
-- 5) RLS：此方案默认不强制（纯邀请码更简单）
-- =====================================================
-- 如果你后面希望“只有两个账号登录可见”，我可以给你写：
-- ① Auth 登录
-- ② 表的 RLS（基于 room_code + user_id）
-- ③ Storage 也按 room_code 目录隔离
