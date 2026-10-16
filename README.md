This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Supabase Auth

The application uses Supabase Auth for passwords, sessions and password reset emails. Do not store passwords in application tables.

Configure Supabase Authentication redirect URLs:

- `http://localhost:3000/nastavit-heslo`
- `http://localhost:3001/nastavit-heslo`
- `https://znojemsky-sipkarsky-spolek.vercel.app/nastavit-heslo`
- `https://YOUR_DOMAIN/nastavit-heslo`

Admin invitations and password reset links build the redirect URL dynamically from the current request host, so the same code works on localhost, Vercel and a future custom domain. The domain still has to be allowed in Supabase Authentication redirect URLs.

For Czech invitation emails, copy `supabase/auth_invite_user_email_template.html` into Supabase Dashboard:

- Authentication
- Email Templates
- Invite user

Use a Czech subject such as `Pozvánka do Znojemského šipkařského spolku`. The template uses `{{ .ConfirmationURL }}`, which opens the Supabase verification link and then redirects the user to `/nastavit-heslo`, where they create their own password. The login name is the user's email address.

Run these SQL files in Supabase SQL Editor when deploying the related modules:

- `supabase/apply_user_profiles_in_dashboard.sql`
- `supabase/apply_gallery_in_dashboard.sql`
- `supabase/apply_discussions_in_dashboard.sql`
- `supabase/migrations/20261016090000_team_match_venues.sql` (multiple team venues and per-match venue selection)
- `supabase/migrations/20261016210000_confirmed_numeric_match_cells.sql` (atomic per-field saves and conflict protection; requires `20261013090000_atomic_match_summary_rpc.sql`)

For the numeric match-sheet fix, apply the new migration **before deploying the application**, then ask users with an already open sheet to reload it. The migration is additive and does not change historical results. Old browser clients will receive a request to reload instead of silently saving numeric edits. A deployment without the migration will reject numeric saves; the API deliberately has no unsafe fallback.

Legs and achievements save automatically when leaving an edited field; Enter also saves. There are no per-field confirmation buttons. Focus, unchanged values, incoming realtime data and page exit do not trigger writes. An empty field restores the stored value on blur; writing zero requires explicitly entering 0. Escape cancels the edit. Conflicts retain the draft and show the current stored value. A fresh direct edit after a conflict starts from that current value; the conflicting draft is never retried automatically. Failed saves offer an explicit retry with the same request ID. Only submitted leg fields change; the other side is never inferred.

Run `npm run test:match-sheet` for regression and in-memory PostgreSQL RPC tests, and `npm run test:e2e:match-fields` for browser tests with mocked API data (local server only, no writes to Supabase). The PostgreSQL tests exercise actual migrations but do not simulate multiple database connections contending for locks. The authenticated staging concurrency test also exercises saving with Enter; do not run its production variant against ongoing matches.

Create the first administrator manually in `public.user_profiles` after inviting or creating the Supabase Auth user. Further users can be managed from `/admin/users`.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
