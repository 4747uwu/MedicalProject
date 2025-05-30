import { WebSocketServer } from 'ws';
import jwt from 'jsonwebtoken';
import User from '../models/userModel.js';
import cookie from 'cookie';
import dotenv from 'dotenv';

dotenv.config();

const COOKIE_NAME = process.env.JWT_COOKIE_NAME || 'jwtAuthToken';

class WebSocketService {
  constructor() {
    this.wss = null;
    this.adminConnections = new Map();
    this.connectionCount = 0;
  }

  initialize(server) {
    this.wss = new WebSocketServer({ 
      server,
      path: '/ws/admin',
      perMessageDeflate: false,
      maxPayload: 16 * 1024 * 1024, // 16MB
      clientTracking: true
    });

    this.wss.on('connection', async (ws, request) => {
      try {
        console.log('🔌 New WebSocket connection attempt...');
        
        // Extract token from cookies
        let token = null;
        
        if (request.headers.cookie) {
          const cookies = cookie.parse(request.headers.cookie);
          token = cookies[COOKIE_NAME];
          
          if (token) {
            console.log(`✅ Token found in cookie '${COOKIE_NAME}'`);
          } else {
            console.log(`❌ No token found in cookie '${COOKIE_NAME}'`);
          }
        } else {
          console.log('❌ No cookies found in request headers');
        }

        if (!token) {
          console.log('❌ WebSocket connection rejected: No authentication token found');
          ws.close(4001, 'Authentication required');
          return;
        }

        // Verify JWT token
        let decoded;
        try {
          decoded = jwt.verify(token, process.env.JWT_SECRET);
          console.log('✅ Token verified successfully, user ID:', decoded.id);
        } catch (jwtError) {
          console.error('❌ JWT verification failed:', jwtError.message);
          ws.close(4007, 'Invalid token');
          return;
        }

        // Find user
        const user = await User.findById(decoded.id)
                              .select('-password')
                              .populate({
                                path: 'lab',
                                select: 'name identifier isActive'
                              });

        if (!user || !user.isActive) {
          console.log('❌ WebSocket connection rejected: User not found or inactive');
          ws.close(4002, 'Invalid user');
          return;
        }

        // Check if user is admin
        if (user.role !== 'admin') {
          console.log(`❌ WebSocket connection rejected: User ${user.email} is not admin`);
          ws.close(4003, 'Admin access required');
          return;
        }

        // Generate unique connection ID
        this.connectionCount++;
        const connectionId = `admin_${user._id}_${this.connectionCount}_${Date.now()}`;
        
        // Store connection
        this.adminConnections.set(connectionId, {
          ws,
          user,
          connectionId,
          connectedAt: new Date(),
          lastPing: new Date(),
          subscribedToStudies: false,
          isAlive: true
        });

        console.log(`✅ Admin WebSocket connected: ${user.fullName || user.email} (${connectionId})`);

        // Set up connection handlers
        ws.isAlive = true;
        
        // Handle pong responses
        ws.on('pong', () => {
          ws.isAlive = true;
          const connection = this.adminConnections.get(connectionId);
          if (connection) {
            connection.lastPing = new Date();
            connection.isAlive = true;
          }
        });

        // Send connection confirmation
        ws.send(JSON.stringify({
          type: 'connection_established',
          message: 'Connected to admin notifications',
          userId: user._id,
          connectionId,
          userInfo: {
            name: user.fullName || user.email,
            role: user.role
          },
          timestamp: new Date()
        }));

        // Handle client messages
        ws.on('message', (data) => {
          try {
            const connection = this.adminConnections.get(connectionId);
            if (connection) {
              connection.lastPing = new Date();
              connection.isAlive = true;
            }
            
            const message = JSON.parse(data);
            this.handleClientMessage(connectionId, message);
          } catch (error) {
            console.error('Invalid WebSocket message:', error);
          }
        });

        // Handle disconnection
        ws.on('close', (code, reason) => {
          console.log(`❌ Admin WebSocket disconnected: ${user.fullName || user.email} (Code: ${code}, Reason: ${reason})`);
          this.adminConnections.delete(connectionId);
        });

        // Handle errors
        ws.on('error', (error) => {
          console.error('WebSocket error:', error);
          this.adminConnections.delete(connectionId);
        });

      } catch (error) {
        console.error('❌ WebSocket connection error:', error);
        ws.close(4004, 'Connection failed');
      }
    });

    // Start heartbeat
    this.startHeartbeat();

    console.log('🔌 WebSocket server initialized for admin notifications');
  }

