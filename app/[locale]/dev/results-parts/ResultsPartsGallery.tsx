import type { ReactNode } from "react";
import { CountedList } from "@/components/results/CountedList";
import { FlavorCompare, type CompareCoffee } from "@/components/results/FlavorCompare";
import { FlavorWheel, WheelCaption } from "@/components/results/FlavorWheel";
import type { CardsStrings } from "@/components/results/cardsStrings";
import type { OverviewStrings } from "@/components/results/overviewStrings";
import type { ResultsPartsStrings } from "@/components/results/partsStrings";
import { RankStrip } from "@/components/results/RankStrip";
import { wheelCaptionText } from "@/components/results/wheelCaption";
import { CountBar } from "@/components/ui/CountBar";
import { DotPlot } from "@/components/ui/DotPlot";
import { ScoreWithContext } from "@/components/ui/ScoreWithContext";
import { fillPattern } from "@/lib/fillPattern";
import {
  SCORE_FIXTURES,
  intensityFixture,
  qualityFixture,
  rankFixtures,
  type FixtureLocale,
} from "@/lib/dev/resultsPartsFixtures";
import {
  BLACKBERRY,
  HONEY,
  WHEEL_FIXTURES,
  wheelFamilyLabels,
  wheelNodeLabels,
  type WheelFixtureName,
} from "@/lib/dev/wheelFixtures";
import { countedDescriptors, countedFamilies } from "@/lib/flavorWheel";
import { wheelHeadline } from "@/lib/flavorWheelLayout";
import { INTENSITY_SCALE, QUALITY_SCALE, countBar } from "@/lib/resultsScales";
import { OVERVIEW_SCENARIOS } from "@/lib/dev/overviewFixtures";
import css from "./gallery.module.css";
import { OverviewFixture } from "./OverviewFixture";

