/** Map SA province / state names to TCG zone codes. */
const ZONE_BY_STATE = {
  gauteng: "GP",
  gp: "GP",
  "western cape": "WC",
  wc: "WC",
  "kwazulu-natal": "KZN",
  "kwa zulu natal": "KZN",
  kzn: "KZN",
  "eastern cape": "EC",
  ec: "EC",
  "free state": "FS",
  fs: "FS",
  limpopo: "LP",
  lp: "LP",
  mpumalanga: "MP",
  mp: "MP",
  "north west": "NW",
  nw: "NW",
  "northern cape": "NC",
  nc: "NC",
};

const resolveSaZone = (state = "") => {
  const key = String(state).trim().toLowerCase();
  return ZONE_BY_STATE[key] || "GP";
};

module.exports = { resolveSaZone };
