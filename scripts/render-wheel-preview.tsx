// Visual check for the flavour wheel and its comparison in lib/pdf/charts.tsx
// (PdfFlavorWheel, PdfFlavorCompare, PdfCountedList). Fixtures only: no
// database, no network, no .env file. Every coffee, cupper and count is invented.
//
//   npx tsx scripts/render-wheel-preview.tsx <outDir>
//
// Then rasterise to look at it (PyMuPDF):
//   python -c "import fitz,sys; d=fitz.open(sys.argv[1]); [p.get_pixmap(dpi=150).save(f'{sys.argv[2]}/wheel-{i+1:02d}.png') for i,p in enumerate(d)]" <outDir>/wheel-preview.pdf <outDir>
import path from "node:path";
import fs from "node:fs";
import type { ReactNode } from "react";
import { Document, Page, Text, View, renderToFile } from "@react-pdf/renderer";
import {
  WHEEL_FAMILY_ORDER,
  countedDescriptors,
  countedFamilies,
  wheelGeometry,
  type WheelFamilyId,
  type WheelPeople,
} from "../lib/flavorWheel";
import {
  PdfCountedList,
  PdfFlavorCompare,
  PdfFlavorWheel,
  type PdfCompareCoffee,
} from "../lib/pdf/charts";
import { registerPdfFonts, SANS, SERIF } from "../lib/pdf/fonts";
import { PDF_PALETTE } from "../lib/pdf/palette";
import {
  BLACKBERRY,
  HONEY,
  WHEEL_FIXTURES,
  wheelFamilyLabels as familyLabelsOf,
  wheelNodeLabels as labelsOf,
} from "../lib/dev/wheelFixtures";

registerPdfFonts();

const OUT = process.argv[2] ?? ".";
fs.mkdirSync(OUT, { recursive: true });

type Locale = "es" | "en";
const WORDS = {
  es: { of: "de", cuppers: "catadores", top: "La más encontrada", nobody: "Nadie describió este café.", families: "Familias", descriptors: "Descriptores", you: "elegido por ti", petals: "pétalos" },
  en: { of: "of", cuppers: "cuppers", top: "Most found", nobody: "Nobody described this coffee.", families: "Families", descriptors: "Descriptors", you: "chosen by you", petals: "petals" },
} as const;

const {
  ambar: AMBAR,
  niebla: NIEBLA,
  musgo: MUSGO,
  cedro: CEDRO,
  tres: TRES,
  cuatro: CUATRO,
  doce: DOCE,
  nadie: NADIE,
} = WHEEL_FIXTURES;

// ── Page furniture ───────────────────────────────────────────────────────────

const INK = PDF_PALETTE.ink;
const SOFT = PDF_PALETTE.soft;

function Sheet({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <Page size="A4" style={{ padding: 36, fontFamily: SANS, color: INK }}>
      <Text style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 16 }}>{title}</Text>
      <Text style={{ fontSize: 8.5, color: SOFT, marginTop: 3, marginBottom: 12 }}>{note}</Text>
      {children}
    </Page>
  );
}

function Caption({ children }: { children: ReactNode }) {
  return <Text style={{ fontSize: 8.5, color: SOFT, marginTop: 4 }}>{children}</Text>;
}

function Heading({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 10.5, marginBottom: 4 }}>{children}</Text>;
}

/** A wheel with its counted lists beside it, as a report section would lay it out. */
function CoffeeBlock({ name, people, locale, marked }: { name: string; people: WheelPeople; locale: Locale; marked?: string[] }) {
  const w = WORDS[locale];
  const labels = labelsOf(locale);
  const families = countedFamilies(people.rollup, people.n);
  const descriptors = countedDescriptors(people.direct, people.n);
  const top = wheelGeometry(people.rollup, people.n).top;
  return (
    <View style={{ marginBottom: 16 }}>
      <Text style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 12 }}>{name}</Text>
      <Caption>
        {top ? `${w.top}: ${labels[top.family]}, ${top.count} ${w.of} ${people.n} ${w.cuppers}.` : w.nobody}
      </Caption>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        <PdfFlavorWheel counts={people.rollup} n={people.n} familyLabels={familyLabelsOf(locale)} width={300} />
        <View style={{ marginLeft: 14, width: 209 }}>
          {families.length > 0 ? (
            <>
              <Heading>{w.families}</Heading>
              <PdfCountedList items={families} labels={labels} ofWord={w.of} width={209} labelWidth={84} />
              <View style={{ height: 10 }} />
              <Heading>{w.descriptors}</Heading>
              <PdfCountedList items={descriptors} labels={labels} ofWord={w.of} width={209} labelWidth={84} maxRows={6} marked={marked} markLabel={w.you} />
            </>
          ) : (
            <Caption>{w.nobody}</Caption>
          )}
        </View>
      </View>
    </View>
  );
}

