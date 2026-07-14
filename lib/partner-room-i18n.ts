// ─────────────────────────────────────────────────────────────────────────────
// Partner-room internationalization.
//
// One dictionary per guest-facing language. The room's `locale` column selects
// which dictionary renders. To ADD A LANGUAGE: (1) add its code to the
// `room_locale` pg enum + a migration, (2) add an entry to ROOM_LOCALE_OPTIONS
// below, (3) add a `<code>: { … }` dictionary matching the RoomDict shape. The
// CRM language dropdown and everything downstream pick it up automatically.
//
// `es` is the canonical shape (RoomDict = typeof es); every other dictionary is
// typed `RoomDict`, so TypeScript fails the build if a key is missing or a
// plural/interpolation signature drifts. That's the guarantee against half-
// translated UI.
// ─────────────────────────────────────────────────────────────────────────────

export const ROOM_LOCALE_OPTIONS = [
  { value: "es", label: "Español", englishName: "Spanish", flag: "🇪🇸", intl: "es-VE" },
  { value: "en", label: "English", englishName: "English", flag: "🇬🇧", intl: "en-US" },
] as const;

export type RoomLocale = (typeof ROOM_LOCALE_OPTIONS)[number]["value"];

export function resolveRoomLocale(value: string | null | undefined): RoomLocale {
  return ROOM_LOCALE_OPTIONS.some((o) => o.value === value)
    ? (value as RoomLocale)
    : "es";
}

/** BCP-47 tag for Intl/toLocale* formatting in the given room locale. */
export function roomIntlLocale(locale: string | null | undefined): string {
  return ROOM_LOCALE_OPTIONS.find((o) => o.value === resolveRoomLocale(locale))!.intl;
}

