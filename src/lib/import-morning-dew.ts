/**
 * Parser for Golden Chance Morning-dew results copied from the provider site
 * ("0671: 01/01/2026: 3202891188 | 1013692163") or a CSV with separate columns
 * (draw_number,date,group1,group2). Numbers stay two-character strings so
 * leading zeros survive preview, staging and display.
 */
export type ParsedRow = {
  line: number;
  raw: string;
  drawNumber: string | null;
  date: string | null; // ISO yyyy-mm-dd
  group1: string[];
  group2: string[];
  error: string | null;
};

const fail = (line: number, raw: string, error: string, partial: Partial<ParsedRow> = {}): ParsedRow =>
  ({ line, raw, drawNumber: null, date: null, group1: [], group2: [], ...partial, error });

export function parseDate(text: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd), mo = Number(mm), y = Number(yyyy);
  if (mo < 1 || mo > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  if (d > dim) return null;
  return `${yyyy}-${mm}-${dd}`;
}

/** Splits exactly ten digits into five two-character numbers; null if malformed. */
export function splitGroup(text: string): string[] | null {
  const t = text.trim();
  if (!/^\d{10}$/.test(t)) return null;
  return [0, 2, 4, 6, 8].map((i) => t.slice(i, i + 2));
}

function validateGroup(label: string, g: string[], min: number, max: number): string | null {
  for (const n of g) {
    const v = Number(n);
    if (v < min || v > max) return `${label}: ${n} is outside ${min}–${max}`;
  }
  if (new Set(g).size !== g.length) return `${label} repeats a number`;
  return null;
}

export function parseRecord(raw: string, line: number, range = { min: 1, max: 90 }): ParsedRow {
  const text = raw.trim();
  let drawNumber: string, dateText: string, g1: string, g2: string;
  if (text.includes(",")) {
    const cols = text.split(",").map((c) => c.trim());
    if (cols.length !== 4) return fail(line, raw, "CSV rows need 4 columns: draw_number,date,group1,group2");
    [drawNumber, dateText, g1, g2] = cols as [string, string, string, string];
  } else {
    const m = /^([^:]*):([^:]*):(.*)$/.exec(text);
    if (!m) return fail(line, raw, "Expected 'draw: DD/MM/YYYY: group1 | group2'");
    drawNumber = m[1]!.trim(); dateText = m[2]!.trim();
    const pipes = m[3]!.split("|");
    if (pipes.length === 1) return fail(line, raw, "Missing '|' separator between the two groups", { drawNumber });
    if (pipes.length > 2) return fail(line, raw, "More than one '|' separator", { drawNumber });
    g1 = pipes[0]!.trim(); g2 = pipes[1]!.trim();
  }
  if (!/^\d{4}$/.test(drawNumber)) return fail(line, raw, "Draw number must be 4 digits");
  const date = parseDate(dateText);
  if (!date) return fail(line, raw, "Date must be a real DD/MM/YYYY date", { drawNumber });
  if (!g1 || !g2) return fail(line, raw, "Both result groups are required", { drawNumber, date });
  const group1 = splitGroup(g1);
  if (!group1) return fail(line, raw, "First group must be exactly 10 digits", { drawNumber, date });
  const group2 = splitGroup(g2);
  if (!group2) return fail(line, raw, "Second group must be exactly 10 digits", { drawNumber, date, group1 });
  const err = validateGroup("First group", group1, range.min, range.max) ?? validateGroup("Second group", group2, range.min, range.max);
  return { line, raw, drawNumber, date, group1, group2, error: err };
}

/** Parses pasted text. Header/footer lines that don't start with a digit are ignored. */
export function parseMorningDew(text: string, range = { min: 1, max: 90 }): ParsedRow[] {
  const rows: ParsedRow[] = [];
  text.split(/\r?\n/).forEach((l, i) => {
    if (!/^\s*\d/.test(l)) return; // titles, "[End ...]", CSV header "draw_number,..."
    rows.push(parseRecord(l, i + 1, range));
  });
  const seenNum = new Map<string, number>(), seenDate = new Map<string, number>();
  for (const r of rows) {
    if (r.error) continue;
    if (seenNum.has(r.drawNumber!)) r.error = `Duplicate draw ${r.drawNumber} (line ${seenNum.get(r.drawNumber!)})`;
    else if (seenDate.has(r.date!)) r.error = `Duplicate date ${r.date} (line ${seenDate.get(r.date!)})`;
    seenNum.set(r.drawNumber!, seenNum.get(r.drawNumber!) ?? r.line);
    seenDate.set(r.date!, seenDate.get(r.date!) ?? r.line);
  }
  return rows;
}

export const pad2 = (n: number) => String(n).padStart(2, "0");
