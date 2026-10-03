"use client";

import { useState } from "react";
import type { LastAction } from "@/lib/game-store";
import {
  SIZE,
  SLOTS,
  legalMoves,
  wallError,
  type Action,
  type Cell,
  type GameState,
  type Seat,
  type WallSlot,
} from "@/lib/quoridor";

// Геометрія в одиницях viewBox: клітинка, паз між клітинками, крок сітки.
const CELL = 10;
const GAP = 2.6;
const UNIT = CELL + GAP;
const PAD = 1;
const VIEW = SIZE * CELL + SLOTS * GAP + PAD * 2;
const WALL_THICKNESS = 1.6;
const WALL_LENGTH = CELL * 2 + GAP;
// Наскільки далеко від осі паза курсор миші ще «чіпляє» стіну, а не клітинку.
const MOUSE_WALL_REACH = GAP / 2 + CELL * 0.2;
// Центральна зона клітинки, дотик у яку вважається ходом фішки. Вона навмисно вузька:
// промах дає лише попередній показ стіни, а не випадковий хід.
const TOUCH_CELL_REACH = CELL * 0.36;

const TONE = [
  {
    pawn: "fill-accent-500 stroke-accent-300",
    wall: "fill-accent-500",
    goal: "fill-accent-500/15 stroke-accent-500/35",
    target: "fill-accent-500/25 stroke-accent-500",
    line: "stroke-accent-300",
  },
  {
    pawn: "fill-ink-100 stroke-white",
    wall: "fill-ink-200",
    goal: "fill-ink-200/10 stroke-ink-200/30",
    target: "fill-ink-200/20 stroke-ink-200",
    line: "stroke-ink-200",
  },
] as const;

type Hover = { kind: "cell"; cell: Cell } | { kind: "wall"; slot: WallSlot } | null;

const keyOf = (hover: Hover) =>
  hover === null
    ? ""
    : hover.kind === "cell"
      ? `c${hover.cell.r}:${hover.cell.c}`
      : `${hover.slot.o}${hover.slot.r}:${hover.slot.c}`;

const sameSlot = (a: WallSlot, b: WallSlot) => a.o === b.o && a.r === b.r && a.c === b.c;

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

// Найближчий паз уздовж однієї осі та відстань до його середини.
function nearestGroove(v: number) {
  const index = clamp(Math.round((v - CELL - GAP / 2) / UNIT), SLOTS - 1);
  return { index, dist: Math.abs(v - (index * UNIT + CELL + GAP / 2)) };
}

// Ближчий паз задає орієнтацію стіни, інша координата — її центр.
function slotAt(x: number, y: number, reach: number): WallSlot | null {
  const gx = nearestGroove(x);
  const gy = nearestGroove(y);
  if (Math.min(gx.dist, gy.dist) > reach) return null;
  return { o: gx.dist < gy.dist ? "v" : "h", r: gy.index, c: gx.index };
}

function cellAt(x: number, y: number, reach: number): Cell | null {
  const r = Math.floor(y / UNIT);
  const c = Math.floor(x / UNIT);
  if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return null;
  const dx = Math.abs(x - (c * UNIT + CELL / 2));
  const dy = Math.abs(y - (r * UNIT + CELL / 2));
  return Math.max(dx, dy) <= reach ? { r, c } : null;
}

function WallRect({ slot, className }: { slot: WallSlot; className: string }) {
  const horizontal = slot.o === "h";
  const inset = CELL + (GAP - WALL_THICKNESS) / 2;
  return (
    <rect
      x={PAD + slot.c * UNIT + (horizontal ? 0 : inset)}
      y={PAD + slot.r * UNIT + (horizontal ? inset : 0)}
      width={horizontal ? WALL_LENGTH : WALL_THICKNESS}
      height={horizontal ? WALL_THICKNESS : WALL_LENGTH}
      rx={WALL_THICKNESS / 2}
      className={className}
    />
  );
}

type BoardProps = {
  state: GameState;
  // Чий бік дошки внизу екрана.
  perspective: Seat;
  // Гравець, який може зараз ходити з цього пристрою; null — дошка лише для перегляду.
  actor: Seat | null;
  last?: LastAction | null;
  // Стіна, яку гравець обрав дотиком, але ще не підтвердив.
  pending?: WallSlot | null;
  onPending?: (slot: WallSlot | null) => void;
  onAction?: (action: Action) => void;
};