const es = {
  meta: {
    privateRoomTitle: "Sala privada",
    description:
      "Documentos, novedades y una línea directa con el equipo — todo en tu sala privada.",
    ogSiteName: "Sala privada",
  },
  common: {
    team: "El equipo",
    you: "Tú",
    close: "Cerrar",
    cancel: "Cancelar",
    continue: "Continuar",
    back: "Atrás",
    open: "Abrir",
  },
  partner: {
    // The single outward relationship label a guest ever sees (hero eyebrow).
    publicLabel: "Aliado",
  },
  hero: {
    eyebrow: "Sala privada",
    subline: "El equipo está atento a tu sala",
    welcomeFallback:
      "Todo lo que estamos trabajando juntos vive aquí — documentos, novedades y una línea directa con el equipo. Estás en tu casa.",
    updated: (rel: string) => `Actualizado ${rel}`,
  },
  greeting: {
    morning: "Buenos días",
    afternoon: "Buenas tardes",
    evening: "Buenas noches",
    neutral: "Te damos la bienvenida",
    withName: (lead: string, name: string) => `${lead}, ${name}`,
  },
  messagesCta: {
    lastMessagePrefix: "Último mensaje",
    emptyTitle: "¿Preguntas o ideas? Escríbenos.",
    emptySub: "El equipo responde aquí mismo, en tu sala.",
    reply: "Responder",
    write: "Escribir",
  },
  messages: {
    title: "Mensajes",
    subtitle: "Preguntas, notas y novedades entre tú y el equipo.",
    empty: "Aún no hay mensajes. Aquí van tus preguntas o notas para el equipo.",
    unreadDivider: "Nuevos desde tu última visita",
    sending: "enviando…",
    notSent: "no enviado",
    retry: "Reintentar",
    placeholder: "Escribe un mensaje… @ para mencionar",
    inputAria: "Mensaje para el equipo",
    sendAria: "Enviar mensaje",
    sendFailed: "No se pudo enviar. Inténtalo de nuevo.",
    sendFailedNetwork: "No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.",
  },
  decks: {
    title: "Presentaciones",
    subtitle: "Toca para abrir en pantalla completa.",
    fallback: "Presentación",
    view: "Ver",
    previewAria: (title: string) => `Vista previa · ${title}`,
  },
  repo: {
    title: "Repositorio",
    subtitle:
      "Todo lo compartido contigo, organizado por sección — y un buzón para enviarnos lo tuyo.",
    empty: "Aún no hay nada aquí. Los nuevos documentos y enlaces aparecerán en este espacio.",
    open: "Abrir",
    viewDeck: "Ver presentación",
    download: "Descargar",
    projectFallback: "Proyecto",
    zoomAria: (title: string) => `Ampliar ${title}`,
    signatureRequired: "Firma requerida",
    signNow: "Firmar ahora",
    signedDocDownload: "Documento firmado",
    signedBy: (signer: string | null, when: string | null) =>
      `Firmado${signer ? ` por ${signer}` : ""}${when ? ` · ${when}` : ""}`,
    uploadSection: "Enviar archivos",
    uploadHint: "Envía documentos al equipo — contratos, firmas, recursos.",
    previouslySent: "Enviados anteriormente",
    kind: {
      file: "Documento",
      link: "Enlace",
      doc: "Documento",
      note: "Nota",
      default: "Documento",
    },
    section: {
      documentos: "Documentos",
      contratos: "Contratos & Legal",
      contenido: "Contenido & Media",
      finanzas: "Finanzas",
      marca: "Marca & Diseño",
      informes: "Informes",
    },
  },
  upload: {
    choosePrompt: "Haz clic para elegir un archivo",
    acceptHint: "PDF, Word, Excel, imágenes, ZIP — máx. 25 MB",
    labelPlaceholder: "Etiqueta (opcional) p. ej. NDA firmado",
    notePlaceholder: "Nota para el equipo (opcional)",
    submit: "Enviar archivo",
    tooLarge: (max: string) => `El archivo es muy grande. Máximo ${max}.`,
    typeNotAllowed: (exts: string) => `Tipo de archivo no permitido. Aceptamos: ${exts}`,
    signFailed: "No se pudo preparar la carga",
    finalizeFailed: "No se pudo guardar el archivo. Intenta de nuevo.",
    genericFailed: "La carga falló",
    sentSuffix: (filename: string) => `${filename} enviado`,
  },
  nextSteps: {
    title: "Próximos pasos",
    markHint: "Marca lo que ya completaste.",
    empty: "Aún no hay próximos pasos. Aquí verás lo que sigue.",
    allDone: "¡Todo al día!",
    done: "Hecho",
    markPending: "Marcar como pendiente",
    markDone: "Marcar como hecho",
    saveError: "No se pudo guardar el cambio. Intenta de nuevo.",
    pendingBadge: (n: number) => `${n} ${n === 1 ? "pendiente" : "pendientes"}`,
    overdue: "Vencido",
    due: "Para",
    assignee: {
      partner: "Para ti",
      owner: "El equipo",
      both: "Ambos",
      default: "Para ti",
    },
  },
  people: {
    title: "La alianza",
    subtitle: "Las personas trabajando juntas en este espacio.",
    team: "Nuestro equipo",
    teamPhotoAlt: "Foto del equipo",
    contactFallback: "Tu contacto",
    guests: "Invitados",
    guestFallback: "Invitado",
    youParen: "(tú)",
    onlineNow: "en línea ahora",
    activeAgo: (rel: string) => `activo ${rel}`,
  },
  cobrand: {
    clientLogoAlt: (name: string | null) => (name ? `${name} logo` : "Logo del cliente"),
    brandLogoAlt: (title: string) => `${title} logo`,
  },
  chips: {
    steps: (n: number): string => (n === 1 ? "paso para ti" : "pasos para ti"),
    signatures: (n: number): string =>
      n === 1 ? "firma pendiente" : "firmas pendientes",
  },
  comments: {
    commentCta: "Comentar",
    count: (n: number) => `${n} ${n === 1 ? "comentario" : "comentarios"}`,
    guestFallback: "Invitado",
    placeholder: "Escribe un comentario…",
    inputAria: "Escribe un comentario",
    sendAria: "Enviar comentario",
    deleteAria: "Eliminar comentario",
    sendError: "No se pudo enviar el comentario. Intenta de nuevo.",
  },
  demo: {
    credsHeading: "Tu cuenta de demostración",
    username: "Usuario",
    password: "Contraseña",
    openCta: "Abrir el demo",
    copy: "Copiar",
    reveal: "Mostrar",
    copied: "Copiado",
    copyAria: (label: string) => `Copiar ${label}`,
  },
  signin: {
    tapToContinue: "Toca para continuar",
    opening: "Abriendo la sala…",
    mute: "Silenciar",
    unmute: "Reproducir sonido",
    bolivarAttribution: "Simón Bolívar",
    pinPrompt: "Ingresa tu código de 4 dígitos.",
    pinAria: "Código de acceso de 4 dígitos",
    pinMismatch: "Ese código no coincide.",
    genericError: "Algo salió mal. Inténtalo de nuevo.",
    ready: "Listo…",
    checking: "Verificando…",
    identityPrompt: "Confirma quién eres para entrar.",
    seatsLeft: (n: number) =>
      ` ${n} ${n === 1 ? "cupo disponible" : "cupos disponibles"}.`,
    nameSelectAria: "Elige tu nombre",
    notInList: "No estoy en la lista…",
    namePlaceholder: "Tu nombre",
    emailPlaceholder: "nombre@empresa.com",
    emailAria: "Tu correo",
    entering: "Entrando…",
    enter: "Entrar a la sala",
    identityError: "No pudimos registrarte.",
    identityErrorRetry: "No pudimos registrarte. Inténtalo de nuevo.",
  },
  sign: {
    eyebrow: "Firma electrónica",
    dialogAria: (title: string) => `Firmar ${title}`,
    drawFirst: "Dibuja tu firma para continuar.",
    nameRequired: "Escribe tu nombre completo.",
    consentRequired: "Confirma que aceptas firmar electrónicamente.",
    registerFailed: "No se pudo registrar la firma. Intenta de nuevo.",
    networkError: "Sin conexión. Revisa tu internet e intenta de nuevo.",
    loadingDoc: "Cargando documento…",
    pageLimit: (n: number) => `Mostrando las primeras ${n} páginas.`,
    tapToPlace: "Toca el documento donde va tu firma",
    signThisDoc: "Firmar este documento",
    size: "Tamaño",
    drawAgain: "Dibujar de nuevo",
    confirmPosition: "Confirmar posición",
    dragHint: "Arrastra la firma para ajustar dónde queda.",
    registering: "Registrando firma…",
    signDoc: "Firmar documento",
    serverTimestamp: "La fecha y hora de la firma las registra el servidor.",
    signatureAlt: "Tu firma",
    drawLabel: "Dibuja tu firma",
    clear: "Borrar",
    fullNameLabel: "Tu nombre completo",
    fullNamePlaceholder: "Nombre y apellido",
    consentText:
      "Acepto firmar este documento electrónicamente. Entiendo que mi firma, nombre, y la fecha y hora del servidor quedarán registrados como constancia de mi consentimiento.",
  },
  deckViewer: {
    back: "Volver",
    open: "Abrir",
  },
  deckPage: {
    unavailable: "Esta presentación no está disponible.",
    backToRoom: "Volver a tu sala",
    deckFallback: "Presentación",
  },
  pdf: {
    openAria: (title: string) => `Abrir ${title}`,
  },
  footer: {
    bolivarQuote: "Dios concede la victoria a la perseverancia",
    bolivarAttribution: "Simón Bolívar",
    confidential: "Privado y confidencial — compartido solo contigo.",
    noForward: "Esta sala es privada. Por favor, no reenvíes el enlace.",
  },
  unavailable: {
    title: "Acceso no disponible",
    body: "Esta sala pudo haber expirado, estar en pausa o haber sido reemplazada por un nuevo enlace. Pide a quien te lo compartió el enlace más reciente.",
  },
  date: {
    today: "Hoy",
    yesterday: "Ayer",
  },
  // Guest-facing error messages returned by the /api/access/* routes. Surfaced
  // in the room UI (sign-in gate, toasts), so they follow the room's language.
  api: {
    roomNotFound: "Sala no encontrada o acceso expirado",
    roomLocked: "La sala está bloqueada",
    invalidRequest: "Solicitud inválida",
    invalidUploadPath: "Ruta de carga inválida",
    validEmail: "Ingresa un correo válido",
    signInBurst: "Demasiados registros a la vez. Espera un momento.",
    signInFailed: "No pudimos registrarte",
    seatFull: "La sala está llena. Pide al anfitrión que agregue un cupo.",
    nameRequired: "Por favor ingresa tu nombre",
    pinRequired: "Ingresa el código de 4 dígitos",
    tooManyAttempts: "Demasiados intentos. Inténtalo en unos minutos.",
    pinMismatch: "Ese código no coincide. Inténtalo de nuevo.",
    commentRequired: "Escribe un comentario primero",
    commentRateLimit: "Estás comentando muy rápido. Espera un momento.",
    itemNotInRoom: "Ese elemento no está en esta sala",
    messageRequired: "Escribe un mensaje primero",
    messageRateLimit: "Estás enviando mensajes muy rápido. Espera un momento.",
    stepNotFound: "Ese paso no existe",
    signBurst: "Demasiados intentos. Espera un momento.",
    signUnavailable: "Esta solicitud de firma ya no está disponible.",
    signInvalid: "La firma no es válida. Dibuja tu firma e intenta de nuevo.",
    signSaveFailed: "No se pudo guardar la firma. Intenta de nuevo.",
    docLoadFailed: "No se pudo cargar el documento",
    fileTypeNotAllowed: "Tipo de archivo no permitido",
    uploadBurst: "Demasiadas cargas a la vez. Espera un momento e intenta de nuevo.",
    uploadNotFound: "No se encontró la carga — intenta de nuevo",
    unknownAction: "Acción desconocida",
  },
  rel: {
    never: "nunca",
    today: "hoy",
    yesterday: "ayer",
    daysAgo: (n: number) => `hace ${n} días`,
    weeksAgo: (n: number) => (n === 1 ? "hace 1 semana" : `hace ${n} semanas`),
    monthsAgo: (n: number) => (n === 1 ? "hace 1 mes" : `hace ${n} meses`),
    yearsAgo: (n: number) => (n === 1 ? "hace 1 año" : `hace ${n} años`),
  },
  // NOTE: no `as const` — string values must widen to `string` so the `en`
  // dictionary (typed RoomDict) type-checks. `es` is the canonical shape; every
  // other locale is checked structurally against it.
};

