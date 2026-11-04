// Server-side proxy to the Meta Model API. The browser never calls
// api.meta.ai directly (some browsers block it on CORS), and the key
// travels only from the user's own app origin to Meta — it is never
// stored, logged, or committed.
export async function POST(req: Request) {
  try {
    const { key, pages, inputName, outputName } = (await req.json()) as {
      key?: string;
      pages?: string[];
      inputName?: string;
      outputName?: string;
    };
    if (!key || !Array.isArray(pages) || !pages.length) {
      return Response.json(
        { error: "Missing model key or pages." },
        { status: 400 },
      );
    }
    const prompt =
      "Translate each " +
      (inputName || "Tamil") +
      " page below into " +
      (outputName || "English") +
      " for a child, keeping the warmth and care, not just the literal words. " +
      'Return JSON only, no prose: {"pages": [{"english": str, "note": str}]} where note briefly explains any idiom, blessing, or cultural expression on that page, or is empty. ' +
      "Pages:\n" +
      pages.map((p, i) => `Page ${i + 1}: ${p}`).join("\n");
    const res = await fetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "muse-spark-1.3",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      choices?: { message?: { content?: string } }[];
      error?: { message?: string };
      message?: string;
    };
    if (!res.ok) {
      return Response.json(
        {
          error:
            "Meta API error (" +
            res.status +
            "): " +
            (data.error?.message || data.message || "request failed"),
        },
        { status: 502 },
      );
    }
    const content = data.choices?.[0]?.message?.content || "";
    const m = content.match(/\{[\s\S]*\}/);
    if (!m) {
      return Response.json(
        { error: "The model returned no translation JSON." },
        { status: 502 },
      );
    }
    let parsed: { pages?: { english: string; note: string }[] };
    try {
      parsed = JSON.parse(m[0]) as typeof parsed;
    } catch {
      return Response.json(
        {
          error:
            "The model returned translation JSON that could not be parsed.",
        },
        { status: 502 },
      );
    }
    return Response.json({ pages: parsed.pages || [] });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
