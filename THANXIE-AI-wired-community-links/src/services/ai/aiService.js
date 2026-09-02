const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash-lite';

function extractGeminiText(data) {
  return data?.candidates?.flatMap(candidate => candidate?.content?.parts || [])
    .map(part => part?.text || '')
    .filter(Boolean)
    .join('\n')
    .trim();
}

async function geminiResponse({ text, language, slang }) {
  const key = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
  if (!key) throw new Error('GEMINI_API_KEY_MISSING');

  const systemInstruction = `You are THANXIE AI. Respond in ${language || 'English'}. If slang is enabled, use ${slang || 'standard'} naturally. Keep answers helpful, warm and concise. Do not generate spam, scams, impersonation, hateful abuse, sexual exploitation, instructions for wrongdoing, or other prohibited content. If asked for harmful or prohibited content, briefly refuse and offer a safe alternative.`;
  const response = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemInstruction }] },
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: { temperature: 0.7, maxOutputTokens: 1200 }
    })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`GEMINI_API_FAILED:${response.status}`);
  if (data?.promptFeedback?.blockReason) throw new Error(`GEMINI_BLOCKED:${data.promptFeedback.blockReason}`);
  const output = extractGeminiText(data);
  if (!output) throw new Error('GEMINI_EMPTY_RESPONSE');
  return output;
}

export async function generateResponse({ text, language = 'en', slang = 'standard' }) {
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
  if (provider === 'gemini' || provider === 'google') return geminiResponse({ text, language, slang });
  if (provider === 'none') return 'AI provider is disabled. Set AI_PROVIDER=gemini and GEMINI_API_KEY to enable THANXIE AI responses.';
  throw new Error('UNSUPPORTED_AI_PROVIDER');
}
