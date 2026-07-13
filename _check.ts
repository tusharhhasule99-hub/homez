import { prisma } from './app/utils/prisma';
import { boundingBox, haversineKm } from './app/utils/geo';
(async () => {
  const lat=12.9716, lng=77.5946, radius=2;
  const bb = boundingBox(lat,lng,radius);
  console.log('BBOX', JSON.stringify(bb));
  const cutoff = new Date(Date.now() - 120*1000);
  console.log('cutoff', cutoff.toISOString(), 'now', new Date().toISOString());
  const cands = await prisma.staff.findMany({
    where: { is_active:true, is_deleted:false, kyc_status:'VERIFIED', is_available:true,
      latitude:{ gte:bb.minLat, lte:bb.maxLat }, longitude:{ gte:bb.minLng, lte:bb.maxLng },
      last_seen_at:{ gte: cutoff } },
    select: { name:true, latitude:true, longitude:true, last_seen_at:true },
  });
  console.log('CANDIDATES', cands.length);
  for (const s of cands) console.log(' ', s.name, haversineKm(lat,lng,s.latitude!,s.longitude!).toFixed(3),'km', s.last_seen_at?.toISOString());
  process.exit(0);
})();
