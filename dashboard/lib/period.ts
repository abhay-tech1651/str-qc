import "server-only";
import { cookies } from "next/headers";
import { getData, resolvePeriod } from "./store";

/** The period the viewer picked (kept in a cookie on this computer only), applied to the data. */
export const PERIOD_COOKIE = "qc_period";

export async function periodKey(): Promise<string> {
  return (await cookies()).get(PERIOD_COOKIE)?.value ?? "all";
}
export async function periodData() {
  return getData(resolvePeriod(await periodKey()));
}
export async function periodModel() {
  return (await periodData()).model;
}
