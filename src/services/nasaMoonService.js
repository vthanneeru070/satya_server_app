const axios = require("axios");

const getNasaMoonData = async (year) => {
  const targetYear = Number(year);
  if (!Number.isInteger(targetYear) || targetYear < 1900 || targetYear > 2100) {
    throw new Error("Invalid year for NASA moon data fetch");
  }

  const url = `https://svs.gsfc.nasa.gov/vis/a000000/a005500/a005587/mooninfo_${targetYear}.json`;
  const response = await axios.get(url, { timeout: 20000 });
  return Array.isArray(response.data) ? response.data : [];
};

module.exports = {
  getNasaMoonData,
};
