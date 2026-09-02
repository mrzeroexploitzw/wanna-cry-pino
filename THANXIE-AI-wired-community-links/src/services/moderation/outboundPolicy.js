// Conservative local guard for outbound AI text. Google Gemini also applies its
// own safety system; this second layer prevents obvious high-risk content from
// being sent even if a model response slips through.
const HIGH_RISK_PATTERNS = [
  /(?:how|steps?|instructions?|guide)\s+(?:to|for)\s+(?:make|build|buy|obtain)\s+(?:a\s+)?(?:bomb|explosive|weapon|poison)/i,
  /(?:credit\s*card|bank\s*account|otp|one[- ]time password)\s+(?:number|details?|code).*?(?:send|give|share)/i,
  /(?:guaranteed|double)\s+(?:your\s+)?money.*?(?:send|pay|deposit|invest)/i,
  /(?:child|minor|underage).*?(?:sexual|nude|explicit)/i,
  /(?:buy|sell|trade)\s+(?:stolen|counterfeit)\s+(?:cards?|documents?|accounts?)/i
];

export function checkOutboundText(text = '') {
  const value = String(text || '').trim();
  if (!value) return { allowed: true, reason: null };
  if (HIGH_RISK_PATTERNS.some(pattern => pattern.test(value))) return { allowed: false, reason: 'high_risk_content' };
  return { allowed: true, reason: null };
}