const coffee = (tag: string, name: string, people: WheelPeople): PdfCompareCoffee => ({
  id: tag,
  tag,
  name,
  counts: people.rollup,
  n: people.n,
});

function Mini({ tag, people, locale }: { tag: string; people: WheelPeople; locale: Locale }) {
  const labels = labelsOf(locale);
  const top = wheelGeometry(people.rollup, people.n).top;
  return (
    <View style={{ width: 96, alignItems: "center" }}>
      <PdfFlavorWheel size="mini" counts={people.rollup} n={people.n} familyLabels={familyLabelsOf(locale)} width={64} />
      <Text style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 10, marginTop: 3 }}>{tag}</Text>
      <Text style={{ fontSize: 8, color: SOFT }}>{top ? `${labels[top.family]} ${top.count}` : "—"}</Text>
    </View>
  );
}

const ES = familyLabelsOf("es");
const EN = familyLabelsOf("en");
const families = (people: WheelPeople) => WHEEL_FAMILY_ORDER.map((f: WheelFamilyId) => people.rollup[f] ?? 0).join(" ");

const doc = (
  <Document>
    <Sheet title="1. Un café, panel completo" note="Siete catadores y una familia que lidera con claridad. Datos inventados.">
      <CoffeeBlock name="Muestra G · Ámbar (natural)" people={AMBAR} locale="es" marked={[BLACKBERRY, HONEY]} />
      <CoffeeBlock name="Muestra D · Musgo (lavado)" people={MUSGO} locale="es" />
    </Sheet>

    <Sheet title="2. Un panel que coincidió poco" note="Siete catadores; casi todas las familias tienen una o dos personas. Es el caso que el diseño dejó como «aún no se sabe».">
      <CoffeeBlock name="Muestra A · Niebla (lavado)" people={NIEBLA} locale="es" />
      <CoffeeBlock name="Muestra H · Cedro (honey), 6 catadores" people={CEDRO} locale="es" />
    </Sheet>

    <Sheet title="3. Paneles de 3 y de 12" note="Con tres catadores hay tres anillos; con doce, los anillos son cuartos del panel (3, 6, 9 y 12). Ruedas a 250 pt: los nombres largos parten en dos líneas.">
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 262 }}>
          <Heading>3 catadores</Heading>
          <PdfFlavorWheel counts={TRES.rollup} n={TRES.n} familyLabels={ES} width={250} />
          <Caption>{`Familias: ${families(TRES)}`}</Caption>
        </View>
        <View style={{ width: 262 }}>
          <Heading>12 catadores</Heading>
          <PdfFlavorWheel counts={DOCE.rollup} n={DOCE.n} familyLabels={ES} width={250} />
          <Caption>{`Familias: ${families(DOCE)}`}</Caption>
        </View>
      </View>
      <View style={{ height: 14 }} />
      <CoffeeBlock name="El panel de 12, con su lista" people={DOCE} locale="es" />
    </Sheet>

    <Sheet title="4. Nadie describió el café · la rueda pequeña" note="Arriba, un café sin descriptores: el suelo de anillos y los nueve nombres, sin pétalos. Abajo, cinco ruedas pequeñas en fila, como en las tarjetas.">
      <CoffeeBlock name="Muestra X · sin descriptores" people={NADIE} locale="es" />
      <Heading>El sabor de cada café</Heading>
      <View style={{ flexDirection: "row", marginTop: 6 }}>
        <Mini tag="G" people={AMBAR} locale="es" />
        <Mini tag="A" people={NIEBLA} locale="es" />
        <Mini tag="H" people={CEDRO} locale="es" />
        <Mini tag="D" people={MUSGO} locale="es" />
        <Mini tag="X" people={NADIE} locale="es" />
      </View>
      <Caption>Cada pétalo llega hasta el número de personas que encontró esa familia. La misma familia está siempre en el mismo lugar.</Caption>
    </Sheet>

    <Sheet title="5. Comparar: territorios solos" note="Sin café base. Cada territorio llega, en cada familia, hasta el anillo de las personas que la encontraron. Los números están en la tabla de debajo: sobre el dibujo, «5·0» se leía como un decimal.">
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 262 }}>
          <Heading>Dos cafés</Heading>
          <PdfFlavorCompare others={[coffee("G", "Ámbar (natural)", AMBAR), coffee("D", "Musgo (lavado)", MUSGO)]} familyLabels={ES} ofWord="de" width={250} />
        </View>
        <View style={{ width: 262 }}>
          <Heading>Tres cafés, paneles de 7, 7 y 6</Heading>
          <PdfFlavorCompare
            others={[coffee("G", "Ámbar (natural)", AMBAR), coffee("D", "Musgo (lavado)", MUSGO), coffee("H", "Cedro (honey)", CEDRO)]}
            familyLabels={ES}
            ofWord="de"
            width={250}
          />
        </View>
      </View>
    </Sheet>

    <Sheet title="6. Comparar sobre los pétalos de un café" note="El café abierto conserva sus pétalos de color; los otros se dibujan encima como contornos en tinta (línea continua, línea discontinua). Paneles de tamaños distintos comparten una escala de personas.">
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 262 }}>
          <Heading>Ámbar con Musgo</Heading>
          <PdfFlavorCompare base={coffee("G", "Ámbar (natural)", AMBAR)} others={[coffee("D", "Musgo (lavado)", MUSGO)]} familyLabels={ES} ofWord="de" width={250} />
        </View>
        <View style={{ width: 262 }}>
          <Heading>Ámbar (7) con Cedro (6) y un panel de 4</Heading>
          <PdfFlavorCompare
            base={coffee("G", "Ámbar (natural)", AMBAR)}
            others={[coffee("H", "Cedro (honey)", CEDRO), coffee("B", "Brisa (lavado)", CUATRO)]}
            familyLabels={ES}
            ofWord="de"
            width={250}
          />
        </View>
      </View>
    </Sheet>

    <Sheet title="7. Comparar: los casos difíciles" note="Izquierda: un café plano y dos paneles pequeños, territorios que se pisan casi por completo. Derecha: paneles de 7 y de 12 en una misma escala de personas; el panel pequeño queda cerca del centro aunque coincida.">
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 262 }}>
          <Heading>Niebla (plano), Tres y Cuatro</Heading>
          <PdfFlavorCompare
            others={[coffee("A", "Niebla (lavado)", NIEBLA), coffee("T", "Panel de 3", TRES), coffee("B", "Brisa (lavado)", CUATRO)]}
            familyLabels={ES}
            ofWord="de"
            width={250}
          />
        </View>
        <View style={{ width: 262 }}>
          <Heading>Niebla con el panel de 12 encima</Heading>
          <PdfFlavorCompare base={coffee("A", "Niebla (lavado)", NIEBLA)} others={[coffee("P", "Panel de 12", DOCE)]} familyLabels={ES} ofWord="de" width={250} />
        </View>
      </View>
    </Sheet>

    <Sheet title="8. In English" note="The same drawings with English labels. Invented data.">
      <CoffeeBlock name="Sample G · Amber (natural)" people={AMBAR} locale="en" marked={[BLACKBERRY, HONEY]} />
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: 262 }}>
          <Heading>Two coffees</Heading>
          <PdfFlavorCompare others={[coffee("G", "Amber (natural)", AMBAR), coffee("D", "Moss (washed)", MUSGO)]} familyLabels={EN} ofWord="of" width={250} />
        </View>
        <View style={{ width: 262 }}>
          <Heading>{"Over Amber’s petals"}</Heading>
          <PdfFlavorCompare base={coffee("G", "Amber (natural)", AMBAR)} others={[coffee("H", "Cedar (honey)", CEDRO)]} familyLabels={EN} ofWord="of" width={250} />
        </View>
      </View>
    </Sheet>
  </Document>
);

const file = path.join(OUT, "wheel-preview.pdf");
renderToFile(doc, file).then(() => console.log("wrote", file));
