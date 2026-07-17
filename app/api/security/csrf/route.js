export const runtime = "edge";

export function GET(request) {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return Response.json({ token }, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Set-Cookie": `portal-so-csrf=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=3600${secure}`,
    },
  });
}
