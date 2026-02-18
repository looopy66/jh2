// Global variables
let authToken = '';
let currentUser = null;

// DOM Elements
const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const currentUserSpan = document.getElementById('current-user');
const adminPanel = document.getElementById('admin-panel');
const tasksList = document.getElementById('tasks-list');
const notificationContainer = document.getElementById('notification-container');

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  // Check if user is already logged in (from localStorage)
  const savedAuth = localStorage.getItem('planner_auth');
  if (savedAuth) {
    const authData = JSON.parse(savedAuth);
    authToken = authData.token;
    currentUser = authData.user;
    showAppView();
  }
});

// Authentication functions
async function login() {
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  
  if (!username || !password) {
    showError('Username and password are required');
    return;
  }
  
  try {
    showLoading(true);
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
      
      // Save to localStorage
      localStorage.setItem('planner_auth', JSON.stringify({
        token: authToken,
        user: currentUser
      }));
      
      showSuccess('Login successful!');
      showAppView();
      loadTasks();
    } else {
      const error = await response.text();
      showError(error || 'Login failed');
    }
  } catch (error) {
    showError('Network error: ' + error.message);
  } finally {
    showLoading(false);
  }
}

function logout() {
  authToken = '';
  currentUser = null;
  localStorage.removeItem('planner_auth');
  showAuthView();
  clearNotifications();
}

function showAuthView() {
  authSection.style.display = 'flex';
  appSection.style.display = 'none';
}

function showAppView() {
  authSection.style.display = 'none';
  appSection.style.display = 'block';
  currentUserSpan.textContent = currentUser.username;
  
  if (currentUser.role === 'admin') {
    adminPanel.style.display = 'block';
  } else {
    adminPanel.style.display = 'none';
  }
}

// Admin functions
async function createUser() {
  const newUsername = document.getElementById('new-username').value;
  const newPassword = document.getElementById('new-password').value;
  const role = document.getElementById('user-role').value;
  const expiresAt = document.getElementById('expires-at').value;
  const maxTasks = parseInt(document.getElementById('max-tasks').value) || 0;
  
  if (!newUsername || !newPassword) {
    showError('Username and password are required');
    return;
  }
  
  try {
    showLoading(true);
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
      showSuccess('User created successfully!');
      document.getElementById('new-username').value = '';
      document.getElementById('new-password').value = '';
      document.getElementById('expires-at').value = '';
      document.getElementById('max-tasks').value = '0';
    } else {
      const error = await response.text();
      showError(error);
    }
  } catch (error) {
    showError('Error creating user: ' + error.message);
  } finally {
    showLoading(false);
  }
}

// Task functions
async function createTask() {
  const title = document.getElementById('task-title').value;
  const description = document.getElementById('task-description').value;
  const dueDate = document.getElementById('task-due-date').value;
  const tags = document.getElementById('task-tags').value;
  const repeatInterval = document.getElementById('repeat-interval').value;
  
  if (!title || !dueDate) {
    showError('Title and Due Date are required!');
    return;
  }
  
  try {
    showLoading(true);
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
      showSuccess('Task created successfully!');
      document.getElementById('task-title').value = '';
      document.getElementById('task-description').value = '';
      document.getElementById('task-due-date').value = '';
      document.getElementById('task-tags').value = '';
      document.getElementById('repeat-interval').value = '';
      
      loadTasks();
    } else {
      const error = await response.text();
      showError(error);
    }
  } catch (error) {
    showError('Error creating task: ' + error.message);
  } finally {
    showLoading(false);
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
      showError('Failed to load tasks');
    }
  } catch (error) {
    showError('Error loading tasks: ' + error.message);
  }
}

async function toggleTaskCompletion(taskId, completed) {
  try {
    showLoading(true);
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
      showSuccess('Task updated successfully!');
    } else {
      const error = await response.text();
      showError(error);
    }
  } catch (error) {
    showError('Error updating task: ' + error.message);
  } finally {
    showLoading(false);
  }
}

async function deleteTask(taskId) {
  if (!confirm('Are you sure you want to delete this task?')) {
    return;
  }
  
  try {
    showLoading(true);
    const response = await fetch('/api/tasks/' + taskId, {
      method: 'DELETE',
      headers: {
        'Authorization': 'Bearer ' + authToken
      }
    });
    
    if (response.ok) {
      loadTasks();
      showSuccess('Task deleted successfully!');
    } else {
      const error = await response.text();
      showError(error);
    }
  } catch (error) {
    showError('Error deleting task: ' + error.message);
  } finally {
    showLoading(false);
  }
}

