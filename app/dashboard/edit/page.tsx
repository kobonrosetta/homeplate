import { redirect } from "next/navigation";

// Kitchen editing lives under Settings now.
export default function EditRedirect() {
  redirect("/dashboard/settings");
}
