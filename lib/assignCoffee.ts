// Input rules for "Asignar café" on a coffee-less sample (S8-10 T10,
// F-express-3). Pure so vitest pins them; the server action in
// app/actions/sessions.ts does the authorization and the writes.
//
// Exactly one of two modes: link an EXISTING coffee the caller may use
// (`coffeeId`, re-validated server-side with usableCoffeeWhere) or CREATE one
// from typed fields (name required, bounded like every other coffee write).

import * as v from "@/lib/validate";

export type AssignCoffeeInput = {
  coffeeId?: unknown;
  fields?: {
    name?: unknown;
    country?: unknown;
    region?: unknown;
    farm?: unknown;
    producer?: unknown;
    variety?: unknown;
    processType?: unknown;
    altitude?: unknown;
    roastLevel?: unknown;
  };
};

export type AssignCoffeePlan =
  | { mode: "link"; coffeeId: string }
  | {
      mode: "create";
      fields: {
        name: string;
        country?: string;
        region?: string;
        farm?: string;
        producer?: string;
        variety?: string;
        processType?: string;
        altitude?: string;
        roastLevel?: string;
      };
    };

const OPTIONAL = ["country", "region", "farm", "producer", "variety", "processType", "altitude", "roastLevel"] as const;

/** Throws `invalid_input` (ValidationError) on anything malformed. */
export function planAssignCoffee(input: AssignCoffeeInput): AssignCoffeePlan {
  const hasId = input.coffeeId !== undefined && input.coffeeId !== null && input.coffeeId !== "";
  if (hasId) {
    return { mode: "link", coffeeId: v.str(input.coffeeId, "coffeeId", { max: 64 })! };
  }
  const f = input.fields;
  if (!f) throw new Error("invalid_input");
  const fields: Extract<AssignCoffeePlan, { mode: "create" }>["fields"] = {
    name: v.str(f.name, "name", { max: 120 })!,
  };
  for (const key of OPTIONAL) {
    const value = v.str(f[key], key, { max: 120, required: false });
    if (value) fields[key] = value;
  }
  return { mode: "create", fields };
}