async function shareTask(taskId) {
  const shareWith = prompt('Enter username to share with:');
  if (!shareWith) return;
  
  try {
    showLoading(true);
    const response = await fetch('/api/tasks/' + taskId + '/share', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + authToken,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        username: shareWith,
        permission: 'view' // Default to view-only
      })
    });
    
    if (response.ok) {
      showSuccess('Task shared successfully!');
      loadTasks();
    } else {
      const error = await response.text();
      showError(error);
    }
  } catch (error) {
    showError('Error sharing task: ' + error.message);
  } finally {
    showLoading(false);
  }
}

function renderTasks(tasks) {
  if (!tasksList) return;
  
  tasksList.innerHTML = '';
  
  if (tasks.length === 0) {
    tasksList.innerHTML = '<p class="no-tasks">No tasks found.</p>';
    return;
  }
  
  tasks.forEach(task => {
    const taskEl = document.createElement('div');
    taskEl.className = 'task-item ' + (task.completed ? 'completed' : '') + (task.shared_with ? 'shared' : '');
    
    const dueDate = new Date(task.due_date);
    const formattedDate = dueDate.toLocaleString();
    
    // Parse tags
    let tagsHtml = '';
    if (task.tags) {
      const tags = task.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
      if (tags.length > 0) {
        tagsHtml = '<div class="task-tags">';
        tags.forEach(tag => {
          tagsHtml += `<span class="tag">${tag}</span>`;
        });
        tagsHtml += '</div>';
      }
    }
    
    // Format repeat interval
    let repeatHtml = '';
    if (task.repeat_interval) {
      repeatHtml = `<div><strong>Repeat:</strong> ${task.repeat_interval.charAt(0).toUpperCase() + task.repeat_interval.slice(1)}</div>`;
    }
    
    // Format shared with
    let sharedWithHtml = '';
    if (task.shared_with) {
      sharedWithHtml = `<div><strong>Shared With:</strong> ${task.shared_with}</div>`;
    }
    
    taskEl.innerHTML = `
      <h3 class="task-title">${task.title} ${task.completed ? '<span class="task-completed">(Completed)</span>' : ''}</h3>
      ${task.description ? `<p class="task-description">${task.description}</p>` : ''}
      <div class="task-meta">
        <div><strong>Due:</strong> ${formattedDate}</div>
        ${repeatHtml}
        ${sharedWithHtml}
      </div>
      ${tagsHtml}
      <div class="task-actions">
        <button class="action-btn complete-btn" onclick="toggleTaskCompletion(${task.id}, ${task.completed})">
          ${task.completed ? 'Mark as Uncompleted' : 'Mark as Completed'}
        </button>
        <button class="action-btn delete-btn" onclick="deleteTask(${task.id})">
          Delete
        </button>
        <button class="action-btn share-btn" onclick="shareTask(${task.id})">
          Share
        </button>
      </div>
    `;
    
    tasksList.appendChild(taskEl);
  });
}

// Notification functions
function showError(message) {
  if (notificationContainer) {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'notification error';
    errorDiv.textContent = message;
    notificationContainer.appendChild(errorDiv);
    
    // Remove after 5 seconds
    setTimeout(() => {
      if (errorDiv.parentNode) {
        errorDiv.parentNode.removeChild(errorDiv);
      }
    }, 5000);
  }
}

function showSuccess(message) {
  if (notificationContainer) {
    const successDiv = document.createElement('div');
    successDiv.className = 'notification success';
    successDiv.textContent = message;
    notificationContainer.appendChild(successDiv);
    
    // Remove after 3 seconds
    setTimeout(() => {
      if (successDiv.parentNode) {
        successDiv.parentNode.removeChild(successDiv);
      }
    }, 3000);
  }
}

function clearNotifications() {
  if (notificationContainer) {
    notificationContainer.innerHTML = '';
  }
}

// Loading state
function showLoading(show) {
  const buttons = document.querySelectorAll('button');
  buttons.forEach(button => {
    if (show) {
      button.disabled = true;
      if (!button.querySelector('.spinner')) {
        const spinner = document.createElement('span');
        spinner.className = 'spinner';
        spinner.innerHTML = '⏳';
        button.prepend(spinner);
      }
    } else {
      button.disabled = false;
      const spinner = button.querySelector('.spinner');
      if (spinner) {
        spinner.remove();
      }
    }
  });
}

// Make functions available globally for inline event handlers
window.login = login;
window.logout = logout;
window.createUser = createUser;
window.createTask = createTask;
window.toggleTaskCompletion = toggleTaskCompletion;
window.deleteTask = deleteTask;
window.shareTask = shareTask;