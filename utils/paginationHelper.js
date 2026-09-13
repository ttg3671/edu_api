/**
 * Pagination and Response Helper Functions for MySQL
 * Provides reusable utilities for paginated endpoints
 */

/**
 * Extract and validate pagination parameters from query
 * @param {Object} query - Request query object
 * @param {number} defaultItemsPerPage - Default items per page (default: 10)
 * @returns {Object} { itemsPerPage, pageNumber, offset }
 */
export const getPaginationParams = (query, defaultItemsPerPage = 10) => {
  const itemsPerPage = parseInt(query.page_items || defaultItemsPerPage) || defaultItemsPerPage;
  const pageNumber = parseInt(query.pgNo || 1) || 1;
  const offset = (pageNumber - 1) * itemsPerPage;

  return {
    itemsPerPage,
    pageNumber,
    offset
  };
};

/**
 * Extract cursor pagination parameters from query
 * @param {Object} query - Request query object
 * @param {number} defaultLimit - Default items per page (default: 10)
 * @returns {Object} { limit, cursor }
 */
export const getCursorPaginationParams = (query, defaultLimit = 10) => {
  const limit = parseInt(query.limit || defaultLimit) || defaultLimit;
  const cursor = query.cursor ? parseInt(query.cursor) : null;

  return {
    limit,
    cursor
  };
};

/**
 * Execute a cursor-based paginated query (MySQL)
 * @param {Object} db - Database connection
 * @param {string} baseQuery - The base SQL query without WHERE or LIMIT
 * @param {Array} params - Parameters for the base query
 * @param {number|string|null} cursor - The cursor value (usually ID)
 * @param {number} limit - Number of items to fetch
 * @param {string} orderByColumn - Column to order by and use for cursor
 * @param {string} sortOrder - Sort order (ASC or DESC, default: DESC)
 * @returns {Promise<Object>} { result, nextCursor, hasMore }
 */
export const getCursorResults = async (
  db,
  baseQuery,
  params = [],
  cursor = null,
  limit = 10,
  orderByColumn = 'id',
  sortOrder = 'DESC'
) => {
  const operator = sortOrder.toUpperCase() === 'DESC' ? '<' : '>';
  
  let query = baseQuery;
  let finalParams = [...params];

  if (cursor) {
    const whereClause = baseQuery.toUpperCase().includes('WHERE') ? ' AND ' : ' WHERE ';
    query += `${whereClause} ${orderByColumn} ${operator} ?`;
    finalParams.push(cursor);
  }

  query += ` ORDER BY ${orderByColumn} ${sortOrder} LIMIT ?`;
  finalParams.push(limit + 1);

  const [rows] = await db.query(query, finalParams);

  const hasMore = rows.length > limit;
  const result = hasMore ? rows.slice(0, limit) : rows;
  
  let nextCursor = null;
  if (hasMore) {
    const lastRow = result[result.length - 1];
    // Extract column name if it has a prefix (e.g., 'us.id' -> 'id')
    const colName = orderByColumn.includes('.') ? orderByColumn.split('.').pop() : orderByColumn;
    nextCursor = lastRow[colName];
  }

  return {
    result,
    nextCursor,
    hasMore
  };
};

/**
 * Execute count and data queries and return paginated results (MySQL)
 * @param {Object} db - Database connection (pool or connection)
 * @param {string} countQuery - SQL query for counting total records
 * @param {string} dataQuery - SQL query for fetching data
 * @param {Array} countParams - Parameters for count query
 * @param {Array} dataParams - Parameters for data query
 * @param {number} itemsPerPage - Items per page for calculating total pages
 * @returns {Promise<Object>} { data, totalCount, totalPages }
 */
export const getPaginatedResults = async (
  db,
  countQuery,
  dataQuery,
  countParams = [],
  dataParams = [],
  itemsPerPage = 10
) => {
  const [[countResult]] = await db.query(countQuery, countParams);
  const totalCount = parseInt(countResult?.c || countResult?.count || 0);
  const totalPages = Math.ceil(totalCount / itemsPerPage);

  const [data] = await db.query(dataQuery, dataParams);

  return {
    data: data || [],
    totalCount,
    totalPages: totalPages || 1
  };
};

/**
 * Send a successful empty response with pagination info
 */
export const sendEmptySuccess = (res, pageNumber = 1, totalPages = 1, totalCount = 0, itemsPerPage = 10) => {
  return res.status(200).json({
    isSuccess: true,
    data: {
      result: [],
      currentPage: pageNumber,
      totalCount,
      totalPages,
      itemsPerPage
    }
  });
};

/**
 * Send a successful paginated response
 */
export const sendPaginatedResponse = (
  res,
  result,
  { pageNumber, totalPages, totalCount, itemsPerPage },
  extra = {}
) => {
  return res.status(200).json({
    isSuccess: true,
    data: {
      result,
      currentPage: pageNumber,
      totalCount,
      totalPages,
      itemsPerPage,
      ...extra
    }
  });
};

/**
 * Send a successful response without pagination
 */
export const sendSuccess = (res, data, message = '') => {
  return res.status(200).json({
    isSuccess: true,
    data,
    ...(message && { message })
  });
};

/**
 * Send a successful cursor-based paginated response
 */
export const sendCursorPaginatedResponse = (res, result, pagination = {}) => {
  const { nextCursor = null, hasMore = false } = pagination || {};
  return res.status(200).json({
    isSuccess: true,
    data: result,
    nextCursor,
    hasMore
  });
};

/**
 * Async handler wrapper to catch errors
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

/**
 * Execute a database transaction (MySQL)
 * @param {Object} pool - Database connection pool
 * @param {Function} callback - Async function to execute within transaction
 * @returns {Promise<*>} Result from callback function
 */
export const withTransaction = async (pool, callback) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
