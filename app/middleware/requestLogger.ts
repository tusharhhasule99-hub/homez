import type express from 'express';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

/** Local wall-clock time, e.g. `05 Apr 2026 9:50:22.730 PM`. */
function formatLogTimestamp(d: Date): string {
    const day = String(d.getDate()).padStart(2, '0');
    const mon = MONTHS[d.getMonth()];
    const y = d.getFullYear();
    const hours24 = d.getHours();
    let h12 = hours24 % 12;
    if (h12 === 0) {
        h12 = 12;
    }
    const min = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    const period = hours24 >= 12 ? 'PM' : 'AM';
    return `${day} ${mon} ${y} ${h12}:${min}:${s}.${ms} ${period}`;
}

/**
 * One-line access log: readable local timestamp, method + path, status, duration, port.
 */
export function requestLogger(port: number | string): express.RequestHandler {
    const portLabel = String(port);

    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const started = process.hrtime.bigint();

        res.on('finish', () => {
            const durationMs = Number(process.hrtime.bigint() - started) / 1_000_000;
            const timestamp = formatLogTimestamp(new Date());
            const line = `${timestamp} -> ${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs.toFixed(1)}ms port:${portLabel}`;
            console.log(line);
        });

        next();
    };
}
