require("dotenv").config();

const app = require("./app");
const { connectDatabase } = require("./config/db");

const port = Number(process.env.PORT || 8080);

connectDatabase()
  .then(() => {
    app.listen(port, () => {
      console.log(`Cevik Emlak API http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error("Database connection failed", error);
    process.exit(1);
  });
