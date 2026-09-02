export function normalizeCommand(text = '') {
  return text.trim().split(/\s+/)[0]?.toLowerCase() || '';
}
export function argsOf(text = '') {
  return text.trim().split(/\s+/).slice(1);
}
export function maskId(id = '') {
  if (id.length <= 6) return '***';
  return `${id.slice(0, 3)}***${id.slice(-3)}`;
}
export function yes(value) { return ['on','true','yes','enable','enabled'].includes(String(value).toLowerCase()); }
export function no(value) { return ['off','false','no','disable','disabled'].includes(String(value).toLowerCase()); }
