import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import path from "node:path";
import * as sqliteVec from "sqlite-vec";
import type { Turn } from "../../src/log.ts";
import type { Scene, Story } from "../../src/story.ts";
import type { Embedder } from "./embedder.ts";
import {
  notesPassages,
  type Passage,
  type PassageKind,
  passageKinds,
  scenePassagesAll,
  scopeAll,
  scopeNotes,
  scopeScene,
  scopeTurn,
  storyPassages,
  summaryPassages,
  turnPassages,
} from "./passages.ts";

// The story's semantic index (spec 5.2, 7.3): <story>/.rp/index.sqlite.
//
//   passages      one row per passage: key, kind, ref, scene, turn, text,
//                 source path, and a hash of the text
//   passages_vec  a sqlite-vec vec0 table, rowid = passages.id, cosine
//                 distance, with kind as a metadata column for filtering
//   meta          the embedding model the vectors came from
//
// Every update is idempotent: a passage whose text hash is unchanged is never
// re-embedded, so indexStory on an up-to-date index costs a file read and a
// query, which is why callers can run it before every search. A different
// model in meta drops everything and starts again.

export type Hit = Passage & { score: number };

export type SearchOptions = { kinds?: readonly PassageKind[]; limit?: number };

export type SyncResult = { embedded: number; removed: number; kept: number };

export function indexPath(storyDir: string): string {
  return `${storyDir}/.rp/index.sqlite`;
}

export async function indexExists(storyDir: string): Promise<boolean> {
  return Bun.file(indexPath(storyDir)).exists();
}

type Row = {
  id: number;
  key: string;
  kind: PassageKind;
  ref: string | null;
  scene: number | null;
  turn: number | null;
  text: string;
  path: string;
  hash: string;
};

export class StoryIndex {
  private constructor(
    private readonly db: Database,
    private readonly embedder: Embedder,
  ) {}

  // Opens (creating if needed) the index for a story folder.
  static open(storyDir: string, embedder: Embedder): StoryIndex {
    const file = indexPath(storyDir);
    mkdirSync(path.dirname(file), { recursive: true });
    const db = new Database(file, { create: true });
    sqliteVec.load(db);
    // The server, the prompt hook and the notes job's reindex can all touch it.
    db.run("PRAGMA journal_mode = WAL");
    db.run("PRAGMA busy_timeout = 5000");
    const index = new StoryIndex(db, embedder);
    index.migrate();
    return index;
  }

  close(): void {
    this.db.close();
  }

  count(): number {
    return (this.db.query("select count(*) as n from passages").get() as { n: number }).n;
  }

  async indexStory(story: Story): Promise<SyncResult> {
    return this.sync(await storyPassages(story), scopeAll);
  }

  async indexScene(scene: Scene): Promise<SyncResult> {
    return this.sync(await scenePassagesAll(scene), scopeScene(scene.number));
  }

  // `exchange` is both halves of one turn number.
  async indexTurn(scene: Scene, exchange: Turn[]): Promise<SyncResult> {
    const n = exchange[0]?.n;
    if (n === undefined) return { embedded: 0, removed: 0, kept: 0 };
    return this.sync(turnPassages(scene, exchange), scopeTurn(scene.number, n));
  }

  async indexNotes(scene: Scene): Promise<SyncResult> {
    return this.sync(
      [...notesPassages(scene), ...summaryPassages(scene)],
      scopeNotes(scene.number),
    );
  }

