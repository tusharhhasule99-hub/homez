/** Escape a value for a CSV cell (RFC-style). */
export function csvCell(value: unknown): string {
    if (value === null || value === undefined) return '';
    const s = String(value);
    if (/[",\n\r]/.test(s)) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
    const lines = [headers.map(csvCell).join(',')];
    for (const row of rows) {
        lines.push(row.map(csvCell).join(','));
    }
    return lines.join('\n') + '\n';
}