  handleClientMessage(connectionId, message) {
    const connection = this.adminConnections.get(connectionId);
    if (!connection) return;

    switch (message.type) {
      case 'ping':
        connection.lastPing = new Date();
        connection.isAlive = true;
        connection.ws.send(JSON.stringify({
          type: 'pong',
          timestamp: new Date()
        }));
        break;
      
      case 'subscribe_to_studies':
        connection.subscribedToStudies = true;
        connection.ws.send(JSON.stringify({
          type: 'subscribed',
          message: 'Subscribed to new study notifications',
          timestamp: new Date()
        }));
        console.log(`📋 Admin ${connection.user.fullName || connection.user.email} subscribed to study notifications`);
        break;
      
      case 'unsubscribe_from_studies':
        connection.subscribedToStudies = false;
        connection.ws.send(JSON.stringify({
          type: 'unsubscribed',
          message: 'Unsubscribed from study notifications',
          timestamp: new Date()
        }));
        break;
      
      default:
        console.log('Unknown message type:', message.type);
    }
  }

  startHeartbeat() {
    const interval = setInterval(() => {
      this.adminConnections.forEach((connection, connectionId) => {
        if (connection.ws.readyState === connection.ws.OPEN) {
          // Check if connection responded to last ping
          if (connection.isAlive === false) {
            console.log(`Terminating unresponsive connection: ${connectionId}`);
            connection.ws.terminate();
            this.adminConnections.delete(connectionId);
            return;
          }

          // Mark as potentially dead and send ping
          connection.isAlive = false;
          connection.ws.ping();
        } else {
          // Clean up dead connections
          this.adminConnections.delete(connectionId);
        }
      });
    }, 30000); // Every 30 seconds

    return interval;
  }

  // Notify all admin users about a new study
  notifyNewStudy(studyData) {
    const notification = {
      type: 'new_study',
      timestamp: new Date(),
      data: {
        studyId: studyData._id,
        patientName: studyData.patientName,
        patientId: studyData.patientId,
        modality: studyData.modality,
        location: studyData.location,
        studyDate: studyData.studyDate,
        workflowStatus: studyData.workflowStatus,
        priority: studyData.priority,
        accessionNumber: studyData.accessionNumber
      }
    };

    let sentCount = 0;
    this.adminConnections.forEach((connection, connectionId) => {
      if (connection.ws.readyState === connection.ws.OPEN && connection.subscribedToStudies) {
        try {
          connection.ws.send(JSON.stringify(notification));
          sentCount++;
        } catch (error) {
          console.error(`Error sending notification to ${connectionId}:`, error);
        }
      }
    });

    console.log(`📢 New study notification sent to ${sentCount} admin(s): ${studyData.patientName}`);
  }

  // Notify about study status changes
  notifyStudyStatusChange(studyData, previousStatus, newStatus) {
    const notification = {
      type: 'study_status_change',
      timestamp: new Date(),
      data: {
        studyId: studyData._id,
        patientName: studyData.patientName,
        patientId: studyData.patientId,
        previousStatus,
        newStatus,
        modality: studyData.modality
      }
    };

    this.adminConnections.forEach((connection, connectionId) => {
      if (connection.ws.readyState === connection.ws.OPEN && connection.subscribedToStudies) {
        try {
          connection.ws.send(JSON.stringify(notification));
        } catch (error) {
          console.error(`Error sending status change notification to ${connectionId}:`, error);
        }
      }
    });
  }

  // Get connection stats
  getStats() {
    return {
      totalConnections: this.adminConnections.size,
      activeConnections: Array.from(this.adminConnections.values()).filter(
        conn => conn.ws.readyState === conn.ws.OPEN
      ).length,
      subscribedConnections: Array.from(this.adminConnections.values()).filter(
        conn => conn.subscribedToStudies && conn.ws.readyState === conn.ws.OPEN
      ).length
    };
  }
}

// Export singleton instance
export default new WebSocketService();