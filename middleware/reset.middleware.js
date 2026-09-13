import jwt from "jsonwebtoken";

import { SHORT_TOKEN_SECRET } from "../config/env.js";

import logger from "../libs/logger.js";

const resetMiddleware = async (req, res, next) => {
	try {
		const authHeader = req.headers.authorization;
        
	    if (!authHeader || !authHeader.startsWith("Bearer ")) {
	     	const error = new Error("Access Denied / Unauthorized request");
	     	error.statusCode = 401;
	     	throw error;
	    }

	    try {
	        const token = authHeader.split(' ')[1];
	      
	        if (!token) {
	        	const error = new Error("Invalid Token");
		        error.statusCode = 401;
		        throw error;
	        }
	      
	        const verifiedUser = jwt.verify(token, SHORT_TOKEN_SECRET);
	        req.user = verifiedUser; // Attach user info to request
	        next(); // Proceed to next middleware or route handler
	    } catch (err) {
			console.log(err);
	        const error = new Error("Invalid Token");
	        error.statusCode = 401;
	        throw error;
	    }
	}

	catch (error) {
		next(error);
	}
}

export default resetMiddleware;