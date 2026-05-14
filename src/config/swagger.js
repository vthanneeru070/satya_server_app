const swaggerJSDoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "Satya Server Auth API",
      version: "1.0.0",
      description: "Production-grade auth and authorization backend APIs",
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
          required: ["itemName", "quantity", "unit"],
          properties: {
            itemName: { type: "string", example: "Kumkum" },
            quantity: { type: "string", example: "500" },
            unit: { type: "string", example: "grams" },
          },
        },
        ProductCreateMultipart: {
          type: "object",
          required: ["title", "items", "stockQuantity", "price"],
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
                "JSON array of pooja kit items. Example: [{\"itemName\":\"Kumkum\",\"quantity\":\"500\",\"unit\":\"grams\"}]",
            },
            stockQuantity: { type: "number", example: 100 },
            price: { type: "number", example: 999 },
            salePrice: { type: "number", example: 799 },
            currency: { type: "string", example: "ZAR" },
            deity: { type: "string", description: "Deity ObjectId" },
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
                "DELIVERED",
                "FULFILLED",
                "CANCELLED",
              ],
              description:
                "FULFILLED is set only after the customer confirms receipt via POST /orders/:id/confirm-delivery.",
            },
            paystackReference: { type: "string", nullable: true },
            transactionId: { type: "string", nullable: true },
            inventoryReserved: { type: "boolean" },
            tracking: { $ref: "#/components/schemas/OrderTracking" },
            invoice: { $ref: "#/components/schemas/OrderInvoice" },
            fulfillment: { $ref: "#/components/schemas/OrderFulfillment" },
            refund: { $ref: "#/components/schemas/OrderRefund" },
            orderType: {
              type: "string",
              enum: ["NORMAL", "REPLACEMENT"],
              description: "REPLACEMENT orders link to `replacementFor` and reuse original Paystack reference.",
            },
            replacementFor: { type: "string", nullable: true, description: "Original order id (replacement orders only)" },
            replacementReason: { type: "string" },
            replacementStatus: {
              type: "string",
              enum: ["REQUESTED", "APPROVED", "REJECTED", "SHIPPED", "DELIVERED"],
              nullable: true,
            },
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
              enum: ["PENDING", "APPROVED", "REJECTED", "COMPLETED"],
            },
            adminRemarks: { type: "string" },
            replacementOrder: { type: "string", nullable: true },
            resolvedBy: { type: "string", nullable: true },
            resolvedAt: { type: "string", format: "date-time", nullable: true },
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
