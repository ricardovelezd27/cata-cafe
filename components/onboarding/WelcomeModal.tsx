"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Coffee, Users, ChevronRight, ChevronLeft } from "lucide-react";
import { completeOnboarding } from "@/app/actions/profile";

// NOTE: this list drives ONBOARDING CHOICES (values + prompt copy), a separate
// concern from display labels shown elsewhere (profile, co-cupper cards, etc).
// For display labels of a Profile's `role` field, see lib/constants.ts ROLE_LABELS.
const ROLES = [
  { value: "q_grader", label: "Catador/a Certificado/a Q" },
  { value: "barista", label: "Barista" },
  { value: "roaster", label: "Tostador/a" },
  { value: "producer", label: "Productor/a" },
  { value: "trader", label: "Importador/a / Exportador/a" },
  { value: "enthusiast", label: "Aficionado/a al café de especialidad" },
];

const COUNTRIES = [
  "Colombia", "Brasil", "México", "Guatemala", "Costa Rica", "Honduras",
  "Perú", "Bolivia", "Ecuador", "El Salvador", "Nicaragua", "Panamá",
  "Venezuela", "Cuba", "República Dominicana", "Etiopía", "Kenia",
  "Ruanda", "Uganda", "Tanzania", "Yemen", "India", "Indonesia",
  "Papúa Nueva Guinea", "Jamaica", "Estados Unidos", "España",
  "Alemania", "Japón", "Reino Unido", "Francia", "Italia", "Australia",
  "Otro",
];

const PATHS = [
  {
    id: "session",
    label: "Crear mi primera sesión CVA",
    description: "Inicia una evaluación descriptiva o afectiva",
    icon: ClipboardList,
    href: "/app/sessions/new",
  },
  {
    id: "coffee",
    label: "Añadir un café a mi biblioteca",
    description: "Registra un café y sus atributos extrínsecos",
    icon: Coffee,
    href: "/app/coffees",
  },
  {
    id: "join",
    label: "Unirme a una sesión",
    description: "Tengo un código de invitación",
    icon: Users,
    href: "/app/sessions",
  },
];

const inputClass =
  "w-full border border-outline-variant rounded-input px-3 py-2 text-sm text-on-surface placeholder:text-on-surface-variant/60 bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary-container/25 focus:border-primary-container transition-colors";

interface WelcomeModalProps {
  locale: string;
  initialDisplayName: string;
}

export default function WelcomeModal({ locale, initialDisplayName }: WelcomeModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [displayName, setDisplayName] = useState(initialDisplayName);
  const [role, setRole] = useState("");
  const [country, setCountry] = useState("");
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  function handleSkip() {
    startTransition(async () => {
      await completeOnboarding({
        displayName: displayName || initialDisplayName,
        role: role || "enthusiast",
        country: country || "",
      });
      router.refresh();
    });
  }

  function handleFinish() {
    if (!selectedPath) return;
    const path = PATHS.find((p) => p.id === selectedPath);
    if (!path) return;
    startTransition(async () => {
      await completeOnboarding({ displayName, role, country });
      router.push(`/${locale}${path.href}`);
    });
  }

  const selectedPathLabel = PATHS.find((p) => p.id === selectedPath)?.label ?? "";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-inverse-surface/60">
      <div className="bg-surface-container-lowest rounded-card shadow-card-lg w-full max-w-[480px] overflow-hidden">

        {/* Step 1 — Bienvenida */}
        {step === 1 && (
          <div className="p-8 flex flex-col items-center text-center gap-5">
            <span className="text-5xl">☕</span>
            <div className="space-y-2">
              <h1 className="font-display text-[28px] font-medium leading-tight text-primary-container">
                Bienvenido a Cata Café Sensible
              </h1>
              <p className="text-sm font-medium text-on-surface">
                La plataforma profesional para evaluadores SCA CVA
              </p>
              <p className="text-sm text-on-surface-variant">
                Evaluación descriptiva, afectiva y extrínseca siguiendo el protocolo CVA 2024.
              </p>
            </div>

            <Dots current={1} />

            <button
              onClick={() => setStep(2)}
              className="w-full bg-primary-container text-on-primary rounded-pill py-3 font-medium flex items-center justify-center gap-2 hover:bg-primary transition-colors"
            >
              Comenzar <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleSkip}
              disabled={isPending}
              className="text-sm text-on-surface-variant hover:text-on-surface transition-colors"
            >
              Omitir introducción
            </button>
          </div>
        )}

        {/* Step 2 — Tu perfil */}
        {step === 2 && (
          <div className="p-8 flex flex-col gap-5">
            <h2 className="font-display text-2xl font-medium text-primary-container">
              Cuéntanos sobre ti
            </h2>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-on-surface mb-1 block">
                  Nombre completo
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Tu nombre"
                  className={inputClass}
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-on-surface mb-1 block">
                  Rol
                </span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>Selecciona tu rol</option>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-on-surface mb-1 block">
                  País
                </span>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>Selecciona tu país</option>
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </label>
            </div>

            <Dots current={2} />

            <div className="flex gap-3">
              <button
                onClick={() => setStep(1)}
                className="flex items-center gap-1 px-4 py-3 text-sm text-on-surface border border-outline-variant rounded-pill hover:bg-surface-container transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!displayName || !role || !country}
                className="flex-1 bg-primary-container text-on-primary rounded-pill py-3 font-medium flex items-center justify-center gap-2 hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Primer paso */}
        {step === 3 && (
          <div className="p-8 flex flex-col gap-5">
            <h2 className="font-display text-2xl font-medium text-primary-container">
              ¿Por dónde empezar?
            </h2>

            <div className="space-y-3">
              {PATHS.map((path) => {
                const Icon = path.icon;
                const isSelected = selectedPath === path.id;
                return (
                  <button
                    key={path.id}
                    onClick={() => setSelectedPath(path.id)}
                    className={`w-full text-left rounded-card border-2 p-4 flex items-start gap-3 transition-all ${
                      isSelected
                        ? "border-primary-container bg-primary-fixed"
                        : "border-outline-variant bg-surface-container-lowest hover:border-outline hover:bg-surface-container-low"
                    }`}
                  >
                    <div
                      className={`mt-0.5 p-1.5 rounded-sm ${
                        isSelected
                          ? "bg-primary-container text-on-primary"
                          : "bg-surface-container text-on-surface-variant"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? "text-primary-container" : "text-on-surface"}`}>
                        {path.label}
                      </p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{path.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <Dots current={3} />

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1 px-4 py-3 text-sm text-on-surface border border-outline-variant rounded-pill hover:bg-surface-container transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
              <button
                onClick={handleFinish}
                disabled={!selectedPath || isPending}
                className="flex-1 bg-primary-container text-on-primary rounded-pill py-3 font-medium flex items-center justify-center gap-2 hover:bg-primary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? "Guardando…" : `Ir a ${selectedPathLabel}`}
                {!isPending && <ChevronRight className="w-4 h-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Dots({ current }: { current: 1 | 2 | 3 }) {
  return (
    <div className="flex gap-2 justify-center">
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className={`w-2 h-2 rounded-full transition-colors ${
            n === current ? "bg-primary-container" : "bg-outline-variant"
          }`}
        />
      ))}
    </div>
  );
}
