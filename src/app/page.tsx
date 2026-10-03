import { Board } from "@/components/board";
import { Lobby } from "@/components/lobby";
import { SiteHeader } from "@/components/site-header";
import type { GameState } from "@/lib/quoridor";

// Позиція з середини партії — лише ілюстрація на головній.
const DEMO: GameState = {
  pawns: [
    { r: 5, c: 4 },
    { r: 2, c: 3 },
  ],
  walls: [
    { r: 4, c: 3, o: "h", by: 1 },
    { r: 4, c: 5, o: "h", by: 1 },
    { r: 5, c: 1, o: "v", by: 1 },
    { r: 1, c: 3, o: "h", by: 0 },
    { r: 2, c: 1, o: "v", by: 0 },
    { r: 6, c: 5, o: "v", by: 0 },
  ],
  wallsLeft: [7, 7],
  turn: 0,
  winner: null,
};

const STEPS = [
  {
    title: "Мета",
    text: "Першим довести свою фішку до протилежного краю дошки.",
  },
  {
    title: "Хід",
    text: "Крок на сусідню клітинку або одна стіна. Фішку суперника можна перестрибнути.",
  },
  {
    title: "Стіни",
    text: "У кожного по 10 стін на дві клітинки. Шлях до мети завжди має лишатися відкритим.",
  },
];

export default function Home() {
  return (
    <>
      <div className="bg-navy-950">
        <SiteHeader />
        <section className="container-page grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-16 lg:py-20">
          <div>
            <p className="eyebrow text-accent-300">Стратегічна гра для двох</p>
            <h1 className="mt-4 text-[32px] leading-[1.1] font-semibold tracking-tight text-white min-[480px]:text-[38px] sm:text-[44px]">
              Дійдіть до краю першим — або перекрийте шлях супернику
            </h1>
            <p className="mt-5 max-w-[520px] text-base leading-relaxed text-ink-300">
              Створіть сесію, надішліть посилання другу — і грайте. Без реєстрації: у кожного
              фішка, десять стін і одна мета.
            </p>
            <Lobby />
          </div>
          <div className="mx-auto w-full max-w-[400px] rounded-card border border-navy-800 p-3">
            <Board state={DEMO} perspective={0} actor={null} />
          </div>
        </section>
      </div>

      <section className="container-page py-12">
        <h2 className="text-[22px] font-semibold">Як грати</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <article
              key={step.title}
              className="rounded-card border border-ink-100 bg-white p-5 shadow-card"
            >
              <p className="eyebrow text-accent-600">Крок {index + 1}</p>
              <h3 className="mt-2 text-base font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-500">{step.text}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}
