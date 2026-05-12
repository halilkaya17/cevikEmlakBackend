require("dotenv").config();

const bcrypt = require("bcryptjs");
const { connectDatabase } = require("./config/db");
const AdminUser = require("./models/AdminUser");

async function main() {
  await connectDatabase();

  const email = String(process.env.ADMIN_EMAIL || "admin@cevikemlak.test")
    .toLowerCase()
    .trim();
  const password = process.env.ADMIN_PASSWORD || "Admin123";
  const passwordHash = await bcrypt.hash(password, 10);

  await AdminUser.updateOne(
    { email },
    {
      email,
      passwordHash,
      name: process.env.ADMIN_NAME || "Cevik Emlak Admin",
      role: "admin",
    },
    { upsert: true },
  );

  console.log(`AdminUser upserted: ${email}`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
