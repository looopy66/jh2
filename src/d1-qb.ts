// D1 Query Builder helper
export class D1QB {
  constructor(private db: D1Database) {}

  async init() {
    // Initialize database schema
    await this.db.batch([
      this.db.prepare(`CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT DEFAULT 'user',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT,
        max_tasks INTEGER
      )`),
      this.db.prepare(`CREATE TABLE IF NOT EXISTS tasks (
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
      this.db.prepare(`CREATE TABLE IF NOT EXISTS task_shares (
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
    const adminUsername = 'admin';
    const adminPassword = 'admin123';
    
    const existingAdmin = await this.db.prepare(
      'SELECT id FROM users WHERE username = ?'
    ).bind(adminUsername).first();

    if (!existingAdmin) {
      const encoder = new TextEncoder();
      const data = encoder.encode(adminPassword);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const passwordHash = Array.from(new Uint8Array(hashBuffer))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      await this.db.prepare(
        'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)'
      ).bind(adminUsername, passwordHash, 'admin').run();
    }
  }

  async getUserByUsername(username: string) {
    return await this.db.prepare(
      'SELECT * FROM users WHERE username = ?'
    ).bind(username).first();
  }

  async createUser(username: string, passwordHash: string, role: string, expiresAt?: string, maxTasks?: number) {
    return await this.db.prepare(
      'INSERT INTO users (username, password_hash, role, expires_at, max_tasks) VALUES (?, ?, ?, ?, ?)'
    ).bind(username, passwordHash, role, expiresAt, maxTasks).run();
  }

  async createTask(userId: number, title: string, description: string, dueDate: string, tags: string, repeatInterval?: string) {
    return await this.db.prepare(`
      INSERT INTO tasks (user_id, title, description, due_date, tags, repeat_interval, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(userId, title, description, dueDate, tags, repeatInterval, new Date().toISOString()).run();
  }

  async getUserTasks(userId: number) {
    return await this.db.prepare(
      'SELECT * FROM tasks WHERE user_id = ? ORDER BY due_date ASC'
    ).bind(userId).all();
  }

  async getSharedTasks(userId: number) {
    return await this.db.prepare(`
      SELECT t.* 
      FROM tasks t 
      JOIN task_shares ts ON t.id = ts.task_id 
      WHERE ts.target_user_id = ? AND ts.permission_level IN ('view', 'edit')
      ORDER BY t.due_date ASC
    `).bind(userId).all();
  }

  async updateTask(id: number, completed: boolean) {
    const completedAt = completed ? new Date().toISOString() : null;
    return await this.db.prepare(`
      UPDATE tasks 
      SET completed = ?, completed_at = ?
      WHERE id = ?
    `).bind(completed ? 1 : 0, completedAt, id).run();
  }

  async deleteTask(id: number) {
    return await this.db.prepare('DELETE FROM tasks WHERE id = ?').bind(id).run();
  }
}