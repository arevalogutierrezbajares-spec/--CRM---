import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { IntakeWizard } from "@/components/posada-onboarding/intake-wizard";

type SearchParams = Promise<{ session?: string; token?: string }>;

/**
 * Posada onboarding intake wizard (AGB-CRM → TOUR PMS).
 *
 * The PMS operator starts an onboarding session in the TOUR console and gets a
 * `session_id` + a short-lived `import_token`. They reach this page either via a
 * deep link (`?session=<id>&token=<token>`) or by pasting both into the
 * connection step, then capture the posada's details and push them to the PMS.
 */
export default async function PosadaOnboardingPage(props: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await props.searchParams;

  return (
    <>
      <TopBar email={user.email} displayName={user.displayName} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Onboarding de posada</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Captura los datos de la posada y envíalos al PMS para crear el tenant.
            Necesitas el <span className="font-medium">ID de sesión</span> y el{" "}
            <span className="font-medium">token de importación</span> que genera la
            consola del PMS (el token caduca a los 10 minutos).
          </p>
        </header>

        <IntakeWizard
          initialSessionId={sp.session ?? ""}
          initialImportToken={sp.token ?? ""}
        />
      </main>
    </>
  );
}
