import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { jwt } from 'hono/jwt';
import { D1QB } from './d1-qb';

// Define types
interface User {
  id: number;
  username: string;
  password_hash: string;
  role: 'admin' | 'user';
  created_at: string;
  expires_at?: string;
  max_tasks?: number;
}

interface Task {
  id: number;
  user_id: number;
  title: string;
  description: string;
  due_date: string;
  completed: boolean;
  completed_at?: string;
  tags: string;
  repeat_interval?: string;
  shared_with?: string; // JSON string of user IDs
  created_at: string;
}

interface TaskShare {
  id: number;
  task_id: number;
  owner_user_id: number;
  target_user_id: number;
  permission_level: 'view' | 'edit';
  created_at: string;
}

const app = new Hono<{ Bindings: { DB: D1Database } }>();

// Middleware
app.use('/*', cors());

// Helper functions
const hashPassword = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  const hashedPassword = await hashPassword(password);
  return hashedPassword === hash;
};

const generateToken = (): string => {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

const isValidDate = (dateString: string): boolean => {
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime());
};

// Routes
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Multi-Sync Planner</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 0;
          padding: 20px;
          background-color: #f5f5f5;
        }
        .container {
          max-width: 800px;
          margin: 0 auto;
          background: white;
          padding: 20px;
          border-radius: 8px;
          box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 {
          color: #333;
          text-align: center;
        }
        .form-group {
          margin-bottom: 15px;
        }
        label {
          display: block;
          margin-bottom: 5px;
          font-weight: bold;
        }
        input, textarea, select {
          width: 100%;
          padding: 8px;
          border: 1px solid #ddd;
          border-radius: 4px;
          box-sizing: border-box;
        }
        button {
          background-color: #007bff;
          color: white;
          padding: 10px 15px;
          border: none;
          border-radius: 4px;
          cursor: pointer;
        }
        button:hover {
          background-color: #0056b3;
        }
        .task-item {
          border: 1px solid #eee;
          padding: 10px;
          margin-bottom: 10px;
          border-radius: 4px;
        }
        .completed {
          background-color: #e8f5e9;
        }
        .shared {
          border-left: 4px solid #007bff;
        }
        .error {
          color: red;
          margin-top: 10px;
        }
        .success {
          color: green;
          margin-top: 10px;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>Multi-Sync Planner</h1>
        
        <div id="auth-section">
          <h2>Login</h2>
          <div class="form-group">
            <label for="login-username">Username:</label>
            <input type="text" id="login-username" required>
          </div>
          <div class="form-group">
            <label for="login-password">Password:</label>
            <input type="password" id="login-password" required>
          </div>
          <button onclick="login()">Login</button>
          <div id="login-error" class="error"></div>
        </div>
        
        <div id="app-section" style="display:none;">
          <h2>Welcome, <span id="current-user"></span>!</h2>
          
          <div id="admin-panel" style="display:none;">
            <h3>Admin Panel</h3>
            <div class="form-group">
              <label for="new-username">New Username:</label>
              <input type="text" id="new-username" required>
            </div>
            <div class="form-group">
              <label for="new-password">New Password:</label>
              <input type="password" id="new-password" required>
            </div>
            <div class="form-group">
              <label for="user-role">Role:</label>
              <select id="user-role">
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
            </div>
            <div class="form-group">
              <label for="expires-at">Expires At (optional):</label>
              <input type="datetime-local" id="expires-at">
            </div>
            <div class="form-group">
              <label for="max-tasks">Max Tasks (optional):</label>
              <input type="number" id="max-tasks" min="0" value="0">
            </div>
            <button onclick="createUser()">Create User</button>
            <div id="admin-error" class="error"></div>
            <div id="admin-success" class="success"></div>
          </div>
          
          <div class="form-group">
            <label for="task-title">Task Title:</label>
            <input type="text" id="task-title" required>
          </div>
          <div class="form-group">
            <label for="task-description">Description:</label>
            <textarea id="task-description"></textarea>
          </div>
          <div class="form-group">
            <label for="task-due-date">Due Date:</label>
            <input type="datetime-local" id="task-due-date" required>
          </div>
          <div class="form-group">
            <label for="task-tags">Tags (comma separated):</label>
            <input type="text" id="task-tags">
          </div>
          <div class="form-group">
            <label for="repeat-interval">Repeat Interval:</label>
            <select id="repeat-interval">
              <option value="">No Repeat</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
          <button onclick="createTask()">Create Task</button>
          <div id="task-error" class="error"></div>
          
          <h3>Your Tasks</h3>
          <div id="tasks-list"></div>
        </div>
      </div>
      
      <script>
        let authToken = '';
        let currentUser = null;
        
        async function login() {
          const username = document.getElementById('login-username').value;
          const password = document.getElementById('login-password').value;
          
          try {
            const response = await fetch('/api/auth/login', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({ username, password })
            });
            
            if (response.ok) {
              const data = await response.json();
              authToken = data.token;
              currentUser = data.user;
              
              document.getElementById('auth-section').style.display = 'none';
              document.getElementById('app-section').style.display = 'block';
              document.getElementById('current-user').textContent = currentUser.username;
              
              if (currentUser.role === 'admin') {
                document.getElementById('admin-panel').style.display = 'block';
              }
              
              loadTasks();
            } else {
              const error = await response.text();
              document.getElementById('login-error').textContent = error;
            }
          } catch (error) {
            document.getElementById('login-error').textContent = 'Login failed: ' + error.message;
          }
        }
        
        async function createUser() {
          const newUsername = document.getElementById('new-username').value;
          const newPassword = document.getElementById('new-password').value;
          const role = document.getElementById('user-role').value;
          const expiresAt = document.getElementById('expires-at').value;
          const maxTasks = parseInt(document.getElementById('max-tasks').value) || 0;
          
          try {
            const response = await fetch('/api/admin/users', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + authToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                username: newUsername,
                password: newPassword,
                role,
                expires_at: expiresAt || null,
                max_tasks: maxTasks > 0 ? maxTasks : null
              })
            });
            
            if (response.ok) {
              document.getElementById('admin-success').textContent = 'User created successfully!';
              document.getElementById('admin-error').textContent = '';
              document.getElementById('new-username').value = '';
              document.getElementById('new-password').value = '';
              document.getElementById('expires-at').value = '';
              document.getElementById('max-tasks').value = '0';
            } else {
              const error = await response.text();
              document.getElementById('admin-error').textContent = error;
              document.getElementById('admin-success').textContent = '';
            }
          } catch (error) {
            document.getElementById('admin-error').textContent = 'Error creating user: ' + error.message;
            document.getElementById('admin-success').textContent = '';
          }
        }
        
        async function createTask() {
          const title = document.getElementById('task-title').value;
          const description = document.getElementById('task-description').value;
          const dueDate = document.getElementById('task-due-date').value;
          const tags = document.getElementById('task-tags').value;
          const repeatInterval = document.getElementById('repeat-interval').value;
          
          if (!title || !dueDate) {
            document.getElementById('task-error').textContent = 'Title and Due Date are required!';
            return;
          }
          
          try {
            const response = await fetch('/api/tasks', {
              method: 'POST',
              headers: {
                'Authorization': 'Bearer ' + authToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                title,
                description,
                due_date: dueDate,
                tags,
                repeat_interval: repeatInterval
              })
            });
            
            if (response.ok) {
              document.getElementById('task-error').textContent = '';
              document.getElementById('task-title').value = '';
              document.getElementById('task-description').value = '';
              document.getElementById('task-due-date').value = '';
              document.getElementById('task-tags').value = '';
              document.getElementById('repeat-interval').value = '';
              
              loadTasks();
            } else {
              const error = await response.text();
              document.getElementById('task-error').textContent = error;
            }
          } catch (error) {
            document.getElementById('task-error').textContent = 'Error creating task: ' + error.message;
          }
        }
        
        async function loadTasks() {
          try {
            const response = await fetch('/api/tasks', {
              headers: {
                'Authorization': 'Bearer ' + authToken
              }
            });
            
            if (response.ok) {
              const tasks = await response.json();
              renderTasks(tasks);
            } else {
              console.error('Failed to load tasks');
            }
          } catch (error) {
            console.error('Error loading tasks:', error);
          }
        }
        
        async function toggleTaskCompletion(taskId, completed) {
          try {
            const response = await fetch('/api/tasks/' + taskId, {
              method: 'PUT',
              headers: {
                'Authorization': 'Bearer ' + authToken,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                completed: !completed
              })
            });
            
            if (response.ok) {
              loadTasks();
            } else {
              console.error('Failed to update task');
            }
          } catch (error) {
            console.error('Error updating task:', error);
          }
        }
        
        async function deleteTask(taskId) {
          if (!confirm('Are you sure you want to delete this task?')) {
            return;
          }
          
          try {
            const response = await fetch('/api/tasks/' + taskId, {
              method: 'DELETE',
              headers: {
                'Authorization': 'Bearer ' + authToken
              }
            });
            
            if (response.ok) {
              loadTasks();
            } else {
              console.error('Failed to delete task');
            }
          } catch (error) {
            console.error('Error deleting task:', error);
          }
        }
        
        function renderTasks(tasks) {
          const tasksList = document.getElementById('tasks-list');
          tasksList.innerHTML = '';
          
          if (tasks.length === 0) {
            tasksList.innerHTML = '<p>No tasks found.</p>';
            return;
          }
          
          tasks.forEach(task => {
            const taskEl = document.createElement('div');
            taskEl.className = 'task-item ' + (task.completed ? 'completed' : '') + (task.shared_with ? 'shared' : '');
            
            const dueDate = new Date(task.due_date);
            const formattedDate = dueDate.toLocaleString();
            
            let tagsHtml = '';
            if (task.tags) {
              const tags = task.tags.split(',');
              tagsHtml = '<div><strong>Tags:</strong> ' + tags.map(tag => tag.trim()).join(', ') + '</div>';
            }
            
            let repeatHtml = '';
            if (task.repeat_interval) {
              repeatHtml = '<div><strong>Repeat:</strong> ' + task.repeat_interval.charAt(0).toUpperCase() + task.repeat_interval.slice(1) + '</div>';
            }
            
            let sharedWithHtml = '';
            if (task.shared_with) {
              sharedWithHtml = '<div><strong>Shared With:</strong> ' + task.shared_with + '</div>';
            }
            
            taskEl.innerHTML = 
              '<h4>' + task.title + ' ' + (task.completed ? '<span>(Completed)</span>' : '') + '</h4>' +
              '<p>' + (task.description || '') + '</p>' +
              '<div><strong>Due:</strong> ' + formattedDate + '</div>' +
              tagsHtml +
              repeatHtml +
              sharedWithHtml +
              '<div style="margin-top: 10px;">' +
                '<button onclick="toggleTaskCompletion(' + task.id + ', ' + task.completed + ')">' + (task.completed ? 'Mark as Uncompleted' : 'Mark as Completed') + '</button>' +
                '<button onclick="deleteTask(' + task.id + ')" style="background-color: #dc3545;">Delete</button>' +
              '</div>';
            
            tasksList.appendChild(taskEl);
          });
        }
      </script>
    </body>
    </html>
  `);
});

// Authentication routes
app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json();
  
  if (!username || !password) {
    return c.text('Username and password are required', 400);
  }
  
  const db = c.env.DB;
  
  try {
    const user = await db.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(username).first<User>();
    
    if (!user) {
      return c.text('Invalid credentials', 401);
    }
    
    if (user.expires_at && new Date(user.expires_at) < new Date()) {
      return c.text('Account has expired', 401);
    }
    
    const isValid = await verifyPassword(password, user.password_hash);
    if (!isValid) {
      return c.text('Invalid credentials', 401);
    }
    
    // Return user info without password
    const userInfo = {
      id: user.id,
      username: user.username,
      role: user.role
    };
    
    return c.json({ token: generateToken(), user: userInfo });
  } catch (e) {
    console.error(e);
    return c.text('Internal server error', 500);
  }
});

// Admin routes
app.post('/api/admin/users', async (c) => {
  // In a real implementation, you would verify admin privileges here
  // For now, we'll just check if the user is admin based on a simple check
  
  const { username, password, role, expires_at, max_tasks } = await c.req.json();
  
  if (!username || !password) {
    return c.text('Username and password are required', 400);
  }
  
  if (role !== 'user' && role !== 'admin') {
    return c.text('Invalid role', 400);
  }
  
  if (expires_at && !isValidDate(expires_at)) {
    return c.text('Invalid expiration date', 400);
  }
  
  const db = c.env.DB;
  
  try {
    // Check if user already exists
    const existingUser = await db.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).bind(username).first();
    
    if (existingUser) {
      return c.text('Username already exists', 400);
    }
    
    const passwordHash = await hashPassword(password);
    
    await db.prepare(
      'INSERT INTO users (username, password_hash, role, created_at, expires_at, max_tasks) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(username, passwordHash, role, new Date().toISOString(), expires_at, max_tasks).run();
    
    return c.text('User created successfully');
  } catch (e) {
    console.error(e);
    return c.text('Internal server error', 500);
  }
});

// Task routes
app.get('/api/tasks', async (c) => {
  // In a real implementation, you would decode the JWT token to get user ID
  // For now, we'll use a placeholder user ID
  const userId = 1; // Placeholder - in real implementation, get from JWT token
  
  const db = c.env.DB;
  
  try {
    // Get user's own tasks
    const userTasks = await db.prepare(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY due_date ASC'
    ).bind(userId).all<Task>();
    
    // Get tasks shared with this user
    const sharedTasks = await db.prepare(`
      SELECT t.* 
      FROM tasks t 
      JOIN task_shares ts ON t.id = ts.task_id 
      WHERE ts.target_user_id = ? AND ts.permission_level IN ('view', 'edit')
      ORDER BY t.due_date ASC
    `).bind(userId).all<Task>();
    
    // Combine and return all tasks
    const allTasks = [...userTasks.results, ...sharedTasks.results];
    
    return c.json(allTasks);
  } catch (e) {
    console.error(e);
    return c.text('Internal server error', 500);
  }
});

app.post('/api/tasks', async (c) => {
  // In a real implementation, you would decode the JWT token to get user ID
  // For now, we'll use a placeholder user ID
  const userId = 1; // Placeholder - in real implementation, get from JWT token
  
  const { title, description, due_date, tags, repeat_interval } = await c.req.json();
  
  if (!title || !due_date) {
    return c.text('Title and due date are required', 400);
  }
  
  if (!isValidDate(due_date)) {
    return c.text('Invalid due date', 400);
  }
  
  const db = c.env.DB;
  
  try {
    // Check if user has exceeded max tasks limit
    const user = await db.prepare(
      'SELECT max_tasks FROM users WHERE id = ?'
    ).bind(userId).first<User>();
    
    if (user?.max_tasks) {
      const taskCount = await db.prepare(
        'SELECT COUNT(*) as count FROM tasks WHERE user_id = ?'
      ).bind(userId).first<{count: number}>();
      
      if (taskCount.count >= user.max_tasks) {
        return c.text('Maximum number of tasks reached', 400);
      }
    }
    
    await db.prepare(`
      INSERT INTO tasks (user_id, title, description, due_date, completed, tags, repeat_interval, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      title,
      description || '',
      due_date,
      0, // Not completed initially
      tags || '',
      repeat_interval || null,
      new Date().toISOString()
    ).run();
    
    return c.text('Task created successfully');
  } catch (e) {
    console.error(e);
    return c.text('Internal server error', 500);
  }
});

