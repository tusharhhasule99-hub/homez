/**
 * Process-local Server-Sent Events (SSE) registry.
 *
 * Staff: job alerts (`job.offered` / `job.assigned` / `job.expired`).
 * Users: booking notifications (`booking.staff_assigned`).
 *
 * SCALE LIMITATION: this registry only reaches clients connected to *this* Node
 * process. Running multiple instances (PM2 cluster / horizontal scale) means an
 * event on instance A cannot push to a socket held by instance B.
 * To scale, publish events to Redis pub/sub and have each instance subscribe
 * and call `sendToStaff` / `sendToUser` for its locally-connected clients.
 * Those send signatures stay identical — only the implementation gains a
 * publish + subscriber bridge.
 */

import type express from 'express';

export interface SseClient {
    res: express.Response;
    heartbeat: NodeJS.Timeout;
}

const staffConnections = new Map<string, Set<SseClient>>();
const userConnections = new Map<string, Set<SseClient>>();

function addToMap(map: Map<string, Set<SseClient>>, id: string, client: SseClient): void {
    let set = map.get(id);
    if (!set) {
        set = new Set<SseClient>();
        map.set(id, set);
    }
    set.add(client);
}

function removeFromMap(map: Map<string, Set<SseClient>>, id: string, client: SseClient): void {
    clearInterval(client.heartbeat);
    const set = map.get(id);
    if (!set) return;
    set.delete(client);
    if (set.size === 0) {
        map.delete(id);
    }
}

function isConnected(map: Map<string, Set<SseClient>>, id: string): boolean {
    const set = map.get(id);
    return !!set && set.size > 0;
}

function sendToMap(
    map: Map<string, Set<SseClient>>,
    id: string,
    event: string,
    data: unknown,
    label: string,
    remove: (id: string, client: SseClient) => void,
): void {
    const set = map.get(id);
    if (!set || set.size === 0) return;

    const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const client of set) {
        try {
            client.res.write(frame);
        } catch (e) {
            console.error(`[sse] write failed for ${label} ${id}; evicting`, e);
            remove(id, client);
        }
    }
}

/** Register an open SSE response for a staff member. */
export function addClient(staffId: string, client: SseClient): void {
    addToMap(staffConnections, staffId, client);
}

/** Remove a closed staff connection and clear its heartbeat. */
export function removeClient(staffId: string, client: SseClient): void {
    removeFromMap(staffConnections, staffId, client);
}

/** Whether the staff member has at least one live SSE connection here. */
export function isStaffConnected(staffId: string): boolean {
    return isConnected(staffConnections, staffId);
}

/**
 * Push a named event to every live connection a staff member holds.
 * Dead sockets (write throws) are evicted. Safe no-op if not connected.
 */
export function sendToStaff(staffId: string, event: string, data: unknown): void {
    sendToMap(staffConnections, staffId, event, data, 'staff', removeClient);
}

/** Register an open SSE response for a booking user (customer). */
export function addUserClient(userId: string, client: SseClient): void {
    addToMap(userConnections, userId, client);
}

/** Remove a closed user connection and clear its heartbeat. */
export function removeUserClient(userId: string, client: SseClient): void {
    removeFromMap(userConnections, userId, client);
}

/** Whether the user has at least one live SSE connection here. */
export function isUserConnected(userId: string): boolean {
    return isConnected(userConnections, userId);
}

/**
 * Push a named event to every live connection a user holds.
 * Dead sockets (write throws) are evicted. Safe no-op if not connected.
 */
export function sendToUser(userId: string, event: string, data: unknown): void {
    sendToMap(userConnections, userId, event, data, 'user', removeUserClient);
}
