export const SIZE = 9;
export const SLOTS = SIZE - 1;
export const WALLS_PER_PLAYER = 10;

export type Seat = 0 | 1;
export type Orientation = "h" | "v";
export type Cell = { r: number; c: number };
// Стіна прив'язана до перехрестя (r, c) між клітинками й накриває дві клітинки:
// "h" лежить під рядком r, "v" — праворуч від стовпця c.
export type WallSlot = { r: number; c: number; o: Orientation };
export type Wall = WallSlot & { by: Seat };

export type GameState = {
  pawns: [Cell, Cell];
  walls: Wall[];
  wallsLeft: [number, number];
  turn: Seat;
  winner: Seat | null;
};

export type Action =
  | { type: "move"; to: Cell }
  | { type: "wall"; wall: WallSlot };

export type ActionError =
  | "bad_request"
  | "finished"
  | "not_your_turn"
  | "illegal_move"
  | "no_walls"
  | "wall_overlap"
  | "wall_blocks_path";

export type ActionResult =
  | { ok: true; state: GameState }
  | { ok: false; error: ActionError };

const DIRS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

export const other = (seat: Seat): Seat => (seat === 0 ? 1 : 0);
export const goalRow = (seat: Seat) => (seat === 0 ? 0 : SIZE - 1);

export function initialState(starter: Seat = 0): GameState {
  const mid = (SIZE - 1) / 2;
  return {
    pawns: [
      { r: SIZE - 1, c: mid },
      { r: 0, c: mid },
    ],
    walls: [],
    wallsLeft: [WALLS_PER_PLAYER, WALLS_PER_PLAYER],
    turn: starter,
    winner: null,
  };
}

const inBounds = ({ r, c }: Cell) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

function hasWall(walls: readonly WallSlot[], o: Orientation, r: number, c: number) {
  return walls.some((w) => w.o === o && w.r === r && w.c === c);
}

// Чи перекрита стіною межа між двома сусідніми клітинками.
function blocked(walls: readonly WallSlot[], a: Cell, b: Cell) {
  if (a.c === b.c) {
    const r = Math.min(a.r, b.r);
    return hasWall(walls, "h", r, a.c) || hasWall(walls, "h", r, a.c - 1);
  }
  const c = Math.min(a.c, b.c);
  return hasWall(walls, "v", a.r, c) || hasWall(walls, "v", a.r - 1, c);
}

export function legalMoves(state: GameState, seat: Seat): Cell[] {
  const me = state.pawns[seat];
  const rival = state.pawns[other(seat)];
  const moves: Cell[] = [];

  for (const [dr, dc] of DIRS) {
    const next = { r: me.r + dr, c: me.c + dc };
    if (!inBounds(next) || blocked(state.walls, me, next)) continue;
    if (next.r !== rival.r || next.c !== rival.c) {
      moves.push(next);
      continue;
    }
    // Суперник поруч: перестрибуємо його, а якщо за ним стіна чи край — обходимо по діагоналі.
    const jump = { r: next.r + dr, c: next.c + dc };
    if (inBounds(jump) && !blocked(state.walls, next, jump)) {
      moves.push(jump);
      continue;
    }
    for (const [sr, sc] of DIRS) {
      if (sr === dr || sc === dc) continue;
      const side = { r: next.r + sr, c: next.c + sc };
      if (inBounds(side) && !blocked(state.walls, next, side)) moves.push(side);
    }
  }
  return moves;
}

function hasPath(walls: readonly WallSlot[], from: Cell, goal: number) {
  const seen = new Set([from.r * SIZE + from.c]);
  const queue = [from];
  for (let i = 0; i < queue.length; i++) {
    const cell = queue[i];
    if (cell.r === goal) return true;
    for (const [dr, dc] of DIRS) {
      const next = { r: cell.r + dr, c: cell.c + dc };
      const key = next.r * SIZE + next.c;
      if (!inBounds(next) || seen.has(key) || blocked(walls, cell, next)) continue;
      seen.add(key);
      queue.push(next);
    }
  }
  return false;
}

export function wallError(state: GameState, seat: Seat, slot: WallSlot): ActionError | null {
  if (state.wallsLeft[seat] <= 0) return "no_walls";

  const clash = state.walls.some((w) => {
    if (w.r === slot.r && w.c === slot.c) return true;
    if (w.o !== slot.o) return false;
    return slot.o === "h"
      ? w.r === slot.r && Math.abs(w.c - slot.c) === 1
      : w.c === slot.c && Math.abs(w.r - slot.r) === 1;
  });
  if (clash) return "wall_overlap";

  const walls = [...state.walls, slot];
  const open = ([0, 1] as const).every((s) => hasPath(walls, state.pawns[s], goalRow(s)));
  return open ? null : "wall_blocks_path";
}

export function applyAction(state: GameState, seat: Seat, action: Action): ActionResult {
  if (state.winner !== null) return { ok: false, error: "finished" };
  if (state.turn !== seat) return { ok: false, error: "not_your_turn" };

  if (action.type === "move") {
    const { r, c } = action.to;
    if (!legalMoves(state, seat).some((m) => m.r === r && m.c === c)) {
      return { ok: false, error: "illegal_move" };
    }
    const pawns: [Cell, Cell] = [state.pawns[0], state.pawns[1]];
    pawns[seat] = { r, c };
    const won = r === goalRow(seat);
    return {
      ok: true,
      state: { ...state, pawns, turn: won ? seat : other(seat), winner: won ? seat : null },
    };
  }

  const error = wallError(state, seat, action.wall);
  if (error) return { ok: false, error };
  const { r, c, o } = action.wall;
  const wallsLeft: [number, number] = [state.wallsLeft[0], state.wallsLeft[1]];
  wallsLeft[seat] -= 1;
  return {
    ok: true,
    state: { ...state, walls: [...state.walls, { r, c, o, by: seat }], wallsLeft, turn: other(seat) },
  };
}

const isIndex = (value: unknown, max: number): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= 0 && value < max;

// Розбирає дію, що прийшла з мережі; повертає null, якщо формат чи координати некоректні.
export function parseAction(input: unknown): Action | null {
  if (typeof input !== "object" || input === null) return null;
  const { type, to, wall } = input as {
    type?: unknown;
    to?: Partial<Record<keyof Cell, unknown>> | null;
    wall?: Partial<Record<keyof WallSlot, unknown>> | null;
  };

  if (type === "move" && to && isIndex(to.r, SIZE) && isIndex(to.c, SIZE)) {
    return { type, to: { r: to.r, c: to.c } };
  }
  if (
    type === "wall" &&
    wall &&
    isIndex(wall.r, SLOTS) &&
    isIndex(wall.c, SLOTS) &&
    (wall.o === "h" || wall.o === "v")
  ) {
    return { type, wall: { r: wall.r, c: wall.c, o: wall.o } };
  }
  return null;
}
