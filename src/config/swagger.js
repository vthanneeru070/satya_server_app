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
            status: { type: "string", enum: ["ACTIVE", "INACTIVE"] },
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
            publicKey: { type: "string", nullable: true, example: "pk_test_..." },
            amount: { type: "number", example: 1647 },
            currency: { type: "string", example: "ZAR" },
            email: { type: "string", example: "user@example.com" },
          },
        },
      },
    },
  },
  apis: ["./src/routes/*.js"],
};

module.exports = swaggerJSDoc(options);
