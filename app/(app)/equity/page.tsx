import { requireUser } from "@/lib/current-user";
import { TopBar } from "@/components/layout/top-bar";
import { EquityCommandCenter } from "@/components/equity/equity-command-center";

export default async function EquityPage() {
  const user = await requireUser();

  return (
    <>
      <TopBar
        email={user.email}
        displayName={user.displayName}
        title="Equity OS"
      />
      <EquityCommandCenter founderName={user.displayName.split(/\s+/)[0] || user.displayName} />
    </>
  );
}
