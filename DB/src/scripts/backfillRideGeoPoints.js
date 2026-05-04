import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('❌ MONGO_URI or MONGODB_URI missing in .env');
  process.exit(1);
}

await mongoose.connect(mongoUri);

console.log('✅ MongoDB connected');

const rides = mongoose.connection.collection('rides');

const cursor = rides.find({});

let total = 0;
let updated = 0;
let skipped = 0;
let fixedStatus = 0;

const isValidCoord = (lat, lng) => {
  const la = Number(lat);
  const ln = Number(lng);

  return (
    Number.isFinite(la) &&
    Number.isFinite(ln) &&
    la >= -90 &&
    la <= 90 &&
    ln >= -180 &&
    ln <= 180
  );
};

for await (const ride of cursor) {
  total += 1;

  const $set = {};

  if (isValidCoord(ride.source?.lat, ride.source?.lng)) {
    $set.sourcePoint = {
      type: 'Point',
      coordinates: [Number(ride.source.lng), Number(ride.source.lat)],
    };
  }

  if (isValidCoord(ride.destination?.lat, ride.destination?.lng)) {
    $set.destinationPoint = {
      type: 'Point',
      coordinates: [
        Number(ride.destination.lng),
        Number(ride.destination.lat),
      ],
    };
  }

  if (ride.status === 'active') {
    $set.status = 'scheduled';
    fixedStatus += 1;
  }

  if (ride.source && !ride.source.name) {
    $set['source.name'] = 'Unknown source';
  }

  if (ride.destination && !ride.destination.name) {
    $set['destination.name'] = 'Unknown destination';
  }

  if (Object.keys($set).length === 0) {
    skipped += 1;
    continue;
  }

  await rides.updateOne(
    { _id: ride._id },
    {
      $set,
    }
  );

  updated += 1;
}

console.log('✅ Backfill completed');
console.log(`Total rides checked: ${total}`);
console.log(`Updated rides: ${updated}`);
console.log(`Skipped rides: ${skipped}`);
console.log(`Status active → scheduled fixed: ${fixedStatus}`);

await mongoose.disconnect();
process.exit(0);