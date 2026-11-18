"use client";

import { useEffect, useId, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useActionFeedback } from "@/components/ui/Toast";
import { useConnectivity } from "@/hooks/useConnectivity";
import { isNetworkFailure } from "@/lib/actionResult";
import { X, ChevronDown } from "lucide-react";
import { PROCESS_TYPES, CERTIFICATIONS, ROAST_LEVELS } from "@/lib/constants";
import { createSession, createGroupSession } from "@/app/actions/sessions";
import { startSession } from "@/app/actions/community";
import type { GroupEmailSummary } from "@/app/actions/groups";
import { NotifyGroupPanel, type NotifyGroupOption, type NotifyGroupTranslations } from "@/components/groups/NotifyGroupPanel";
import { InviteQR } from "@/components/ui/InviteQR";
import { buildInviteUrl } from "@/lib/inviteUrl";
import { CoffeePicker, type UsableCoffee } from "@/components/coffees/CoffeePicker";
import { Badge } from "@/components/ui/Badge";
import { SampleKey, type SampleKeyRow, type SampleKeyTranslations } from "@/components/cupping/SampleKey";
import { SamplePrepFields, type SamplePrepTranslations } from "@/components/cupping/SamplePrepFields";
import { prepToForm } from "@/lib/samplePrep";
import { localDateISO } from "@/lib/localDate";
import {
  isDraftDirtyFrom,
  parseDraft,
  serializeDraft,
  wizardDraftKey,
} from "@/lib/wizardDraft";
import {
  LAST_FORMAT_KEY,
  WIZARD_DEFAULT_FORMAT,
  parseLastFormat,
  type WizardHandoff,
} from "@/lib/sessionDefaults";
import { Select } from "@/components/ui/Select";
import { HIT_Y44 } from "@/components/ui/hitArea";
import { radioKeyDown } from "@/components/radioKeys";
import { sampleCountWarning, type SampleCountWarning } from "@/lib/sampleCount";
import { DEFAULT_NOTIFY_WHEN, type NotifyWhen } from "@/lib/groupNotify";
import { DEFAULT_REFERENCE_MODE, referenceExplanation, type ReferenceMode } from "@/lib/referenceRules";
import { browserZone, dateInZone, LAST_CLOSING_DAY } from "@/lib/closeRules";
import { MAX_DATE_INPUT } from "@/lib/safeDate";
import { WARMUP_EXERCISES, lw, type WarmupId } from "@/lib/warmup/exercises";
import { fieldErrorId, fieldForErrorCode, fieldInputId, type SessionFormField } from "@/lib/sessionFormErrors";
import { scrollBehavior } from "@/lib/motion";
import { FormActionBar, dockedFormClass } from "@/components/ui/FormActionBar";
import { Card } from "@/components/ui/Card";
import { cardClasses } from "@/components/ui/cardRecipe";
import { Notice } from "@/components/ui/Notice";
import { PaperSectionHeading } from "@/components/ui/PaperSectionHeading";
import {
  addSample as addSampleTo,
  blankCoffee,
  buildWizardSubmission,
  linkedEntry,
  autoSample,
  ownerOf,
  removeSample as removeSampleFrom,
  setSampleCoffee,
  shareableCoffees,
  type CoffeeEntry,
  type CoffeeInput,
  type SampleEntry,
  type SampleList,
} from "./wizardModel";

// Groups v2: session wizard extends NotifyGroupTranslations with the
// step-1 "link a group" selector copy + the step-2 auto-invite success
// strip template. Kept local (not exported from components/groups/*) since
// this file owns the wizard's translation shape.
type SessionGroupsTranslations = NotifyGroupTranslations & {
  linkGroupLabel: string;
  noGroupOption: string;
  autoInviteAsync: string;
  // Raw ICU template — interpolated locally via formatTemplate, not t().
  autoInviteSummary: string;
  // Shown when the group invitation was held back by the email limits.
  autoInviteRateLimited: string;
  // S8-17: non-blocking owner notices when the start-time group email failed.
  startGroupNoticeFailed: string;
  startGroupNoticePartial: string;
};

// Same tiny interpolation helper as components/groups/NotifyGroupPanel.tsx.
function formatTemplate(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match,
  );
}

type Translations = {
  name: string;
  namePh: string;
  date: string;
  objective: string;
  objectivePh: string;
  format: string;
  cups: string;
  formatDescriptive: string;
  formatAffective: string;
  formatCombined: string;
  // coffee fields (of each sample's coffee)
  coffeeName: string;
  producerRoaster: string;
  coffeeVariety: string;
  coffeeAltitude: string;
  coffeeRoastLevel: string;
  coffeeCountry: string;
  coffeeRegion: string;
  coffeeFarm: string;
  coffeeSpecies: string;
  coffeeHarvest: string;
  coffeeHarvestPh: string;
  coffeeProcess: string;
  coffeeCertifications: string;
  coffeeNotes: string;
  coffeeNotesPh: string;
  // samples section
  addSample: string;
  removeSample: string;
  sampleLabel: string;
  sampleCoffee: string;
  start: string;
  // warm-up (Movimiento Sensorial)
  warmup: { toggle: string; label: string; hint: string; minutes: string };
  // group
  groupToggle: string;
  groupClosesAt: string;
  groupClosesAtHint: string;
  /** Consequence of picking a closing date on a live cupping (F-sesiones-12). */
  groupClosesAtLiveNotice: string;
  groupInviteLink: string;
  groupCopyLink: string;
  groupCopied: string;
  groupCopyImage: string;
  groupDownloadQr: string;
  groupStartCupping: string;
  // new form microcopy
  newForm: {
    required: string;
    optionalSuffix: string;
    /** S7a: the numbered section titles that have no key of their own elsewhere. */
    sectionSession: string;
    sectionGroup: string;
    /** S7a (D-05): a sample row's coffee: its own, or the same as an earlier row's. */
    coffeeOwn: string;
    /** Raw ICU string (t.raw()) — contains a literal "{n}" token. */
    coffeeSameAs: string;
    coffeeCard: string;
    sampleChip: string;
    samplesTitle: string;
    samplesHelper: string;
    moreDetails: string;
    referenceTitle: string;
    referenceHelper: string;
    goToPanel: string;
    goToPanelHint: string;
    startNow: string;
    startGroup: string;
    /** Raw ICU string (t.raw()) — contains a literal "{label}" token. */
    referenceMark: string;
    cupsHint: string;
    referenceBadge: string;
    referenceNone: string;
    referenceClear: string;
    /** A4: placeholder of a row whose letter is drawn at random, and the helper above the list. */
    sampleLabelAuto: string;
    samplesBlindHelper: string;
    sampleKey: SampleKeyTranslations;
    /** X6: non-blocking line above the add button when the count is high for the format. */
    sampleWarning: Record<SampleCountWarning, string>;
    /** B1: how the reference is scored (anchor / free) and the helper for each. */
    referenceMode: { legend: string; anchor: string; free: string; anchorHelp: string; freeHelp: string; descriptiveHelp: string };
    /** A9: the collapsed "Más datos de la muestra" section of each sample row. */
    samplePrep: SamplePrepTranslations;
    /** C8: when a LIVE session's linked group is emailed. */
    notifyWhen: { checkbox: string; legend: string; onCreate: string; onStart: string };
    /** Whole newForm.errors table (S8-10); includes `offline` (S8-09). */
    errors: Record<string, string> & { generic: string; offline?: string };
  };
  picker: {
    useExisting: string;
    title: string;
    searchPlaceholder: string;
    mine: string;
    shared: string;
    public: string;
    empty: string;
    linked: string;
    unlink: string;
    close: string;
  };
};

