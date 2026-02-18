import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { D1Database } from '@cloudflare/workers-types';

// Define types
interface Env {
  DB: D1Database;
  ADMIN_USERNAME: string;
  ADMIN_PASSWORD: string;
  OPENAI_API_KEY: string;
  NOTIFY_WEBHOOK_URL: string;
}

// Initialize the app
const app = new Hono<{ Bindings: Env }>();

// Enable CORS
app.use('*', cors());

// Helper functions
const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

// Database initialization
const initDB = async (db: D1Database) => {
  // Create tables if they don't exist
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'user',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT,
      max_tasks INTEGER DEFAULT 100
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      due_date TEXT,
      reminder_time TEXT,
      completed BOOLEAN DEFAULT 0,
      completed_at TEXT,
      tags TEXT,
      repeat_pattern TEXT,
      shared_with TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      response TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Create admin user if not exists
  const adminUsername = db.env?.ADMIN_USERNAME || 'admin';
  const adminPassword = db.env?.ADMIN_PASSWORD || 'admin123';
  const hashedPassword = await hashPassword(adminPassword);
  
  const existingAdmin = await db.prepare(
    'SELECT * FROM users WHERE username = ? AND role = "admin"'
  ).bind(adminUsername).first();
  
  if (!existingAdmin) {
    await db.prepare(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, "admin")'
    ).bind(adminUsername, hashedPassword).run();
  }
};

// Authentication middleware
const authenticate = async (c: any, next: () => Promise<void>) => {
  const authHeader = c.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const token = authHeader.substring(7);
  // In a real implementation, we would verify the JWT token
  // For now, we'll just check if it's a valid token format
  try {
    // Decode the token (simplified for this example)
    const payload = JSON.parse(atob(token.split('.')[1]));
    c.set('userId', payload.userId);
    c.set('role', payload.role);
    await next();
  } catch (error) {
    return c.json({ error: 'Invalid token' }, 401);
  }
};

// Routes

// Health check
app.get('/', (c) => {
  return c.text('Multi-Sync Planner API is running!');
});

// User registration
const registerSchema = z.object({
  username: z.string().min(3).max(50),
  password: z.string().min(6),
});

app.post('/register', zValidator('json', registerSchema), async (c) => {
  const db = c.env.DB;
  const { username, password } = c.req.valid('json');
  
  // Check if user already exists
  const existingUser = await db.prepare(
    'SELECT * FROM users WHERE username = ?'
  ).bind(username).first();
  
  if (existingUser) {
    return c.json({ error: 'Username already exists' }, 409);
  }
  
  // Hash password
  const passwordHash = await hashPassword(password);
  
  // Insert new user
  const result = await db.prepare(
    'INSERT INTO users (username, password_hash) VALUES (?, ?)'
  ).bind(username, passwordHash).run();
  
  return c.json({ success: true, userId: result.lastRowId });
});

// Login
const loginSchema = z.object({
  username: z.string(),
  password: z.string(),
});

app.post('/login', zValidator('json', loginSchema), async (c) => {
  const db = c.env.DB;
  const { username, password } = c.req.valid('json');
  
  // Find user
  const user = await db.prepare(
    'SELECT id, username, password_hash, role FROM users WHERE username = ?'
  ).bind(username).first();
  
  if (!user) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  
  // Hash provided password and compare
  const passwordHash = await hashPassword(password);
  if (passwordHash !== user.password_hash) {
    return c.json({ error: 'Invalid credentials' }, 401);
  }
  
  // Generate simple JWT token (in production, use proper JWT library)
  const payload = {
    userId: user.id,
    username: user.username,
    role: user.role,
    exp: Math.floor(Date.now() / 1000) + (60 * 60 * 24) // 24 hours
  };
  
  // Simple token generation (not production ready)
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }));
  const encodedPayload = btoa(JSON.stringify(payload));
  const signature = btoa('signature'); // Not actually signed
  
  const token = `${header}.${encodedPayload}.${signature}`;
  
  return c.json({ 
    token,
    user: { id: user.id, username: user.username, role: user.role }
  });
});

