-- Clean up duplicate kitchens and lock it to one kitchen per user.
-- Run this ONCE in Supabase -> SQL Editor. Safe to run: it only removes
-- older duplicate kitchens, keeping the most recent one per user.

-- 1. Keep the newest kitchen per user; delete older duplicates.
--    (Deleting a kitchen also removes its listings — your extras have none.)
delete from cooks c
using cooks other
where c.profile_id = other.profile_id
  and (
    c.created_at < other.created_at
    or (c.created_at = other.created_at and c.id < other.id)
  );

-- 2. Enforce one kitchen per user from now on (blocks accidental double-submits).
alter table cooks add constraint cooks_one_per_profile unique (profile_id);
