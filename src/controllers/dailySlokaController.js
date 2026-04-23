const DailySloka = require("../models/DailySloka");
const HttpError = require("../utils/httpError");
const { sendSuccess } = require("../utils/response");
const xlsx = require("xlsx");
const mammoth = require("mammoth");

const toDateParts = (dateString) => {
  const value = String(dateString || "").trim();

  const ddMmYyyyMatch = /^(0[1-9]|[12][0-9]|3[01])-(0[1-9]|1[0-2])-([0-9]{4})$/.exec(
    value
  );
  if (ddMmYyyyMatch) {
    return {
      day: Number(ddMmYyyyMatch[1]),
      month: Number(ddMmYyyyMatch[2]),
      year: Number(ddMmYyyyMatch[3]),
    };
  }

  const yyyyMmDdMatch = /^([0-9]{4})-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.exec(
    value
  );
  if (yyyyMmDdMatch) {
    return {
      day: Number(yyyyMmDdMatch[3]),
      month: Number(yyyyMmDdMatch[2]),
      year: Number(yyyyMmDdMatch[1]),
    };
  }

  throw new HttpError("date must be in dd-mm-yyyy or yyyy-mm-dd format", 400);
};

const toDateKey = ({ day, month, year }) => {
  const d = String(day).padStart(2, "0");
  const m = String(month).padStart(2, "0");
  const y = String(year);
  return `${d}-${m}-${y}`;
};

const stripHtml = (value) =>
  String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .trim();

const normalizeHeader = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z]/g, "");

const getCellValue = (row, keys) => {
  const mappedEntries = Object.entries(row || {}).map(([key, value]) => [normalizeHeader(key), value]);
  for (const key of keys) {
    const found = mappedEntries.find(([normalizedKey]) => normalizedKey === key);
    if (found) {
      return String(found[1] ?? "").trim();
    }
  }
  return "";
};

const parseXlsxRows = (fileBuffer) => {
  const workbook = xlsx.read(fileBuffer, { type: "buffer" });
  const firstSheetName = workbook.SheetNames?.[0];

  if (!firstSheetName) {
    throw new HttpError("Uploaded xlsx has no sheets", 400);
  }

  const worksheet = workbook.Sheets[firstSheetName];
  return xlsx.utils.sheet_to_json(worksheet, { defval: "" });
};

const parseDocxRows = async (fileBuffer) => {
  const result = await mammoth.convertToHtml({ buffer: fileBuffer });
  const html = result.value || "";

  const tableMatch = html.match(/<table[\s\S]*?<\/table>/i);
  if (!tableMatch) {
    throw new HttpError("No table found in .docx file", 400);
  }

  const rowMatches = [...tableMatch[0].matchAll(/<tr[\s\S]*?<\/tr>/gi)];
  if (rowMatches.length < 2) {
    throw new HttpError("Table must include header row and at least one data row", 400);
  }

  const extractCells = (rowHtml) => {
    const cellMatches = [...rowHtml.matchAll(/<t[hd][^>]*>([\s\S]*?)<\/t[hd]>/gi)];
    return cellMatches.map((match) => stripHtml(match[1]));
  };

  const headers = extractCells(rowMatches[0][0]);
  return rowMatches.slice(1).map((rowMatch) => {
    const cells = extractCells(rowMatch[0]);
    return headers.reduce((acc, header, index) => {
      acc[header] = cells[index] || "";
      return acc;
    }, {});
  });
};

const parseImportRows = async (file) => {
  const mimetype = file?.mimetype || "";
  if (
    mimetype === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    file.originalname?.toLowerCase().endsWith(".xlsx")
  ) {
    return parseXlsxRows(file.buffer);
  }

  if (
    mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    file.originalname?.toLowerCase().endsWith(".docx")
  ) {
    return parseDocxRows(file.buffer);
  }

  throw new HttpError("Unsupported file type. Upload .xlsx or .docx", 400);
};

const todayDateKey = () => {
  const now = new Date();
  return toDateKey({
    day: now.getUTCDate(),
    month: now.getUTCMonth() + 1,
    year: now.getUTCFullYear(),
  });
};

const bulkImportDailySlokas = async (req, res, next) => {
  try {
    if (!req.file) {
      throw new HttpError("Import file is required", 400);
    }

    const rows = await parseImportRows(req.file);
    if (!rows.length) {
      throw new HttpError("No data rows found in import file", 400);
    }

    const invalidRows = [];
    const latestByDateKey = new Map();

    rows.forEach((row, index) => {
      const rowNumber = index + 2;
      const dateRaw = getCellValue(row, ["date", "datekey"]);
      const sloka = getCellValue(row, ["sloka", "shloka"]);
      const author = getCellValue(row, ["author", "source"]);
      const meaning = getCellValue(row, ["meaning", "explanation"]);

      if (!dateRaw) {
        invalidRows.push({ row: rowNumber, reason: "date is required" });
        return;
      }

      if (!sloka) {
        invalidRows.push({ row: rowNumber, reason: "sloka is required" });
        return;
      }

      try {
        const parts = toDateParts(dateRaw);
        const dateKey = toDateKey(parts);
        const normalizedDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

        latestByDateKey.set(dateKey, {
          row: rowNumber,
          date: normalizedDate,
          dateKey,
          sloka,
          author: author || undefined,
          meaning: meaning || undefined,
        });
      } catch (error) {
        invalidRows.push({
          row: rowNumber,
          reason: error?.message || "Invalid date",
        });
      }
    });

    const validEntries = Array.from(latestByDateKey.values());
    if (!validEntries.length) {
      throw new HttpError("No valid rows found in import file", 400);
    }

    const operations = validEntries.map((entry) => ({
      updateOne: {
        filter: { dateKey: entry.dateKey },
        update: {
          $set: {
            sloka: entry.sloka,
            author: entry.author,
            meaning: entry.meaning,
            date: entry.date,
            dateKey: entry.dateKey,
            createdBy: req.user.userId,
          },
        },
        upsert: true,
      },
    }));

    const result = await DailySloka.bulkWrite(operations, { ordered: false });

    return sendSuccess(
      res,
      {
        totalRows: rows.length,
        processedRows: validEntries.length,
        skippedRows: rows.length - validEntries.length,
        upsertedCount: result.upsertedCount || 0,
        modifiedCount: result.modifiedCount || 0,
        matchedCount: result.matchedCount || 0,
        invalidRows,
      },
      "Daily slokas imported successfully"
    );
  } catch (error) {
    return next(error);
  }
};

const createDailySloka = async (req, res, next) => {
  try {
    const { sloka, date, author, meaning } = req.body;
    const parts = toDateParts(date);
    const dateKey = toDateKey(parts);
    const normalizedDate = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));

    const dailySloka = await DailySloka.findOneAndUpdate(
      { dateKey },
      {
        sloka,
        author,
        meaning,
        date: normalizedDate,
        dateKey,
        createdBy: req.user.userId,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).populate("createdBy", "email role isSuperAdmin");

    return sendSuccess(res, { dailySloka }, "Daily sloka saved successfully", 201);
  } catch (error) {
    return next(error);
  }
};

const getDailySloka = async (req, res, next) => {
  try {
    const dateKey = req.query.date ? toDateKey(toDateParts(req.query.date)) : todayDateKey();

    const dailySloka = await DailySloka.findOne({ dateKey }).populate(
      "createdBy",
      "email role"
    );

    return sendSuccess(
      res,
      { dailySloka, date: dateKey },
      dailySloka ? "Daily sloka fetched successfully" : "No daily sloka found for this date"
    );
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createDailySloka,
  getDailySloka,
  bulkImportDailySlokas,
};
