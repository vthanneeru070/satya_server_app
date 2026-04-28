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
          required: ["title", "deity"],
          properties: {
            title: { type: "string" },
            deity: { type: "string", description: "Deity ObjectId" },
            category: { type: "string" },
            difficulty: { type: "string" },
            duration: { type: "string" },
            description: { type: "string" },
            purpose: { type: "string", description: "JSON string" },
            deitySummary: { type: "string", description: "JSON string" },
            preparation: { type: "string", description: "JSON string" },
            steps: { type: "string", description: "JSON string array of step objects" },
            mantra: { type: "string", description: "JSON string" },
            spiritualMeaning: { type: "string", description: "JSON string" },
            guidance: { type: "string", description: "JSON string" },
            completion: { type: "string", description: "JSON string" },
            media: { type: "string", description: "JSON string" },
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
      },
    },
  },
  apis: ["./src/routes/*.js"],
};

module.exports = swaggerJSDoc(options);
