import { randomInt } from "node:crypto";
import { Redis } from "@upstash/redis";
import {
  applyAction,
  initialState,
  type Action,
  type ActionError,
  type Cell,
  type GameState,
  type Seat,
  type WallSlot,
} from "./quoridor";

export type LastAction =
  | { type: "move"; by: Seat; from: Cell; to: Cell }
  | { type: "wall"; by: Seat; wall: WallSlot };

// Те, що бачать клієнти: без токенів гравців.
export type PublicSession = {
  id: string;
  seats: [boolean, boolean];
  state: GameState;
  last: LastAction | null;
  round: number;
  version: number;
};

export type StoreError = ActionError | "not_found" | "not_player" | "waiting";

export type Outcome =
  | { ok: true; session: PublicSession }
  | { ok: false; error: StoreError };

type Session = {
  id: string;
  players: [string | null, string | null];
  state: GameState;
  last: LastAction | null;
  round: number;
  version: number;
};

// Сховище сесій. replace записує лише тоді, коли версія в сховищі ще дорівнює expected, —
// так два одночасні запити не затирають зміни один одного.
type Backend = {
  create(session: Session): Promise<boolean>;
  read(id: string): Promise<Session | null>;
  replace(expected: number, next: Session): Promise<boolean>;
};

// Без схожих між собою символів (0/O, 1/I/L), щоб код було легко продиктувати.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ID_LENGTH = 5;
const TTL_SECONDS = 12 * 60 * 60;
const MAX_ATTEMPTS = 5;

const keyOf = (id: string) => `corridor:game:${id}`;

const REPLACE_SCRIPT = `
local current = redis.call("GET", KEYS[1])
if not current or cjson.decode(current).version ~= tonumber(ARGV[1]) then return 0 end
redis.call("SET", KEYS[1], ARGV[2], "EX", ARGV[3])
return 1`;

function redisBackend(redis: Redis): Backend {
  return {
    async create(session) {
      const set = await redis.set(keyOf(session.id), session, { nx: true, ex: TTL_SECONDS });
      return set === "OK";
    },
    read(id) {
      return redis.get<Session>(keyOf(id));
    },
    async replace(expected, next) {
      const args = [String(expected), JSON.stringify(next), String(TTL_SECONDS)];
      return (await redis.eval(REPLACE_SCRIPT, [keyOf(next.id)], args)) === 1;
    },
  };
}

// Для локальної розробки без Redis: сесії в пам'яті процесу. globalThis переживає HMR.
function memoryBackend(): Backend {
  type Entry = { session: Session; touched: number };
  const store = globalThis as typeof globalThis & { __corridorStore?: Map<string, Entry> };
  const sessions = (store.__corridorStore ??= new Map<string, Entry>());

  return {
    async create(session) {
      const deadline = Date.now() - TTL_SECONDS * 1000;
      for (const [id, entry] of sessions) {
        if (entry.touched < deadline) sessions.delete(id);
      }
      if (sessions.has(session.id)) return false;
      sessions.set(session.id, { session, touched: Date.now() });
      return true;
    },
    async read(id) {
      return sessions.get(id)?.session ?? null;
    },
    async replace(expected, next) {
      if (sessions.get(next.id)?.session.version !== expected) return false;
      sessions.set(next.id, { session: next, touched: Date.now() });
      return true;
    },
  };
}

let chosen: Backend | undefined;

// Вибираємо сховище при першому запиті, а не під час імпорту: збірка не має залежати від змінних середовища.
function backend() {
  if (chosen) return chosen;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  if (url && token) {
    chosen = redisBackend(new Redis({ url, token }));
  } else if (process.env.VERCEL) {
    // На Vercel запити потрапляють у різні екземпляри функції, тож пам'ять процесу там не працює.
    throw new Error(
      "Не налаштовано сховище сесій: підключіть Upstash Redis до проєкту (UPSTASH_REDIS_REST_URL і UPSTASH_REDIS_REST_TOKEN).",
    );
  } else {
    chosen = memoryBackend();
  }
  return chosen;
}

const normalize = (id: string) => id.trim().toUpperCase();

function snapshot(session: Session): PublicSession {
  return {
    id: session.id,
    seats: [session.players[0] !== null, session.players[1] !== null],
    state: session.state,
    last: session.last,
    round: session.round,
    version: session.version,
  };
}

function seatOf(session: Session, token: string): Seat | null {
  if (session.players[0] === token) return 0;
  if (session.players[1] === token) return 1;
  return null;
}

function newId() {
  let id = "";
  for (let i = 0; i < ID_LENGTH; i++) id += ALPHABET[randomInt(ALPHABET.length)];
  return id;
}

// Читає сесію, застосовує step і записує результат; якщо хтось устиг змінити сесію раніше — повторює.
// step повертає нову сесію, код помилки або null, коли змінювати нічого не треба.
async function update(
  id: string,
  step: (session: Session) => Session | StoreError | null,
): Promise<Session | StoreError> {
  const store = backend();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const current = await store.read(normalize(id));
    if (!current) return "not_found";
    const next = step(current);
    if (next === null) return current;
    if (typeof next === "string") return next;
    if (await store.replace(current.version, next)) return next;
  }
  throw new Error(`Не вдалося оновити сесію ${id}: забагато одночасних змін.`);
}

const toOutcome = (result: Session | StoreError): Outcome =>
  typeof result === "string"
    ? { ok: false, error: result }
    : { ok: true, session: snapshot(result) };

export async function createSession(token: string) {
  const store = backend();
  for (;;) {
    const session: Session = {
      id: newId(),
      players: [token, null],
      state: initialState(),
      last: null,
      round: 1,
      version: 1,
    };
    if (await store.create(session)) return snapshot(session);
  }
}

export async function getSnapshot(id: string) {
  const session = await backend().read(normalize(id));
  return session && snapshot(session);
}

// Перші два відвідувачі сідають за дошку, решта — глядачі (seat: null).
export async function joinSession(id: string, token: string) {
  const result = await update(id, (session) => {
    const free = session.players.indexOf(null);
    if (seatOf(session, token) !== null || free === -1) return null;
    const players: Session["players"] = [session.players[0], session.players[1]];
    players[free] = token;
    return { ...session, players, version: session.version + 1 };
  });
  if (typeof result === "string") return null;
  return { seat: seatOf(result, token), session: snapshot(result) };
}

export async function act(id: string, token: string, action: Action) {
  const result = await update(id, (session) => {
    const seat = seatOf(session, token);
    if (seat === null) return "not_player";
    if (session.players.includes(null)) return "waiting";

    const applied = applyAction(session.state, seat, action);
    if (!applied.ok) return applied.error;

    const last: LastAction =
      action.type === "move"
        ? { type: "move", by: seat, from: session.state.pawns[seat], to: action.to }
        : { type: "wall", by: seat, wall: action.wall };
    return { ...session, state: applied.state, last, version: session.version + 1 };
  });
  return toOutcome(result);
}

// round захищає від подвійного скидання, коли обидва гравці тиснуть «ще раз» одночасно.
export async function rematch(id: string, token: string, round: number) {
  const result = await update(id, (session) => {
    if (seatOf(session, token) === null) return "not_player";
    if (session.round !== round || session.state.winner === null) return null;
    return {
      ...session,
      // Право першого ходу переходить щораунду.
      state: initialState(session.round % 2 === 0 ? 0 : 1),
      last: null,
      round: session.round + 1,
      version: session.version + 1,
    };
  });
  return toOutcome(result);
}
