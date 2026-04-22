export function sanitizeSpreadsheetCell(value: string): string {
  if (!value) return value;
  const first = value[0];
  if (first === '=' || first === '+' || first === '-' || first === '@') {
    return `'${value}`;
  }
  return value;
}

export function encodeCsvCell(value: string | number): string {
  const normalized = sanitizeSpreadsheetCell(String(value).replace(/\r\n/g, '\n'));
  return `"${normalized.replace(/"/g, '""')}"`;
}

export function buildCsv(rows: Array<Array<string | number>>): string {
  return rows.map((row) => row.map((cell) => encodeCsvCell(cell)).join(',')).join('\n');
}
