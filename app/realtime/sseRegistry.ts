/**
 * Process-local Server-Sent Events (SSE) registry for staff job alerts.
 *
 * Maps a staffId to the set of open SSE connections that staff currently holds
 * (a staff may be connected from more than one device). The dispatch service
 * calls `sendToStaff` to push `job.offered` / `job.assigned` / `job.expired`
 * events to a staff member in real time.
 *
 * SCALE LIMITATION: this registry only reaches clients connected to *this* Node
 * process. Running multiple instances (PM2 cluster / horizontal scale) means a
 * booking dispatched on instance A cannot push to a socket held by instance B.
 * To scale, publish events to Redis pub/sub (e.g. a per-staff or global
 * channel) and have each instance subscribe and call `sendToStaff` for its
 * locally-connected staff. The `sendToStaff` signature stays identical — only
 * its implementation gains a publish + subscriber bridge.
 */

import type express from 'express';

export interface SseClient {
    res: express.Response;
    heartbeat: NodeJS.Timeout;
}

const connections = new Map<string, Set<SseClient>>();

/** Register an open SSE response for a staff member. */
export function addClient(staffId: string, client: SseClient): void {
    let set = connections.get(staffId);
    if (!set) {
        set = new Set<SseClient>();
        connections.set(staffId, set);
    }
    set.add(client);
}

/** Remove a closed connection and clear its heartbeat. */
export function removeClient(staffId: string, client: SseClient): void {
    clearInterval(client.heartbeat);
    const set = connections.get(staffId);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) {
        connections.delete(staffId);
    }
}

/** Whether the staff member has at least one live SSE connection here. */
export function isStaffConnected(staffId: string): boolean {
    const set = connections.get(staffId);
    return !!set && set.size > 0;
}

/**
 * Push a named event to every live connection a staff member holds.
 * Dead sockets (write throws) are evicted. Safe no-op if not connected.
 */
export function sendToStaff(staffId: string, event: string, data: unknown): void {
    const set = connections.get(staffId);
    if (!set || set.size === 0) return;

    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of set) {
        try {
            client.res.write(frame);
        } catch (e) {
            console.error(`[sse] write failed for staff ${staffId}; evicting`, e);
            removeClient(staffId, client);
        }
    }
}
