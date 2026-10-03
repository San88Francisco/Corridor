"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Board } from "@/components/board";
import { SiteHeader } from "@/components/site-header";
import { getPlayerToken, postJson } from "@/lib/client";
import type { PublicSession } from "@/lib/game-store";
import {
  WALLS_PER_PLAYER,
  other,
  wallError,
  type Action,
  type ActionError,
  type Seat,
  type WallSlot,
} from "@/lib/quoridor";

const SIDE = ["Золоті", "Світлі"] as const;

const ERRORS: Record<string, string> = {
  not_found: "Сесію не знайдено.",
  not_player: "Ви спостерігаєте за цією грою.",
  waiting: "Суперник ще не приєднався.",
  finished: "Гру вже завершено.",
  not_your_turn: "Зараз хід суперника.",
  illegal_move: "Такий хід неможливий.",
  no_walls: "У вас не залишилося стін.",
  wall_overlap: "Тут уже стоїть стіна.",
  wall_blocks_path: "Стіна не може повністю перекрити шлях.",
};

// Короткі підписи для кнопки підтвердження, коли обрану стіну поставити не можна.
const WALL_BLOCKED: Partial<Record<ActionError, string>> = {
  wall_overlap: "Місце зайняте",
  wall_blocks_path: "Шлях перекрито",
};

const RULES = [
  "Мета — першим довести фішку до протилежного краю дошки.",
  "За хід: крок на сусідню клітинку або одна стіна завдовжки у дві клітинки.",
  "Стіна мишею: наведіть курсор на проміжок між клітинками й клацніть.",
  "Стіна на телефоні: торкніться проміжку, за потреби поверніть стіну й підтвердьте.",
  "Фішку суперника можна перестрибнути. Повністю перекривати шлях до мети заборонено.",
];

// Той самий об'єкт для тієї самої версії — щоб опитування без змін не перемальовувало екран.
const newer = (prev: PublicSession | null, next: PublicSession) =>
  prev && prev.version >= next.version ? prev : next;

// Як часто питати сервер про зміни. Коли хід наш, змінити гру може лише наша ж дія,
// тож опитуємо рідко; найчастіше — поки чекаємо на хід суперника.
function pollDelay(session: PublicSession, seat: Seat | null) {
  const { seats, state } = session;
  if (!seats[0] || !seats[1] || state.winner !== null) return 2000;
  return state.turn === seat ? 4000 : 1000;
}

const noSubscription = () => () => {};

function ExpandButton({ expanded, onToggle }: { expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={expanded ? "Згорнути" : "На весь екран"}
      className="-mr-1 grid size-9 place-items-center rounded-md text-ink-300 transition-colors hover:bg-navy-900 hover:text-white active:bg-navy-800"
    >
      <svg
        viewBox="0 0 16 16"
        className="size-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path
          d={
            expanded
              ? "M2.5 6H6V2.5M13.5 6H10V2.5M2.5 10H6v3.5M13.5 10H10v3.5"
              : "M6 2.5H2.5V6M10 2.5h3.5V6M6 13.5H2.5V10M10 13.5h3.5V10"
          }
        />
      </svg>
    </button>
  );
}

