import { redirect } from "next/navigation";

import { getCurrentAccess } from "@/modules/access/application/get-current-access";

export async function requireCurrentAccess() {
  const access = await getCurrentAccess();

  if (!access) {
    redirect("/");
  }

  return access;
}
