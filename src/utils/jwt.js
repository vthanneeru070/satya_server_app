const jwt = require("jsonwebtoken");
const { jwtSecret, jwtRefreshSecret } = require("../config/env");

const generateAccessToken = ({ userId, role }) => {
  return jwt.sign({ userId, role }, jwtSecret, { expiresIn: "15m" });
};

const generateRefreshToken = ({ userId, role }) => {
  return jwt.sign({ userId, role }, jwtRefreshSecret, { expiresIn: "7d" });
};

module.exports = {
  generateAccessToken,
  generateRefreshToken,
};
