import { sql } from "@vercel/postgres";

async function main() {
  await sql`
    create table if not exists social_signals (
      id bigserial primary key,
      created_at timestamptz not null default now(),

      cast_hash text not null unique,
      cast_timestamp timestamptz,
      warpcast_url text,

      text text,
      author_fid int,
      author_username text,
      author_display_name text,
      author_pfp_url text,
      author_score double precision,

      tickers text[] not null default '{}',
      contracts text[] not null default '{}',

      raw jsonb
    );
  `;

  await sql`create index if not exists social_signals_created_at_idx on social_signals(created_at desc);`;
  await sql`create index if not exists social_signals_cast_timestamp_idx on social_signals(cast_timestamp desc);`;

  console.log("✅ social_signals table is ready");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
