/**
 * Background sweep for real-time job dispatch. On each tick it expires
 * timed-out offers, self-heals bookings whose dispatch trigger failed, and
 * widens the search radius for bookings still awaiting a staff acceptance.
 * The heavy lifting lives in the dispatch service (`runSweep`).
 */

import { runSweep } from '../routes/staff/jobs/dispatchService';

const TICK_MS = () => Number(process.env.DISPATCH_SWEEP_MS ?? 5000);

let running = false;

async function tick() {
    if (running) return; // reentrancy guard — skip if the previous tick is still going
    running = true;
    try {
        await runSweep();
    } catch (e) {
        console.error('[dispatch-sweep] tick failed', e);
    } finally {
        running = false;
    }
}

export function startDispatchSweep() {
    const tickMs = TICK_MS();
    void tick();

    const handle = setInterval(() => {
        void tick();
    }, tickMs);

    console.log(`[dispatch-sweep] Cron started (every ${tickMs / 1000}s).`);

    return () => clearInterval(handle);
}