type WizardStep = "form" | "invite";

/** Cups the wizard proposes for affective and combined sessions (express stays at 1).
 *  TODO(kim-validar:A2): simulated answer; Kim to confirm 2. */
const DEFAULT_CUPS_PER_SAMPLE = 2;

const inputBase =
  "w-full border border-outline-variant rounded-input px-3.5 py-2.5 text-body text-on-surface bg-surface-container-lowest focus:border-primary-container transition-colors";
// 44px tap target (root font-size is 14px, so min-h-11 would paint 38.5px).
const inputCls = inputBase + " min-h-[44px]";

/** Origin badge colors mirror CoffeePicker's own badges. */
const originBadgeCls: Record<UsableCoffee["origin"], string> = {
  mine: "bg-primary-container/10 text-primary-container border-primary-container/30",
  shared: "bg-secondary/15 text-on-surface border-secondary/40",
  public: "bg-surface-container text-on-surface-variant border-outline-variant",
};

function originBadgeLabel(origin: UsableCoffee["origin"], t: Translations): string {
  return origin === "mine" ? t.picker.mine : origin === "shared" ? t.picker.shared : t.picker.public;
}

function FieldLabel({
  children,
  required,
  requiredText,
  optionalText,
  htmlFor,
}: {
  children: React.ReactNode;
  required?: boolean;
  requiredText?: string;
  optionalText?: string;
  /** H-07: the id of the control this label names. */
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="label-caps block mb-1.5">
      {children}
      {required && (
        <>
          <span className="text-secondary" aria-hidden="true">
            {" "}
            *
          </span>
          {requiredText && <span className="sr-only"> ({requiredText})</span>}
        </>
      )}
      {!required && optionalText && (
        <span className="normal-case tracking-normal font-normal text-on-surface-variant">
          {" "}
          ({optionalText})
        </span>
      )}
    </label>
  );
}

/** A numbered section of the wizard (S7a, C-08): "1 · La sesión". A step
 *  carries its number, as on the landing. Green through `.section-title`. */
function SectionTitle({
  n,
  id,
  className = "",
  children,
}: {
  n: number;
  id: string;
  className?: string;
  children: React.ReactNode;
}) {
  // P2b (B-04): the paper heading (same h2, same id); the margins stay the caller's.
  return (
    <div className={className || undefined}>
      <PaperSectionHeading
        id={id}
        flush
        title={
          <>
            <span className="tabular-nums">{n}</span>
            <span aria-hidden="true"> · </span>
            <span className="sr-only">. </span>
            {children}
          </>
        }
      />
    </div>
  );
}

/** The three formats, in the order the wizard offers them (a radio group, N3). */
const FORMAT_CHOICES = ["descriptive", "affective", "combined"] as const;