export function Board({
  state,
  perspective,
  actor,
  last = null,
  pending = null,
  onPending,
  onAction,
}: BoardProps) {
  // hover — лише для миші; на дотик попередній показ стіни живе в pending.
  const [hover, setHover] = useState<Hover>(null);

  // Другий гравець бачить дошку розвернутою на 180°; поворот обернений сам до себе.
  const flipped = perspective === 1;
  const viewCell = (cell: Cell): Cell =>
    flipped ? { r: SIZE - 1 - cell.r, c: SIZE - 1 - cell.c } : cell;
  const viewSlot = (slot: WallSlot): WallSlot =>
    flipped ? { ...slot, r: SLOTS - 1 - slot.r, c: SLOTS - 1 - slot.c } : slot;
  const center = (cell: Cell) => {
    const view = viewCell(cell);
    return { x: PAD + view.c * UNIT + CELL / 2, y: PAD + view.r * UNIT + CELL / 2 };
  };

  const moves = actor === null ? [] : legalMoves(state, actor);
  const active = actor === null ? null : hover;
  const preview =
    actor === null ? null : (pending ?? (active?.kind === "wall" ? active.slot : null));

  // Що під вказівником: слот для стіни чи клітинка, куди можна піти.
  function pick(event: React.PointerEvent<SVGSVGElement>): Hover {
    if (actor === null) return null;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * VIEW - PAD;
    const y = ((event.clientY - rect.top) / rect.height) * VIEW - PAD;
    const mouse = event.pointerType === "mouse";

    // viewCell/viewSlot переводять і з екранних координат у модель — поворот симетричний.
    const seen = cellAt(x, y, mouse ? CELL / 2 : TOUCH_CELL_REACH);
    const cell = seen && viewCell(seen);
    const step = cell && moves.some((m) => m.r === cell.r && m.c === cell.c) ? cell : null;
    const groove =
      state.wallsLeft[actor] > 0 ? slotAt(x, y, mouse ? MOUSE_WALL_REACH : Infinity) : null;
    const slot = groove && viewSlot(groove);

    // Мишею біля паза ставимо стіну; на дотик пріоритет має хід у центр клітинки.
    if (mouse && slot) return { kind: "wall", slot };
    if (step) return { kind: "cell", cell: step };
    return slot ? { kind: "wall", slot } : null;
  }

  const update = (next: Hover) =>
    setHover((prev) => (keyOf(prev) === keyOf(next) ? prev : next));

  function handleUp(event: React.PointerEvent<SVGSVGElement>) {
    if (actor === null || !onAction || event.button !== 0) return;
    const next = pick(event);
    update(null);
    if (next?.kind === "cell") {
      onAction({ type: "move", to: next.cell });
      onPending?.(null);
      return;
    }
    if (next?.kind !== "wall") {
      onPending?.(null);
      return;
    }
    // Мишею стіну видно ще до кліку, тож клік одразу ставить її. На дотик перший тап
    // лише показує стіну, а ставить повторний тап по ній або кнопка підтвердження.
    const confirmed =
      event.pointerType === "mouse" || (pending !== null && sameSlot(pending, next.slot));
    if (!confirmed) {
      onPending?.(next.slot);
    } else if (wallError(state, actor, next.slot) === null) {
      onAction({ type: "wall", wall: next.slot });
      onPending?.(null);
    }
  }

  const previewValid =
    preview !== null && actor !== null && wallError(state, actor, preview) === null;
  const clickable = active?.kind === "cell" || previewValid;

  return (
    <svg
      viewBox={`0 0 ${VIEW} ${VIEW}`}
      role="img"
      aria-label="Ігрова дошка"
      className={`block w-full touch-manipulation select-none [-webkit-touch-callout:none] ${clickable ? "cursor-pointer" : ""}`}
      onPointerMove={(event) => {
        if (event.pointerType === "mouse") update(pick(event));
      }}
      onPointerLeave={(event) => {
        if (event.pointerType === "mouse") update(null);
      }}
      onPointerUp={handleUp}
    >
      {Array.from({ length: SIZE * SIZE }, (_, i) => {
        const r = Math.floor(i / SIZE);
        const c = i % SIZE;
        // Верхній ряд на екрані — мета того, хто дивиться; нижній — мета суперника.
        const tone =
          r === 0
            ? TONE[perspective].goal
            : r === SIZE - 1
              ? TONE[flipped ? 0 : 1].goal
              : "fill-navy-900 stroke-navy-800";
        return (
          <rect
            key={i}
            x={PAD + c * UNIT}
            y={PAD + r * UNIT}
            width={CELL}
            height={CELL}
            rx={1.3}
            strokeWidth={0.25}
            className={tone}
          />
        );
      })}

      {last?.type === "move" && (
        <circle
          cx={center(last.from).x}
          cy={center(last.from).y}
          r={2.4}
          strokeWidth={0.4}
          strokeDasharray="1.1 1.1"
          className={`fill-none opacity-60 ${TONE[last.by].line}`}
        />
      )}

      {actor !== null &&
        moves.map((move) => {
          const { x, y } = center(move);
          const hovered =
            active?.kind === "cell" && active.cell.r === move.r && active.cell.c === move.c;
          return (
            <g key={`${move.r}:${move.c}`}>
              {hovered && (
                <rect
                  x={x - CELL / 2}
                  y={y - CELL / 2}
                  width={CELL}
                  height={CELL}
                  rx={1.3}
                  strokeWidth={0.4}
                  className={TONE[actor].target}
                />
              )}
              <circle cx={x} cy={y} r={1.4} className={`${TONE[actor].wall} opacity-60`} />
            </g>
          );
        })}

      {state.walls.map((wall) => {
        const fresh =
          last?.type === "wall" &&
          last.wall.o === wall.o &&
          last.wall.r === wall.r &&
          last.wall.c === wall.c;
        return (
          <WallRect
            key={`${wall.o}${wall.r}:${wall.c}`}
            slot={viewSlot(wall)}
            className={`${TONE[wall.by].wall} ${fresh ? "stroke-white/80 stroke-[0.35]" : ""}`}
          />
        );
      })}

      {preview !== null && actor !== null && (
        <WallRect
          slot={viewSlot(preview)}
          className={
            previewValid
              ? `${TONE[actor].wall} ${pending ? "animate-pulse" : "opacity-60"}`
              : "fill-critical opacity-90"
          }
        />
      )}

      {state.pawns.map((pawn, index) => {
        const seat = index as Seat;
        const { x, y } = center(pawn);
        const toMove = state.winner === null && state.turn === seat;
        return (
          <g
            key={seat}
            style={{ transform: `translate(${x}px, ${y}px)` }}
            className="transition-transform duration-300 ease-out"
          >
            {(toMove || state.winner === seat) && (
              <circle
                r={CELL * 0.45}
                strokeWidth={0.4}
                className={`fill-none ${TONE[seat].line} ${toMove ? "animate-pulse" : ""}`}
              />
            )}
            <circle r={CELL * 0.32} strokeWidth={0.7} className={TONE[seat].pawn} />
          </g>
        );
      })}
    </svg>
  );
}
