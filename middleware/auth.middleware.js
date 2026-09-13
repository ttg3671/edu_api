import jwt from "jsonwebtoken";

import { ACCESS_TOKEN_SECRET } from "../config/env.js";

import logger from "../libs/logger.js";

const authMiddleware = async (req, res, next) => {
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
	      
	        const verifiedUser = jwt.verify(token, ACCESS_TOKEN_SECRET);
	        // console.log(verifiedUser);
	        req.user = verifiedUser; // Attach user info to request
	        next(); // Proceed to next middleware or route handler
	    } catch (err) {
			logger.error(err);
	        const error = new Error("Invalid Token");
	        error.statusCode = 401;
	        throw error;
	    }
	}

	catch (error) {
		next(error);
	}
}

export default authMiddleware;