// Get user profile
app.get('/profile', authenticate, async (c) => {
  const db = c.env.DB;
  const userId = c.get('userId');
  
  const user = await db.prepare(
    'SELECT id, username, role, created_at, expires_at FROM users WHERE id = ?'
  ).bind(userId).first();
  
  return c.json(user);
});

// Create task
const createTaskSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  due_date: z.string().optional(),
  reminder_time: z.string().optional(),
  tags: z.string().optional(),
  repeat_pattern: z.string().optional(),
  shared_with: z.string().optional(),
});

app.post('/tasks', authenticate, zValidator('json', createTaskSchema), async (c) => {
  const db = c.env.DB;
  const userId = c.get('userId');
  const { title, description, due_date, reminder_time, tags, repeat_pattern, shared_with } = c.req.valid('json');
  
  const result = await db.prepare(
    'INSERT INTO tasks (user_id, title, description, due_date, reminder_time, tags, repeat_pattern, shared_with) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(userId, title, description || '', due_date || '', reminder_time || '', tags || '', repeat_pattern || '', shared_with || '').run();
  
  return c.json({ success: true, taskId: result.lastRowId });
});

// Get user tasks
app.get('/tasks', authenticate, async (c) => {
  const db = c.env.DB;
  const userId = c.get('userId');
  
  // Get tasks owned by user
  let tasks = await db.prepare(
    'SELECT * FROM tasks WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all();
  
  // Also get tasks shared with user
  const sharedTasks = await db.prepare(
    'SELECT t.* FROM tasks t JOIN users u ON t.user_id = u.id WHERE t.shared_with LIKE ?'
  ).bind(`%${userId}%`).all();
  
  // Combine both sets of tasks
  tasks = [...tasks.results, ...sharedTasks.results];
  
  return c.json(tasks);
});

// Update task
const updateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  due_date: z.string().optional(),
  reminder_time: z.string().optional(),
  completed: z.boolean().optional(),
  tags: z.string().optional(),
  repeat_pattern: z.string().optional(),
  shared_with: z.string().optional(),
});

