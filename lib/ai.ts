// Groq AI helpers. Get a free key at console.groq.com and set GROQ_API_KEY.
// Both functions fail gracefully (return null) if the key is missing or the
// call errors — so the app works fine with or without AI configured.

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

// If Groq renames models, update these (see console.groq.com/docs/models).
const TEXT_MODEL = "llama-3.3-70b-versatile";
const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

export async function generateDescription(
  title: string,
  category: string,
  image?: string | null
): Promise<string | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;

  const system =
    "You write short, appetizing, honest descriptions for homemade food listings on a premium local marketplace. One or two sentences. No emojis, no exclamation marks, no hype like 'best ever'. Describe only what is actually true — never invent ingredients, crusts, or details.";

  // When a photo is provided, use the vision model and describe what's really
  // in the image, so it can't hallucinate details from the name alone.
  const userContent = image
    ? [
        {
          type: "text",
          text: `Write the description for this listing titled "${title}" (category: ${category}) based on what you actually see in the photo. Only mention details that are visible.`,
        },
        { type: "image_url", image_url: { url: image } },
      ]
    : `Write a listing description for "${title}" (category: ${category}).`;

  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: image ? VISION_MODEL : TEXT_MODEL,
        temperature: 0.6,
        max_tokens: 150,
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    return typeof text === "string" ? text.trim() : null;
  } catch {
    return null;
  }
}

export async function checkPhotoImage(
  imageUrl: string
): Promise<{ score: number; feedback: string } | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: VISION_MODEL,
        temperature: 0.2,
        max_tokens: 120,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  'Rate this food photo from 0 to 100 on how appetizing and clear it is for a food marketplace listing. Respond ONLY as JSON: {"score": <number>, "feedback": "<one short tip>"}.',
              },
              { type: "image_url", image_url: { url: imageUrl } },
            ],
          },
        ],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const text: string = data?.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const score = Number(parsed.score);
    if (Number.isNaN(score)) return null;
    return { score, feedback: String(parsed.feedback ?? "") };
  } catch {
    return null;
  }
}
