const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const {
  listPoojaHistory,
  listPendingPoojas,
  listFinishedPoojas,
  startPooja,
  updateProgress,
  finishPooja,
  finishPoojaBySession,
} = require("../controllers/userPoojaHistoryController");
const {
  poojaIdParamsSchema,
  sessionIdParamsSchema,
  scheduleIdQuerySchema,
  listPoojaHistoryQuerySchema,
  poojaHistoryOverviewQuerySchema,
  updateProgressSchema,
} = require("../validations/userPoojaHistoryValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: User Pooja History
 *   description: User pooja progress — pending (in progress) and finished sessions
 */

router.use(authenticate);

/**
 * @swagger
 * /user/pooja-history/pending:
 *   get:
 *     summary: List pending (in-progress) poojas
 *     tags: [User Pooja History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *     responses:
 *       200:
 *         description: Pending sessions with populated pooja details
 */
router.get("/pending", validate(listPoojaHistoryQuerySchema, "query"), listPendingPoojas);

/**
 * @swagger
 * /user/pooja-history/finished:
 *   get:
 *     summary: List finished (completed) poojas
 *     tags: [User Pooja History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *     responses:
 *       200:
 *         description: Finished sessions with populated pooja details
 */
router.get("/finished", validate(listPoojaHistoryQuerySchema, "query"), listFinishedPoojas);

/**
 * @swagger
 * /user/pooja-history:
 *   get:
 *     summary: Pooja history overview (counts + pending & finished lists)
 *     description: |
 *       **Without `status`:** returns `pendingCount`, `finishedCount`, `pending[]`, `finished[]` with full pooja details.
 *       **With `status=PENDING|FINISHED`:** returns a single filtered paginated list.
 *     tags: [User Pooja History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [PENDING, FINISHED] }
 *         description: Omit for full overview; set to filter one list only
 *       - in: query
 *         name: pendingPage
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: pendingLimit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: finishedPage
 *         schema: { type: integer, default: 1 }
 *       - in: query
 *         name: finishedLimit
 *         schema: { type: integer, default: 20, maximum: 50 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *         description: Used only when status filter is set
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *         description: Used only when status filter is set
 *     responses:
 *       200:
 *         description: Overview or filtered list
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     pendingCount: { type: integer }
 *                     finishedCount: { type: integer }
 *                     totalCount: { type: integer }
 *                     pending:
 *                       type: array
 *                       items: { $ref: "#/components/schemas/UserPoojaSession" }
 *                     finished:
 *                       type: array
 *                       items: { $ref: "#/components/schemas/UserPoojaSession" }
 */
router.get(
  "/",
  (req, res, next) => {
    const schema = req.query.status
      ? listPoojaHistoryQuerySchema
      : poojaHistoryOverviewQuerySchema;
    return validate(schema, "query")(req, res, next);
  },
  listPoojaHistory
);

/**
 * @swagger
 * /user/pooja-history/{poojaId}/start:
 *   post:
 *     summary: Start a pooja (creates PENDING session)
 *     description: Idempotent — returns existing pending session if already started.
 *     tags: [User Pooja History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: poojaId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: scheduleId
 *         required: false
 *         schema: { type: string }
 *         description: Required when pooja has multiple schedules.
 *     responses:
 *       201:
 *         description: Pooja started
 *       200:
 *         description: Resumed existing pending session
 */
router.post(
  "/:poojaId/start",
  validate(poojaIdParamsSchema, "params"),
  validate(scheduleIdQuerySchema, "query"),
  startPooja
);

/**
 * @swagger
 * /user/pooja-history/{poojaId}/finish:
 *   post:
 *     summary: Finish pooja (marks session FINISHED)
 *     tags: [User Pooja History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: poojaId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: scheduleId
 *         required: false
 *         schema: { type: string }
 *         description: Required when pooja has multiple schedules.
 *     responses:
 *       200:
 *         description: Pooja completed
 *       404:
 *         description: No pending session for this pooja
 */
router.post(
  "/:poojaId/finish",
  validate(poojaIdParamsSchema, "params"),
  validate(scheduleIdQuerySchema, "query"),
  finishPooja
);

/**
 * @swagger
 * /user/pooja-history/sessions/{sessionId}/progress:
 *   patch:
 *     summary: Update current step while performing pooja
 *     tags: [User Pooja History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentStep]
 *             properties:
 *               currentStep: { type: integer, minimum: 0, example: 3 }
 *     responses:
 *       200:
 *         description: Progress saved
 */
router.patch(
  "/sessions/:sessionId/progress",
  validate(sessionIdParamsSchema, "params"),
  validate(updateProgressSchema),
  updateProgress
);

/**
 * @swagger
 * /user/pooja-history/sessions/{sessionId}/finish:
 *   post:
 *     summary: Finish pooja by session id
 *     tags: [User Pooja History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Pooja completed
 */
router.post(
  "/sessions/:sessionId/finish",
  validate(sessionIdParamsSchema, "params"),
  finishPoojaBySession
);

module.exports = router;
