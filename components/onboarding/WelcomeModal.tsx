"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardList, Coffee, Users, ChevronRight, ChevronLeft } from "lucide-react";
import { completeOnboarding } from "@/app/actions/profile";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-[480px] overflow-hidden">

        {/* Step 1 — Bienvenida */}
        {step === 1 && (
          <div className="p-8 flex flex-col items-center text-center gap-5">
            <span className="text-5xl">☕</span>
            <div className="space-y-2">
              <h1
                className="text-[28px] font-semibold leading-tight text-[#3D5A3E]"
                style={{ fontFamily: "var(--font-cormorant, Georgia, serif)" }}
              >
                Bienvenido a Cata Café Sensible
              </h1>
              <p className="text-sm font-medium text-[#5C4033]">
                La plataforma profesional para evaluadores SCA CVA
              </p>
              <p className="text-sm text-[#7a6a5a]">
                Evaluación descriptiva, afectiva y extrínseca siguiendo el protocolo CVA 2024.
              </p>
            </div>

            <Dots current={1} />

            <button
              onClick={() => setStep(2)}
              className="w-full bg-[#3D5A3E] text-white rounded-xl py-3 font-medium flex items-center justify-center gap-2 hover:bg-[#2e4530] transition-colors"
            >
              Comenzar <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleSkip}
              disabled={isPending}
              className="text-sm text-[#9e8e7e] hover:text-[#5C4033] transition-colors"
            >
              Omitir introducción
            </button>
          </div>
        )}

        {/* Step 2 — Tu perfil */}
        {step === 2 && (
          <div className="p-8 flex flex-col gap-5">
            <div>
              <h2
                className="text-2xl font-semibold text-[#3D5A3E]"
                style={{ fontFamily: "var(--font-cormorant, Georgia, serif)" }}
              >
                Cuéntanos sobre ti
              </h2>
            </div>

            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-[#5C4033] mb-1 block">
                  Nombre completo
                </span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Tu nombre"
                  className="w-full border border-[#d4c5b0] rounded-lg px-3 py-2 text-sm text-[#3a2e22] placeholder:text-[#b0a090] focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/30 focus:border-[#3D5A3E]"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-[#5C4033] mb-1 block">
                  Rol
                </span>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="w-full border border-[#d4c5b0] rounded-lg px-3 py-2 text-sm text-[#3a2e22] focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/30 focus:border-[#3D5A3E] bg-white"
                >
                  <option value="" disabled>Selecciona tu rol</option>
                  {ROLES.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-[#5C4033] mb-1 block">
                  País
                </span>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full border border-[#d4c5b0] rounded-lg px-3 py-2 text-sm text-[#3a2e22] focus:outline-none focus:ring-2 focus:ring-[#3D5A3E]/30 focus:border-[#3D5A3E] bg-white"
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
                className="flex items-center gap-1 px-4 py-3 text-sm text-[#5C4033] border border-[#d4c5b0] rounded-xl hover:bg-[#f5ede0] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
              <button
                onClick={() => setStep(3)}
                disabled={!displayName || !role || !country}
                className="flex-1 bg-[#3D5A3E] text-white rounded-xl py-3 font-medium flex items-center justify-center gap-2 hover:bg-[#2e4530] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Siguiente <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Step 3 — Primer paso */}
        {step === 3 && (
          <div className="p-8 flex flex-col gap-5">
            <div>
              <h2
                className="text-2xl font-semibold text-[#3D5A3E]"
                style={{ fontFamily: "var(--font-cormorant, Georgia, serif)" }}
              >
                ¿Por dónde empezar?
              </h2>
            </div>

            <div className="space-y-3">
              {PATHS.map((path) => {
                const Icon = path.icon;
                const isSelected = selectedPath === path.id;
                return (
                  <button
                    key={path.id}
                    onClick={() => setSelectedPath(path.id)}
                    className={`w-full text-left rounded-xl border-2 p-4 flex items-start gap-3 transition-all ${
                      isSelected
                        ? "border-[#3D5A3E] bg-[#E8F0E8]"
                        : "border-[#e0d4c0] bg-white hover:border-[#b0c4b0] hover:bg-[#f5f8f5]"
                    }`}
                  >
                    <div
                      className={`mt-0.5 p-1.5 rounded-lg ${
                        isSelected ? "bg-[#3D5A3E] text-white" : "bg-[#f0e8d8] text-[#5C4033]"
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <p className={`text-sm font-medium ${isSelected ? "text-[#3D5A3E]" : "text-[#3a2e22]"}`}>
                        {path.label}
                      </p>
                      <p className="text-xs text-[#7a6a5a] mt-0.5">{path.description}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            <Dots current={3} />

            <div className="flex gap-3">
              <button
                onClick={() => setStep(2)}
                className="flex items-center gap-1 px-4 py-3 text-sm text-[#5C4033] border border-[#d4c5b0] rounded-xl hover:bg-[#f5ede0] transition-colors"
              >
                <ChevronLeft className="w-4 h-4" /> Atrás
              </button>
              <button
                onClick={handleFinish}
                disabled={!selectedPath || isPending}
                className="flex-1 bg-[#3D5A3E] text-white rounded-xl py-3 font-medium flex items-center justify-center gap-2 hover:bg-[#2e4530] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
            n === current ? "bg-[#3D5A3E]" : "bg-[#d4c5b0]"
          }`}
        />
      ))}
    </div>
  );
}
