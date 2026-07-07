/**
 * One-time backfill: correct `connectionType` for existing installations.
 *
 * Before this change, connectionType defaulted to 'bot' even when nothing was
 * connected. This recomputes it from the real source of truth:
 *   - bot connected (telegramConfig != null)      → 'bot'
 *   - phone active  (phoneConfig.isActive)         → 'phone'
 *   - both connected                               → 'bot' (bot wins as primary)
 *   - neither                                      → 'none'
 *
 * Run once after deploying the schema change:
 *   node scripts/backfill-connection-type.js
 *
 * Idempotent — safe to run multiple times. Only writes docs whose value changes.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Installation = require('../src/schemas/installation.schema');
const { connectDatabase } = require('../src/database/connection');

function computeType(inst) {
  const hasBot = !!inst.telegramConfig;
  const hasPhone = !!inst.phoneConfig?.isActive;
  if (hasBot) return 'bot';
  if (hasPhone) return 'phone';
  return 'none';
}

// All active transports for the array field, e.g. ['bot', 'phone'].
function computeTypes(inst) {
  const types = [];
  if (inst.telegramConfig) types.push('bot');
  if (inst.phoneConfig?.isActive) types.push('phone');
  return types;
}

function sameArray(a = [], b = []) {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

async function main() {
  await connectDatabase();

  const cursor = Installation.find({}).cursor();
  let scanned = 0;
  let updated = 0;
  const counts = { none: 0, bot: 0, phone: 0 };

  for (let inst = await cursor.next(); inst != null; inst = await cursor.next()) {
    scanned++;
    const next = computeType(inst);
    const nextTypes = computeTypes(inst);
    counts[next]++;

    const typeChanged = inst.connectionType !== next;
    const typesChanged = !sameArray(inst.connectionTypes, nextTypes);

    if (typeChanged || typesChanged) {
      await Installation.updateOne(
        { _id: inst._id },
        { connectionType: next, connectionTypes: nextTypes },
      );
      updated++;
      console.log(
        `  ${inst.locationId}: ${inst.connectionType || '(unset)'} → ${next} | [${(inst.connectionTypes || []).join(',')}] → [${nextTypes.join(',')}]`,
      );
    }
  }

  console.log('\n── Backfill complete ──');
  console.log(`Scanned: ${scanned}`);
  console.log(`Updated: ${updated}`);
  console.log(`Final distribution → none: ${counts.none}, bot: ${counts.bot}, phone: ${counts.phone}`);

  await mongoose.disconnect();
  process.exit(0);
}

main().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
