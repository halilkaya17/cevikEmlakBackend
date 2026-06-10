const mongoose = require("mongoose");

function describeMongoTarget(uri) {
  try {
    const parsed = new URL(uri);
    const dbName = parsed.pathname.replace(/^\//, "").split("?")[0] || "(varsayılan)";
    const host = parsed.hostname + (parsed.port ? `:${parsed.port}` : "");
    const user = parsed.username ? `${parsed.username}@` : "";
    return `${user}${host}/${dbName}`;
  } catch {
    return "MONGODB_URI (ayrıştırılamadı)";
  }
}

async function connectDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI is required");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);

  const { host, name } = mongoose.connection;
  console.log(`MongoDB bağlandı: ${host} / veritabanı: ${name} (${describeMongoTarget(uri)})`);

  return mongoose.connection;
}

module.exports = { connectDatabase };
