import { createRequire } from "module";
import logger from "../libs/logger.js";
import dbConnectionPromise from "./db.js";
import redisClient from "./redis.js";
import { generateDeviceFingerprint } from "../utils/authHelper.js";

const require = createRequire(import.meta.url);
const deviceToSocketMap = new Map();
import { corsOptions } from "./corsOptions.js";

let io;
let subClient;

const socketIO = {
    init: httpServer => {
        io = require('socket.io')(httpServer, {
            cors: {
                ...corsOptions
            }
        });
        
        // Initialize Redis subscriber for cross-process notifications
        subClient = redisClient.duplicate();
        subClient.subscribe('socket-notifications');
        subClient.on('message', (channel, message) => {
            if (channel === 'socket-notifications') {
                try {
                    const { target, room, event, data } = JSON.parse(message);
                    if (io) {
                        io.to(room).emit(event, data);
                        // logger.info(`Broadcasted notification from Redis: ${event} to ${room}`);
                    }
                } catch (err) {
                    logger.error("Error processing Redis socket notification:", err);
                }
            }
        });

        // Optional: Add connection listener
        io.on('connection', async (socket) => {
            logger.info(`Client connected: ${socket.id}`);
          
            const dbConnection = await dbConnectionPromise;

            socket.on('register', async ({ deviceID }) => {
              try {
                const deviceFp = deviceID ? (/^[a-f0-9]{64}$/i.test(deviceID) ? deviceID : generateDeviceFingerprint(deviceID)) : null;
                const [[device]] = await dbConnection.query(
                  "SELECT user_id FROM user_devices WHERE device_fingerprint = ? OR device_fingerprint = ? LIMIT 1",
                  [deviceFp, deviceID]
                );

                if (!device) {
                  return socket.emit("error", { message: "Invalid device." });
                }

                // Register device ↔ socket
                deviceToSocketMap.set(deviceID, socket.id);
                
                // Join specific device room
                socket.join(`device_${deviceID}`);
                if (deviceFp && deviceFp !== deviceID) {
                  socket.join(`device_${deviceFp}`);
                }

                // Join user-wide room if user_id exists
                if (device.user_id) {
                    socket.join(`user_${device.user_id}`);
                }

              } catch (err) {
                logger.error("Socket registration error:", err);
                socket.emit("error", { message: "Failed to register device." });
              }
            });

            socket.on('disconnect', () => {
                for (const [deviceID, socketId] of deviceToSocketMap.entries()) {
                    if (socketId === socket.id) {
                        deviceToSocketMap.delete(deviceID);
                        break;
                    }
                }
            });
        });
        
        return io;
    },
    getIO: () => {
        if (!io) {
            throw new Error("Socket.io not initialized!");
        }
        return io;
    },
    // New method to notify even if io is not initialized in this process
    notify: (room, event, data) => {
        if (io) {
            // If io is available (main process), emit directly
            io.to(room).emit(event, data);
        } else {
            // Otherwise (worker process), publish to Redis
            redisClient.publish('socket-notifications', JSON.stringify({
                room,
                event,
                data
            }));
        }
    },
    close: () => {
        if (io) {
            io.close();
            // logger.info("Socket.io server closed");
        }
        if (subClient) {
            subClient.quit();
            // logger.info("Socket Redis subscriber closed");
        }
    }
};

export default socketIO;
export { deviceToSocketMap };
