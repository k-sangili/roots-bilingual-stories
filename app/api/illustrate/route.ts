// Server-side proxy to the Meta Model API for illustrations, for the
// same reason as /api/translate: the browser never calls api.meta.ai
// directly, and the key is never stored, logged, or committed.
export async function POST(req: Request) {
  try {
    const { key, pageText, speaker } = (await req.json()) as {
      key?: string;
      pageText?: string;
      speaker?: string;
    };
    if (!key || !pageText) {
      return Response.json(
        { error: "Missing model key or page text." },
        { status: 400 },
      );
    }
    const prompt =
      `Warm children's storybook illustration, soft watercolour style, no text in the image. Scene: ${pageText}. ` +
      `Told by a grandmother${speaker ? " named " + speaker : ""}, for her grandchild. Consistent gentle storybook style.`;
    const res = await fetch("https://api.meta.ai/v1/images/generations", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model: "muse-image-1.0", prompt }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      data?: { b64_json?: string; url?: string }[];
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
    const item = data.data && data.data[0];
    if (!item) {
      return Response.json(
        { error: "No illustration returned." },
        { status: 502 },
      );
    }
    // API returns base64 (b64_json) or a URL depending on the response shape.
    if (item.b64_json) {
      return Response.json({ image: "data:image/png;base64," + item.b64_json });
    }
    if (item.url) {
      return Response.json({ image: item.url });
    }
    return Response.json(
      { error: "Illustration format not recognised." },
      { status: 502 },
    );
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
