import logger from "../libs/logger.js";
import { NODE_ENV } from "../config/env.js";

const errorMiddleware = (err, req, res, next) => {
    try {
      let statusCode = err.statusCode || 500;
  
      const response = {
        isSuccess: false,
        message: err.message || 'Internal Server Error',
      };
  
      // Include validation errors or any additional metadata
      if (err.data) response.data = err.data;

      if (err.code == "ER_DUP_ENTRY") {
        statusCode = 400;
        response.message = "Value already found. Try Inserting a new one..."
      }
  
      // Log the full error stack
      logger.error(err);

      // Include stack trace in response ONLY during development
      if (NODE_ENV !== 'production') {
        response.stack = err.stack;
      }
  
      res.status(statusCode).json(response);
    } 
  
    catch (error) {
      logger.error('Error in error handler:', error);
      res.status(500).json({
        isSuccess: false,
        message: 'Unexpected error occurred in error handler'
      });
    }
};
  
export default errorMiddleware;