function PlayerStrip({
  seat,
  label,
  walls,
  active,
  action,
}: {
  seat: Seat;
  label: string;
  walls: number;
  active: boolean;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-11 items-center justify-between gap-3 px-1">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          className={`size-3.5 shrink-0 rounded-full border-2 ${
            seat === 0 ? "border-accent-300 bg-accent-500" : "border-white bg-ink-100"
          }`}
        />
        <span className="truncate text-[15px] font-semibold text-white">{label}</span>
        {/* На телефоні колір сторони видно з кружечка, а місце в рядку потрібне лічильнику й кнопці. */}
        <span className="hidden text-[13.5px] text-ink-300 sm:inline">{SIDE[seat]}</span>
        {active && (
          <span className="eyebrow rounded-md bg-accent-500/15 px-2 py-1 text-accent-300">
            Хід
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2.5">
        <span className="eyebrow hidden text-ink-300 sm:inline">Стіни</span>
        <div className="flex gap-0.75" aria-hidden>
          {Array.from({ length: WALLS_PER_PLAYER }, (_, i) => (
            <span
              key={i}
              className={`h-4 w-0.75 rounded-full ${
                i >= walls ? "bg-navy-800" : seat === 0 ? "bg-accent-500" : "bg-ink-200"
              }`}
            />
          ))}
        </div>
        <span className="w-5 text-right text-[15px] font-semibold text-white tabular-nums">
          {walls}
        </span>
        {action}
      </div>
    </div>
  );
}

// Займає місце нижньої смужки гравця, поки стіна, обрана дотиком, чекає на підтвердження.
function WallActions({
  blocked,
  onCancel,
  onRotate,
  onConfirm,
}: {
  blocked: string | null;
  onCancel: () => void;
  onRotate: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="flex h-11 items-center gap-2">
      <button
        type="button"
        onClick={onCancel}
        aria-label="Скасувати стіну"
        className="grid size-10 shrink-0 place-items-center rounded-lg border border-navy-700 text-ink-200 transition-colors hover:bg-navy-900 active:bg-navy-800"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onRotate}
        className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-navy-700 px-3.5 text-[13.5px] font-semibold text-white transition-colors hover:bg-navy-900 active:bg-navy-800"
      >
        <svg
          viewBox="0 0 16 16"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5" />
        </svg>
        Повернути
      </button>
      <button
        type="button"
        onClick={onConfirm}
        disabled={blocked !== null}
        className="h-10 min-w-0 flex-1 truncate rounded-lg bg-accent-500 px-3 text-[13.5px] font-semibold text-navy-950 transition-colors hover:bg-accent-300 active:bg-accent-300 disabled:bg-navy-800 disabled:text-ink-300"
      >
        {blocked ?? "Поставити стіну"}
      </button>
    </div>
  );
}

function Invite({ id }: { id: string }) {
  const origin = useSyncExternalStore(
    noSubscription,
    () => window.location.origin,
    () => "",
  );
  // Системне вікно «Поділитися» доречне на телефоні; на комп'ютері зручніше копіювати.
  const canShare = useSyncExternalStore(
    noSubscription,
    () => typeof navigator.share === "function" && matchMedia("(pointer: coarse)").matches,
    () => false,
  );
  const input = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);
  const link = `${origin}/g/${id}`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard API недоступний по http з локальної мережі — виділяємо текст для ручного копіювання.
      input.current?.select();
    }
  }

  async function share() {
    try {
      await navigator.share({ title: "Коридор", text: "Зіграймо в «Коридор»?", url: link });
    } catch {
      // Користувач закрив вікно — нічого не робимо.
    }
  }

  const primary = "bg-navy-900 text-white hover:bg-navy-800 active:bg-navy-800";
  const secondary = "border border-ink-200 text-ink-900 hover:bg-ink-50 active:bg-ink-100";

  return (
    <div className="mt-3 flex flex-col gap-2">
      {/* 16px на телефоні: з меншим шрифтом iOS масштабує сторінку при фокусі на полі. */}
      <input
        ref={input}
        readOnly
        value={link}
        aria-label="Посилання на гру"
        onFocus={(event) => event.currentTarget.select()}
        className="h-10 w-full min-w-0 rounded-lg border border-ink-100 bg-ink-50 px-3 text-base text-ink-700 focus:border-navy-600 focus:outline-none sm:text-[13.5px]"
      />
      <div className="flex gap-2">
        {canShare && (
          <button
            type="button"
            onClick={share}
            className={`h-10 flex-1 rounded-lg px-4 text-[13.5px] font-semibold transition-colors ${primary}`}
          >
            Поділитися
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className={`h-10 flex-1 rounded-lg px-4 text-[13.5px] font-semibold transition-colors ${
            canShare ? secondary : primary
          }`}
        >
          {copied ? "Скопійовано" : "Копіювати"}
        </button>
      </div>
    </div>
  );
}

function Rules() {
  return (
    <ul className="space-y-2.5 text-[13.5px] leading-relaxed text-ink-500">
      {RULES.map((rule) => (
        <li key={rule} className="flex gap-2.5">
          <span className="mt-1.75 size-1.5 shrink-0 rounded-full bg-accent-500" />
          {rule}
        </li>
      ))}
    </ul>
  );
}

function Message({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="container-page flex flex-1 items-center justify-center py-16">
      <div className="w-full max-w-sm rounded-card border border-ink-100 bg-white p-6 text-center shadow-card">
        <h1 className="text-[22px] font-semibold">{title}</h1>
        {children}
      </div>
    </div>
  );
}

export function GameClient({ id }: { id: string }) {
  const [phase, setPhase] = useState<"loading" | "ready" | "missing">("loading");
  const [seat, setSeat] = useState<Seat | null>(null);
  const [session, setSession] = useState<PublicSession | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<WallSlot | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setExpanded(false);
    };
    // Вихід із повноекранного режиму засобами браузера (Esc, жест «назад») теж згортає дошку.
    const onFullscreen = () => {
      if (!document.fullscreenElement) setExpanded(false);
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("fullscreenchange", onFullscreen);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("fullscreenchange", onFullscreen);
    };
  }, [expanded]);

  function toggleExpanded() {
    const next = !expanded;
    setExpanded(next);
    // Справжній повноекранний режим — лише покращення: на iPhone та у вбудованих браузерах
    // месенджерів його немає, і тоді дошка просто займає все вікно.
    if (next) document.documentElement.requestFullscreen?.()?.catch(() => {});
    else if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }

  useEffect(() => {
    let cancelled = false;

    async function join() {
      const res = await postJson(`/api/games/${id}/join`, { token: getPlayerToken() });
      if (cancelled) return;
      if (!res.ok) {
        setPhase("missing");
        return;
      }
      const joined: { seat: Seat | null; session: PublicSession } = await res.json();
      if (cancelled) return;
      setSeat(joined.seat);
      setSession((prev) => newer(prev, joined.session));
      setPhase("ready");
    }

    join().catch(() => {
      if (!cancelled) setPhase("missing");
    });

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Зміни від суперника забираємо опитуванням: воно працює і на serverless-хостингу,
  // де немає постійного з'єднання з одним процесом сервера.
  const pollMs = phase === "ready" && session ? pollDelay(session, seat) : null;

  useEffect(() => {
    if (pollMs === null) return;
    let cancelled = false;
    let wake = () => {};
    const pause = () =>
      new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, pollMs);
        wake = () => {
          clearTimeout(timer);
          resolve();
        };
      });

    async function poll() {
      while (!cancelled) {
        await pause();
        // У фоновій вкладці не опитуємо — заощаджуємо запити.
        if (cancelled || document.visibilityState !== "visible") continue;
        try {
          const res = await fetch(`/api/games/${id}`, { cache: "no-store" });
          if (cancelled) return;
          if (res.status === 404) {
            setPhase("missing");
            return;
          }
          if (res.ok) {
            const next: PublicSession = await res.json();
            if (!cancelled) setSession((prev) => newer(prev, next));
          }
        } catch {
          // Мережа зникла — спробуємо наступного разу.
        }
      }
    }

    // Повернулися на вкладку (наприклад, із месенджера) — оновлюємося одразу.
    const onVisibility = () => {
      if (document.visibilityState === "visible") wake();
    };

    poll();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      wake();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [id, pollMs]);

  async function send(path: "action" | "rematch", payload: object) {
    setBusy(true);
    setNotice(null);
    setPending(null);
    try {
      const res = await postJson(`/api/games/${id}/${path}`, {
        token: getPlayerToken(),
        ...payload,
      });
      const data: { session?: PublicSession; error?: string } = await res.json();
      if (data.session) {
        const next = data.session;
        setSession((prev) => newer(prev, next));
      } else {
        setNotice(ERRORS[data.error ?? ""] ?? "Не вдалося виконати дію.");
      }
    } catch {
      setNotice("Немає з'єднання із сервером.");
    } finally {
      setBusy(false);
    }
  }

  if (phase === "missing") {
    return (
      <>
        <SiteHeader />
        <Message title="Сесію не знайдено">
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-500">
            Перевірте код або створіть нову гру.
          </p>
          <Link
            href="/"
            className="mt-5 inline-flex h-10 items-center rounded-lg bg-navy-900 px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-navy-800"
          >
            На головну
          </Link>
        </Message>
      </>
    );
  }

  if (phase === "loading" || !session) {
    return (
      <>
        <SiteHeader />
        <Message title="Підключення до сесії…" />
      </>
    );
  }

  const { state } = session;
  const started = session.seats[0] && session.seats[1];
  const perspective = seat ?? 0;
  const playing = started && state.winner === null;
  const myTurn = seat !== null && playing && state.turn === seat;
  const actor = myTurn && !busy ? seat : null;
  const chosen = actor === null ? null : pending;
  const chosenError = chosen && actor !== null ? wallError(state, actor, chosen) : null;

  const labelOf = (s: Seat) => {
    if (!session.seats[s]) return "Очікуємо…";
    if (seat === null) return `Гравець ${s + 1}`;
    return s === seat ? "Ви" : "Суперник";
  };

  let title: string;
  let hint: string;
  let tone = "text-ink-900";
  if (!started) {
    title = "Очікуємо суперника";
    hint = "Надішліть посилання другу — гра почнеться, щойно він його відкриє.";
  } else if (state.winner !== null) {
    if (seat === null) {
      title = `Перемогли ${SIDE[state.winner].toLowerCase()}`;
      hint = "Раунд завершено.";
    } else if (state.winner === seat) {
      title = "Ви перемогли";
      hint = "Ваша фішка першою дійшла до краю.";
      tone = "text-positive";
    } else {
      title = "Суперник переміг";
      hint = "Цього разу він дійшов першим.";
      tone = "text-critical";
    }
  } else if (seat === null) {
    title = `Хід: ${SIDE[state.turn].toLowerCase()}`;
    hint = "Обидва місця зайняті — ви спостерігаєте за грою.";
  } else if (myTurn) {
    title = "Ваш хід";
    hint = "Перемістіть фішку або поставте стіну.";
  } else {
    title = "Хід суперника";
    hint = "Чекаємо на його рішення.";
  }

  const strip = (s: Seat, action?: React.ReactNode) => (
    <PlayerStrip
      seat={s}
      label={labelOf(s)}
      walls={state.wallsLeft[s]}
      active={playing && state.turn === s}
      action={action}
    />
  );
  const finished = state.winner !== null && seat !== null;
  const rematch = () => send("rematch", { round: session.round });

  return (
    <>
      <SiteHeader>
        <div className="flex items-center gap-2.5">
          <span className="eyebrow text-ink-300">Сесія</span>
          <span className="rounded-md border border-navy-700 px-2.5 py-1 text-[13.5px] font-semibold tracking-[0.14em] text-white">
            {session.id}
          </span>
        </div>
      </SiteHeader>

      <main className="mx-auto grid w-full max-w-310 flex-1 content-start items-start gap-2.5 px-2.5 py-2.5 sm:gap-6 sm:px-8 sm:py-8 lg:grid-cols-[minmax(0,672px)_340px] lg:grid-rows-[auto_1fr] lg:justify-center">
        <section className="rounded-card border border-ink-100 bg-white px-4 py-3.5 shadow-card lg:col-start-2 lg:row-start-1 lg:p-5">
          {/* На телефоні раунд стоїть праворуч від заголовка, на десктопі — над ним. */}
          <div className="flex items-baseline justify-between gap-3 lg:flex-col-reverse lg:items-start lg:gap-2">
            <h1 className={`text-lg font-semibold lg:text-[22px] ${tone}`}>{title}</h1>
            <p className="eyebrow shrink-0 text-ink-500">Раунд {session.round}</p>
          </div>
          <p className="mt-1 text-[13.5px] leading-relaxed text-ink-500 lg:mt-1.5">{hint}</p>
          {!started && <Invite id={session.id} />}
          {finished && (
            <button
              type="button"
              disabled={busy}
              onClick={rematch}
              className="mt-3 h-10 w-full rounded-lg bg-accent-500 px-4 text-[13.5px] font-semibold text-navy-950 transition-colors hover:bg-accent-300 active:bg-accent-300 disabled:opacity-60 sm:w-auto lg:mt-4"
            >
              Зіграти ще раз
            </button>
          )}
          {notice && <p className="mt-3 text-[13.5px] text-critical">{notice}</p>}
        </section>

        {/* Розгорнута дошка накриває все вікно; m-auto центрує її й не обрізає верх, коли вона вища за екран. */}
        <section
          data-board-expanded={expanded || undefined}
          className={
            expanded
              ? "fixed inset-0 z-50 flex overflow-y-auto overscroll-contain bg-navy-950 p-2.5 sm:p-4"
              : "lg:col-start-1 lg:row-span-2 lg:row-start-1"
          }
        >
          {/* Дошка вміщається у висоту вікна разом зі статусом і смужками гравців, але не стає меншою за 280px. */}
          <div
            className={
              expanded
                ? "m-auto w-full max-w-[max(240px,min(100%,calc(100dvh-9rem)))]"
                : "mx-auto w-full max-w-[max(280px,min(100%,calc(100dvh-18rem)))] rounded-card bg-navy-950 p-2.5 shadow-card sm:p-4 lg:max-w-[max(280px,min(100%,calc(100dvh-12rem)))]"
            }
          >
            {strip(
              other(perspective),
              <ExpandButton expanded={expanded} onToggle={toggleExpanded} />,
            )}
            <div className={`my-1.5 transition-opacity sm:my-2 ${started ? "" : "opacity-50"}`}>
              <Board
                state={state}
                perspective={perspective}
                actor={actor}
                last={session.last}
                pending={chosen}
                onPending={setPending}
                onAction={(action: Action) => send("action", { action })}
              />
            </div>
            {chosen ? (
              <WallActions
                blocked={chosenError ? (WALL_BLOCKED[chosenError] ?? "Недоступно") : null}
                onCancel={() => setPending(null)}
                onRotate={() => setPending({ ...chosen, o: chosen.o === "h" ? "v" : "h" })}
                onConfirm={() => send("action", { action: { type: "wall", wall: chosen } })}
              />
            ) : expanded && finished ? (
              // На весь екран картка статусу схована, тож підсумок і реванш показуємо тут.
              <div className="flex h-11 items-center justify-between gap-3 px-1">
                <span className="truncate text-[15px] font-semibold text-white">{title}</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={rematch}
                  className="h-10 shrink-0 rounded-lg bg-accent-500 px-4 text-[13.5px] font-semibold text-navy-950 transition-colors hover:bg-accent-300 active:bg-accent-300 disabled:opacity-60"
                >
                  Зіграти ще раз
                </button>
              </div>
            ) : (
              strip(perspective)
            )}
          </div>
        </section>

        <details className="group rounded-card border border-ink-100 bg-white shadow-card lg:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[15px] font-semibold [&::-webkit-details-marker]:hidden">
            Як грати
            <svg
              viewBox="0 0 16 16"
              className="size-4 text-ink-500 transition-transform group-open:rotate-180"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M4 6l4 4 4-4" />
            </svg>
          </summary>
          <div className="px-4 pb-4">
            <Rules />
          </div>
        </details>

        <section className="hidden rounded-card border border-ink-100 bg-white p-5 shadow-card lg:col-start-2 lg:row-start-2 lg:block">
          <h2 className="mb-3 text-[15px] font-semibold">Як грати</h2>
          <Rules />
        </section>
      </main>
    </>
  );
}
