const swaggerJSDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Satya Server API",
      version: "1.0.0",
      description:
        "Satya backend APIs — auth & user profiles, inventory, pooja kits (products), orders, payments, and admin.",
    },
    servers: [
      {
        url: "/api/v1",
        description: "Version 1 API",
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        SuccessResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: true },
            message: { type: "string", example: "Success" },
            data: { type: "object" },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            success: { type: "boolean", example: false },
            message: { type: "string", example: "Error message" },
          },
        },
        User: {
          type: "object",
          properties: {
            _id: { type: "string" },
            firebaseUid: { type: "string" },
            email: { type: "string", nullable: true },
            phone: { type: "string", nullable: true, description: "Local digits (no country code)" },
            countryCode: { type: "string", nullable: true, example: "+27" },
            fullName: { type: "string", nullable: true },
            firstName: { type: "string", nullable: true },
            lastName: { type: "string", nullable: true },
            gender: {
              type: "string",
              nullable: true,
              enum: ["male", "female", "other", "prefer_not_to_say"],
            },
            dateOfBirth: { type: "string", format: "date-time", nullable: true },
            timeOfBirth: { type: "string", nullable: true, example: "14:30" },
            placeOfBirth: { type: "string", nullable: true, example: "Hyderabad" },
            sunSign: {
              type: "string",
              nullable: true,
              enum: [
                "aries",
                "taurus",
                "gemini",
                "cancer",
                "leo",
                "virgo",
                "libra",
                "scorpio",
                "sagittarius",
                "capricorn",
                "aquarius",
                "pisces",
              ],
              example: "leo",
            },
            moonSign: {
              type: "string",
              nullable: true,
              enum: [
                "aries",
                "taurus",
                "gemini",
                "cancer",
                "leo",
                "virgo",
                "libra",
                "scorpio",
                "sagittarius",
                "capricorn",
                "aquarius",
                "pisces",
              ],
              example: "cancer",
            },
            photoUrl: { type: "string", nullable: true, description: "OAuth avatar URL" },
            profileImageUrl: { type: "string", nullable: true, description: "S3 upload URL" },
            imageUrl: {
              type: "string",
              nullable: true,
              description: "profileImageUrl || photoUrl",
            },
            isRegistered: {
              type: "boolean",
              description:
                "True when basic details + profile image are complete (mobile: go to home vs registration)",
            },
            emailVerified: { type: "boolean" },
            provider: { type: "string", enum: ["google", "apple", "password"] },
            role: { type: "string", enum: ["user", "admin", "superadmin"] },
            timezone: { type: "string" },
            preferredLanguage: { type: "string", enum: ["en", "te", "ta", "hi", "kn"] },
            favoriteDeities: {
              type: "array",
              items: { type: "string" },
              description: "Favourite deity ObjectIds (on profile; use GET /auth/favorite-deities for full objects)",
            },
            accountDeletionComment: {
              type: "string",
              nullable: true,
              description: "Reason given when the user deleted their account",
            },
            accountDeletedAt: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        UserInboxNotification: {
          type: "object",
          properties: {
            id: { type: "string", description: "Inbox row id" },
            notificationId: {
              type: "string",
              nullable: true,
              description: "Admin broadcast id when type is ADMIN_BROADCAST",
            },
            title: { type: "string" },
            body: { type: "string" },
            imageUrl: { type: "string", nullable: true },
            type: {
              type: "string",
              example: "ORDER_SHIPPED",
              description:
                "e.g. ADMIN_BROADCAST, ORDER_PLACED, ORDER_SHIPPED, ORDER_DELIVERED, ORDER_CANCELLED",
            },
            read: { type: "boolean" },
            readAt: { type: "string", format: "date-time", nullable: true },
            sentAt: { type: "string", format: "date-time" },
            createdAt: { type: "string", format: "date-time" },
          },
        },
        GlobalSearchHit: {
          type: "object",
          properties: {
            id: { type: "string", description: "Item ObjectId" },
            type: {
              type: "string",
              enum: ["pooja", "festival", "ritual", "deity", "donation"],
            },
            title: { type: "string", example: "Ganesh Pooja" },
            name: { type: "string", example: "Ganesha", description: "Same as title for deities" },
            description: { type: "string" },
            imageUrl: { type: "string", nullable: true },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        GlobalSearchResponse: {
          type: "object",
          properties: {
            query: { type: "string" },
            total: { type: "integer" },
            results: {
              type: "array",
              items: { $ref: "#/components/schemas/GlobalSearchHit" },
            },
            countsByType: {
              type: "object",
              additionalProperties: { type: "integer" },
              example: { pooja: 2, festival: 1, ritual: 0, deity: 3, donation: 1 },
            },
            byType: {
              type: "object",
              description: "Optional grouped results per type",
            },
          },
        },
        PoojaHistoryOverview: {
          type: "object",
          properties: {
            pendingCount: { type: "integer", example: 2 },
            finishedCount: { type: "integer", example: 15 },
            totalCount: { type: "integer", example: 17 },
            pending: {
              type: "array",
              items: { $ref: "#/components/schemas/UserPoojaSession" },
            },
            finished: {
              type: "array",
              items: { $ref: "#/components/schemas/UserPoojaSession" },
            },
            pagination: {
              type: "object",
              properties: {
                pending: {
                  type: "object",
                  properties: {
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    total: { type: "integer" },
                    totalPages: { type: "integer" },
                  },
                },
                finished: {
                  type: "object",
                  properties: {
                    page: { type: "integer" },
                    limit: { type: "integer" },
                    total: { type: "integer" },
                    totalPages: { type: "integer" },
                  },
                },
              },
            },
          },
        },
        UserPoojaSession: {
          type: "object",
          properties: {
            _id: { type: "string" },
            status: { type: "string", enum: ["PENDING", "FINISHED"] },
            currentStep: { type: "integer", example: 2 },
            totalSteps: { type: "integer", example: 5 },
            progressPercent: { type: "integer", example: 40 },
            startedAt: { type: "string", format: "date-time" },
            finishedAt: { type: "string", format: "date-time", nullable: true },
            pooja: {
              type: "object",
              description: "Populated Pooja document",
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        DeitySummary: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string" },
            alternate_names: { type: "array", items: { type: "string" } },
            description: { type: "string" },
            deity_color: {
              type: "string",
              description: "Hex color for UI branding (e.g. #FF5733)",
              example: "#FF5733",
            },
            roles: { type: "array", items: { type: "string" } },
            media: {
              type: "object",
              properties: {
                images: { type: "array", items: { type: "string" } },
              },
            },
            status: { type: "string", enum: ["APPROVED"] },
          },
        },
        UserProfilePayload: {
          type: "object",
          properties: {
            user: { $ref: "#/components/schemas/User" },
            isRegistered: { type: "boolean" },
          },
        },
        LoginResponse: {
          type: "object",
          properties: {
            user: { $ref: "#/components/schemas/User" },
            isRegistered: {
              type: "boolean",
              description: "false → show basic-details screen; true → home",
            },
            accessToken: { type: "string" },
            refreshToken: { type: "string" },
          },
        },
        ProfileCreateMultipart: {
          type: "object",
          required: ["fullName", "gender", "countryCode"],
          properties: {
            fullName: { type: "string", example: "Venkat Thanneeru" },
            gender: {
              type: "string",
              enum: ["male", "female", "other", "prefer_not_to_say"],
            },
            dateOfBirth: { type: "string", format: "date", example: "1990-05-15" },
            timeOfBirth: { type: "string", example: "14:30" },
            placeOfBirth: { type: "string", example: "Hyderabad" },
            sunSign: {
              type: "string",
              enum: [
                "aries",
                "taurus",
                "gemini",
                "cancer",
                "leo",
                "virgo",
                "libra",
                "scorpio",
                "sagittarius",
                "capricorn",
                "aquarius",
                "pisces",
              ],
              example: "leo",
            },
            moonSign: {
              type: "string",
              enum: [
                "aries",
                "taurus",
                "gemini",
                "cancer",
                "leo",
                "virgo",
                "libra",
                "scorpio",
                "sagittarius",
                "capricorn",
                "aquarius",
                "pisces",
              ],
              example: "cancer",
            },
            countryCode: { type: "string", example: "+27" },
            phone: { type: "string", example: "821234567" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            timezone: { type: "string", example: "Asia/Kolkata" },
            preferredLanguage: { type: "string", enum: ["en", "te", "ta", "hi", "kn"] },
            image: {
              type: "string",
              format: "binary",
              description: "Optional profile photo upload",
            },
          },
        },
        ProfileUpdateMultipart: {
          type: "object",
          properties: {
            fullName: { type: "string" },
            gender: {
              type: "string",
              enum: ["male", "female", "other", "prefer_not_to_say"],
            },
            dateOfBirth: { type: "string", format: "date" },
            timeOfBirth: { type: "string", example: "14:30" },
            placeOfBirth: { type: "string", example: "Johannesburg" },
            sunSign: {
              type: "string",
              enum: [
                "aries",
                "taurus",
                "gemini",
                "cancer",
                "leo",
                "virgo",
                "libra",
                "scorpio",
                "sagittarius",
                "capricorn",
                "aquarius",
                "pisces",
              ],
            },
            moonSign: {
              type: "string",
              enum: [
                "aries",
                "taurus",
                "gemini",
                "cancer",
                "leo",
                "virgo",
                "libra",
                "scorpio",
                "sagittarius",
                "capricorn",
                "aquarius",
                "pisces",
              ],
            },
            countryCode: { type: "string", example: "+27" },
            phone: { type: "string" },
            firstName: { type: "string" },
            lastName: { type: "string" },
            timezone: { type: "string" },
            preferredLanguage: { type: "string", enum: ["en", "te", "ta", "hi", "kn"] },
            image: { type: "string", format: "binary" },
          },
        },
        DeleteAccountBody: {
          type: "object",
          required: ["comment"],
          properties: {
            comment: {
              type: "string",
              minLength: 5,
              maxLength: 500,
              example: "I no longer use this app.",
              description: "Required reason for deleting the account",
            },
            refreshToken: {
              type: "string",
              description: "Optional — also revoke this refresh token",
            },
          },
        },
        PoojaStep: {
          type: "object",
          properties: {
            stepNumber: { type: "integer", example: 1 },
            title: { type: "string", example: "Sankalpa" },
            description: { type: "string", example: "Set your intention." },
            subSteps: {
              type: "array",
              items: { type: "string" },
            },
          },
        },
        PoojaKeyValue: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
          },
        },
        PoojaMedia: {
          type: "object",
          properties: {
            images: { type: "array", items: { type: "string", format: "uri" } },
            audio: { type: "array", items: { type: "string", format: "uri" } },
            videos: { type: "array", items: { type: "string", format: "uri" } },
          },
        },
        PoojaCreateMultipart: {
          type: "object",
          required: ["title", "date", "deity"],
          properties: {
            title: { type: "string" },
            date: { type: "string", example: "05-05-2026" },
            deity: { type: "string", description: "Deity ObjectId" },
            category: { type: "string" },
            difficulty: { type: "string" },
            duration: { type: "string" },
            description: { type: "string" },
            accessType: {
              type: "string",
              enum: ["FREE", "PAID"],
              default: "FREE",
              description: "When PAID, price (>0) and currency are required.",
            },
            price: {
              type: "number",
              example: 0,
              description: "Required and must be > 0 when accessType is PAID.",
            },
            currency: {
              type: "string",
              example: "ZAR",
              description: "Required (non-empty) when accessType is PAID.",
            },
            purpose: { type: "string", description: "JSON string" },
            deitySummary: { type: "string", description: "JSON string" },
            preparation: { type: "string", description: "JSON string" },
            steps: { type: "string", description: "JSON string array of step objects" },
            mantra: { type: "string", description: "JSON string" },
            spiritualMeaning: { type: "string", description: "JSON string" },
            guidance: { type: "string", description: "JSON string" },
            completion: { type: "string", description: "JSON string" },
            media: { type: "string", description: "JSON string" },
            blessings: {
              type: "string",
              description: "Array of blessings (JSON array string or comma-separated string)",
            },
            status: {
              type: "string",
              enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"],
            },
            image: { type: "string", format: "binary" },
            audio: { type: "string", format: "binary" },
            video: { type: "string", format: "binary" },
            festivalIds: { type: "string", description: "ObjectId, comma list, or JSON array string" },
            rating: { type: "number" },
          },
        },
        PoojaUpdateMultipart: {
          allOf: [{ $ref: "#/components/schemas/PoojaCreateMultipart" }],
        },
        RitualContent: {
          type: "object",
          required: ["title"],
          properties: {
            title: { type: "string", example: "Morning sankalpa" },
            description: { type: "string", example: "Set intention for the day." },
            imageUrl: {
              type: "string",
              format: "uri",
              description: "Optional illustration URL for this content block",
            },
          },
        },
        RitualSection: {
          type: "object",
          required: ["key", "label"],
          properties: {
            key: { type: "string", example: "overview", description: "Stable machine key" },
            label: { type: "string", example: "Overview", description: "Human-readable heading" },
            contents: {
              type: "array",
              items: { $ref: "#/components/schemas/RitualContent" },
              default: [],
            },
          },
        },
        RitualDay: {
          type: "object",
          required: ["dayNumber", "title"],
          properties: {
            dayNumber: { type: "integer", minimum: 1, example: 1 },
            title: { type: "string", example: "Day 1 — Invocation" },
            activities: {
              type: "array",
              items: { type: "string" },
              example: ["Light lamp", "Offer flowers"],
            },
            mantra: { type: "string", example: "" },
            affirmation: { type: "string", example: "" },
          },
        },
        Ritual: {
          type: "object",
          description: "Ritual document as returned by GET /rituals and related endpoints",
          properties: {
            _id: { type: "string", example: "507f1f77bcf86cd799439011" },
            title: { type: "string" },
            slug: { type: "string" },
            description: { type: "string" },
            deity: { oneOf: [{ type: "string" }, { type: "object" }] },
            category: { type: "string" },
            purpose: { type: "string" },
            ritualDays: { type: "integer", minimum: 1, description: "Programme length in days" },
            bestDayTime: { type: "string" },
            startingDay: { type: "string" },
            difficulty: {
              type: "string",
              enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
            },
            sections: {
              type: "array",
              items: { $ref: "#/components/schemas/RitualSection" },
            },
            days: {
              type: "array",
              items: { $ref: "#/components/schemas/RitualDay" },
            },
            images: { type: "array", items: { type: "string", format: "uri" } },
            audio: { type: "array", items: { type: "string", format: "uri" } },
            videos: { type: "array", items: { type: "string", format: "uri" } },
            accessType: { type: "string", enum: ["FREE", "PAID"] },
            price: { type: "number" },
            currency: { type: "string", example: "ZAR" },
            isFeatured: { type: "boolean" },
            viewCount: { type: "integer" },
            purchaseCount: { type: "integer" },
            status: {
              type: "string",
              enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"],
            },
            createdBy: { oneOf: [{ type: "string" }, { type: "object" }] },
            isDeleted: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        RitualMultipartFields: {
          type: "object",
          properties: {
            title: { type: "string" },
            slug: {
              type: "string",
              description: "Optional on create; generated from title if omitted",
            },
            description: { type: "string" },
            deity: { type: "string", description: "Deity MongoDB ObjectId (24-char hex)" },
            category: { type: "string" },
            purpose: { type: "string" },
            ritualDays: {
              type: "integer",
              minimum: 1,
              description:
                "Total days in the ritual programme (required on create). In multipart/form-data you may send a numeric string.",
              example: 7,
            },
            bestDayTime: { type: "string" },
            startingDay: { type: "string" },
            difficulty: {
              type: "string",
              enum: ["BEGINNER", "INTERMEDIATE", "ADVANCED"],
              default: "BEGINNER",
            },
            sections: {
              type: "string",
              description:
                "JSON array of RitualSection objects (key, label, contents[]). Same shape as `Ritual.sections` in responses.",
            },
            days: {
              type: "string",
              description:
                "JSON array of RitualDay objects (dayNumber, title, activities[], mantra, affirmation).",
            },
            media: {
              type: "string",
              description:
                'Optional JSON object merging URL lists with uploaded files, e.g. {"images":[],"audio":[],"videos":[]}. Uploaded `image`/`audio`/`video` files are appended server-side.',
            },
            accessType: {
              type: "string",
              enum: ["FREE", "PAID"],
              default: "FREE",
              description: "When PAID, price (>0) and currency are required.",
            },
            price: {
              type: "number",
              description: "Required and must be > 0 when accessType is PAID.",
            },
            currency: {
              type: "string",
              example: "ZAR",
              description: "Required (non-empty) when accessType is PAID.",
            },
            isFeatured: { type: "boolean" },
            status: {
              type: "string",
              enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED"],
              description: "Superadmins may set explicitly on create; others default to PENDING.",
            },
            image: { type: "string", format: "binary", description: "Optional; merged into images[]" },
            audio: { type: "string", format: "binary", description: "Optional; merged into audio[]" },
            video: { type: "string", format: "binary", description: "Optional; merged into videos[]" },
          },
        },
        RitualCreateMultipart: {
          allOf: [
            { $ref: "#/components/schemas/RitualMultipartFields" },
            {
              type: "object",
              required: ["title", "deity", "ritualDays"],
            },
          ],
        },
        RitualUpdateMultipart: {
          allOf: [{ $ref: "#/components/schemas/RitualMultipartFields" }],
        },
        PoojaKitItem: {
          type: "object",
          required: ["inventoryItem", "quantity"],
          properties: {
            inventoryItem: {
              type: "string",
              description: "InventoryItem ObjectId",
              example: "6a030010936141f352857e07",
            },
            quantity: {
              type: "number",
              description:
                "Stock units consumed per kit sold (e.g. 2 packs of 50g if itemQuantity is 50)",
              example: 1,
            },
          },
        },
        InventoryCategory: {
          type: "object",
          properties: {
            _id: { type: "string" },
            code: {
              type: "string",
              example: "SACRED_POWDERS",
              description: "Stored on InventoryItem.category",
            },
            label: { type: "string", example: "Sacred Powders" },
            sortOrder: { type: "integer" },
            isActive: { type: "boolean" },
          },
        },
        InventoryItem: {
          type: "object",
          properties: {
            _id: { type: "string" },
            name: { type: "string" },
            slug: { type: "string" },
            category: {
              type: "string",
              description: "InventoryCategory code (see GET /inventory/categories)",
              example: "SACRED_POWDERS",
            },
            unit: { type: "string", example: "grams", description: "Unit for itemQuantity" },
            itemQuantity: {
              type: "number",
              example: 50,
              description: "Amount per one stock unit (e.g. 50 grams per pack)",
            },
            stockQuantity: {
              type: "integer",
              example: 50,
              description: "Count of stock units in warehouse (e.g. 50 packs)",
            },
            totalAvailableQuantity: {
              type: "number",
              example: 2500,
              description: "stockQuantity × itemQuantity (e.g. 50 packs × 50g)",
            },
            price: { type: "number", example: 29.99, description: "Per stock unit" },
            salePrice: { type: "number", nullable: true, example: 24.99 },
            currency: { type: "string", example: "ZAR" },
            effectivePrice: { type: "number", description: "salePrice if set, else price" },
            lowStockThreshold: { type: "number" },
            status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
            imageUrl: { type: "string", nullable: true },
            supplierName: { type: "string" },
            description: { type: "string" },
            isLowStock: { type: "boolean" },
          },
        },
        InventoryCreateMultipart: {
          type: "object",
          required: ["name", "category", "unit", "itemQuantity", "price", "currency"],
          properties: {
            name: { type: "string", example: "Turmeric powder 50g" },
            slug: { type: "string" },
            description: { type: "string" },
            category: { type: "string", example: "SACRED_POWDERS" },
            unit: { type: "string", example: "grams" },
            itemQuantity: { type: "number", example: 50 },
            stockQuantity: { type: "integer", example: 0 },
            price: { type: "number", example: 29.99 },
            salePrice: { type: "number" },
            currency: { type: "string", example: "ZAR" },
            supplierName: { type: "string" },
            lowStockThreshold: { type: "integer" },
            status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
            image: { type: "string", format: "binary" },
          },
        },
        InventoryUpdateMultipart: {
          allOf: [{ $ref: "#/components/schemas/InventoryCreateMultipart" }],
        },
        Product: {
          type: "object",
          properties: {
            _id: { type: "string" },
            title: { type: "string" },
            slug: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  inventoryItem: { $ref: "#/components/schemas/InventoryItem" },
                  quantity: { type: "number" },
                },
              },
            },
            price: { type: "number" },
            salePrice: { type: "number", nullable: true },
            currency: { type: "string" },
            associate_puja: {
              type: "array",
              items: { type: "string" },
              description: "Linked Pooja ObjectIds",
            },
            effectivePrice: { type: "number" },
            stockQuantity: {
              type: "integer",
              readOnly: true,
              description: "Max kits buildable from inventory",
            },
            inStock: { type: "boolean", readOnly: true },
            status: {
              type: "string",
              enum: ["DRAFT", "PENDING", "APPROVED", "REJECTED", "QUEUED"],
            },
            productStatus: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
            imageUrl: { type: "string", nullable: true },
          },
        },
        ProductCreateMultipart: {
          type: "object",
          required: ["title", "items", "price"],
          properties: {
            title: { type: "string", example: "Ganesh Pooja Kit" },
            slug: { type: "string", example: "ganesh-pooja-kit" },
            description: {
              type: "string",
              example: "Complete pooja kit for Ganesh Pooja",
            },
            items: {
              type: "string",
              description:
                'JSON array of kit lines referencing inventory. Example: [{"inventoryItem":"6a03...","quantity":1}]',
            },
            stockQuantity: {
              type: "number",
              readOnly: true,
              description:
                "Computed on read — max kits buildable from inventory (not sent on create)",
            },
            price: { type: "number", example: 999 },
            salePrice: { type: "number", example: 799 },
            currency: { type: "string", example: "ZAR" },
            deity: { type: "string", description: "Deity ObjectId" },
            associate_puja: {
              type: "string",
              description:
                'JSON array of Pooja ObjectIds, e.g. ["507f1f77bcf86cd799439011","507f1f77bcf86cd799439012"]',
            },
            category: { type: "string", example: "Ganesh" },
            status: {
              type: "string",
              enum: ["DRAFT", "PENDING"],
              description:
                "Review workflow status. Admins can set DRAFT or submit for review (PENDING, default). APPROVED / REJECTED / QUEUED are set only by superadmin via PUT /products/review/:id.",
            },
            productStatus: {
              type: "string",
              enum: ["ACTIVE", "INACTIVE"],
              description: "Publish toggle. Public list/get only return ACTIVE products.",
            },
            isFeatured: { type: "boolean", example: false },
            image: { type: "string", format: "binary" },
          },
        },
        ProductUpdateMultipart: {
          allOf: [{ $ref: "#/components/schemas/ProductCreateMultipart" }],
        },
        ShippingAddress: {
          type: "object",
          required: ["fullName", "phone", "city", "state"],
          properties: {
            fullName: { type: "string", example: "Venkat Thanneeru" },
            phone: { type: "string", example: "+27821234567" },
            addressLine1: { type: "string", example: "12 Temple Road" },
            line1: { type: "string", description: "Legacy alias for addressLine1" },
            city: { type: "string", example: "Johannesburg" },
            state: { type: "string", example: "Gauteng" },
            postalCode: { type: "string", example: "2000" },
            pincode: { type: "string", description: "Legacy alias for postalCode" },
            country: { type: "string", example: "South Africa" },
          },
        },
        CreateOrderRequest: {
          type: "object",
          required: ["shippingAddress"],
          properties: {
            items: {
              type: "array",
              description:
                "Optional. Omit to use the user's cart. Provide for Buy Now.",
              items: {
                type: "object",
                required: ["productId", "quantity"],
                properties: {
                  productId: { type: "string" },
                  quantity: { type: "integer", minimum: 1 },
                },
              },
            },
            shippingAddress: { $ref: "#/components/schemas/ShippingAddress" },
            paymentMethod: {
              type: "string",
              enum: ["COD", "EFT", "PAYSTACK"],
              default: "PAYSTACK",
            },
          },
        },
        PaystackInitResponse: {
          type: "object",
          properties: {
            reference: { type: "string", example: "PSK-ORD-LXRZ4-A1B2C3-XYZ" },
            accessCode: { type: "string", example: "abcd1234efgh5678" },
            authorizationUrl: {
              type: "string",
              format: "uri",
              example: "https://checkout.paystack.com/abcd1234efgh5678",
            },
            callbackUrl: {
              type: "string",
              format: "uri",
              nullable: true,
              description:
                "Resolved Paystack redirect URL. Echoes the per-request callbackUrl when provided, otherwise the server-wide PAYSTACK_CALLBACK_URL.",
              example: "https://satya-server-app-1.onrender.com/payment-success",
            },
            publicKey: { type: "string", nullable: true, example: "pk_test_..." },
            amount: { type: "number", example: 1647 },
            currency: { type: "string", example: "ZAR" },
            email: { type: "string", example: "user@example.com" },
          },
        },
        InitiateDonationRequest: {
          type: "object",
          required: ["amount"],
          properties: {
            amount: { type: "number", minimum: 10, example: 100 },
            currency: { type: "string", default: "ZAR", example: "ZAR" },
            note: {
              type: "string",
              maxLength: 280,
              example: "Om Namah Shivaya",
            },
            callbackUrl: {
              type: "string",
              format: "uri",
              example: "https://app.example.com/donation/return",
            },
          },
        },
        DonationContribution: {
          type: "object",
          properties: {
            _id: { type: "string" },
            contributionNumber: { type: "string", example: "SATYA-DON-10001" },
            donation: { type: "string" },
            user: { type: "string" },
            amount: { type: "number", example: 100 },
            currency: { type: "string", example: "ZAR" },
            paymentStatus: {
              type: "string",
              enum: ["PENDING", "PAID", "FAILED", "REFUNDED"],
            },
            paymentMethod: { type: "string", enum: ["PAYSTACK"] },
            paystackReference: { type: "string" },
            transactionId: { type: "string", nullable: true },
            note: { type: "string" },
            isDeleted: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        Payment: {
          type: "object",
          properties: {
            _id: { type: "string" },
            user: { type: "string" },
            order: { type: "string", nullable: true },
            donationContribution: { type: "string", nullable: true },
            paymentFor: {
              type: "string",
              enum: ["ORDER", "DONATION"],
              description:
                "ORDER payments link to an Order; DONATION payments link to a DonationContribution.",
            },
            amount: { type: "number", example: 999 },
            currency: { type: "string", example: "ZAR" },
            gateway: { type: "string", enum: ["PAYSTACK"] },
            reference: { type: "string", example: "PSK-DON-10001-A1B2C3" },
            paymentId: { type: "string", nullable: true },
            transactionId: { type: "string", nullable: true },
            status: {
              type: "string",
              enum: ["PENDING", "SUCCESS", "FAILED"],
            },
            response: { type: "object" },
            isDeleted: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        OrderTracking: {
          type: "object",
          description: "Courier / dispatch details on an Order.",
          properties: {
            courier: { type: "string", example: "The Courier Guy" },
            trackingNumber: { type: "string", example: "CG123456789" },
            trackingUrl: { type: "string", format: "uri", nullable: true },
            dispatchedAt: { type: "string", format: "date-time", nullable: true },
            sharedWithUserAt: {
              type: "string",
              format: "date-time",
              nullable: true,
              description: "Timestamp of the most recent tracking email sent to the buyer.",
            },
          },
        },
        OrderInvoice: {
          type: "object",
          description: "Generated invoice metadata for a paid Order.",
          properties: {
            number: { type: "string", example: "INV-10001" },
            url: { type: "string", format: "uri", nullable: true },
            generatedAt: { type: "string", format: "date-time", nullable: true },
          },
        },
        OrderFulfillment: {
          type: "object",
          description:
            "Post-delivery customer satisfaction. `satisfied` is null until the user confirms via POST /orders/:id/confirm-delivery.",
          properties: {
            satisfied: { type: "boolean", nullable: true },
            ratedAt: { type: "string", format: "date-time", nullable: true },
            feedback: { type: "string" },
          },
        },
        OrderCancelOrder: {
          type: "object",
          description: "Present when orderStatus is CANCELLED.",
          properties: {
            canceledBy: { type: "string", enum: ["user", "admin"] },
            cancelReason: { type: "string", maxLength: 2000 },
            canceledAt: { type: "string", format: "date-time" },
          },
        },
        OrderRefundedBy: {
          type: "object",
          properties: {
            adminId: { type: "string" },
            fullName: { type: "string" },
            email: { type: "string" },
          },
        },
        OrderRefund: {
          type: "object",
          description:
            "Paystack refund state. `PENDING` means the refund was accepted by Paystack and we're waiting on the `refund.processed` webhook. `FAILED` means the auto-refund call was rejected and admin must settle manually.",
          properties: {
            status: {
              type: "string",
              enum: ["NONE", "PENDING", "PROCESSED", "FAILED"],
              default: "NONE",
            },
            paystackRefundId: { type: "string" },
            amount: { type: "number" },
            currency: { type: "string" },
            attemptedAt: { type: "string", format: "date-time", nullable: true },
            processedAt: { type: "string", format: "date-time", nullable: true },
            lastError: { type: "string" },
            reason: { type: "string", maxLength: 2000 },
            adminNote: { type: "string", maxLength: 2000 },
            refundedBy: { $ref: "#/components/schemas/OrderRefundedBy" },
          },
        },
        Order: {
          type: "object",
          properties: {
            _id: { type: "string" },
            orderNumber: { type: "string", example: "SATYA-10001" },
            user: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  product: { type: "string" },
                  title: { type: "string" },
                  imageUrl: { type: "string" },
                  quantity: { type: "integer" },
                  price: { type: "number" },
                  lineTotal: { type: "number" },
                },
              },
            },
            totalAmount: { type: "number", example: 999 },
            currency: { type: "string", example: "ZAR" },
            paymentStatus: {
              type: "string",
              enum: [
                "PENDING",
                "PAID",
                "FAILED",
                "REFUNDED",
                "REFUND_INITIATED",
                "REFUND_FAILED",
              ],
            },
            paymentMethod: {
              type: "string",
              enum: ["COD", "EFT", "PAYSTACK"],
            },
            orderStatus: {
              type: "string",
              enum: [
                "PLACED",
                "PROCESSING",
                "SHIPPED",
                "OUT_FOR_DELIVERY",
                "DELIVERED",
                "FULFILLED",
                "CANCELLED",
              ],
              description:
                "FULFILLED is set only after the customer confirms receipt via POST /orders/:id/confirm-delivery.",
            },
            paystackReference: { type: "string", nullable: true },
            transactionId: { type: "string", nullable: true },
            originalPaystackReference: { type: "string", description: "Audit copy on replacement orders" },
            originalTransactionId: { type: "string", description: "Audit copy on replacement orders" },
            inventoryReserved: { type: "boolean" },
            tracking: { $ref: "#/components/schemas/OrderTracking" },
            invoice: { $ref: "#/components/schemas/OrderInvoice" },
            fulfillment: { $ref: "#/components/schemas/OrderFulfillment" },
            refund: { $ref: "#/components/schemas/OrderRefund" },
            cancelOrder: { $ref: "#/components/schemas/OrderCancelOrder" },
            orderType: {
              type: "string",
              enum: ["NORMAL", "REPLACEMENT"],
              description: "REPLACEMENT orders link to `replacementFor` and reuse original Paystack reference.",
            },
            replacementFor: { type: "string", nullable: true, description: "Original order id (replacement orders only)" },
            replacementReason: { type: "string" },
            parentOrderNumber: { type: "string", description: "Original SATYA-… number on replacement orders" },
            replacementState: {
              type: "string",
              enum: ["NONE", "REQUESTED", "APPROVED", "REJECTED", "IN_PROGRESS", "COMPLETED"],
              description: "Summary on the original order for replacement UI",
            },
            replacementCount: { type: "integer", minimum: 0 },
            latestReplacementRequest: { type: "string", nullable: true },
            latestReplacementOrder: { type: "string", nullable: true },
            shippingAddress: { $ref: "#/components/schemas/ShippingAddress" },
            orderStatusHistory: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  status: { type: "string" },
                  at: { type: "string", format: "date-time" },
                  note: { type: "string" },
                },
              },
            },
            isDeleted: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        ReplacementRequest: {
          type: "object",
          properties: {
            _id: { type: "string" },
            requestNumber: { type: "string", example: "REP-10001" },
            user: { type: "string" },
            order: { type: "string", description: "Original order id" },
            reason: { type: "string" },
            images: { type: "array", items: { type: "string", format: "uri" } },
            status: {
              type: "string",
              enum: [
                "REQUESTED",
                "APPROVED",
                "REJECTED",
                "PROCESSING",
                "SHIPPED",
                "DELIVERED",
                "CANCELLED",
              ],
            },
            adminRemarks: { type: "string" },
            replacementOrder: { type: "string", nullable: true },
            resolvedBy: { type: "string", nullable: true },
            resolvedAt: { type: "string", format: "date-time", nullable: true },
            completedAt: { type: "string", format: "date-time", nullable: true },
            rejectedAt: { type: "string", format: "date-time", nullable: true },
            cancellationReason: { type: "string" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        SetTrackingRequest: {
          type: "object",
          required: ["courier", "trackingNumber"],
          properties: {
            courier: { type: "string", example: "The Courier Guy" },
            trackingNumber: { type: "string", example: "CG123456789" },
            trackingUrl: {
              type: "string",
              format: "uri",
              example: "https://www.thecourierguy.co.za/track?n=CG123456789",
            },
          },
        },
        DispatchOrderRequest: {
          allOf: [
            { $ref: "#/components/schemas/SetTrackingRequest" },
            {
              type: "object",
              properties: {
                note: { type: "string", maxLength: 300 },
              },
            },
          ],
        },
        ConfirmDeliveryRequest: {
          type: "object",
          required: ["satisfied"],
          properties: {
            satisfied: { type: "boolean" },
            feedback: { type: "string", maxLength: 2000 },
          },
        },
        OrderRequestHistoryEntry: {
          type: "object",
          properties: {
            status: { type: "string" },
            at: { type: "string", format: "date-time" },
            note: { type: "string" },
            by: { type: "string", nullable: true },
          },
        },
        OrderRequest: {
          type: "object",
          properties: {
            _id: { type: "string" },
            requestNumber: { type: "string", example: "REQ-10001" },
            order: {
              oneOf: [
                { type: "string" },
                { $ref: "#/components/schemas/Order" },
              ],
            },
            user: { type: "string" },
            type: {
              type: "string",
              enum: ["CANCELLATION", "REFUND"],
            },
            reason: { type: "string" },
            attachments: {
              type: "array",
              items: { type: "string", format: "uri" },
            },
            status: {
              type: "string",
              enum: ["PENDING", "APPROVED", "REJECTED", "COMPLETED"],
            },
            adminNote: { type: "string" },
            resolvedBy: { type: "string", nullable: true },
            resolvedAt: { type: "string", format: "date-time", nullable: true },
            replacementOrder: {
              oneOf: [
                { type: "string" },
                { $ref: "#/components/schemas/Order" },
              ],
              nullable: true,
              description:
                "Set on approved REPLACEMENT requests — points to the new auto-created order.",
            },
            history: {
              type: "array",
              items: { $ref: "#/components/schemas/OrderRequestHistoryEntry" },
            },
            isDeleted: { type: "boolean" },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        CreateOrderRequestBody: {
          type: "object",
          required: ["type"],
          properties: {
            type: {
              type: "string",
              enum: ["CANCELLATION", "REFUND"],
            },
            reason: { type: "string", maxLength: 2000 },
            attachments: {
              type: "array",
              items: { type: "string", format: "uri" },
              maxItems: 10,
            },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.js"],
};

module.exports = swaggerJSDoc(options);
