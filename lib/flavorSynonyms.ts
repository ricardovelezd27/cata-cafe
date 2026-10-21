// Curated dictionary: words cuppers actually type (LatAm fruits, spices, wine /
// fermentation vocabulary, es + en) → the ONE flavor-wheel node they file under.
// Consumed by lib/flavorSearch.ts so a typed word lands on a real node (the typed
// word itself is kept as the qualifying note by FlavorPicker).
//
// Rules: terms are lowercase; accents optional (matching is accent-insensitive);
// a term maps to exactly one id (tests enforce uniqueness + that every id exists);
// when unsure, leave a word OUT — a wrong filing is worse than the fallback
// "Agregar «palabra»…" flow. Terms equal to a node's own label belong in
// FLAVOR_WHEEL, not here. Wheel only — the CATA sets are Spanish-only.
//
// NEEDS KIM REVIEW before merge (first pass generated, then curated by hand).

export const FLAVOR_SYNONYM_SOURCE: readonly { id: string; terms: readonly string[] }[] = [
  { id: "floral:floral", terms: ["flores", "flor", "flowers", "flower", "azahar", "flor de azahar", "orange blossom", "hibisco", "hibiscus", "flor de jamaica", "lavanda", "lavender"] },
  { id: "floral:floral:chamomile", terms: ["camomila", "camomile"] },
  { id: "floral:floral:jasmine", terms: ["jasmin"] },
  { id: "floral:floral:rose", terms: ["rosas", "roses"] },
  { id: "fruity:berry", terms: ["berries", "frutos rojos", "frutas rojas", "frutos del bosque", "red fruit", "uchuva", "uchuvas", "physalis", "goldenberry", "uvilla"] },
  { id: "fruity:berry:blackberry", terms: ["moras", "zarzamora", "zarzamoras", "blackberries", "mulberry"] },
  { id: "fruity:berry:blueberry", terms: ["arandanos", "blueberries", "mirtilo", "mirtilos"] },
  { id: "fruity:berry:raspberry", terms: ["frambuesas", "raspberries"] },
  { id: "fruity:berry:strawberry", terms: ["frutilla", "frutillas", "fresas", "strawberries"] },
  { id: "fruity:citrus", terms: ["citricos", "citrus", "bergamota", "bergamot"] },
  { id: "fruity:citrus:grapefruit", terms: ["toronja", "toronjas", "pomelos", "grapefruits"] },
  { id: "fruity:citrus:lemon", terms: ["limones", "lemons"] },
  { id: "fruity:citrus:lime", terms: ["limas", "limes"] },
  { id: "fruity:citrus:orange", terms: ["naranjas", "oranges", "mandarina", "mandarinas", "mandarin", "tangerine", "naranja dulce"] },
  { id: "fruity:dried", terms: ["fruta seca", "frutas secas", "frutas deshidratadas", "dried fruits", "deshidratada"] },
  { id: "fruity:dried:prune", terms: ["ciruelas pasas", "ciruela seca", "ciruelas secas", "prunes"] },
  { id: "fruity:dried:raisin", terms: ["pasas", "uva pasa", "uvas pasas", "raisins", "sultanas", "sultana"] },
  { id: "fruity:other_fruit", terms: ["otras frutas", "other fruits", "tropical", "frutas tropicales", "tropical fruit", "lulo", "naranjilla", "pitahaya", "pitaya", "fruta del dragon", "dragon fruit", "chontaduro", "guanabana", "soursop", "maracuya", "parchita", "passion fruit", "granadilla", "curuba", "mamey", "zapote", "nispero", "tamarindo", "guayaba", "guava", "papaya", "lechosa", "mango", "carambola", "borojo", "feijoa", "lichi", "lychee", "pulpa de cacao", "cacao pulp", "mucilago", "banana", "bananas", "platano", "guineo", "higo", "higos", "melon", "sandia", "kiwi", "ciruela", "ciruelas", "plum", "plums"] },
  { id: "fruity:other_fruit:apple", terms: ["manzanas", "apples", "manzana verde", "green apple"] },
  { id: "fruity:other_fruit:cherry", terms: ["cerezas", "cherries", "guinda", "guindas", "sour cherry"] },
  { id: "fruity:other_fruit:coconut", terms: ["cocos", "coconuts"] },
  { id: "fruity:other_fruit:grape", terms: ["uvas", "grapes", "uva verde", "uvas verdes"] },
  { id: "fruity:other_fruit:peach", terms: ["melocoton", "melocotones", "duraznos", "peaches", "damasco", "damascos", "albaricoque", "albaricoques", "apricot", "apricots"] },
  { id: "fruity:other_fruit:pear", terms: ["peras", "pears"] },
  { id: "fruity:other_fruit:pineapple", terms: ["piña", "ananas", "ananá", "pineapples"] },
  { id: "fruity:other_fruit:pomegranate", terms: ["granadas", "pomegranates"] },
  { id: "green_veg:fresh:fresh", terms: ["frescura", "frescor", "freshness"] },
  { id: "green_veg:fresh:peapod", terms: ["vainas", "vaina verde", "pea pod", "pea pods", "peapods", "ejote", "ejotes", "green beans"] },
  { id: "green_veg:fresh:vegetative", terms: ["vegetales", "vegetable", "vegetables"] },
  { id: "green_veg:fresh:dark_green", terms: ["verde obscuro"] },
  { id: "green_veg:fresh:herb_like", terms: ["herbaceos", "hierba", "hierbas", "herbal", "herbs", "herb", "herbaceous", "romero", "rosemary", "tomillo", "thyme", "menta", "mint", "hierbabuena", "albahaca", "basil", "oregano"] },
  { id: "green_veg:fresh:under_ripe", terms: ["unripe", "underripe", "under ripe", "inmadura", "inmaduras", "verde inmaduro"] },
  { id: "green_veg:fresh:hay_like", terms: ["hay", "paja", "pajoso", "pajosa", "heno seco"] },
  { id: "green_veg:beany", terms: ["legumbre", "legumbres", "legumes", "frijol", "frijoles", "beans", "bean", "garbanzo", "garbanzos", "lentejas"] },
  { id: "green_veg:olive_oil", terms: ["oliva", "olive", "olives", "aceituna", "aceitunas"] },
  { id: "nutty_cocoa:cocoa", terms: ["cacao en polvo", "polvo de cacao", "cocoa powder"] },
  { id: "nutty_cocoa:cocoa:chocolate", terms: ["chocolate con leche", "milk chocolate", "chocolate blanco", "white chocolate"] },
  { id: "nutty_cocoa:cocoa:dark_chocolate", terms: ["chocolate negro", "chocolate oscuro", "bittersweet chocolate", "semisweet chocolate"] },
  { id: "nutty_cocoa:nutty", terms: ["nuez", "nuts", "nut", "walnut", "walnuts", "frutos secos"] },
  { id: "nutty_cocoa:nutty:almond", terms: ["almendras", "almonds"] },
  { id: "nutty_cocoa:nutty:hazelnut", terms: ["avellanas", "hazelnuts", "filbert", "filberts"] },
  { id: "nutty_cocoa:nutty:peanuts", terms: ["cacahuate", "cacahuates", "cacahuete", "cacahuetes", "peanut"] },
  { id: "spice:brown_spice", terms: ["spice", "especiado", "especiada", "especias calidas", "warm spices", "cardamomo", "cardamom", "jengibre", "ginger"] },
  { id: "spice:brown_spice:anise", terms: ["licorice", "liquorice", "regaliz", "orozuz", "hinojo", "fennel"] },
  { id: "spice:brown_spice:cinnamon", terms: ["cassia", "canela en rama", "cinnamon stick"] },
  { id: "spice:brown_spice:clove", terms: ["clavos", "clavo de olor", "cloves"] },
  { id: "spice:brown_spice:nutmeg", terms: ["nuezmoscada", "macis", "nutmegs"] },
  { id: "spice:pungent", terms: ["picoso", "picosa", "picor", "spicy", "pungente", "chile", "chili", "chiles", "ají"] },
  { id: "spice:pepper", terms: ["pimienta negra", "pimienta blanca", "black pepper", "white pepper", "peppery"] },
  { id: "roasted:burnt", terms: ["quemada", "quemados", "burned", "scorched", "carbonizado", "carbonizada", "chamuscado"] },
  { id: "roasted:burnt:acrid", terms: ["acridez", "acridity"] },
  { id: "roasted:burnt:ashy", terms: ["cenizas", "ash", "ashes"] },
  { id: "roasted:burnt:brown_roast", terms: ["tostada", "tostados", "roast"] },
  { id: "roasted:burnt:smoky", terms: ["ahumado", "ahumada", "ahumados", "smoke", "smoked"] },
  { id: "roasted:cereal", terms: ["cereales", "cereals"] },
  { id: "roasted:cereal:grain", terms: ["granos", "grains"] },
  { id: "roasted:cereal:malt", terms: ["maltoso", "maltosa", "malty", "maltas"] },
  { id: "roasted:tobacco:pipe_tobacco", terms: ["pipa", "pipe"] },
  { id: "roasted:tobacco:tobacco", terms: ["cigarro", "cigarros", "cigar", "cigars"] },
  { id: "sweet:brown_sugar", terms: ["panela", "piloncillo", "rapadura", "papelon", "chancaca", "jaggery", "azucar de cana", "cane sugar", "raw sugar", "azucar sin refinar"] },
  { id: "sweet:brown_sugar:caramelized", terms: ["caramelo", "caramel", "dulce de leche", "carameloso", "caramelized sugar"] },
  { id: "sweet:brown_sugar:honey", terms: ["miel de abeja", "panal"] },
  { id: "sweet:brown_sugar:maple_syrup", terms: ["arce", "maple", "jarabe de maple"] },
  { id: "sweet:brown_sugar:molasses", terms: ["melasa", "melazas", "miel de caña", "blackstrap", "treacle"] },
  { id: "sweet:sweet_aromatics:overall_sweet", terms: ["dulzor", "dulzura", "sweetness"] },
  { id: "sweet:sweet_aromatics:vanilla", terms: ["vaina de vainilla", "vanilla bean"] },
  { id: "sweet:sweet_aromatics:vanillin", terms: ["vanilina", "vanillina"] },
  { id: "sour_fermented:alcohol_fermented", terms: ["alcohol", "alcohólico", "alcoholic", "licor", "liquor", "ron", "rum", "tequila", "mezcal", "brandy", "cognac", "aguardiente", "cerveza", "cervezas", "beer", "beers"] },
  { id: "sour_fermented:alcohol_fermented:fermented", terms: ["fermentacion", "fermentation", "ferment", "kombucha", "fermentativo"] },
  { id: "sour_fermented:alcohol_fermented:overripe", terms: ["sobremadura", "sobre maduro", "sobre-maduro", "demasiado maduro"] },
  { id: "sour_fermented:alcohol_fermented:whiskey", terms: ["scotch", "wisky"] },
  { id: "sour_fermented:alcohol_fermented:winey", terms: ["vinoso", "vinosa", "vino", "wine", "winy"] },
  { id: "sour_fermented:sour", terms: ["lactico", "acido lactico", "yogur", "yogurt", "yoghurt"] },
  { id: "sour_fermented:sour:acetic", terms: ["vinagre", "vinegar", "avinagrado", "avinagrada", "acetico", "acetic acid"] },
  { id: "sour_fermented:sour:butyric", terms: ["butirico", "mantequilla rancia", "rancid butter"] },
  { id: "sour_fermented:sour:citric", terms: ["citric acid"] },
  { id: "sour_fermented:sour:isovaleric", terms: ["isovalerico"] },
  { id: "sour_fermented:sour:malic", terms: ["malico", "malic acid"] },
  { id: "sour_fermented:sour:sour_aromatics", terms: ["aromas acidos"] },
  { id: "other:chemical", terms: ["quimicos", "chemicals"] },
  { id: "other:chemical:bitter", terms: ["amargor", "amargura", "bitterness"] },
  { id: "other:chemical:medicinal", terms: ["medicina", "medicine", "farmaceutico", "pharmaceutical", "pharmacy"] },
  { id: "other:chemical:petroleum", terms: ["gasolina", "gasoline", "kerosene", "queroseno", "diesel"] },
  { id: "other:chemical:rubber", terms: ["caucho", "hule", "rubbery", "latex"] },
  { id: "other:chemical:salty", terms: ["sal", "salinidad", "salt", "salinity"] },
  { id: "other:chemical:skunky", terms: ["skunk", "skunks"] },
  { id: "other:papery_musty", terms: ["musty", "mustiness", "papel mojado"] },
  { id: "other:papery_musty:animalic", terms: ["animalico", "barnyard", "establo", "animalidad"] },
  { id: "other:papery_musty:cardboard", terms: ["papel de carton"] },
  { id: "other:papery_musty:meaty_brothy", terms: ["carne", "caldo", "meaty", "brothy", "broth", "carnoso", "carnosa"] },
  { id: "other:papery_musty:moldy_damp", terms: ["moho", "mohoso", "mohosa", "humedo", "mold", "moldy", "damp", "mildew"] },
  { id: "other:papery_musty:musty_dusty", terms: ["polvo", "polvoriento", "dusty", "dust"] },
  { id: "other:papery_musty:musty_earthy", terms: ["tierra", "terroso", "terrosa", "earthy", "earth", "geosmina", "geosmin"] },
  { id: "other:papery_musty:papery", terms: ["paper", "papel seco"] },
  { id: "other:papery_musty:phenolic", terms: ["fenol", "phenol", "phenols", "fenoles"] },
  { id: "other:papery_musty:stale", terms: ["rancido", "rancida", "staleness"] },
  { id: "other:papery_musty:woody", terms: ["maderoso", "maderosa", "lena", "wood", "oak", "roble", "barrica", "barrel", "cedar"] },
];

/** Accent/case-insensitive key, same folding as lib/flavorSearch's norm(). */
function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

const INDEX = new Map<string, string>();
for (const { id, terms } of FLAVOR_SYNONYM_SOURCE) {
  for (const t of terms) {
    const key = fold(t);
    if (!INDEX.has(key)) INDEX.set(key, id);
  }
}

/** Node id a (normalized or raw) typed phrase files under, or undefined. */
export function lookupSynonym(query: string): string | undefined {
  return INDEX.get(fold(query));
}

/** Distinct node ids whose dictionary term starts with the typed prefix (3+ chars). */
export function lookupSynonymPrefix(query: string): string[] {
  const q = fold(query);
  if (q.length < 3) return [];
  const ids = new Set<string>();
  for (const [term, id] of INDEX) if (term.startsWith(q)) ids.add(id);
  return [...ids];
}