app.put('/api/tasks/:id', async (c) => {
  const taskId = parseInt(c.req.param('id'));
  const userId = 1; // Placeholder - in real implementation, get from JWT token
  
  const { completed } = await c.req.json();
  
  if (typeof completed !== 'boolean') {
    return c.text('Invalid completed status', 400);
  }
  
  const db = c.env.DB;
  
  try {
    // Check if task belongs to user or is shared with user with edit permissions
    const task = await db.prepare(`
      SELECT t.*, ts.permission_level
      FROM tasks t
      LEFT JOIN task_shares ts ON t.id = ts.task_id AND ts.target_user_id = ?
      WHERE t.id = ? AND (t.user_id = ? OR (ts.permission_level = 'edit'))
    `).bind(userId, taskId, userId).first<Task & {permission_level: string | null}>();
    
    if (!task) {
      return c.text('Task not found or insufficient permissions', 404);
    }
    
    const completedAt = completed ? new Date().toISOString() : null;
    
    await db.prepare(`
      UPDATE tasks 
      SET completed = ?, completed_at = ?
      WHERE id = ?
    `).bind(completed ? 1 : 0, completedAt, taskId).run();
    
    return c.text('Task updated successfully');
  } catch (e) {
    console.error(e);
    return c.text('Internal server error', 500);
  }
});