app.put('/tasks/:id', authenticate, zValidator('json', updateTaskSchema), async (c) => {
  const db = c.env.DB;
  const userId = c.get('userId');
  const taskId = parseInt(c.req.param('id'));
  const updates = c.req.valid('json');
  
  // Check if user owns the task or has permission to modify it
  const task = await db.prepare(
    'SELECT user_id FROM tasks WHERE id = ?'
  ).bind(taskId).first();
  
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }
  
  // Admins can modify any task
  const userRole = c.get('role');
  if (userRole !== 'admin' && task.user_id !== userId) {
    return c.json({ error: 'Not authorized to modify this task' }, 403);
  }
  
  // Build dynamic update query
  const updateFields = [];
  const values = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      updateFields.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (updateFields.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }
  
  values.push(taskId); // Add ID for WHERE clause
  
  const query = `UPDATE tasks SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  await db.prepare(query).bind(...values).run();
  
  return c.json({ success: true });
});

// Delete task
app.delete('/tasks/:id', authenticate, async (c) => {
  const db = c.env.DB;
  const userId = c.get('userId');
  const taskId = parseInt(c.req.param('id'));
  
  // Check if user owns the task
  const task = await db.prepare(
    'SELECT user_id FROM tasks WHERE id = ?'
  ).bind(taskId).first();
  
  if (!task) {
    return c.json({ error: 'Task not found' }, 404);
  }
  
  // Admins can delete any task
  const userRole = c.get('role');
  if (userRole !== 'admin' && task.user_id !== userId) {
    return c.json({ error: 'Not authorized to delete this task' }, 403);
  }
  
  await db.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run();
  
  return c.json({ success: true });
});

// AI integration endpoint
const aiQuerySchema = z.object({
  message: z.string().min(1),
});

app.post('/ai', authenticate, zValidator('json', aiQuerySchema), async (c) => {
  const db = c.env.DB;
  const userId = c.get('userId');
  const { message } = c.req.valid('json');
  const openaiApiKey = c.env.OPENAI_API_KEY;
  
  if (!openaiApiKey) {
    return c.json({ error: 'OpenAI API key not configured' }, 500);
  }
  
  // Save the query to the database
  await db.prepare(
    'INSERT INTO ai_conversations (user_id, message) VALUES (?, ?)'
  ).bind(userId, message).run();
  
  // In a real implementation, we would call the OpenAI API here
  // For now, we'll return a mock response
  const response = `Mock AI response for: "${message}". In a real implementation, this would connect to OpenAI API.`;
  
  // Update the conversation record with the response
  const conversationResult = await db.prepare(
    'SELECT id FROM ai_conversations WHERE user_id = ? AND message = ? ORDER BY created_at DESC LIMIT 1'
  ).bind(userId, message).first();
  
  if (conversationResult) {
    await db.prepare(
      'UPDATE ai_conversations SET response = ? WHERE id = ?'
    ).bind(response, conversationResult.id).run();
  }
  
  return c.json({ response });
});

// Get AI conversations
app.get('/ai/conversations', authenticate, async (c) => {
  const db = c.env.DB;
  const userId = c.get('userId');
  
  const conversations = await db.prepare(
    'SELECT * FROM ai_conversations WHERE user_id = ? ORDER BY created_at DESC'
  ).bind(userId).all();
  
  return c.json(conversations);
});

// Admin routes
const adminAuth = async (c: any, next: () => Promise<void>) => {
  const role = c.get('role');
  if (role !== 'admin') {
    return c.json({ error: 'Admin access required' }, 403);
  }
  await next();
};

// Get all users (admin only)
app.get('/admin/users', authenticate, adminAuth, async (c) => {
  const db = c.env.DB;
  
  const users = await db.prepare(
    'SELECT id, username, role, created_at, expires_at, max_tasks FROM users ORDER BY created_at DESC'
  ).all();
  
  return c.json(users);
});

// Update user (admin only)
const updateUserSchema = z.object({
  role: z.enum(['admin', 'user']).optional(),
  expires_at: z.string().optional(),
  max_tasks: z.number().int().positive().optional(),
});

app.put('/admin/users/:id', authenticate, adminAuth, zValidator('json', updateUserSchema), async (c) => {
  const db = c.env.DB;
  const userId = parseInt(c.req.param('id'));
  const updates = c.req.valid('json');
  
  // Build dynamic update query
  const updateFields = [];
  const values = [];
  
  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      updateFields.push(`${key} = ?`);
      values.push(value);
    }
  }
  
  if (updateFields.length === 0) {
    return c.json({ error: 'No fields to update' }, 400);
  }
  
  values.push(userId); // Add ID for WHERE clause
  
  const query = `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`;
  await db.prepare(query).bind(...values).run();
  
  return c.json({ success: true });
});

// Delete user (admin only)
app.delete('/admin/users/:id', authenticate, adminAuth, async (c) => {
  const db = c.env.DB;
  const userId = parseInt(c.req.param('id'));
  
  // Don't allow deleting the admin account
  const user = await db.prepare('SELECT role FROM users WHERE id = ?').bind(userId).first();
  if (user && user.role === 'admin') {
    return c.json({ error: 'Cannot delete admin account' }, 400);
  }
  
  // Delete user's tasks first
  await db.prepare('DELETE FROM tasks WHERE user_id = ?').bind(userId).run();
  
  // Then delete the user
  await db.prepare('DELETE FROM users WHERE id = ?').bind(userId).run();
  
  return c.json({ success: true });
});

// Setup database on first request
app.use('*', async (c, next) => {
  await initDB(c.env.DB);
  await next();
});

export default app;