  // Upserts `passages` and deletes rows under `scope` (key prefixes) that the
  // new set does not contain.
  async sync(passages: Passage[], scope: readonly string[]): Promise<SyncResult> {
    const existing = new Map<string, Row>();
    for (const row of this.db.query("select * from passages").all() as Row[]) {
      if (scope.some((p) => row.key.startsWith(p))) existing.set(row.key, row);
    }
    const wanted = new Map(passages.map((p) => [p.key, p]));
    const changed = passages.filter((p) => existing.get(p.key)?.hash !== hashOf(p.text));
    const gone = [...existing.values()].filter((r) => !wanted.has(r.key));
    const vectors = await this.embedder.embed(changed.map((p) => p.text));

    const remove = this.db.query("delete from passages where id = ?");
    const removeVec = this.db.query("delete from passages_vec where rowid = ?");
    const insert = this.db.query(
      "insert into passages (key, kind, ref, scene, turn, text, path, hash) values (?, ?, ?, ?, ?, ?, ?, ?)",
    );
    const insertVec = this.db.query(
      "insert into passages_vec (rowid, embedding, kind) values (?, ?, ?)",
    );
    this.db.transaction(() => {
      const drop = (id: number) => {
        removeVec.run(id);
        remove.run(id);
      };
      for (const row of gone) drop(row.id);
      changed.forEach((p, i) => {
        const old = existing.get(p.key);
        if (old) drop(old.id);
        const { lastInsertRowid } = insert.run(
          p.key,
          p.kind,
          p.ref ?? null,
          p.scene ?? null,
          p.turn ?? null,
          p.text,
          p.path,
          hashOf(p.text),
        );
        insertVec.run(BigInt(lastInsertRowid), vectors[i] ?? new Float32Array(), p.kind);
      });
    })();
    return {
      embedded: changed.length,
      removed: gone.length,
      kept: passages.length - changed.length,
    };
  }

  // Best passages for each query text, merged by best score. Each kind is
  // queried on its own so a common kind (turns) cannot crowd out a rare one.
  async search(query: string | string[], options: SearchOptions = {}): Promise<Hit[]> {
    const queries = (Array.isArray(query) ? query : [query]).map((q) => q.trim()).filter(Boolean);
    if (queries.length === 0) return [];
    const limit = options.limit ?? 8;
    const kinds = options.kinds ?? passageKinds;
    const vectors = await this.embedder.embed(queries);
    const knn = this.db.query(
      "select rowid, distance from passages_vec where embedding match ? and k = ? and kind = ?",
    );
    const byId = this.db.query("select * from passages where id = ?");
    const best = new Map<number, number>();
    for (const vector of vectors) {
      for (const kind of kinds) {
        for (const r of knn.all(vector, limit, kind) as { rowid: number; distance: number }[]) {
          const score = 1 - r.distance;
          if (score > (best.get(r.rowid) ?? Number.NEGATIVE_INFINITY)) best.set(r.rowid, score);
        }
      }
    }
    return [...best.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .flatMap(([id, score]) => {
        const row = byId.get(id) as Row | null;
        return row ? [{ ...toPassage(row), score }] : [];
      });
  }

  private migrate(): void {
    const { model, dims } = this.embedder;
    this.db.run("create table if not exists meta (key text primary key, value text not null)");
    const stored = this.db.query("select value from meta where key = 'model'").get() as {
      value: string;
    } | null;
    if (stored && stored.value !== `${model}:${dims}`) {
      this.db.run("drop table if exists passages");
      this.db.run("drop table if exists passages_vec");
    }
    this.db.run(
      `create table if not exists passages (
        id integer primary key,
        key text not null unique,
        kind text not null,
        ref text,
        scene integer,
        turn integer,
        text text not null,
        path text not null,
        hash text not null
      )`,
    );
    this.db.run(
      `create virtual table if not exists passages_vec using vec0(
        embedding float[${dims}] distance_metric=cosine,
        kind text
      )`,
    );
    this.db
      .query("insert or replace into meta (key, value) values ('model', ?)")
      .run(`${model}:${dims}`);
  }
}

function toPassage(row: Row): Passage {
  return {
    key: row.key,
    kind: row.kind,
    ref: row.ref ?? undefined,
    scene: row.scene ?? undefined,
    turn: row.turn ?? undefined,
    text: row.text,
    path: row.path,
  };
}

function hashOf(text: string): string {
  return Bun.hash(text).toString(16);
}
