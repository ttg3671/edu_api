import swaggerAutogen from 'swagger-autogen';

const doc = {
  info: {
    title: 'My Express REST API',
    description: 'Auto-generated OpenAPI specification for subscriptions and payments',
    version: '1.0.0',
  },
  host: 'localhost:4000', // Update with your actual server domain/port
  schemes: ['http', 'https'],
  securityDefinitions: {
    bearerAuth: {
      type: 'apiKey',
      in: 'header',
      name: 'Authorization',
      description: 'Enter your JWT token in the format: Bearer <token>'
    }
  },
  definitions: {
    SuccessResponse: {
      isSuccess: true,
      data: {},
      message: "Operation completed successfully"
    },
    ErrorResponse: {
      isSuccess: false,
      message: "Error message details"
    }
  }
};

const outputFile = './swagger-output.json'; // This will be your generated openapi.json file
const endpointsFiles = ['./app.js']; // Path to your main entry file or route files

// Generate swagger-output.json
swaggerAutogen()(outputFile, endpointsFiles, doc).then(() => {
  console.log('OpenAPI document generated successfully!');
});