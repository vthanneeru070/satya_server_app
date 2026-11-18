const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  tokenizeKeywords,
  buildTextSearchFilter,
} = require("./textSearch");

describe("tokenizeKeywords", () => {
  it("splits on whitespace and drops short tokens", () => {
    assert.deepEqual(tokenizeKeywords("Ganesh chaturti puja"), [
      "Ganesh",
      "chaturti",
      "puja",
    ]);
  });

  it("dedupes case-insensitively", () => {
    assert.deepEqual(tokenizeKeywords("Ganesh ganesh PUJA"), [
      "Ganesh",
      "PUJA",
    ]);
  });
});

describe("buildTextSearchFilter", () => {
  it("matches any keyword across fields (OR)", () => {
    const filter = buildTextSearchFilter(
      ["title", "description"],
      "Ganesh chaturti puja"
    );

    assert.equal(filter.$or.length, 6);
    assert.deepEqual(filter.$or, [
      { title: { $regex: "Ganesh", $options: "i" } },
      { description: { $regex: "Ganesh", $options: "i" } },
      { title: { $regex: "chaturti", $options: "i" } },
      { description: { $regex: "chaturti", $options: "i" } },
      { title: { $regex: "puja", $options: "i" } },
      { description: { $regex: "puja", $options: "i" } },
    ]);
  });

  it("does not require the full phrase as one regex", () => {
    const filter = buildTextSearchFilter(["title"], "Ganesh chaturti");
    const patterns = filter.$or.map((clause) => clause.title.$regex);
    assert.deepEqual(patterns, ["Ganesh", "chaturti"]);
    assert.equal(patterns.includes("Ganesh chaturti"), false);
  });
});
