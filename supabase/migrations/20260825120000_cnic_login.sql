-- ============================================================================
-- Sign in with a CNIC instead of an email address.
--
-- Floor staff have a national identity card and no mailbox. Asking them for an
-- email invents a credential nobody can remember, so the CNIC becomes the
-- thing they type. Supabase Auth is still keyed on email underneath — a
-- synthetic address derived from the digits keeps the auth row addressable
-- without pretending the mailbox exists.
-- ============================================================================

alter table public.profiles
  add column cnic text unique
    check (cnic is null or cnic ~ '^\d{5}-\d{7}-\d$');

comment on column public.profiles.cnic is
  'National identity number, stored dashed as XXXXX-XXXXXXX-X — the form printed on the card. This is the sign-in identifier; auth.users.email holds a derived address, not a real mailbox.';

create index on public.profiles (cnic);

-- ---------------------------------------------------------------------------
-- Reset every password to the shared starting one
--
-- Requested deliberately: the workforce is being enrolled in person and each
-- person is told the same password to sign in with the first time. This runs
-- once, when the migration is applied.
--
-- It resets EVERY account, administrators included. Anyone who had set their
-- own password loses it and must be told the new one.
-- ---------------------------------------------------------------------------

update auth.users
   set encrypted_password = crypt('antrosys123', gen_salt('bf')),
       updated_at         = now();
