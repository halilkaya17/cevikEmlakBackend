require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const app = require("./app");
const { connectDatabase } = require("./config/db");

const port = process.env.PORT || 5001;

connectDatabase()
  .then(() => {
    app.listen(port, () => {});
  })
  .catch(() => {
    process.exit(1);
  });