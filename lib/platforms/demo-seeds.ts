/**
 * One-click seed catalog for the Demo Links section: CaneyCloud's guided
 * tours, deep-linked via the in-app `?guia=<id>` autostart (Teaching Mode,
 * --TOURISM-- TASK-FE-014/020). The links require a CaneyCloud login first —
 * the tour starts right after — so every entry names the Posada Bolívar
 * demo account alongside the link.
 */

const CANEY_URL = process.env.PLATFORM_CANEY_URL ?? "https://caneycloud.com";

const DEMO_ACCOUNT = {
  username: "owner@posadabolivar.example",
  // Plaintext by design for demo accounts; the real value is set by the
  // staging seed. Keep anything sensitive in the vault instead.
  password: null as string | null,
  accessNotes:
    "Inicia sesión con la cuenta demo Posada Bolívar primero — el tour arranca solo al cargar. Contraseña: ver Vault → Demo accounts (la fija el seed de staging).",
};

export type DemoSeed = {
  platformId: string;
  label: string;
  description: string;
  url: string;
  username: string | null;
  password: string | null;
  accessNotes: string;
  sortOrder: number;
};

export const CANEY_DEMO_SEEDS: DemoSeed[] = [
  {
    platformId: "caneycloud",
    label: "Demo rápido (5 min, sin tecnicismos)",
    description:
      "Para prospectos sin experiencia tecnológica: qué es CaneyCloud y qué le resuelve, en su idioma. El mejor primer link para WhatsApp.",
    url: `${CANEY_URL}/today?guia=demo-rapido`,
    sortOrder: 0,
    ...DEMO_ACCOUNT,
  },
  {
    platformId: "caneycloud",
    label: "Demo completo (8 min, toda la plataforma)",
    description:
      "Recorrido de alto nivel por los 17 módulos: operación, reservas, POS, precios, canales, WhatsApp IA, CRM y finanzas.",
    url: `${CANEY_URL}/today?guia=demo-completo`,
    sortOrder: 1,
    ...DEMO_ACCOUNT,
  },
  {
    platformId: "caneycloud",
    label: "Entrenamiento maestro (20 min, owner/manager)",
    description:
      "Configuración end-to-end + un día completo simulado + ajustes del día a día. Para dueños evaluando en serio.",
    url: `${CANEY_URL}/today?guia=entrenamiento-maestro`,
    sortOrder: 2,
    ...DEMO_ACCOUNT,
  },
  {
    platformId: "caneycloud",
    label: "Entrenamiento de recepción (12 min)",
    description:
      "El turno completo de front-desk: llegadas, caminantes, consumos, mensajes y salidas. Para entrenar al equipo del cliente.",
    url: `${CANEY_URL}/today?guia=entrenamiento-recepcion`,
    sortOrder: 3,
    ...DEMO_ACCOUNT,
  },
  {
    platformId: "caneycloud",
    label: "Entrenamiento de finanzas (10 min)",
    description:
      "El circuito del dinero: panel de finanzas, tasa BCV, cobros pendientes, gastos y cuadre del día. Para contadores.",
    url: `${CANEY_URL}/today?guia=entrenamiento-finanzas`,
    sortOrder: 4,
    ...DEMO_ACCOUNT,
  },
];
