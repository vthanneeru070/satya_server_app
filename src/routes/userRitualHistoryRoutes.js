const express = require("express");
const authenticate = require("../middleware/authenticate");
const validate = require("../middleware/validate");
const {
  listRitualHistory,
  listPendingRituals,
  listFinishedRituals,
  getSession,
  startRitual,
  startDay,
  updateProgress,
  completeDay,
  finishRitual,
  finishRitualBySession,
} = require("../controllers/userRitualHistoryController");
const {
  ritualIdParamsSchema,
  sessionIdParamsSchema,
  listRitualHistoryQuerySchema,
  ritualHistoryOverviewQuerySchema,
  updateRitualProgressSchema,
  timeZoneQuerySchema,
} = require("../validations/userRitualHistoryValidation");

const router = express.Router();

/**
 * @swagger
 * tags:
 *   name: User Ritual History
 *   description: |
 *     Mobile user multi-day ritual tracking — start/resume sessions, per-day progress,
 *     complete-day notifications, next-day required-items reminders, and miss restart.
 */

router.use(authenticate);

/**
 * @swagger
 * /user/ritual-history/pending:
 *   get:
 *     summary: List pending (in-progress) rituals
 *     tags: [User Ritual History]
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
 *         description: Pending ritual sessions with populated ritual details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessions:
 *                       type: array
 *                       items: { $ref: "#/components/schemas/UserRitualSession" }
 */
router.get("/pending", validate(listRitualHistoryQuerySchema, "query"), listPendingRituals);

/**
 * @swagger
 * /user/ritual-history/finished:
 *   get:
 *     summary: List finished (completed) rituals
 *     tags: [User Ritual History]
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
 *         description: Finished ritual sessions with populated ritual details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     sessions:
 *                       type: array
 *                       items: { $ref: "#/components/schemas/UserRitualSession" }
 */
router.get("/finished", validate(listRitualHistoryQuerySchema, "query"), listFinishedRituals);

/**
 * @swagger
 * /user/ritual-history:
 *   get:
 *     summary: Ritual history overview (counts + pending & finished lists)
 *     description: |
 *       **Without `status`:** returns `pendingCount`, `finishedCount`, `pending[]`, `finished[]` with full ritual details.
 *       **With `status=PENDING|FINISHED`:** returns a single filtered paginated list.
 *     tags: [User Ritual History]
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
 *                   $ref: "#/components/schemas/RitualHistoryOverview"
 */
router.get(
  "/",
  (req, res, next) => {
    const schema = req.query.status
      ? listRitualHistoryQuerySchema
      : ritualHistoryOverviewQuerySchema;
    return validate(schema, "query")(req, res, next);
  },
  listRitualHistory
);

/**
 * @swagger
 * /user/ritual-history/sessions/{sessionId}:
 *   get:
 *     summary: Get a single ritual session
 *     description: |
 *       Returns session progress including `currentDay`, `currentStep`, `completedDays`,
 *       `nextDayDueDateKey`, and populated ritual. If the user missed a day, returns 409.
 *     tags: [User Ritual History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: timezone
 *         schema: { type: string, example: Asia/Kolkata }
 *         description: Optional IANA timezone override (defaults to user profile timezone)
 *     responses:
 *       200:
 *         description: Session fetched
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     session:
 *                       $ref: "#/components/schemas/UserRitualSession"
 *       404:
 *         description: Session not found
 *       409:
 *         description: User missed a day — must restart from Day 1
 */