export function NewSessionForm({
  locale,
  t,
  countries,
  groupsT,
  groups,
  usableCoffees,
  initialGroupId,
  handoff,
  userId,
  initialCoffee,
}: {
  locale: string;
  t: Translations;
  countries: string[];
  groupsT: SessionGroupsTranslations;
  groups: NotifyGroupOption[];
  usableCoffees: UsableCoffee[];
  /** Prefill from `?groupId=` (e.g. the group page's "create session" CTA) —
   *  already validated server-side against the user's own groups. */
  initialGroupId?: string;
  /** Prefill carried from the express form (already validated server-side). */
  handoff?: WizardHandoff;
  /** Keys the localStorage draft; null disables drafts. */
  userId?: string | null;
  /** "Catar este café": a coffee the server already checked with usableCoffeeWhere. */
  initialCoffee?: UsableCoffee | null;
}) {
  const router = useRouter();
  const feedback = useActionFeedback();
  // H-07: ties each visible label to its control (htmlFor / aria-labelledby).
  const fid = useId();
  // Shared connectivity probe: creating a session needs the server. Offline the
  // submit is disabled and every field keeps its value (S8-09, F-04-3).
  const { online } = useConnectivity();

  // Session basics
  const [name, setName] = useState(handoff?.name ?? "");
  const [date, setDate] = useState(localDateISO());
  const [objective, setObjective] = useState("");
  const [format, setFormat] = useState<"descriptive" | "affective" | "combined">(
    handoff?.format ?? WIZARD_DEFAULT_FORMAT,
  );

  // Remembered last format (shared with the express form) — an explicit
  // handoff wins.
  useEffect(() => {
    if (handoff?.format) return;
    try {
      const last = parseLastFormat(window.localStorage.getItem(LAST_FORMAT_KEY));
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (last) setFormat(last);
    } catch {
      // storage blocked: keep the default
    }
  }, [handoff?.format]);
  // The wizard proposes 2 cups per sample for affective and combined (the
  // owner can raise it to 5). TODO(kim-validar:A2): simulated answer.
  const [cupsPerSample, setCupsPerSample] = useState(DEFAULT_CUPS_PER_SAMPLE);
  const [cupsInput, setCupsInput] = useState(String(DEFAULT_CUPS_PER_SAMPLE));

  // Optional pre-cupping warm-up (CuppingSession.warmupExerciseId).
  const [warmupOn, setWarmupOn] = useState(false);
  // Default "Los ojos" ("Antes de oler"); exercises 4–5 need a firm chair and
  // the back off the backrest, so the wizard offers 1–3 (the library has all).
  const [warmupId, setWarmupId] = useState<WarmupId>("eyes");

  const [coffees, setCoffees] = useState<CoffeeEntry[]>(() => {
    // Fixed ids on the first render: the server and the browser render the
    // same label ids (S7a). Rows added later take random ones.
    const blank = blankCoffee("initial-coffee");
    return [initialCoffee ? linkedEntry(blank, initialCoffee) : blank];
  });
  const [samples, setSamples] = useState<SampleEntry[]>(() =>
    // N sample chips from the express handoff (default 1); coffees stay required.
    Array.from({ length: handoff?.sampleCount ?? 1 }, (_, i) => autoSample(coffees[0].id, `initial-sample-${i}`)),
  );

  // Reference sample — the SampleEntry.id (never the index) so add/remove/
  // reorder keep the selection stable across relabelling.
  const [referenceId, setReferenceId] = useState<string | null>(null);
  // B1: how the reference is scored; only asked (and only sent as "free") when
  // a reference is marked. "anchor" = today's pinned 79.00 exercise.
  const [referenceMode, setReferenceMode] = useState<ReferenceMode>(DEFAULT_REFERENCE_MODE);

  // Group session fields — a valid ?groupId= prefill turns the toggle on and
  // preselects the group in one step.
  const [isGroup, setIsGroup] = useState(!!initialGroupId);
  const [closesAt, setClosesAt] = useState("");
  // Today in the owner's own zone (see the date input below).
  const [todayMin] = useState(() => dateInZone(Date.now(), browserZone()));
  const [linkedGroupId, setLinkedGroupId] = useState(initialGroupId ?? "");
  const [notifyGroup, setNotifyGroup] = useState(true);
  // C8: when a LIVE session's group is emailed (async sessions ignore it).
  const [notifyGroupWhen, setNotifyGroupWhen] = useState<NotifyWhen>(DEFAULT_NOTIFY_WHEN);
  const [emailSummary, setEmailSummary] = useState<GroupEmailSummary | undefined>(undefined);
  const [inviteBlocked, setInviteBlocked] = useState(false);
  // Step 2: letter -> coffee, from the server's response (A4).
  const [sampleKey, setSampleKey] = useState<(SampleKeyRow & { sourceId: string | null })[]>([]);

  // Client-side validation state
  const [invalidCoffeeId, setInvalidCoffeeId] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const cardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  // Bumped on every failed submit that belongs to a field, so the focus effect
  // re-runs even when the same code comes back twice (S9-03).
  const [focusTick, setFocusTick] = useState(0);
  const showError = (code: string) => {
    setErrorCode(code);
    if (fieldForErrorCode(code)) setFocusTick((n) => n + 1);
  };
  // The cups input only exists outside the descriptive format; an invalid_cups
  // error with no field to sit under must fall back to the strip, never vanish.
  const rawErrorField: SessionFormField | null = fieldForErrorCode(errorCode);
  const errorField: SessionFormField | null =
    rawErrorField === "cups" && format === "descriptive" ? null : rawErrorField;
  useEffect(() => {
    if (focusTick === 0 || !errorField) return;
    const el = document.getElementById(fieldInputId(errorField));
    if (!el) return;
    el.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    el.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusTick]);

  // Coffee picker — targets a single CoffeeEntry card at a time.
  const [pickerFor, setPickerFor] = useState<string | null>(null);

  // Wizard state
  const [step, setStep] = useState<WizardStep>("form");
  const [inviteToken, setInviteToken] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [copied, setCopied] = useState(false);

  const [pending, start] = useTransition();

  // ── Draft (S8-10 T3): per-user localStorage copy of the unsent form ─────────
  const draftKey = userId ? wizardDraftKey(userId) : null;
  const draftReady = useRef(false);
  const leaving = useRef(false);

  const clearDraft = () => {
    leaving.current = true;
    if (!draftKey) return;
    try {
      window.localStorage.removeItem(draftKey);
    } catch {
      // storage blocked: nothing to clear
    }
  };

  // Restore once on mount. An explicit prefill (?groupId= / express handoff)
  // wins over an old draft.
  useEffect(() => {
    const prefilled =
      !!initialGroupId || !!initialCoffee || !!handoff?.name || !!handoff?.format || !!handoff?.sampleCount;
    if (draftKey && !prefilled) {
      try {
        const d = parseDraft(window.localStorage.getItem(draftKey));
        if (d) {
          /* eslint-disable react-hooks/set-state-in-effect */
          setName(d.name);
          setObjective(d.objective);
          setFormat(d.format);
          setCupsPerSample(d.cupsPerSample);
          setCupsInput(String(d.cupsPerSample));
          setWarmupOn(d.warmupOn);
          if (WARMUP_EXERCISES.some((ex) => ex.id === d.warmupId)) {
            setWarmupId(d.warmupId as WarmupId);
          }
          setCoffees(d.coffees);
          setSamples(d.samples);
          setReferenceId(
            d.referenceId && d.samples.some((x) => x.id === d.referenceId) ? d.referenceId : null,
          );
          setIsGroup(d.isGroup);
          setClosesAt(d.closesAt);
          setLinkedGroupId(d.linkedGroupId);
          setNotifyGroup(d.notifyGroup);
          setNotifyGroupWhen(d.notifyGroupWhen);
          setReferenceMode(d.referenceMode);
          /* eslint-enable react-hooks/set-state-in-effect */
        }
      } catch {
        // storage blocked or corrupt: start clean
      }
    }
    draftReady.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Captured on the first render: the prefilled-but-untouched form is pristine.
  const [initialShape] = useState(() => ({ name, objective, coffees, samples }));
  const dirty = isDraftDirtyFrom({ name, objective, coffees, samples }, initialShape);

  // Save (debounced) while there is something worth keeping; drop it when the
  // form is back to pristine. The date is intentionally not stored.
  useEffect(() => {
    if (!draftKey || !draftReady.current || step !== "form" || leaving.current) return;
    const timer = setTimeout(() => {
      try {
        if (dirty) {
          window.localStorage.setItem(
            draftKey,
            serializeDraft({
              name,
              objective,
              format,
              cupsPerSample,
              warmupOn,
              warmupId,
              coffees,
              samples,
              referenceId,
              isGroup,
              closesAt,
              linkedGroupId,
              notifyGroup,
              notifyGroupWhen,
              referenceMode,
            }),
          );
        } else {
          window.localStorage.removeItem(draftKey);
        }
      } catch {
        // quota / blocked: the form still works
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [
    draftKey, step, dirty, name, objective, format, cupsPerSample, warmupOn, warmupId,
    coffees, samples, referenceId, isGroup, closesAt, linkedGroupId, notifyGroup, notifyGroupWhen,
    referenceMode,
  ]);

  // Leaving the tab with an unsent form: ask first (the draft also survives).
  useEffect(() => {
    if (!dirty || step !== "form") return;
    const guard = (e: BeforeUnloadEvent) => {
      if (leaving.current) return;
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty, step]);

  // ── Coffee + sample helpers ────────────────────────────────────────────────
  const updateCoffee = (
    id: string,
    field: Exclude<keyof CoffeeInput, "certifications">,
    value: string,
  ) => {
    setCoffees((prev) => prev.map((c) => (c.id === id ? { ...c, [field]: value } : c)));
    if (invalidCoffeeId === id) {
      setInvalidCoffeeId(null);
      setErrorCode(null);
    }
  };

  const toggleCoffeeCertification = (id: string, cert: string) => {
    setCoffees((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              certifications: c.certifications.includes(cert)
                ? c.certifications.filter((x) => x !== cert)
                : [...c.certifications, cert],
            }
          : c,
      ),
    );
  };

  const applyExistingCoffee = (id: string, picked: UsableCoffee) => {
    setCoffees((prev) => prev.map((c) => (c.id === id ? linkedEntry(c, picked) : c)));
    if (invalidCoffeeId === id) {
      setInvalidCoffeeId(null);
      setErrorCode(null);
    }
    setPickerFor(null);
  };

  const unlinkCoffee = (id: string) => {
    setCoffees((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, existingCoffeeId: undefined, linkedOrigin: undefined } : c
      )
    );
  };

  // ── The one list of samples (S7a, D-05; rules in ./wizardModel.ts) ─────────
  const applyList = (next: SampleList) => {
    setCoffees(next.coffees);
    setSamples(next.samples);
    setReferenceId(next.referenceId);
    if (invalidCoffeeId && !next.coffees.some((c) => c.id === invalidCoffeeId)) {
      setInvalidCoffeeId(null);
      setErrorCode(null);
    }
  };
  const list: SampleList = { coffees, samples, referenceId };

  const addSample = () => applyList(addSampleTo(list));
  const removeSample = (id: string) => applyList(removeSampleFrom(list, id));
  const chooseSampleCoffee = (id: string, choice: string) => {
    applyList(setSampleCoffee(list, id, choice));
    setErrorCode(null);
  };

  // Clearing a typed label hands the row back to the random letters.
  const updateSampleLabel = (id: string, value: string) => {
    setSamples((prev) =>
      prev.map((s) => (s.id === id ? { ...s, label: value, auto: value.trim() === "" } : s)),
    );
  };

  const sampleWarning = sampleCountWarning(format, samples.length);
  /** Typed name of a coffee card ("" while it is still blank). */
  const coffeeNameOf = (coffeeId: string) =>
    coffees.find((c) => c.id === coffeeId)?.name.trim() ?? "";

  // ── Submit ──────────────────────────────────────────────────────────────────
  const validateClient = (): boolean => {
    const fail = (id: string, code: string) => {
      setInvalidCoffeeId(id);
      setErrorCode(code);
      cardRefs.current[id]?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
      return false;
    };
    // Cards no sample uses are dropped server-side, so they cannot block the submit.
    const referenced = new Set(samples.map((s) => s.coffeeId));
    for (const c of coffees) {
      if (!referenced.has(c.id)) continue;
      if (c.existingCoffeeId) continue;
      // Data-quality gate relaxed 2026-09 — only the name is required now;
      // everything else is progressive/fill-later. Mirror of the server-side
      // rule (REQUIRED_COFFEE_FIELDS in app/actions/sessions.ts).
      if (!c.name.trim()) {
        return fail(c.id, "missing_coffee_fields");
      }
      // Altitude is a plain msnm number — only validated when supplied.
      if (c.altitude.trim()) {
        const altitude = Number(c.altitude);
        if (!Number.isFinite(altitude) || altitude <= 0 || altitude > 6000) {
          return fail(c.id, "invalid_altitude");
        }
      }
    }
    return true;
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorCode(null);
    if (!validateClient()) return;

    // What is posted is built by one pure function (./wizardModel.ts); the
    // S7a test compares it with the builder this form had before, field by field.
    const submission = buildWizardSubmission({
      name, date, objective, format, cupsPerSample, coffees, samples, referenceId, referenceMode,
      warmupOn, warmupId, locale, isGroup, closesAt, zone: browserZone, linkedGroupId, notifyGroup,
      notifyGroupWhen,
    });

    try {
      window.localStorage.setItem(LAST_FORMAT_KEY, format);
    } catch {
      // non-fatal
    }

    start(async () => {
      // A network drop / opaque server failure must never unmount the form:
      // every field stays in state and the strip shows copy (S8-10 T1).
      try {
      if (submission.kind === "solo") {
        const result = await createSession(submission.input);
        if (result) showError(result.error);
      } else {
        const result = await createGroupSession(submission.input);
        if (result.ok) {
          clearDraft();
          setSessionId(result.sessionId);
          setInviteToken(result.inviteToken);
          setEmailSummary(result.emailSummary);
          setInviteBlocked(result.emailBlocked === "rate_limited");
          // A4: which letter got which coffee, in cupping order (owner only).
          setSampleKey(
            result.sampleKey.map((k) => {
              const src = samples[k.sourceIndex];
              const coffee = src ? coffees.find((c) => c.id === src.coffeeId) : undefined;
              return {
                id: src?.id ?? String(k.position),
                label: k.label,
                coffee: coffee?.name.trim() || null,
                sourceId: src?.id ?? null,
              };
            }),
          );
          setStep("invite");
          // Step 2 used to live only in memory: a reload lost the link. Point
          // the address bar at the owner-only invite route so a reload (or a
          // shared URL) re-reads the token from the database (S8-10 T3).
          try {
            window.history.replaceState(
              null,
              "",
              `/${locale}/app/sessions/${result.sessionId}/invite`,
            );
          } catch {
            // Non-fatal: the in-memory step still works.
          }
        } else {
          showError(result.error);
        }
      }
      } catch (err) {
        // Successful solo create navigates via redirect(); never treat that
        // control-flow throw as a failure.
        const digest = (err as { digest?: unknown } | null)?.digest;
        if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
          clearDraft();
          throw err;
        }
        // A dropped request gets the offline copy (S8-09); anything else falls
        // back to the generic line (S8-10).
        setErrorCode(isNetworkFailure(err, navigator.onLine) ? "offline" : "unknown");
      }
    });
  };

  const errorText = errorCode
    ? (t.newForm.errors as Record<string, string>)[errorCode] ?? t.newForm.errors.generic
    : null;
  // A field-level error renders under its field; the strip keeps the rest.
  const stripText = errorField ? null : errorText;
  const fieldProps = (f: SessionFormField) =>
    errorField === f
      ? { id: fieldInputId(f), "aria-invalid": true as const, "aria-describedby": fieldErrorId(f) }
      : { id: fieldInputId(f) };
  const fieldError = (f: SessionFormField) =>
    errorField === f && errorText ? (
      <p id={fieldErrorId(f)} role="alert" className="mt-1 text-caption text-error">
        {errorText}
      </p>
    ) : null;

  const inviteUrl =
    typeof window !== "undefined" ? buildInviteUrl(window.location.origin, locale, inviteToken) : "";

  const handleCopy = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Step 2: Invite link ──────────────────────────────────────────────────────
  if (step === "invite") {
    // The reference's label is the letter the server drew for it (A4).
    const refKey = referenceId ? sampleKey.find((k) => k.sourceId === referenceId) : undefined;
    return (
      <div className="space-y-6">
        {refKey && (
          <p className="flex items-center gap-2 text-body text-on-surface">
            <Badge tone="accent" size="xs">
              {t.newForm.referenceBadge}
            </Badge>
            {refKey.label}
          </p>
        )}

        <SampleKey rows={sampleKey} translations={t.newForm.sampleKey} />

        <Card tone="quiet" className="space-y-3">
          <p className="text-body font-semibold text-primary-container">{t.groupInviteLink}</p>
          {inviteUrl && (
            <div className="flex justify-center py-1">
              <InviteQR
                url={inviteUrl}
                labels={{
                  copyImage: t.groupCopyImage,
                  download: t.groupDownloadQr,
                  copied: t.groupCopied,
                }}
              />
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              readOnly
              value={inviteUrl}
              className={inputCls + " flex-1 text-caption select-all"}
              onFocus={(e) => e.target.select()}
            />
            <button
              type="button"
              onClick={handleCopy}
              className="min-h-[44px] border border-primary-container text-primary-container rounded-pill px-5 py-2.5 text-caption font-medium hover:bg-primary-fixed transition-colors whitespace-nowrap"
            >
              {copied ? t.groupCopied : t.groupCopyLink}
            </button>
          </div>
        </Card>

        {/* P2b (E-05): the rate limit needs attention (warning, not terracotta); the summary is
            information. Same text; the rate limit keeps its status role. */}
        {inviteBlocked && <Notice tone="warning">{groupsT.autoInviteRateLimited}</Notice>}

        {emailSummary && (
          <Notice tone="info" live={false}>
            {formatTemplate(groupsT.autoInviteSummary, {
              sent: emailSummary.sent,
              skipped: emailSummary.skipped,
              failed: emailSummary.failed,
            })}
          </Notice>
        )}

        <NotifyGroupPanel
          groups={groups}
          sessionId={sessionId}
          defaultSubject={name}
          t={groupsT}
        />

        {/* Primary = go to the master panel WITHOUT starting: the room may
            still be arriving, and the warm-up runs from the panel (v3). */}
        <button
          type="button"
          disabled={pending}
          onClick={() => router.push(`/${locale}/app/sessions/${sessionId}/cup`)}
          className="w-full bg-primary-container text-on-primary rounded-pill py-3.5 font-medium hover:bg-primary transition-colors disabled:opacity-50"
        >
          {t.newForm.goToPanel}
        </button>
        <p className="text-caption text-on-surface-variant text-center">{t.newForm.goToPanelHint}</p>
        {!closesAt && (
          <button
            type="button"
            disabled={pending}
            onClick={() => {
              start(async () => {
                try {
                  const r = await startSession(sessionId);
                  // The session started either way; the toast provider lives in
                  // the locale layout, so the notice survives the navigation below.
                  if (r.groupNotice === "rate_limited" || r.groupNotice === "failed") {
                    feedback.notifyWarning(groupsT.startGroupNoticeFailed);
                  } else if (r.groupNotice === "partial") {
                    feedback.notifyWarning(groupsT.startGroupNoticePartial);
                  }
                } catch {
                  feedback.notifyError("unknown");
                  return;
                }
                router.push(`/${locale}/app/sessions/${sessionId}/cup`);
              });
            }}
            className="w-full rounded-pill py-2.5 text-caption font-medium text-primary-container hover:bg-primary-fixed transition-colors disabled:opacity-50"
          >
            {t.newForm.startNow}
          </button>
        )}
      </div>
    );
  }

  // ── Step 1: Session form ─────────────────────────────────────────────────────
  // S7a (C-08, D-05): four numbered sections, ONE list of samples (each with
  // its coffee), and the one submit in the docked action bar.

  /** The fields of a coffee card: the linked coffee's summary, or the form. */
  const renderCoffee = (coffee: CoffeeEntry) =>
    coffee.existingCoffeeId ? (
      <div className="space-y-2">
        <p className="label-caps">
          {t.picker.linked}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-body text-on-surface">{coffee.name}</span>
          {coffee.linkedOrigin && (
            <span
              className={`label-caps rounded-pill border px-2 py-0.5 ${
                originBadgeCls[coffee.linkedOrigin]
              }`}
            >
              {originBadgeLabel(coffee.linkedOrigin, t)}
            </span>
          )}
        </div>
        {[coffee.country, coffee.region, coffee.variety, coffee.altitude]
          .filter(Boolean)
          .join(" · ") && (
          <p className="text-caption text-on-surface-variant">
            {[coffee.country, coffee.region, coffee.variety, coffee.altitude]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
        <button
          type="button"
          onClick={() => unlinkCoffee(coffee.id)}
          className="min-h-[44px] rounded-pill border border-outline-variant px-3 py-1.5 text-caption font-medium text-on-surface hover:bg-surface-container transition-colors"
        >
          {t.picker.unlink}
        </button>
      </div>
    ) : (
      <div className="space-y-3">
        {/* Name is the only required field (2026-09); these stay
            always-visible (not tucked into "more details") since
            they're still the fields people fill in most often. */}
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <FieldLabel htmlFor={`${fid}-${coffee.id}-name`} required requiredText={t.newForm.required}>
              {t.coffeeName}
            </FieldLabel>
            <input
              id={`${fid}-${coffee.id}-name`}
              className={inputCls}
              value={coffee.name}
              onChange={(e) => updateCoffee(coffee.id, "name", e.target.value)}
              required
              placeholder={t.coffeeName}
            />
          </div>

          <div>
            <FieldLabel htmlFor={`${fid}-${coffee.id}-country`} optionalText={t.newForm.optionalSuffix}>
              {t.coffeeCountry}
            </FieldLabel>
            <input
              id={`${fid}-${coffee.id}-country`}
              list="cata-coffee-countries"
              className={inputCls}
              value={coffee.country}
              onChange={(e) => updateCoffee(coffee.id, "country", e.target.value)}
              placeholder={t.coffeeCountry}
            />
          </div>
          <div>
            <FieldLabel htmlFor={`${fid}-${coffee.id}-variety`} optionalText={t.newForm.optionalSuffix}>
              {t.coffeeVariety}
            </FieldLabel>
            <input
              id={`${fid}-${coffee.id}-variety`}
              className={inputCls}
              value={coffee.variety}
              onChange={(e) => updateCoffee(coffee.id, "variety", e.target.value)}
              placeholder={t.coffeeVariety}
            />
          </div>

          <div>
            <FieldLabel htmlFor={`${fid}-${coffee.id}-altitude`} optionalText={t.newForm.optionalSuffix}>
              {t.coffeeAltitude}
            </FieldLabel>
            <div className="relative">
              <input
                id={`${fid}-${coffee.id}-altitude`}
                type="number"
                inputMode="numeric"
                min={1}
                max={6000}
                className={inputCls + " pr-14"}
                value={coffee.altitude}
                onChange={(e) => updateCoffee(coffee.id, "altitude", e.target.value)}
                placeholder="1800"
              />
              <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-caption text-on-surface-variant pointer-events-none">
                msnm
              </span>
            </div>
          </div>
          <div>
            <FieldLabel htmlFor={`${fid}-${coffee.id}-roastLevel`} optionalText={t.newForm.optionalSuffix}>
              {t.coffeeRoastLevel}
            </FieldLabel>
            <select
              id={`${fid}-${coffee.id}-roastLevel`}
              className={inputCls + " cursor-pointer"}
              value={coffee.roastLevel}
              onChange={(e) => updateCoffee(coffee.id, "roastLevel", e.target.value)}
            >
              <option value="">—</option>
              {ROAST_LEVELS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Optional fields — collapsed accordion keeps the card light */}
        <details className="group rounded-input border border-outline-variant bg-surface-container-low/50">
          <summary className="label-caps flex cursor-pointer select-none items-center justify-between px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
            {t.newForm.moreDetails}
            <ChevronDown
              size={14}
              className="transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="grid grid-cols-2 gap-3 px-3.5 pb-3.5">
            <div>
              <FieldLabel htmlFor={`${fid}-${coffee.id}-region`} optionalText={t.newForm.optionalSuffix}>
                {t.coffeeRegion}
              </FieldLabel>
              <input
                id={`${fid}-${coffee.id}-region`}
                className={inputCls}
                value={coffee.region}
                onChange={(e) => updateCoffee(coffee.id, "region", e.target.value)}
                placeholder={t.coffeeRegion}
              />
            </div>
            <div>
              <FieldLabel htmlFor={`${fid}-${coffee.id}-farm`} optionalText={t.newForm.optionalSuffix}>
                {t.coffeeFarm}
              </FieldLabel>
              <input
                id={`${fid}-${coffee.id}-farm`}
                className={inputCls}
                value={coffee.farm}
                onChange={(e) => updateCoffee(coffee.id, "farm", e.target.value)}
                placeholder={t.coffeeFarm}
              />
            </div>
            <div>
              <FieldLabel htmlFor={`${fid}-${coffee.id}-producer`} optionalText={t.newForm.optionalSuffix}>
                {t.producerRoaster}
              </FieldLabel>
              <input
                id={`${fid}-${coffee.id}-producer`}
                className={inputCls}
                value={coffee.producer}
                onChange={(e) => updateCoffee(coffee.id, "producer", e.target.value)}
                placeholder={t.producerRoaster}
              />
            </div>
            <div>
              <FieldLabel htmlFor={`${fid}-${coffee.id}-species`} optionalText={t.newForm.optionalSuffix}>
                {t.coffeeSpecies}
              </FieldLabel>
              <input
                id={`${fid}-${coffee.id}-species`}
                className={inputCls}
                value={coffee.species}
                onChange={(e) => updateCoffee(coffee.id, "species", e.target.value)}
                placeholder={t.coffeeSpecies}
              />
            </div>
            <div>
              <FieldLabel htmlFor={`${fid}-${coffee.id}-harvestYear`} optionalText={t.newForm.optionalSuffix}>
                {t.coffeeHarvest}
              </FieldLabel>
              <input
                id={`${fid}-${coffee.id}-harvestYear`}
                className={inputCls}
                value={coffee.harvestYear}
                onChange={(e) => updateCoffee(coffee.id, "harvestYear", e.target.value)}
                placeholder={t.coffeeHarvestPh}
              />
            </div>
            <div>
              <FieldLabel htmlFor={`${fid}-${coffee.id}-processType`} optionalText={t.newForm.optionalSuffix}>
                {t.coffeeProcess}
              </FieldLabel>
              <select
                id={`${fid}-${coffee.id}-processType`}
                className={inputCls + " cursor-pointer"}
                value={coffee.processType}
                onChange={(e) => updateCoffee(coffee.id, "processType", e.target.value)}
              >
                <option value="">—</option>
                {PROCESS_TYPES.map((pt) => (
                  <option key={pt} value={pt}>
                    {pt}
                  </option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <FieldLabel optionalText={t.newForm.optionalSuffix}>
                {t.coffeeCertifications}
              </FieldLabel>
              {/* Chips paint 30 px, 15 px apart in height: each chip's 44 px
                  hit area (HIT_Y44) meets the next row's at the midpoint. */}
              <div className="flex flex-wrap gap-x-1.5 gap-y-[15px]">
                {CERTIFICATIONS.map((cert) => {
                  const active = coffee.certifications.includes(cert);
                  return (
                    <button
                      key={cert}
                      type="button"
                      onClick={() => toggleCoffeeCertification(coffee.id, cert)}
                      aria-pressed={active}
                      className={
                        active
                          ? `${HIT_Y44} min-h-[30px] rounded-pill bg-primary-container px-3 py-1 text-caption font-semibold text-on-primary transition-colors`
                          : `${HIT_Y44} min-h-[30px] rounded-pill border border-outline-variant px-3 py-1 text-caption font-medium text-on-surface transition-colors hover:bg-surface-container`
                      }
                    >
                      {cert}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="col-span-2">
              <FieldLabel htmlFor={`${fid}-${coffee.id}-notes`} optionalText={t.newForm.optionalSuffix}>
                {t.coffeeNotes}
              </FieldLabel>
              <textarea
                id={`${fid}-${coffee.id}-notes`}
                className={inputBase + " min-h-[64px]"}
                value={coffee.notes}
                onChange={(e) => updateCoffee(coffee.id, "notes", e.target.value)}
                placeholder={t.coffeeNotesPh}
              />
            </div>
          </div>
        </details>
      </div>
    );

  return (
    <form onSubmit={onSubmit} className={`${dockedFormClass} space-y-[32px] md:space-y-[40px]`}>
      {/* 1. The session */}
      <section aria-labelledby={`${fid}-sec-session`} className="space-y-5">
        <SectionTitle n={1} id={`${fid}-sec-session`}>
          {t.newForm.sectionSession}
        </SectionTitle>
        <div>
          <FieldLabel htmlFor={fieldInputId("name")}>{t.name}</FieldLabel>
          <input
            {...fieldProps("name")}
            className={inputCls}
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            placeholder={t.namePh}
          />
          {fieldError("name")}
        </div>

        <div className={format === "descriptive" ? "grid grid-cols-1 gap-3" : "grid grid-cols-2 gap-3"}>
          <div>
            <FieldLabel htmlFor={fieldInputId("date")}>{t.date}</FieldLabel>
            <input
              type="date" suppressHydrationWarning
              {...fieldProps("date")}
              max={MAX_DATE_INPUT}
              className={inputCls}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
            {fieldError("date")}
          </div>
          {format !== "descriptive" && (
          <div>
            <FieldLabel htmlFor={fieldInputId("cups")}>{t.cups}</FieldLabel>
            <input
              type="number"
              inputMode="numeric"
              enterKeyHint="next"
              min={1}
              max={5}
              {...fieldProps("cups")}
              className={inputCls}
              value={cupsInput}
              onChange={(e) => {
                const raw = e.target.value;
                setCupsInput(raw);
                const n = parseInt(raw, 10);
                if (!Number.isNaN(n) && n >= 1 && n <= 5) {
                  setCupsPerSample(n);
                }
              }}
              onBlur={() => {
                const n = parseInt(cupsInput, 10);
                const clamped = Number.isNaN(n) ? DEFAULT_CUPS_PER_SAMPLE : Math.min(5, Math.max(1, n));
                setCupsPerSample(clamped);
                setCupsInput(String(clamped));
              }}
            />
            {fieldError("cups")}
          </div>
          )}
        </div>
        {format !== "descriptive" && (
          <p className="-mt-2 text-caption text-on-surface-variant">{t.newForm.cupsHint}</p>
        )}

        <div>
          <FieldLabel htmlFor={`${fid}-objective`}>{t.objective}</FieldLabel>
          <textarea
            id={`${fid}-objective`}
            className={inputBase + " min-h-[72px]"}
            value={objective}
            onChange={(e) => setObjective(e.target.value)}
            placeholder={t.objectivePh}
          />
        </div>
      </section>

      {/* 2. Format (and the optional warm-up) */}
      <section aria-labelledby={`${fid}-sec-format`}>
        <SectionTitle n={2} id={`${fid}-sec-format`} className="mb-3 md:mb-4">
          {t.format}
        </SectionTitle>
        <div role="radiogroup" aria-label={t.format} className="flex flex-wrap gap-2">
          {FORMAT_CHOICES.map((v, i, all) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={format === v}
              tabIndex={format === v ? 0 : -1}
              onClick={() => setFormat(v)}
              onKeyDown={(e) => radioKeyDown(e, i, all.length, (n) => setFormat(all[n]))}
              className={
                format === v
                  ? "min-h-[44px] bg-primary-container text-on-primary rounded-pill px-5 py-2.5 text-caption font-medium"
                  : "min-h-[44px] border border-outline-variant text-on-surface rounded-pill px-5 py-2.5 text-caption hover:bg-surface-container transition-colors"
              }
            >
              {{ descriptive: t.formatDescriptive, affective: t.formatAffective, combined: t.formatCombined }[v]}
            </button>
          ))}
        </div>

        {/* Optional pre-cupping warm-up (same switch pattern as the group toggle) */}
        <div className="mt-5 space-y-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              role="switch"
              aria-checked={warmupOn}
              aria-labelledby={`${fid}-warmup`}
              onClick={() => setWarmupOn((v) => !v)}
              // A 44 px box around the 39 x 21 track (F-03); the negative margin
              // keeps the row as it was.
              className="-my-[10px] -ml-[3px] inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
            >
              <span
                aria-hidden
                className={
                  "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
                  (warmupOn ? "bg-primary-container" : "bg-outline-variant")
                }
              >
                <span
                  className={
                    "inline-block h-5 w-5 transform rounded-full bg-surface-container-lowest shadow-card transition-transform " +
                    (warmupOn ? "translate-x-5" : "translate-x-0.5")
                  }
                />
              </span>
            </button>
            <span id={`${fid}-warmup`} className="text-body text-on-surface font-medium">{t.warmup.toggle}</span>
          </div>
          {warmupOn && (
            <Card tone="quiet" padding="compact" className="space-y-2">
              <FieldLabel htmlFor={`${fid}-warmup-exercise`}>{t.warmup.label}</FieldLabel>
              <Select
                id={`${fid}-warmup-exercise`}
                value={warmupId}
                onChange={(v) => setWarmupId(v as WarmupId)}
                ariaLabel={t.warmup.label}
                options={WARMUP_EXERCISES.filter((ex) => ex.order <= 3).map((ex) => ({
                  value: ex.id,
                  label: `${ex.order}. ${lw(ex.name, locale)} · ${t.warmup.minutes.replace("{min}", String(ex.durationMin))}`,
                }))}
              />
              <p className="text-caption text-on-surface-variant">{t.warmup.hint}</p>
            </Card>
          )}
        </div>
      </section>

      {/* 3. Samples: ONE list, each sample with its coffee (D-05) */}
      <section aria-labelledby={`${fid}-sec-samples`} className="space-y-4">
        <div>
          <SectionTitle n={3} id={`${fid}-sec-samples`} className="mb-1">
            {t.newForm.samplesTitle}
          </SectionTitle>
          <p className="text-caption text-on-surface-variant">{t.newForm.samplesHelper}</p>
        </div>

        <datalist id="cata-coffee-countries">
          {countries.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>

        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="label-caps">
              {t.newForm.referenceTitle}
            </p>
            <p className="text-caption text-on-surface-variant">{t.newForm.referenceHelper}</p>
          </div>
          {referenceId !== null && (
            <button
              type="button"
              onClick={() => setReferenceId(null)}
              className="text-caption font-medium text-primary-container hover:underline shrink-0"
            >
              {t.newForm.referenceClear}
            </button>
          )}
        </div>

        {/* B1: how the reference is scored. Shown only once one is marked. */}
        {referenceId !== null && referenceExplanation({ mode: referenceMode, moduleKey: format }) === "descriptive" && (
          // S10 WP6 fix round (2): a descriptive session has no quality ratings, so nothing is pinned
          // and the mode choice does not exist: say only what the reference is for.
          <p className="text-caption text-on-surface-variant">{t.newForm.referenceMode.descriptiveHelp}</p>
        )}
        {referenceId !== null && referenceExplanation({ mode: referenceMode, moduleKey: format }) !== "descriptive" && (
          <fieldset className="space-y-1.5 border-0 p-0">
            <legend className="label-caps mb-1">
              {t.newForm.referenceMode.legend}
            </legend>
            <div
              role="radiogroup"
              aria-label={t.newForm.referenceMode.legend}
              className="flex flex-wrap gap-2"
            >
              {(
                [
                  { v: "anchor", l: t.newForm.referenceMode.anchor },
                  { v: "free", l: t.newForm.referenceMode.free },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  role="radio"
                  aria-checked={referenceMode === opt.v}
                  onClick={() => setReferenceMode(opt.v)}
                  className={
                    referenceMode === opt.v
                      ? "min-h-[44px] bg-primary-container text-on-primary rounded-pill px-4 py-2 text-caption font-medium"
                      : "min-h-[44px] border border-outline-variant text-on-surface rounded-pill px-4 py-2 text-caption hover:bg-surface-container transition-colors"
                  }
                >
                  {opt.l}
                </button>
              ))}
            </div>
            <p className="text-caption text-on-surface-variant">
              {referenceMode === "free"
                ? t.newForm.referenceMode.freeHelp
                : t.newForm.referenceMode.anchorHelp}
            </p>
          </fieldset>
        )}

        <p className="text-caption text-on-surface-variant">{t.newForm.samplesBlindHelper}</p>

        <div className="space-y-4">
          {samples.map((s, si) => {
            const coffee = coffees.find((c) => c.id === s.coffeeId);
            // A coffee card is shown under the first sample that uses it.
            const owns = !!coffee && ownerOf(samples, coffee.id) === s.id;
            const invalid = owns && invalidCoffeeId === coffee.id;
            const number = si + 1;
            const sampleName = `${t.newForm.sampleChip} ${number}`;
            const shareable = si > 0 ? shareableCoffees({ samples, coffees }, si) : [];
            return (
              <div
                key={s.id}
                ref={
                  owns
                    ? (el) => {
                        cardRefs.current[coffee.id] = el;
                      }
                    : undefined
                }
                role="group"
                aria-label={sampleName}
                // P2b (D-07): the card recipe (no shadow), through cardClasses() because the
                // element keeps its ref; an invalid sample takes the error border.
                className={`${cardClasses({ invalid })} space-y-4`}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="label-caps bg-surface-container rounded-pill px-3 py-1 text-on-surface">
                    {sampleName}
                  </span>
                  {/* The reference mark: a 44 px row around a 16 px radio. */}
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 px-2 text-caption font-medium text-on-surface">
                    <input
                      type="radio"
                      name="reference"
                      checked={referenceId === s.id}
                      onChange={() => setReferenceId(s.id)}
                      // An auto row has no label yet (the letter is drawn at
                      // creation): name it by its coffee, else by its row number.
                      aria-label={t.newForm.referenceMark.replace(
                        "{label}",
                        s.label.trim() || coffeeNameOf(s.coffeeId) || sampleName,
                      )}
                      className="h-4 w-4 accent-secondary cursor-pointer"
                    />
                    <span aria-hidden="true">{t.newForm.referenceBadge}</span>
                  </label>
                  <div className="flex-1" />
                  {owns && usableCoffees.length > 0 && !coffee.existingCoffeeId && (
                    <button
                      type="button"
                      onClick={() => setPickerFor(coffee.id)}
                      className="min-h-[44px] rounded-pill border border-primary-container px-3 py-1 text-caption font-medium text-primary-container hover:bg-primary-fixed transition-colors"
                    >
                      {t.picker.useExisting}
                    </button>
                  )}
                  {samples.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSample(s.id)}
                      aria-label={`${t.removeSample} ${sampleName.toLowerCase()}`}
                      className="inline-flex h-[44px] w-[44px] items-center justify-center rounded-pill text-on-surface-variant hover:text-error transition-colors"
                    >
                      <X size={16} aria-hidden />
                    </button>
                  )}
                </div>

                <div>
                  <FieldLabel htmlFor={`${fid}-${s.id}-label`} optionalText={t.newForm.optionalSuffix}>
                    {t.sampleLabel}
                  </FieldLabel>
                  <input
                    id={`${fid}-${s.id}-label`}
                    value={s.label}
                    onChange={(e) => updateSampleLabel(s.id, e.target.value)}
                    placeholder={t.newForm.sampleLabelAuto}
                    className={inputCls}
                  />
                </div>

                {shareable.length > 0 && (
                  <div>
                    <FieldLabel htmlFor={`${fid}-${s.id}-coffee`}>{t.sampleCoffee}</FieldLabel>
                    <select
                      id={`${fid}-${s.id}-coffee`}
                      value={owns ? "own" : s.coffeeId}
                      onChange={(e) => chooseSampleCoffee(s.id, e.target.value)}
                      className={inputCls + " cursor-pointer"}
                    >
                      <option value="own">{t.newForm.coffeeOwn}</option>
                      {shareable.map((o) => (
                        <option key={o.coffeeId} value={o.coffeeId}>
                          {t.newForm.coffeeSameAs.replace("{n}", String(o.sampleNumber))}
                          {o.name ? ` · ${o.name}` : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {owns && renderCoffee(coffee)}

                <SamplePrepFields
                  idPrefix={`prep-${s.id}`}
                  value={prepToForm({
                    roastDate: s.roastDate || null,
                    preparationNote: s.preparationNote || null,
                    offProtocol: s.offProtocol === true,
                    offProtocolNote: s.offProtocolNote || null,
                  })}
                  onChange={(patch) =>
                    setSamples((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...patch } : x)))
                  }
                  translations={t.newForm.samplePrep}
                />
              </div>
            );
          })}
        </div>

        <CoffeePicker
          open={pickerFor !== null}
          onOpenChange={(o) => !o && setPickerFor(null)}
          coffees={usableCoffees}
          onSelect={(picked) => {
            if (pickerFor) applyExistingCoffee(pickerFor, picked);
          }}
          translations={{
            title: t.picker.title,
            searchPlaceholder: t.picker.searchPlaceholder,
            mine: t.picker.mine,
            shared: t.picker.shared,
            public: t.picker.public,
            empty: t.picker.empty,
            close: t.picker.close,
          }}
        />

        {sampleWarning && (
          <p role="status" className="text-caption font-medium text-secondary">
            {t.newForm.sampleWarning[sampleWarning]}
          </p>
        )}

        <button
          type="button"
          onClick={addSample}
          className="min-h-[44px] border border-primary-container text-primary-container rounded-pill px-5 py-2.5 text-caption font-medium hover:bg-primary-fixed transition-colors"
        >
          + {t.addSample}
        </button>
      </section>

      {/* 4. Group session */}
      <section aria-labelledby={`${fid}-sec-group`} className="space-y-4">
        <SectionTitle n={4} id={`${fid}-sec-group`}>
          {t.newForm.sectionGroup}
        </SectionTitle>
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={isGroup}
            aria-labelledby={`${fid}-group`}
            onClick={() => setIsGroup((v) => !v)}
            // A 44 px box around the 39 x 21 track (F-03); the negative margin
            // keeps the row as it was.
            className="-my-[10px] -ml-[3px] inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center"
          >
            <span
              aria-hidden
              className={
                "relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors " +
                (isGroup ? "bg-primary-container" : "bg-outline-variant")
              }
            >
              <span
                className={
                  "inline-block h-5 w-5 transform rounded-full bg-surface-container-lowest shadow-card transition-transform " +
                  (isGroup ? "translate-x-5" : "translate-x-0.5")
                }
              />
            </span>
          </button>
          <span id={`${fid}-group`} className="text-body text-on-surface font-medium">{t.groupToggle}</span>
        </div>

        {isGroup && (
          <Card tone="quiet" padding="compact" className="space-y-4">
            <div>
              <FieldLabel htmlFor={fieldInputId("closesAt")}>{t.groupClosesAt}</FieldLabel>
              <input
                type="date"
                {...fieldProps("closesAt")}
                className={inputCls}
                value={closesAt}
                // "Today" in the owner's own zone; the server render is UTC,
                // so the attribute may differ at hydration.
                suppressHydrationWarning
                min={todayMin}
                max={LAST_CLOSING_DAY}
                onChange={(e) => setClosesAt(e.target.value)}
              />
              {fieldError("closesAt")}
              <p className="mt-1 text-caption text-on-surface-variant">{t.groupClosesAtHint}</p>
              {closesAt && (
                <p className="mt-1 text-caption font-medium text-secondary">{t.groupClosesAtLiveNotice}</p>
              )}
            </div>

            <div>
              <FieldLabel htmlFor={`${fid}-linked-group`}>{groupsT.linkGroupLabel}</FieldLabel>
              <select
                id={`${fid}-linked-group`}
                value={linkedGroupId}
                onChange={(e) => setLinkedGroupId(e.target.value)}
                className={inputCls + " cursor-pointer"}
              >
                <option value="">{groupsT.noGroupOption}</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} · {g.memberCount}
                  </option>
                ))}
              </select>
            </div>

            {linkedGroupId && (
              <label className="flex min-h-[44px] items-center gap-2.5 text-body text-on-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyGroup}
                  onChange={(e) => setNotifyGroup(e.target.checked)}
                  className="h-4 w-4 rounded accent-primary-container cursor-pointer"
                />
                {closesAt ? groupsT.autoInviteAsync : t.newForm.notifyWhen.checkbox}
              </label>
            )}

            {/* C8: only a LIVE session (no closing date) has a start to wait
                for; an async one is always announced at creation. */}
            {linkedGroupId && notifyGroup && !closesAt && (
              <fieldset className="space-y-1.5">
                <legend className="label-caps">
                  {t.newForm.notifyWhen.legend}
                </legend>
                <div role="radiogroup" aria-label={t.newForm.notifyWhen.legend} className="flex flex-wrap gap-2">
                  {(
                    [
                      { v: "create", l: t.newForm.notifyWhen.onCreate },
                      { v: "start", l: t.newForm.notifyWhen.onStart },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.v}
                      type="button"
                      role="radio"
                      aria-checked={notifyGroupWhen === opt.v}
                      onClick={() => setNotifyGroupWhen(opt.v)}
                      className={
                        notifyGroupWhen === opt.v
                          ? "min-h-[44px] bg-primary-container text-on-primary rounded-pill px-4 py-2 text-caption font-medium"
                          : "min-h-[44px] border border-outline-variant text-on-surface rounded-pill px-4 py-2 text-caption hover:bg-surface-container transition-colors"
                      }
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </fieldset>
            )}
          </Card>
        )}
      </section>

      {/* The one submit, docked (C-08), with the form's own error line. */}
      <FormActionBar
        status={
          <>
            {/* P2b (E-05): an error Notice; no role added (the bar's announcement is unchanged). */}
            {stripText && (
              <Notice tone="error" live={false}>
                {stripText}
              </Notice>
            )}
            {!online && t.newForm.errors.offline && (
              <p role="status" className="text-center text-body text-error">
                {t.newForm.errors.offline}
              </p>
            )}
          </>
        }
      >
        <button
          type="submit"
          disabled={pending || !online}
          className="bg-primary-container text-on-primary rounded-pill px-6 py-3.5 font-medium hover:bg-primary transition-colors disabled:opacity-50"
        >
          {isGroup ? t.newForm.startGroup : t.start}
        </button>
      </FormActionBar>
    </form>
  );
}
