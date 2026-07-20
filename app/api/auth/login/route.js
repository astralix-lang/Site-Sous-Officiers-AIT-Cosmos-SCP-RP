import { json } from "../_shared";

export const runtime = "edge";

export async function POST() {
  return json({ error: "La connexion par mot de passe a ete remplacee par la connexion Discord." }, 410);
}
