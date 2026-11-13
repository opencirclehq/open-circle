import { Pool } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { runMigrations } from "../scripts/migrations";
import { PostgresForumStore } from "../server/forum-store";
import { commandForum, readForum } from "../server/forum";
import { admin, alice, bob, command, content, forumContract, poll } from "./helpers/forum-contract";

const url = process.env.FORUM_TEST_DATABASE_URL;
describe.skipIf(!url)("PostgreSQL forum contract", () => {
  let pool: Pool;
  let store: PostgresForumStore;
  beforeAll(async () => {
    const parsed = new URL(url!);
    if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || !parsed.pathname.startsWith("/opencircle_forum_test_")) throw new Error("Use a disposable local forum test database.");
    pool = new Pool({ connectionString: url, max: 2 });
    const client = await pool.connect();
    try { await runMigrations(client); expect((await client.query("SELECT to_regclass('opencircle_forum_votes') AS name")).rows[0].name).toBe("opencircle_forum_votes"); expect(await runMigrations(client)).toEqual([]); }
    finally { client.release(); }
    store = new PostgresForumStore(pool);
  });
  beforeEach(async () => { await pool.query("TRUNCATE opencircle_forum_threads CASCADE"); });
  afterAll(async () => { await pool?.end(); });
  forumContract(() => store);
  it("enforces vote uniqueness in PostgreSQL, persists across connections and rolls back failed transactions", async () => {
    const post = await commandForum(store, admin, command({ action: "create", kind: "discussion", content, publish: true, poll }));
    await commandForum(store, alice, command({ action: "vote", id: post.id, ballot: post.poll!.ballot, optionId: "option_1" }));
    const commented = await commandForum(store, alice, command({ action: "comment", id: post.id, body: "A persistent comment" }));
    await commandForum(store, alice, command({ action: "like", id: post.id, commentId: commented.comments[0].id, liked: true }));
    await expect(pool.query("INSERT INTO opencircle_forum_votes(thread_id,voter_id,option_id) VALUES($1,$2,$3)", [post.id, alice.profile.id, "option_2"])).rejects.toMatchObject({ code: "23505" });
    await expect(store.transact(post.id, true, (data) => { data.thread!.hidden = true; throw new Error("Abort save"); })).rejects.toThrow("Abort save");
    const another = new PostgresForumStore(pool);
    expect(await readForum(another, alice, post.id)).toMatchObject({ hidden: false, comments: [{ likeCount: 1, liked: true }], poll: { total: 1, selected: "option_1" } });
    expect(await another.readActivity()).toEqual(await store.readActivity());
  });
  it("serializes closure against votes and cannot commit a vote after closure", async () => {
    const post = await commandForum(store, admin, command({ action: "create", kind: "discussion", content, publish: true, poll }));
    const outcomes = await Promise.allSettled([
      commandForum(store, admin, command({ action: "moderate", id: post.id, version: post.version, operation: "close-poll", reason: "Poll finished" })),
      commandForum(store, alice, command({ action: "vote", id: post.id, ballot: post.poll!.ballot, optionId: "option_1" })),
      commandForum(store, bob, command({ action: "vote", id: post.id, ballot: post.poll!.ballot, optionId: "option_2" })),
    ]);
    expect(outcomes[0].status).toBe("fulfilled");
    const persisted = await readForum(store, alice, post.id);
    expect(persisted.poll?.open).toBe(false);
    expect(persisted.poll?.total).toBe(outcomes.slice(1).filter((v) => v.status === "fulfilled").length);
    await expect(commandForum(store, alice, command({ action: "vote", id: post.id, ballot: post.poll!.ballot, optionId: "option_2" }))).rejects.toMatchObject({ code: "poll_closed" });
  });
});
