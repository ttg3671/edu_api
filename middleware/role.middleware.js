// middlewares/authorizeRoles.middleware.js

const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    const userRole = req.user?.role;

    const hasRole = Boolean(
      userRole &&
        allowedRoles.some(
          (role) => String(role).toUpperCase() === String(userRole).toUpperCase()
        )
    );

    if (!hasRole) {
      const error = new Error("Forbidden: You don't have permission to access this resource.");
      error.statusCode = 403;
      return next(error);
    }

    next();
  };
};

export default authorizeRoles;
