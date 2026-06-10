import { db, schema } from '@/db';
import { isNotNull } from 'drizzle-orm';

async function main() {
  const rooms = await db.select({ 
    id: schema.partnerRooms.id, 
    name: schema.partnerRooms.name,
    status: schema.partnerRooms.status,
    tokenHash: schema.partnerRooms.publicAccessTokenHash,
    workspaceId: schema.partnerRooms.workspaceId,
  }).from(schema.partnerRooms).where(isNotNull(schema.partnerRooms.publicAccessTokenHash)).limit(5);
  console.log('Rooms with tokens:', JSON.stringify(rooms, null, 2));
}
main().then(() => process.exit(0)).catch(e => { console.error('Fatal:', e.message); process.exit(1); });