// The board's own words (a dev page: they are not product copy and are not in
// the messages). The parts' words come from `results.parts`, through `strings`.
const COPY = {
  es: {
    dev: "Página de desarrollo. Datos inventados; no lee la base de datos ni necesita una cuenta.",
    title: "Partes de resultados",
    overview: "El resumen de una cata",
    overviewNote: "La parte de arriba de la página de resultados, con catas inventadas: los estados que ninguna cuenta de prueba puede mostrar (un participante ante una cata cerrada, dos catadores, una referencia libre).",
    lead: "Cada parte de la nueva página de resultados, dibujada con datos inventados. Lo que aquí se ve es lo que las pantallas usarán; todavía no está en ninguna.",
    score: "El puntaje con su contexto",
    scoreNote: "El número es tinta. Lo que se dice a su lado depende de cuántos catadores entran: con dos no hay dispersión ni diferencia.",
    cuppers: (n: number) => `${n} ${n === 1 ? "catador incluido" : "catadores incluidos"}`,
    solo: "Cata individual",
    noScore: "Sin puntaje",
    rank: "El ranking",
    rankNote: "Una fila por café en una escala fija. El punto es el grupo, el anillo eres tú, el bigote es la dispersión, la línea de trazos es la referencia y una barra une a los vecinos sin diferencia clara.",
    rankPanel: "Siete de ocho catadores",
    rankPanelNote: "Tres vecinos sin diferencia clara, una referencia fija y un café por debajo de la escala.",
    rankTwo: "Dos catadores",
    rankTwoNote: "Sin dispersión y sin diferencia.",
    rankSolo: "Cata individual",
    rankSoloNote: "Solo tu anillo.",
    dots: "Tú y el grupo, atributo por atributo",
    dotsNote: "Una escala fija por medida: la calidad de 1 a 9 y las intensidades de 0 a 15.",
    quality: "Calidad, de 1 a 9",
    qualityNote: "Dulzor no tiene valor del grupo.",
    intensity: "Intensidades, de 0 a 15",
    intensityNote: "La primera fila está en el mínimo y la última en el máximo.",
    mineOnly: "Solo tus valores",
    mineOnlyNote: "Cuando el valor del grupo no se puede mostrar.",
    wheel: "La rueda contada",
    wheelNote: "Cada familia tiene su sector en un tono pálido (el sector entero es «todos») y, encima, un pétalo tan largo como las personas que la encontraron. Dentro no hay anillos: el número va junto al anillo exterior, el total de catadores debajo y la lista repite cada cifra.",
    families: "Familias",
    descriptors: "Descriptores",
    panel: (n: number) => `Panel de ${n}`,
    leader: "Un sabor claro",
    little: "Un panel que coincidió poco",
    two: "Dos familias al frente",
    unanimous: "Una familia unánime",
    twelve: "Con doce: cuentas de dos cifras",
    nobody: "Nadie eligió un sabor",
    empty: "Nadie lo cató",
    minis: "La fila de ruedas pequeñas",
    minisNote: "La misma rueda sin palabras: los nueve sectores pálidos, los pétalos y el anillo exterior. Su letra y lo más encontrado van escritos debajo.",
    compare: "La comparación",
    compareNote: "Sin números en el dibujo: la tabla de abajo es la lectura exacta. Cada café lleva su letra sobre su propio borde y un estilo de línea distinto.",
    aloneTwo: "Dos cafés, solos",
    aloneThree: "Tres cafés, solos",
    overOne: "Sobre los pétalos de un café: otro café",
    overTwo: "Sobre los pétalos: otros dos (paneles de 7, 6 y 4)",
    hard: "Caso difícil: tres paneles planos o pequeños",
    mixed: "Paneles de 7 y 12 en una misma escala de personas",
    choice: "Una decisión abierta: el fondo de la comparación",
    choiceNote: "La rueda de un café ya no lleva anillos por dentro porque cada pétalo tiene su número al lado. La comparación no imprime números en el dibujo, así que hay dos caminos. Está construida la A.",
    choiceRings: "A · con un anillo por persona (recomendada)",
    choiceRingsNote: "El borde de cada territorio corre sobre el anillo de su cuenta: el anillo es la única escala del dibujo.",
    choiceFamilies: "B · como la rueda: sectores pálidos, sin anillos",
    choiceFamiliesNote: "Igual que la rueda de un café. La altura de un territorio solo se lee en la tabla.",
    compareRest: "Los demás casos, con el fondo A",
    narrow: "En una columna de 288 px",
    narrowNote: "El ancho del contenido en un teléfono de 320 px. El texto pinta al mismo tamaño; lo que se achica es la rueda.",
    bar: "Una barra contada, sola",
  },
  en: {
    dev: "Development page. Invented data; it reads no database and needs no account.",
    title: "Results parts",
    overview: "The overview of a cupping",
    overviewNote: "The top of the results page, with invented cuppings: the states no test account can show (a participant looking at a closed cupping, two cuppers, a free reference).",
    lead: "Every part of the new results page, drawn from invented data. What is seen here is what the screens will use; it is in none of them yet.",
    score: "The score with its context",
    scoreNote: "The number is ink. What is said beside it depends on how many cuppers count: with two there is no spread and no difference.",
    cuppers: (n: number) => `${n} ${n === 1 ? "cupper included" : "cuppers included"}`,
    solo: "Solo cupping",
    noScore: "No score",
    rank: "The ranking",
    rankNote: "One row per coffee on a fixed scale. The dot is the group, the ring is you, the whisker is the spread, the dashed line is the reference, and one bar joins neighbours with no clear difference.",
    rankPanel: "Seven of eight cuppers",
    rankPanelNote: "Three neighbours with no clear difference, a fixed reference and a coffee under the scale.",
    rankTwo: "Two cuppers",
    rankTwoNote: "No spread and no difference.",
    rankSolo: "Solo cupping",
    rankSoloNote: "Your ring only.",
    dots: "You and the group, attribute by attribute",
    dotsNote: "One fixed scale per measure: quality from 1 to 9 and intensities from 0 to 15.",
    quality: "Quality, 1 to 9",
    qualityNote: "Sweetness has no group value.",
    intensity: "Intensities, 0 to 15",
    intensityNote: "The first row is at the lowest value and the last at the highest.",
    mineOnly: "Your values only",
    mineOnlyNote: "When the group's value may not be shown.",
    wheel: "The counted wheel",
    wheelNote: "Each family has its sector in a pale tint (the whole sector is everyone) and, over it, a petal as long as the people who found it. No rings inside: the number sits beside the outer ring, the panel's size under the wheel, and the list repeats every figure.",
    families: "Families",
    descriptors: "Descriptors",
    panel: (n: number) => `Panel of ${n}`,
    leader: "One clear flavour",
    little: "A panel that agreed on little",
    two: "Two families lead",
    unanimous: "One family unanimous",
    twelve: "With twelve: two-digit counts",
    nobody: "Nobody picked a flavour",
    empty: "Nobody cupped it",
    minis: "The row of small wheels",
    minisNote: "The same wheel with no words: the nine pale sectors, the petals and the outer ring. Its letter and the most found family are written under it.",
    compare: "The comparison",
    compareNote: "No numbers on the drawing: the table under it is the exact reading. Each coffee carries its letter on its own edge and its own line style.",
    aloneTwo: "Two coffees, alone",
    aloneThree: "Three coffees, alone",
    overOne: "Over one coffee's petals: one other",
    overTwo: "Over the petals: two others (panels of 7, 6 and 4)",
    hard: "Hard case: three flat or small panels",
    mixed: "Panels of 7 and 12 on one scale of people",
    choice: "One open choice: the ground of the comparison",
    choiceNote: "A coffee's wheel no longer has rings inside because every petal has its number beside it. The comparison prints no numbers on the drawing, so there are two ways. A is the one built.",
    choiceRings: "A · a ring per person (recommended)",
    choiceRingsNote: "Each territory's edge runs on the ring of its count: the ring is the only scale on the drawing.",
    choiceFamilies: "B · as the wheel: pale sectors, no rings",
    choiceFamiliesNote: "The same as a coffee's wheel. How far a territory reaches is read in the table only.",
    compareRest: "The other cases, on ground A",
    narrow: "In a 288 px column",
    narrowNote: "The width of the content on a 320 px phone. Text paints at the same size; what shrinks is the wheel.",
    bar: "One counted bar, alone",
  },
} as const;