export type RoomDict = typeof es;

const en: RoomDict = {
  meta: {
    privateRoomTitle: "Private room",
    description:
      "Documents, updates, and a direct line to the team — all in your private room.",
    ogSiteName: "Private room",
  },
  common: {
    team: "The team",
    you: "You",
    close: "Close",
    cancel: "Cancel",
    continue: "Continue",
    back: "Back",
    open: "Open",
  },
  partner: {
    publicLabel: "Partner",
  },
  hero: {
    eyebrow: "Private room",
    subline: "The team is watching your room",
    welcomeFallback:
      "Everything we're working on together lives here — documents, updates, and a direct line to the team. Make yourself at home.",
    updated: (rel: string) => `Updated ${rel}`,
  },
  greeting: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    neutral: "Welcome",
    withName: (lead: string, name: string) => `${lead}, ${name}`,
  },
  messagesCta: {
    lastMessagePrefix: "Latest message",
    emptyTitle: "Questions or ideas? Write to us.",
    emptySub: "The team replies right here, in your room.",
    reply: "Reply",
    write: "Write",
  },
  messages: {
    title: "Messages",
    subtitle: "Questions, notes, and updates between you and the team.",
    empty: "No messages yet. Your questions or notes for the team go here.",
    unreadDivider: "New since your last visit",
    sending: "sending…",
    notSent: "not sent",
    retry: "Retry",
    placeholder: "Write a message… @ to mention",
    inputAria: "Message for the team",
    sendAria: "Send message",
    sendFailed: "Couldn't send. Please try again.",
    sendFailedNetwork: "Couldn't send. Check your connection and try again.",
  },
  decks: {
    title: "Presentations",
    subtitle: "Tap to open full screen.",
    fallback: "Presentation",
    view: "View",
    previewAria: (title: string) => `Preview · ${title}`,
  },
  repo: {
    title: "Repository",
    subtitle:
      "Everything shared with you, organized by section — plus an inbox to send us yours.",
    empty: "Nothing here yet. New documents and links will appear in this space.",
    open: "Open",
    viewDeck: "View presentation",
    download: "Download",
    projectFallback: "Project",
    zoomAria: (title: string) => `Zoom ${title}`,
    signatureRequired: "Signature required",
    signNow: "Sign now",
    signedDocDownload: "Signed document",
    signedBy: (signer: string | null, when: string | null) =>
      `Signed${signer ? ` by ${signer}` : ""}${when ? ` · ${when}` : ""}`,
    uploadSection: "Send files",
    uploadHint: "Send documents to the team — contracts, signatures, resources.",
    previouslySent: "Sent previously",
    kind: {
      file: "Document",
      link: "Link",
      doc: "Document",
      note: "Note",
      default: "Document",
    },
    section: {
      documentos: "Documents",
      contratos: "Contracts & Legal",
      contenido: "Content & Media",
      finanzas: "Finance",
      marca: "Brand & Design",
      informes: "Reports",
    },
  },
  upload: {
    choosePrompt: "Click to choose a file",
    acceptHint: "PDF, Word, Excel, images, ZIP — max 25 MB",
    labelPlaceholder: "Label (optional) e.g. signed NDA",
    notePlaceholder: "Note for the team (optional)",
    submit: "Send file",
    tooLarge: (max: string) => `That file is too large. Maximum ${max}.`,
    typeNotAllowed: (exts: string) => `File type not allowed. We accept: ${exts}`,
    signFailed: "Couldn't prepare the upload",
    finalizeFailed: "Couldn't save the file. Please try again.",
    genericFailed: "Upload failed",
    sentSuffix: (filename: string) => `${filename} sent`,
  },
  nextSteps: {
    title: "Next steps",
    markHint: "Check off what you've already completed.",
    empty: "No next steps yet. What's coming up will show here.",
    allDone: "All caught up!",
    done: "Done",
    markPending: "Mark as pending",
    markDone: "Mark as done",
    saveError: "Couldn't save the change. Please try again.",
    pendingBadge: (n: number) => `${n} pending`,
    overdue: "Overdue",
    due: "Due",
    assignee: {
      partner: "For you",
      owner: "The team",
      both: "Both",
      default: "For you",
    },
  },
  people: {
    title: "The alliance",
    subtitle: "The people working together in this space.",
    team: "Our team",
    teamPhotoAlt: "Team photo",
    contactFallback: "Your contact",
    guests: "Guests",
    guestFallback: "Guest",
    youParen: "(you)",
    onlineNow: "online now",
    activeAgo: (rel: string) => `active ${rel}`,
  },
  cobrand: {
    clientLogoAlt: (name: string | null) => (name ? `${name} logo` : "Client logo"),
    brandLogoAlt: (title: string) => `${title} logo`,
  },
  chips: {
    steps: (n: number) => (n === 1 ? "step for you" : "steps for you"),
    signatures: (n: number) => (n === 1 ? "pending signature" : "pending signatures"),
  },
  comments: {
    commentCta: "Comment",
    count: (n: number) => `${n} ${n === 1 ? "comment" : "comments"}`,
    guestFallback: "Guest",
    placeholder: "Write a comment…",
    inputAria: "Write a comment",
    sendAria: "Send comment",
    deleteAria: "Delete comment",
    sendError: "Couldn't send the comment. Please try again.",
  },
  demo: {
    credsHeading: "Your demo account",
    username: "Username",
    password: "Password",
    openCta: "Launch demo",
    copy: "Copy",
    reveal: "Show",
    copied: "Copied",
    copyAria: (label: string) => `Copy ${label}`,
  },
  signin: {
    tapToContinue: "Tap to continue",
    opening: "Opening your room…",
    mute: "Mute",
    unmute: "Play sound",
    bolivarAttribution: "Simón Bolívar",
    pinPrompt: "Enter your 4-digit code.",
    pinAria: "4-digit access code",
    pinMismatch: "That code doesn't match.",
    genericError: "Something went wrong. Please try again.",
    ready: "Ready…",
    checking: "Checking…",
    identityPrompt: "Confirm who you are to enter.",
    seatsLeft: (n: number) => ` ${n} ${n === 1 ? "seat available" : "seats available"}.`,
    nameSelectAria: "Choose your name",
    notInList: "I'm not on the list…",
    namePlaceholder: "Your name",
    emailPlaceholder: "name@company.com",
    emailAria: "Your email",
    entering: "Entering…",
    enter: "Enter the room",
    identityError: "We couldn't sign you in.",
    identityErrorRetry: "We couldn't sign you in. Please try again.",
  },
  sign: {
    eyebrow: "Electronic signature",
    dialogAria: (title: string) => `Sign ${title}`,
    drawFirst: "Draw your signature to continue.",
    nameRequired: "Enter your full name.",
    consentRequired: "Confirm that you agree to sign electronically.",
    registerFailed: "Couldn't register the signature. Please try again.",
    networkError: "You're offline. Check your internet and try again.",
    loadingDoc: "Loading document…",
    pageLimit: (n: number) => `Showing the first ${n} pages.`,
    tapToPlace: "Tap the document where your signature goes",
    signThisDoc: "Sign this document",
    size: "Size",
    drawAgain: "Draw again",
    confirmPosition: "Confirm position",
    dragHint: "Drag the signature to adjust where it lands.",
    registering: "Registering signature…",
    signDoc: "Sign document",
    serverTimestamp: "The signature's date and time are recorded by the server.",
    signatureAlt: "Your signature",
    drawLabel: "Draw your signature",
    clear: "Clear",
    fullNameLabel: "Your full name",
    fullNamePlaceholder: "First and last name",
    consentText:
      "I agree to sign this document electronically. I understand that my signature, name, and the server's date and time will be recorded as evidence of my consent.",
  },
  deckViewer: {
    back: "Back",
    open: "Open",
  },
  deckPage: {
    unavailable: "This presentation isn't available.",
    backToRoom: "Back to your room",
    deckFallback: "Presentation",
  },
  pdf: {
    openAria: (title: string) => `Open ${title}`,
  },
  footer: {
    bolivarQuote: "God grants victory to perseverance",
    bolivarAttribution: "Simón Bolívar",
    confidential: "Private and confidential — shared only with you.",
    noForward: "This room is private. Please don't forward the link.",
  },
  unavailable: {
    title: "Access unavailable",
    body: "This room may have expired, been paused, or been replaced by a new link. Ask whoever shared it for the most recent link.",
  },
  date: {
    today: "Today",
    yesterday: "Yesterday",
  },
  api: {
    roomNotFound: "Room not found or access expired",
    roomLocked: "Room is locked",
    invalidRequest: "Invalid request",
    invalidUploadPath: "Invalid upload path",
    validEmail: "Enter a valid email",
    signInBurst: "Too many sign-ins at once. Wait a moment.",
    signInFailed: "We couldn't sign you in",
    seatFull: "The room is full. Ask the host to add a seat.",
    nameRequired: "Please enter your name",
    pinRequired: "Enter the 4-digit code",
    tooManyAttempts: "Too many attempts. Try again in a few minutes.",
    pinMismatch: "That code doesn't match. Try again.",
    commentRequired: "Write a comment first",
    commentRateLimit: "You're commenting too fast. Wait a moment.",
    itemNotInRoom: "That item isn't in this room",
    messageRequired: "Write a message first",
    messageRateLimit: "You're sending messages too fast. Wait a moment.",
    stepNotFound: "Step not found",
    signBurst: "Too many attempts. Wait a moment.",
    signUnavailable: "This signature request is no longer available.",
    signInvalid: "The signature isn't valid. Draw your signature and try again.",
    signSaveFailed: "Couldn't save the signature. Try again.",
    docLoadFailed: "Couldn't load the document",
    fileTypeNotAllowed: "File type not allowed",
    uploadBurst: "Too many uploads at once. Wait a moment and try again.",
    uploadNotFound: "Upload not found in storage — try again",
    unknownAction: "Unknown action",
  },
  rel: {
    never: "never",
    today: "today",
    yesterday: "yesterday",
    daysAgo: (n: number) => `${n}d ago`,
    weeksAgo: (n: number) => `${n}w ago`,
    monthsAgo: (n: number) => `${n}mo ago`,
    yearsAgo: (n: number) => `${n}y ago`,
  },
};

