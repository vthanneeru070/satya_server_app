const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const { search } = require("../controllers/globalSearchController");
const { globalSearchQuerySchema } = require("../validations/globalSearchValidation");

const router = express.Router();

const optionalAuthenticate = (req, res, next) => {
  if (!req.headers.authorization) return next();
  const authenticate = require("../middleware/authenticate");
  return authenticate(req, res, (err) => {
    if (err) return next();
    return next();
  });
};

/**
 * @swagger
 * tags:
 *   name: Search
 *   description: Global search across poojas, festivals, rituals, deities, and donations
 */

/**
 * @swagger
 * /search:
 *   get:
 *     summary: Global search (mobile)
 *     description: |
 *       Searches **APPROVED** public content. Each hit includes `id`, `type`, `title`/`name`,
 *       `description` (trimmed), and `imageUrl`.
 *       Types: `pooja`, `festival`, `ritual`, `deity`, `donation`.
 *     tags: [Search]
 *     parameters:
 *       - in: query
 *         name: q
 *         required: true
 *         schema: { type: string, minLength: 2 }
 *         description: Search term (matches title, name, description)
 *       - in: query
 *         name: types
 *         schema: { type: string, example: "pooja,deity,festival" }
 *         description: Comma-separated types to include (default all)
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 10, maximum: 25 }
 *         description: Max results per content type before merge
 *       - in: query
 *         name: maxTotal
 *         schema: { type: integer, default: 50, maximum: 100 }
 *         description: Max results in merged `results` array
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: "#/components/schemas/GlobalSearchResponse"
 */
router.get("/", optionalAuthenticate, validate(globalSearchQuerySchema, "query"), search);

module.exports = router;
