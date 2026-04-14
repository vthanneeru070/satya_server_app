const app = require("./app");
const connectDatabase = require("./config/db");
const { port } = require("./config/env");

const startServer = async () => {
  await connectDatabase();
  app.listen(port, () => {
    console.log(`Server running on port ${port}`);
  });
};

startServer();