export const ROOM_DICTS: Record<RoomLocale, RoomDict> = { es, en };

export function getRoomDict(locale: string | null | undefined): RoomDict {
  return ROOM_DICTS[resolveRoomLocale(locale)];
}

/**
 * Locale-aware relative time — the partner-surface twin of formatRelativeEs,
 * driven by the room dictionary. Keeps the same buckets (today/yesterday/…/years)
 * and falls back to a localized absolute date for future timestamps.
 */
export function formatRoomRelative(
  value: Date | string | number | null | undefined,
  locale: string | null | undefined,
): string {
  const t = getRoomDict(locale).rel;
  if (value === null || value === undefined) return t.never;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return t.never;
  const diffDays = Math.floor((new Date().getTime() - d.getTime()) / 86_400_000);
  if (diffDays < 0) {
    return d.toLocaleDateString(roomIntlLocale(locale), {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  }
  if (diffDays === 0) return t.today;
  if (diffDays === 1) return t.yesterday;
  if (diffDays < 7) return t.daysAgo(diffDays);
  if (diffDays < 30) return t.weeksAgo(Math.floor(diffDays / 7));
  if (diffDays < 365) return t.monthsAgo(Math.floor(diffDays / 30));
  return t.yearsAgo(Math.floor(diffDays / 365));
}