router.get(
  "/sessions/:sessionId",
  validate(sessionIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  getSession
);

/**
 * @swagger
 * /user/ritual-history/{ritualId}/start:
 *   post:
 *     summary: Start a ritual (creates PENDING session)
 *     description: |
 *       Idempotent — returns existing pending session if already started.
 *       If a previous attempt was abandoned due to a missed day, creates a new attempt from Day 1.
 *     tags: [User Ritual History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ritualId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: timezone
 *         schema: { type: string, example: Asia/Kolkata }
 *     responses:
 *       201:
 *         description: Ritual started (new session)
 *       200:
 *         description: Resumed existing pending session
 *       404:
 *         description: Ritual not found or not approved
 */
router.post(
  "/:ritualId/start",
  validate(ritualIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  startRitual
);

/**
 * @swagger
 * /user/ritual-history/{ritualId}/finish:
 *   post:
 *     summary: Finish ritual by ritual id
 *     description: Marks session FINISHED when all days are completed.
 *     tags: [User Ritual History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ritualId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: timezone
 *         schema: { type: string, example: Asia/Kolkata }
 *     responses:
 *       200:
 *         description: Ritual completed
 *       400:
 *         description: Not all days completed yet
 *       404:
 *         description: No pending session for this ritual
 *       409:
 *         description: Missed day — restart required
 */
router.post(
  "/:ritualId/finish",
  validate(ritualIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  finishRitual
);

/**
 * @swagger
 * /user/ritual-history/sessions/{sessionId}/start-day:
 *   post:
 *     summary: Explicitly start the current ritual day
 *     description: |
 *       For multi-day rituals, Day 2+ must be started on the correct calendar day (user timezone).
 *       Day 1 is started automatically when the ritual session is created.
 *     tags: [User Ritual History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: timezone
 *         schema: { type: string, example: Asia/Kolkata }
 *     responses:
 *       200:
 *         description: Day started
 *       400:
 *         description: Wrong calendar day for this ritual day
 *       404:
 *         description: No in-progress session
 *       409:
 *         description: Missed day — restart required
 */
router.post(
  "/sessions/:sessionId/start-day",
  validate(sessionIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  startDay
);

/**
 * @swagger
 * /user/ritual-history/sessions/{sessionId}/progress:
 *   patch:
 *     summary: Update step progress within the current day
 *     tags: [User Ritual History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: timezone
 *         schema: { type: string, example: Asia/Kolkata }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [currentStep]
 *             properties:
 *               currentStep:
 *                 type: integer
 *                 minimum: 0
 *                 example: 2
 *                 description: Last completed step number within the current day
 *               currentDay:
 *                 type: integer
 *                 minimum: 1
 *                 description: Optional guard — must match session currentDay if provided
 *     responses:
 *       200:
 *         description: Progress saved
 *       400:
 *         description: Invalid step or wrong calendar day
 *       404:
 *         description: No in-progress session
 *       409:
 *         description: Missed day — restart required
 */
router.patch(
  "/sessions/:sessionId/progress",
  validate(sessionIdParamsSchema, "params"),
  validate(updateRitualProgressSchema),
  validate(timeZoneQuerySchema, "query"),
  updateProgress
);

/**
 * @swagger
 * /user/ritual-history/sessions/{sessionId}/complete-day:
 *   post:
 *     summary: Mark the current ritual day as completed
 *     description: |
 *       Validates all steps for the day are done, records completion, sends push/inbox notification,
 *       and schedules next-day required-items reminder. For the last day, marks the ritual FINISHED.
 *       Multi-day rituals require each day (after Day 1) to be completed on the next calendar day.
 *     tags: [User Ritual History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: timezone
 *         schema: { type: string, example: Asia/Kolkata }
 *     responses:
 *       200:
 *         description: Day completed (or entire ritual finished on last day)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     session:
 *                       $ref: "#/components/schemas/UserRitualSession"
 *                     dayCompleted:
 *                       type: integer
 *                       example: 1
 *                     ritualFinished:
 *                       type: boolean
 *                       example: false
 *       400:
 *         description: Steps incomplete or wrong calendar day
 *       404:
 *         description: No in-progress session
 *       409:
 *         description: Missed day — restart required
 */
router.post(
  "/sessions/:sessionId/complete-day",
  validate(sessionIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  completeDay
);

/**
 * @swagger
 * /user/ritual-history/sessions/{sessionId}/finish:
 *   post:
 *     summary: Finish ritual by session id
 *     tags: [User Ritual History]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema: { type: string }
 *       - in: query
 *         name: timezone
 *         schema: { type: string, example: Asia/Kolkata }
 *     responses:
 *       200:
 *         description: Ritual completed
 *       400:
 *         description: Not all days completed yet
 *       404:
 *         description: No in-progress session
 *       409:
 *         description: Missed day — restart required
 */
router.post(
  "/sessions/:sessionId/finish",
  validate(sessionIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  finishRitualBySession
);

module.exports = router;
