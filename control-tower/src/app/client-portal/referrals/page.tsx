import { permanentRedirect } from "next/navigation";

export default async function ClientReferralsPage() {
  permanentRedirect("/rewards/invitations");
}
