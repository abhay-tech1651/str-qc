import { redirect } from "next/navigation";

/** Retired: this page used the first engine, whose counts differed from the rest of the dashboard. Its content now lives on the page it sends you to. */
export default function Retired() {
  redirect("/fix");
}
