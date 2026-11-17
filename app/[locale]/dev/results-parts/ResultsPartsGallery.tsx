import type { ReactNode } from "react";
import { CountedList } from "@/components/results/CountedList";
import { FlavorCompare, type CompareCoffee } from "@/components/results/FlavorCompare";
import { FlavorWheel } from "@/components/results/FlavorWheel";
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
import css from "./gallery.module.css";

// The board's own words (a dev page: they are not product copy and are not in
// the messages). The parts' words come from `results.parts`, through `strings`.
const COPY = {
  es: {
    dev: "Página de desarrollo. Datos inventados; no lee la base de datos ni necesita una cuenta.",
    title: "Partes de resultados",
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
    wheelNote: "Un anillo por persona y un pétalo por familia, tan largo como las personas que la encontraron. El número va junto al anillo y la lista de abajo repite cada cifra.",
    families: "Familias",
    descriptors: "Descriptores",
    panel: (n: number) => `Panel de ${n}`,
    leader: "Un sabor claro",
    two: "Dos familias al frente",
    unanimous: "Una familia unánime",
    twelve: "Con doce, los anillos son cuartos del panel",
    nobody: "Nadie eligió un sabor",
    empty: "Nadie lo cató",
    minis: "La fila de ruedas pequeñas",
    minisNote: "La forma sola, con su letra y lo más encontrado escrito debajo.",
    compare: "La comparación",
    compareNote: "Sin números en el dibujo: la tabla de abajo es la lectura exacta. Cada café lleva su letra sobre su propio borde y un estilo de línea distinto.",
    aloneTwo: "Dos cafés, solos",
    aloneThree: "Tres cafés, solos",
    overOne: "Sobre los pétalos de un café: otro café",
    overTwo: "Sobre los pétalos: otros dos (paneles de 7, 6 y 4)",
    hard: "Caso difícil: tres paneles planos o pequeños",
    mixed: "Paneles de 7 y 12 en una misma escala de personas",
    flat: "Un panel que coincidió poco: tres opciones",
    flatNote: "La misma cuenta y la misma escala en las tres; cambia el titular y el fondo. Arriba el café en que el panel coincidió poco, abajo el mismo trato para un café con un sabor claro.",
    optionA: "Opción A · como hoy",
    optionANote: "La rueda y sus números, sin titular.",
    optionB: "Opción B · con titular",
    optionBNote: "Una línea encima dice lo más encontrado, con su cifra.",
    optionC: "Opción C · con titular y fondo de familias",
    optionCNote: "Además, el sector entero de cada familia en un tono pálido: se ven las nueve y cuánto falta para todos.",
    minisTracks: "Las ruedas pequeñas, con el fondo de la opción C",
    narrow: "En una columna de 288 px",
    narrowNote: "El ancho del contenido en un teléfono de 320 px. El texto pinta al mismo tamaño; lo que se achica es la rueda.",
    bar: "Una barra contada, sola",
  },
  en: {
    dev: "Development page. Invented data; it reads no database and needs no account.",
    title: "Results parts",
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
    wheelNote: "A ring per person and a petal per family, as long as the people who found it. The number sits beside the ring and the list under it repeats every figure.",
    families: "Families",
    descriptors: "Descriptors",
    panel: (n: number) => `Panel of ${n}`,
    leader: "One clear flavour",
    two: "Two families lead",
    unanimous: "One family unanimous",
    twelve: "With twelve, the rings are quarters of the panel",
    nobody: "Nobody picked a flavour",
    empty: "Nobody cupped it",
    minis: "The row of small wheels",
    minisNote: "The shape alone, with its letter and the most found family written under it.",
    compare: "The comparison",
    compareNote: "No numbers on the drawing: the table under it is the exact reading. Each coffee carries its letter on its own edge and its own line style.",
    aloneTwo: "Two coffees, alone",
    aloneThree: "Three coffees, alone",
    overOne: "Over one coffee's petals: one other",
    overTwo: "Over the petals: two others (panels of 7, 6 and 4)",
    hard: "Hard case: three flat or small panels",
    mixed: "Panels of 7 and 12 on one scale of people",
    flat: "A panel that agreed on little: three options",
    flatNote: "The same count and the same scale in all three; the headline and the ground change. Above, the coffee the panel agreed little on; below, the same treatment for a coffee with one clear flavour.",
    optionA: "Option A · as today",
    optionANote: "The wheel and its numbers, no headline.",
    optionB: "Option B · with a headline",
    optionBNote: "One line above says what most people found, with its figure.",
    optionC: "Option C · headline and family ground",
    optionCNote: "Also, each family's whole sector in a pale tint: all nine are seen, and how far each is from everyone.",
    minisTracks: "The small wheels, with the ground of option C",
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
export const GALLERY_SECTIONS = ["wheel", "options", "minis", "compare", "rank", "dots", "score", "narrow"] as const;
export type GallerySection = (typeof GALLERY_SECTIONS)[number];

export function ResultsPartsGallery({
  locale,
  strings,
  only,
}: {
  locale: FixtureLocale;
  strings: ResultsPartsStrings;
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
    wheelCaptionText(wheelHeadline(WHEEL_FIXTURES[name].rollup, WHEEL_FIXTURES[name].n), families, strings);
  const wheel = (name: WheelFixtureName, caption?: ReactNode, tracks = false) => (
    <FlavorWheel
      counts={WHEEL_FIXTURES[name].rollup}
      n={WHEEL_FIXTURES[name].n}
      familyLabels={families}
      strings={strings.wheel}
      caption={caption}
      tracks={tracks}
    />
  );
  const mini = (name: WheelFixtureName, tracks = false) => (
    <FlavorWheel
      counts={WHEEL_FIXTURES[name].rollup}
      n={WHEEL_FIXTURES[name].n}
      familyLabels={families}
      strings={strings.wheel}
      size="mini"
      decorative
      tracks={tracks}
    />
  );
  const miniRow = (tracks: boolean) => (
    <ul className={css.minis}>
      {(["ambar", "niebla", "musgo", "cedro", "doce"] as const).map((name) => (
        <li key={name} className={css.miniItem}>
          {mini(name, tracks)}
          <span>
            <span className={css.miniTag}>{COFFEE[name].tag}</span> {COFFEE[name].name}
          </span>
          <span className={css.miniLine}>{captionOf(name)}</span>
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
  const cuppersLine = (name: WheelFixtureName) => fillPattern(strings.caption.cuppers, { n: WHEEL_FIXTURES[name].n });
  const headline = (name: WheelFixtureName) => (
    <div>
      <p className={css.eyebrow}>{strings.caption.mostFoundLabel}</p>
      <p className={css.headline}>{captionOf(name)}</p>
    </div>
  );

  const rankOf = (id: "panel" | "two" | "solo") => {
    const f = ranks.find((r) => r.id === id) ?? ranks[0];
    return <RankStrip items={f.rows} reference={f.reference} strings={strings.rank} scoreStrings={strings.score} ariaLabel={c.rank} />;
  };

  const flatOptions = (name: WheelFixtureName) => (
    <div className={css.gridThree}>
      <Card option={c.optionA} note={c.optionANote}>
        <div className={css.stack}>
          {wheel(name, cuppersLine(name))}
          {familyList(name)}
        </div>
      </Card>
      <Card option={c.optionB} note={c.optionBNote}>
        {headline(name)}
        <div className={css.stack}>
          {wheel(name, cuppersLine(name))}
          {familyList(name)}
        </div>
      </Card>
      <Card option={c.optionC} note={c.optionCNote}>
        {headline(name)}
        <div className={css.stack}>
          {wheel(name, cuppersLine(name), true)}
          {familyList(name)}
        </div>
      </Card>
    </div>
  );

  return (
    <main className={css.page}>
      <p className={css.devNote}>{c.dev}</p>
      <h1 className={css.title}>{c.title}</h1>
      <p className={css.lead}>{c.lead}</p>

      {show("wheel") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.wheel}</h2>
          <p className={css.sectionNote}>{c.wheelNote}</p>
          <div className={css.grid}>
            <Card title={c.leader} note={c.panel(7)}>
              <div className={css.stack}>
                {wheel("ambar", cuppersLine("ambar"))}
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
            <Card title={c.two} note={c.panel(7)}>
              <div className={css.stack}>
                {wheel("musgo", cuppersLine("musgo"))}
                {familyList("musgo")}
              </div>
            </Card>
            <Card title={c.unanimous} note={c.panel(6)}>
              <div className={css.stack}>
                {wheel("cedro", cuppersLine("cedro"))}
                {familyList("cedro")}
              </div>
            </Card>
            <Card title={c.panel(3)}>{wheel("tres", cuppersLine("tres"))}</Card>
            <Card title={c.twelve} note={c.panel(12)}>
              {wheel("doce", cuppersLine("doce"))}
            </Card>
            <Card title={c.nobody} note={c.panel(7)}>
              <div className={css.stack}>
                {wheel("nadie", cuppersLine("nadie"))}
                {familyList("nadie")}
              </div>
            </Card>
            <Card title={c.empty}>{wheel("vacio")}</Card>
          </div>
        </section>
      ) : null}

      {show("options") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.flat}</h2>
          <p className={css.sectionNote}>{c.flatNote}</p>
          {flatOptions("niebla")}
          {flatOptions("ambar")}
          <div className={css.gridWide}>
            <Card title={c.minisTracks}>{miniRow(true)}</Card>
          </div>
        </section>
      ) : null}

      {show("minis") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.minis}</h2>
          <p className={css.sectionNote}>{c.minisNote}</p>
          <div className={css.gridWide}>
            <Card>{miniRow(false)}</Card>
          </div>
        </section>
      ) : null}

      {show("compare") ? (
        <section className={css.section}>
          <h2 className={css.sectionTitle}>{c.compare}</h2>
          <p className={css.sectionNote}>{c.compareNote}</p>
          <div className={css.grid}>
            <Card title={c.aloneTwo}>
              <FlavorCompare others={[coffee("ambar"), coffee("musgo")]} familyLabels={families} strings={strings.compare} />
            </Card>
            <Card title={c.aloneThree}>
              <FlavorCompare
                others={[coffee("ambar"), coffee("musgo"), coffee("cedro")]}
                familyLabels={families}
                strings={strings.compare}
              />
            </Card>
            <Card title={c.overOne}>
              <FlavorCompare base={coffee("ambar")} others={[coffee("cedro")]} familyLabels={families} strings={strings.compare} />
            </Card>
            <Card title={c.overTwo}>
              <FlavorCompare
                base={coffee("ambar")}
                others={[coffee("cedro"), coffee("cuatro")]}
                familyLabels={families}
                strings={strings.compare}
              />
            </Card>
            <Card title={c.hard}>
              <FlavorCompare
                others={[coffee("niebla"), coffee("tres"), coffee("cuatro")]}
                familyLabels={families}
                strings={strings.compare}
              />
            </Card>
            <Card title={c.mixed}>
              <FlavorCompare others={[coffee("ambar"), coffee("doce")]} familyLabels={families} strings={strings.compare} />
            </Card>
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
            <div className={css.narrow}>{wheel("ambar", cuppersLine("ambar"))}</div>
            <div className={css.narrow}>{wheel("doce", cuppersLine("doce"))}</div>
            <div className={css.narrow}>
              <FlavorCompare
                base={coffee("ambar")}
                others={[coffee("cedro"), coffee("cuatro")]}
                familyLabels={families}
                strings={strings.compare}
              />
            </div>
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
