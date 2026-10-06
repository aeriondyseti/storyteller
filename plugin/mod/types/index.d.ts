// The storyteller mod's contract: the values it keeps in $.state, and the
// snapshot plugin/scene.ts prints for the stage to draw from. Plain JSON
// throughout (null, never undefined), because it crosses a process boundary
// and the host's state store.

export type StageCharacter = { stem: string; name: string };

export type StagePresent = StageCharacter & {
  // Absolute path of a PNG portrait under the story's assets/, when there is one.
  portrait: string | null;
  // The card's tags, drawn dim beside the name; empty when it has none.
  tags: string[];
};

// One widget as the pane draws it (spec 19), mirroring PlainWidget in
// src/widgets.ts, which the mod cannot import: the name inside, null for an
// unset field. `color` is a hex the server validated; `pane` names a pane of
// its own (null: the scene pane); `group` draws a dim heading.
export type StageWidget = {
  name: string;
  note: string | null;
  color: string | null;
  pane: string | null;
  group: string | null;
} & (
  | { type: "text"; value: string }
  | { type: "counter"; value: number }
  | { type: "meter"; value: number; max: number }
  | { type: "clock"; value: number; of: number }
  | { type: "list"; value: string[] }
  | { type: "tags"; value: string[] }
);

export type StageScene = {
  number: number;
  title: string;
  location: string | null;
  time: string | null;
  mood: string | null;
  // The scene's "## Now" section, kept current by the notes job.
  now: string | null;
  // scene.md, watched for the notes job's writes.
  path: string;
  // On stage, the player's own character left out.
  present: StagePresent[];
  // In the scene file's order, which is draw order.
  widgets: StageWidget[];
};

export type StageSnapshot = {
  storyteller: string;
  persona: string | null;
  scene: StageScene | null;
  // Characters a quoted line in a reply may belong to.
  speakers: StageCharacter[];
};

// The codex pane (spec 20.13): what plugin/codex.ts prints, mirroring
// CodexSnapshot in src/codex.ts. Known entries only; `secret` only once the
// Secret is revealed. Ids are `lore/<stem>` or `character/<stem>`.

export type CodexEntry = {
  id: string;
  title: string;
  keys: string[];
  label: "" | "Rumour";
  text: string;
  secret?: string;
  history: string[];
};

export type CodexSnapshot = {
  books: { name: string; entries: CodexEntry[] }[];
  characters: { id: string; name: string; tags: string[]; appearance: string }[];
  // The glossary: every linkable name and the id it opens.
  names: { name: string; id: string }[];
};

// The directives pane (spec 12): what plugin/directives.ts prints and takes.

export type DirectiveMode = "always" | "keyed" | "manual";

export type DirectiveRow = {
  stem: string;
  title: string;
  mode: DirectiveMode;
  keys: string[];
  on: boolean;
  // The instruction itself.
  body: string;
  // "library" when the story uses the library's file and has none of its own.
  source: "story" | "library";
  // The file in force: the story's own, or the library's.
  path: string;
};

export type DirectiveList = {
  // The story folder.
  dir: string;
  directives: DirectiveRow[];
};

// One change, sent as JSON on the script's stdin. `update` changes only the
// fields it names; an empty `keys` removes them.
export type DirectiveWrite =
  | { op: "toggle"; stem: string; on: boolean }
  | {
      op: "update";
      stem: string;
      title?: string;
      mode?: DirectiveMode;
      keys?: string[];
      body?: string;
    }
  | {
      op: "create";
      title: string;
      mode: DirectiveMode;
      keys: string[];
      on: boolean;
      body: string;
    }
  | { op: "delete"; stem: string };

// What a write or an open answers: a one-line confirmation or an error, and
// after a write the list as it now stands.
export type DirectiveReply = {
  message: string | null;
  error: string | null;
  list: DirectiveList | null;
};

// The inline editor's working copy. `stem` is null for a new directive;
// `keys` is the comma list as typed.
export type DirectiveDraft = {
  stem: string | null;
  title: string;
  keys: string;
  mode: DirectiveMode;
  body: string;
  on: boolean;
  source: "story" | "library";
  path: string | null;
};

export type DirectivesPane = {
  // The row being edited, or a new directive; null while only listing.
  draft: DirectiveDraft | null;
  // The stem whose delete waits for "yes".
  confirm: string | null;
  // The one dim line under the list: the last confirmation or error.
  notice: { text: string; isError: boolean } | null;
};

declare module "claude-code" {
  interface PluginState {
    storyteller: {
      // The story as last read from disk; null until the first read, or
      // outside a story.
      stage: StageSnapshot | null;
      // True once the player asked for the pane (/scene): it may then sit
      // inline above the prompt; opened unasked it only docks as a sidebar.
      paneAsked: boolean;
      // Display name of the character whose card was read this turn; the
      // spinner says they are thinking.
      voicing: string | null;
      // The story's directives as last read; null until /directives first
      // reads them, or outside a story.
      directives: DirectiveList | null;
      // The directives pane's own state: editor, delete confirm, notice.
      directivesPane: DirectivesPane;
      // Ids of widget panes the person closed by hand: not reopened while
      // their widgets stay, so a closed pane stays closed.
      closedPanes: string[];
    };
  }
}