const COFFEE: Record<WheelFixtureName, { tag: string; name: string }> = {
  ambar: { tag: "A", name: "Ámbar" },
  niebla: { tag: "B", name: "Niebla" },
  musgo: { tag: "C", name: "Musgo" },
  cedro: { tag: "D", name: "Cedro" },
  tres: { tag: "E", name: "Tres" },
  cuatro: { tag: "F", name: "Cuatro" },
  doce: { tag: "G", name: "Doce" },
  nadie: { tag: "H", name: "Nadie" },
  vacio: { tag: "I", name: "Vacío" },
};

function Card({ title, note, option, children }: { title?: string; note?: string; option?: string; children: ReactNode }) {
  return (
    <div className={css.card}>
      {option ? <span className={css.option}>{option}</span> : null}
      {title ? <h3 className={css.cardTitle}>{title}</h3> : null}
      {note ? <p className={css.cardNote}>{note}</p> : null}
      {children}
    </div>
  );
}

/** The groups of parts the board can show, in the order of the page. */
export const GALLERY_SECTIONS = ["overview", "wheel", "minis", "compare", "rank", "dots", "score", "narrow"] as const;
export type GallerySection = (typeof GALLERY_SECTIONS)[number];

export function ResultsPartsGallery({
  locale,
  strings,
  overviewStrings,
  cardsStrings,
  only,
}: {
  locale: FixtureLocale;
  strings: ResultsPartsStrings;
  /** The overview's words for each invented cupping, by scenario id. */
  overviewStrings: Record<string, OverviewStrings>;
  cardsStrings: CardsStrings;
  /** Show only these groups (`?only=wheel,compare`); everything without it. */
  only?: readonly GallerySection[];
}) {
  const show = (section: GallerySection) => !only || only.length === 0 || only.includes(section);
  const c = COPY[locale];
  const families = wheelFamilyLabels(locale);
  const nodes = wheelNodeLabels(locale);
  const ranks = rankFixtures(locale);
  const quality = qualityFixture(locale);
  const intensity = intensityFixture(locale);

  const coffee = (name: WheelFixtureName): CompareCoffee => ({
    id: name,
    tag: COFFEE[name].tag,
    name: COFFEE[name].name,
    counts: WHEEL_FIXTURES[name].rollup,
    n: WHEEL_FIXTURES[name].n,
  });
  const captionOf = (name: WheelFixtureName) =>
    wheelCaptionText(wheelHeadline(WHEEL_FIXTURES[name].rollup, WHEEL_FIXTURES[name].n), families, strings.caption);
  const wheel = (name: WheelFixtureName) => (
    <FlavorWheel
      counts={WHEEL_FIXTURES[name].rollup}
      n={WHEEL_FIXTURES[name].n}
      familyLabels={families}
      strings={strings.wheel}
    />
  );
  const mini = (name: WheelFixtureName) => (
    <FlavorWheel
      counts={WHEEL_FIXTURES[name].rollup}
      n={WHEEL_FIXTURES[name].n}
      familyLabels={families}
      strings={strings.wheel}
      size="mini"
      decorative
    />
  );
  const miniRow = (
    <ul className={css.minis}>
      {(["ambar", "niebla", "musgo", "cedro", "tres", "doce", "nadie"] as const).map((name) => (
        <li key={name} className={css.miniItem}>
          {mini(name)}
          <span>
            <span className={css.miniTag}>{COFFEE[name].tag}</span> {COFFEE[name].name}
          </span>
          <span className={css.miniLine}>
            <WheelCaption text={captionOf(name)} />
          </span>
        </li>
      ))}
    </ul>
  );
  const familyList = (name: WheelFixtureName) => (
    <CountedList
      items={countedFamilies(WHEEL_FIXTURES[name].rollup, WHEEL_FIXTURES[name].n)}
      labels={nodes}
      strings={strings.counted}
      ariaLabel={c.families}
    />
  );
  const descriptorList = (name: WheelFixtureName, top = 6) => (
    <CountedList
      items={countedDescriptors(WHEEL_FIXTURES[name].direct, WHEEL_FIXTURES[name].n, top)}
      labels={nodes}
      strings={strings.counted}
      marked={[BLACKBERRY, HONEY]}
      ariaLabel={c.descriptors}
    />
  );
  const compare = (
    set: { base?: WheelFixtureName; others: WheelFixtureName[] },
    ground: "rings" | "families" = "rings",
  ) => (
    <FlavorCompare
      base={set.base ? coffee(set.base) : null}
      others={set.others.map(coffee)}
      familyLabels={families}
      strings={strings.compare}
      ground={ground}
    />
  );
  const choice = (set: { base?: WheelFixtureName; others: WheelFixtureName[] }) => (
    <div className={css.grid}>
      <Card option={c.choiceRings} note={c.choiceRingsNote}>
        {compare(set, "rings")}
      </Card>
      <Card option={c.choiceFamilies} note={c.choiceFamiliesNote}>
        {compare(set, "families")}
      </Card>
    </div>
  );

  const rankOf = (id: "panel" | "two" | "solo") => {
    const f = ranks.find((r) => r.id === id) ?? ranks[0];
    return <RankStrip items={f.rows} reference={f.reference} strings={strings.rank} scoreStrings={strings.score} ariaLabel={c.rank} />;
  };

  return (
    <main className={css.page}>
      <p className={css.devNote}>{c.dev}</p>
      <h1 className={css.title}>{c.title}</h1>
      <p className={css.lead}>{c.lead}</p>

      {show("overview") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.overview}</h2>
          <p className={css.sectionNote}>{c.overviewNote}</p>
          {OVERVIEW_SCENARIOS.map((scenario) => (
            <div key={scenario.id} className={css.scenario} data-scenario={scenario.id}>
              <p className={css.listTitle}>{scenario.title[locale]}</p>
              <OverviewFixture
                scenario={scenario}
                locale={locale}
                familyLabels={families}
                parts={strings}
                t={overviewStrings[scenario.id]}
                cards={cardsStrings}
              />
            </div>
          ))}
        </section>
      ) : null}

      {show("wheel") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.wheel}</h2>
          <p className={css.sectionNote}>{c.wheelNote}</p>
          <div className={css.grid}>
            <Card title={c.leader} note={c.panel(7)}>
              <div className={css.stack}>
                {wheel("ambar")}
                <div>
                  <p className={css.listTitle}>{c.families}</p>
                  {familyList("ambar")}
                </div>
                <div>
                  <p className={css.listTitle}>{c.descriptors}</p>
                  {descriptorList("ambar")}
                </div>
              </div>
            </Card>
            <Card title={c.little} note={c.panel(7)}>
              <div className={css.stack}>
                {wheel("niebla")}
                <div>
                  <p className={css.listTitle}>{c.families}</p>
                  {familyList("niebla")}
                </div>
              </div>
            </Card>
            <Card title={c.two} note={c.panel(7)}>
              <div className={css.stack}>
                {wheel("musgo")}
                {familyList("musgo")}
              </div>
            </Card>
            <Card title={c.unanimous} note={c.panel(6)}>
              <div className={css.stack}>
                {wheel("cedro")}
                {familyList("cedro")}
              </div>
            </Card>
            <Card title={c.panel(3)}>{wheel("tres")}</Card>
            <Card title={c.twelve} note={c.panel(12)}>
              {wheel("doce")}
            </Card>
            <Card title={c.nobody} note={c.panel(7)}>
              {wheel("nadie")}
            </Card>
            <Card title={c.empty}>{wheel("vacio")}</Card>
          </div>
        </section>
      ) : null}

      {show("minis") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.minis}</h2>
          <p className={css.sectionNote}>{c.minisNote}</p>
          <div className={css.gridWide}>
            <Card>{miniRow}</Card>
          </div>
        </section>
      ) : null}

      {show("compare") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.choice}</h2>
          <p className={css.sectionNote}>{c.choiceNote}</p>
          {choice({ others: ["ambar", "musgo"] })}
          {choice({ base: "ambar", others: ["cedro"] })}

          <h2 className={`${css.sectionTitle} ${css.sectionTitleNext}`}>{c.compare}</h2>
          <p className={css.sectionNote}>{c.compareNote}</p>
          <p className={css.listTitle}>{c.compareRest}</p>
          <div className={css.grid}>
            <Card title={c.aloneThree}>{compare({ others: ["ambar", "musgo", "cedro"] })}</Card>
            <Card title={c.overTwo}>{compare({ base: "ambar", others: ["cedro", "cuatro"] })}</Card>
            <Card title={c.hard}>{compare({ others: ["niebla", "tres", "cuatro"] })}</Card>
            <Card title={c.mixed}>{compare({ others: ["ambar", "doce"] })}</Card>
          </div>
        </section>
      ) : null}

      {show("rank") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.rank}</h2>
          <p className={css.sectionNote}>{c.rankNote}</p>
          <div className={css.gridWide}>
            <Card title={c.rankPanel} note={c.rankPanelNote}>
              {rankOf("panel")}
            </Card>
          </div>
          <div className={css.grid}>
            <Card title={c.rankTwo} note={c.rankTwoNote}>
              {rankOf("two")}
            </Card>
            <Card title={c.rankSolo} note={c.rankSoloNote}>
              {rankOf("solo")}
            </Card>
          </div>
        </section>
      ) : null}

      {show("dots") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.dots}</h2>
          <p className={css.sectionNote}>{c.dotsNote}</p>
          <div className={css.grid}>
            <Card title={c.quality} note={c.qualityNote}>
              <DotPlot scale={QUALITY_SCALE} items={quality} strings={strings.dotPlot} ariaLabel={c.quality} />
            </Card>
            <Card title={c.intensity} note={c.intensityNote}>
              <DotPlot scale={INTENSITY_SCALE} items={intensity} strings={strings.dotPlot} ariaLabel={c.intensity} />
            </Card>
            <Card title={c.mineOnly} note={c.mineOnlyNote}>
              <DotPlot scale={INTENSITY_SCALE} items={intensity} strings={strings.dotPlot} showGroup={false} ariaLabel={c.mineOnly} />
            </Card>
          </div>
        </section>
      ) : null}

      {show("score") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.score}</h2>
          <p className={css.sectionNote}>{c.scoreNote}</p>
          <div className={css.gridThree}>
            {SCORE_FIXTURES.map((f) => (
              <Card key={f.id} title={f.cuppers !== null ? c.cuppers(f.cuppers) : f.id === "solo" ? c.solo : c.noScore}>
                <ScoreWithContext context={f.context} strings={strings.score} size={f.id === "six" ? "lg" : "md"} />
              </Card>
            ))}
            <Card title={c.bar}>
              <CountBar
                label={fillPattern(strings.caption.cuppers, { n: 7 })}
                bar={countBar(5, 7)}
                valueText={fillPattern(strings.counted.countOf, { count: 5, n: 7 })}
              />
            </Card>
          </div>
        </section>
      ) : null}

      {show("narrow") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.narrow}</h2>
          <p className={css.sectionNote}>{c.narrowNote}</p>
          <div className={css.narrowRow} data-narrow-row="">
            <div className={css.narrow}>{wheel("ambar")}</div>
            <div className={css.narrow}>{wheel("musgo")}</div>
            <div className={css.narrow}>{wheel("doce")}</div>
            <div className={css.narrow}>{compare({ base: "ambar", others: ["cedro", "cuatro"] })}</div>
            <div className={css.narrow}>{descriptorList("ambar")}</div>
            <div className={css.narrow}>{rankOf("panel")}</div>
            <div className={css.narrow}>
              <DotPlot scale={QUALITY_SCALE} items={quality} strings={strings.dotPlot} ariaLabel={c.quality} />
            </div>
          </div>
        </section>
      ) : null}
    </main>
  );
}
