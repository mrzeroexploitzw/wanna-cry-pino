const jobs = new Map();
export function schedule(id, when, fn) { if (jobs.has(id)) throw new Error('SCHEDULE_EXISTS'); const timer = setTimeout(() => { jobs.delete(id); fn(); }, Math.max(0, new Date(when).getTime() - Date.now())); jobs.set(id, timer); return id; }
export function cancel(id) { const timer = jobs.get(id); if (!timer) return false; clearTimeout(timer); jobs.delete(id); return true; }
export function list() { return [...jobs.keys()]; }