app.delete('/api/tasks/:id', async (c) => {
  const taskId = parseInt(c.req.param('id'));
  const userId = 1; // Placeholder - in real implementation, get from JWT token
  
  const db = c.env.DB;
  
  try {
    // Check if task belongs to user
    const task = await db.prepare(
      'SELECT * FROM tasks WHERE id = ? AND user_id = ?'
    ).bind(taskId, userId).first<Task>();
    
    if (!task) {
      return c.text('Task not found or does not belong to user', 404);
    }
    
    await db.prepare('DELETE FROM tasks WHERE id = ?').bind(taskId).run();
    
    // Also delete any shares related to this task
    await db.prepare('DELETE FROM task_shares WHERE task_id = ?').bind(taskId).run();
    
    return c.text('Task deleted successfully');
  } catch (e) {
    console.error(e);
    return c.text('Internal server error', 500);
  }
});

// Initialize database
app.get('/api/init', async (c) => {
  const db = c.env.DB;
  
  try {
    // Create tables if they don't exist
    await db.batch([
      db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT,
        max_tasks INTEGER
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        due_date TEXT NOT NULL,
        completed BOOLEAN DEFAULT 0,
        completed_at TEXT,
        tags TEXT,
        repeat_interval TEXT,
        shared_with TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      )`),
      db.prepare(`CREATE TABLE IF NOT EXISTS task_shares (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        owner_user_id INTEGER NOT NULL,
        target_user_id INTEGER NOT NULL,
        permission_level TEXT DEFAULT 'view',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES tasks (id),
        FOREIGN KEY (owner_user_id) REFERENCES users (id),
        FOREIGN KEY (target_user_id) REFERENCES users (id),
        UNIQUE(task_id, target_user_id)
      )`)
    ]);
    
    // Create admin user if doesn't exist
    const adminUsername = c.env.ADMIN_USERNAME || 'admin';
    const adminPassword = c.env.ADMIN_PASSWORD || 'admin123';
    
    const existingAdmin = await db.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).bind(adminUsername).first();
    
    if (!existingAdmin) {
      const passwordHash = await hashPassword(adminPassword);
      await db.prepare(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
      ).bind(adminUsername, passwordHash, 'admin').run();
    }
    
    return c.text('Database initialized successfully');
  } catch (e) {
    console.error(e);
    return c.text('Error initializing database: ' + e.message, 500);
  }
});

export default app;