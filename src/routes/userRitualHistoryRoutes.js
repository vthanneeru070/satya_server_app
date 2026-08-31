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
 *   description: Multi-day ritual tracking — progress, day completion, reminders, miss restart
 */

router.use(authenticate);

router.get("/pending", validate(listRitualHistoryQuerySchema, "query"), listPendingRituals);
router.get("/finished", validate(listRitualHistoryQuerySchema, "query"), listFinishedRituals);

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

router.get(
  "/sessions/:sessionId",
  validate(sessionIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  getSession
);

router.post(
  "/:ritualId/start",
  validate(ritualIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  startRitual
);

router.post(
  "/:ritualId/finish",
  validate(ritualIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  finishRitual
);

router.post(
  "/sessions/:sessionId/start-day",
  validate(sessionIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  startDay
);

router.patch(
  "/sessions/:sessionId/progress",
  validate(sessionIdParamsSchema, "params"),
  validate(updateRitualProgressSchema),
  validate(timeZoneQuerySchema, "query"),
  updateProgress
);

router.post(
  "/sessions/:sessionId/complete-day",
  validate(sessionIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  completeDay
);

router.post(
  "/sessions/:sessionId/finish",
  validate(sessionIdParamsSchema, "params"),
  validate(timeZoneQuerySchema, "query"),
  finishRitualBySession
);

module.exports = router;
