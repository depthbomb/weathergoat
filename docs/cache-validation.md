# Discord cache retention

Run `bun scripts/benchmark-discord-cache.ts` for the offline 50,000-user workload.
This exercises installed discord.js 14.27.0 on Bun 1.4.1, without logging in.

On 2026-09-04, three samples retained 50,000 users with the default cache and
1,000 with the configured cache. Incremental heap after GC was 18.07–18.15 MiB
versus 0.40–0.44 MiB (over 97% less retained heap). End-to-end insertion and GC
times varied from 56–232 ms for defaults and 128–219 ms with limits. This is a
memory bound, not a throughput optimization or production RSS prediction.

User caches retain at most 1,000 entries and member caches 200 per guild, retaining
the bot for permission checks. Message caches retain discord.js's 200-message
limit and sweep messages older than ten minutes every five minutes. Explicit
user/message fetches still recover evicted objects. Existing member and message
objects can retain user references, so total heap also depends on guild/channel
count; production profiling is still needed to quantify total memory.

The configuration follows the installed Options.cacheWithLimits implementation
and the [official cache documentation](https://discordjs.guide/legacy/miscellaneous/cache-customization).
