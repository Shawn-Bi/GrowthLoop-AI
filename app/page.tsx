import { redirect } from "next/navigation";

// The persisted, access-protected controller workflow is the application's entry point.
// The original local Content dashboard remains available as a component for reference.
export default function Home() {
  redirect("/experiments");
}
