const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const {
  tokenizeKeywords,
  buildPhraseSearchFilter,
  buildKeywordSearchFilter,
  resolveTextSearchFilter,
} = require("./textSearch");

describe("tokenizeKeywords", () => {
  it("splits on whitespace and drops short tokens", () => {
    assert.deepEqual(tokenizeKeywords("Ganesh marraige puja"), [
      "Ganesh",
      "marraige",
      "puja",
    ]);
  });
});

describe("buildPhraseSearchFilter", () => {
  it("uses the full query as one regex", () => {
    const filter = buildPhraseSearchFilter(
      ["title"],
      "ganesh marraige puja"
    );
    assert.deepEqual(filter.$or, [
      { title: { $regex: "ganesh marraige puja", $options: "i" } },
    ]);
  });
});

describe("buildKeywordSearchFilter", () => {
  it("ORs each keyword across fields", () => {
    const filter = buildKeywordSearchFilter(
      ["title"],
      "ganesh marraige puja"
    );
    assert.deepEqual(filter.$or.map((c) => c.title.$regex), [
      "ganesh",
      "marraige",
      "puja",
    ]);
  });
});

describe("resolveTextSearchFilter", () => {
  it("keeps phrase filter when phrase hits exist", async () => {
    const Model = {
      countDocuments: async () => 2,
    };
    const filter = await resolveTextSearchFilter(
      Model,
      { status: "APPROVED" },
      ["title"],
      "ganesh marraige puja"
    );
    assert.equal(filter.$or[0].title.$regex, "ganesh marraige puja");
  });

  it("falls back to keywords when phrase has no hits", async () => {
    const Model = {
      countDocuments: async () => 0,
    };
    const filter = await resolveTextSearchFilter(
      Model,
      { status: "APPROVED" },
      ["title"],
      "ganesh marraige puja"
    );
    assert.deepEqual(filter.$or.map((c) => c.title.$regex), [
      "ganesh",
      "marraige",
      "puja",
    ]);
  });
});
