// Global state
let authToken = localStorage.getItem('authToken') || '';
let currentUser = null;

// DOM Elements
const elements = {
  authSection: document.getElementById('auth-section'),
  mainApp: document.getElementById('main-app'),
  loginTab: document.getElementById('login-tab'),
  registerTab: document.getElementById('register-tab'),
  loginForm: document.getElementById('login-form'),
  registerForm: document.getElementById('register-form'),
  currentUserSpan: document.getElementById('current-user'),
  logoutBtn: document.getElementById('logout-btn'),
  tasksTab: document.getElementById('tasks-tab'),
  aiTab: document.getElementById('ai-tab'),
  settingsTab: document.getElementById('settings-tab'),
  adminTab: document.getElementById('admin-tab'),
  tasksView: document.getElementById('tasks-view'),
  aiView: document.getElementById('ai-view'),
  settingsView: document.getElementById('settings-view'),
  adminView: document.getElementById('admin-view'),
  tasksList: document.getElementById('tasks-list'),
  addTaskBtn: document.getElementById('add-task-btn'),
  taskModal: document.getElementById('task-modal'),
  closeModal: document.querySelector('.close'),
  taskForm: document.getElementById('task-form'),
  aiConversation: document.getElementById('ai-conversation'),
  aiMessage: document.getElementById('ai-message'),
  sendAiMessage: document.getElementById('send-ai-message')
};

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  setupEventListeners();
  loadUserData();
});

// Set up event listeners
function setupEventListeners() {
  // Tab switching
  elements.loginTab.addEventListener('click', switchToLogin);
  elements.registerTab.addEventListener('click', switchToRegister);
  
  // Form submissions
  elements.loginForm.addEventListener('submit', handleLogin);
  elements.registerForm.addEventListener('submit', handleRegister);
  
  // Navigation
  elements.logoutBtn.addEventListener('click', handleLogout);
  elements.tasksTab.addEventListener('click', () => showView('tasks'));
  elements.aiTab.addEventListener('click', () => showView('ai'));
  elements.settingsTab.addEventListener('click', () => showView('settings'));
  elements.adminTab.addEventListener('click', () => showView('admin'));
  
  // Task management
  elements.addTaskBtn.addEventListener('click', openAddTaskModal);
  elements.closeModal.addEventListener('click', closeTaskModal);
  elements.taskForm.addEventListener('submit', handleTaskSubmit);
  
  // AI assistant
  elements.sendAiMessage.addEventListener('click', sendAiMessage);
  elements.aiMessage.addEventListener('keypress', (e) => {
    if (e.key === 'Enter' && e.ctrlKey) {
      sendAiMessage();
    }
  });
  
  // Close modal when clicking outside
  window.addEventListener('click', (e) => {
    if (e.target === elements.taskModal) {
      closeTaskModal();
    }
  });
}

// Authentication handlers
async function handleLogin(e) {
  e.preventDefault();
  
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;
  
  try {
    const response = await fetch('/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      authToken = data.token;
      localStorage.setItem('authToken', authToken);
      currentUser = data.user;
      showMainApp();
      loadTasks();
      loadUserData();
    } else {
      alert(data.error || 'Login failed');
    }
  } catch (error) {
    console.error('Login error:', error);
    alert('An error occurred during login');
  }
}

async function handleRegister(e) {
  e.preventDefault();
  
  const username = document.getElementById('register-username').value;
  const password = document.getElementById('register-password').value;
  
  try {
    const response = await fetch('/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      alert('Registration successful! Please log in.');
      switchToLogin();
    } else {
      alert(data.error || 'Registration failed');
    }
  } catch (error) {
    console.error('Registration error:', error);
    alert('An error occurred during registration');
  }
}

function handleLogout() {
  authToken = '';
  currentUser = null;
  localStorage.removeItem('authToken');
  showAuthSection();
}

// UI helpers
function switchToLogin() {
  document.getElementById('login-form').style.display = 'block';
  document.getElementById('register-form').style.display = 'none';
  elements.loginTab.classList.add('active');
  elements.registerTab.classList.remove('active');
}

function switchToRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
  elements.registerTab.classList.add('active');
  elements.loginTab.classList.remove('active');
}

function showAuthSection() {
  elements.authSection.style.display = 'flex';
  elements.mainApp.style.display = 'none';
}

function showMainApp() {
  elements.authSection.style.display = 'none';
  elements.mainApp.style.display = 'block';
  elements.currentUserSpan.textContent = currentUser.username;
  
  // Show admin panel only for admins
  if (currentUser.role === 'admin') {
    elements.adminTab.style.display = 'block';
  } else {
    elements.adminTab.style.display = 'none';
  }
}

function showView(viewName) {
  // Hide all views
  elements.tasksView.classList.remove('active');
  elements.aiView.classList.remove('active');
  elements.settingsView.classList.remove('active');
  elements.adminView.classList.remove('active');
  
  // Remove active class from all nav buttons
  elements.tasksTab.classList.remove('active');
  elements.aiTab.classList.remove('active');
  elements.settingsTab.classList.remove('active');
  elements.adminTab.classList.remove('active');
  
  // Show selected view
  const viewElement = document.getElementById(`${viewName}-view`);
  if (viewElement) {
    viewElement.classList.add('active');
  }
  
  // Activate selected nav button
  const navButton = document.getElementById(`${viewName}-tab`);
  if (navButton) {
    navButton.classList.add('active');
  }
  
  // Load content based on view
  if (viewName === 'tasks') {
    loadTasks();
  } else if (viewName === 'ai') {
    loadAiConversations();
  } else if (viewName === 'admin') {
    loadUsers();
  }
}

// Task management
async function loadTasks() {
  try {
    const response = await fetch('/tasks', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    const tasks = await response.json();
    
    if (response.ok) {
      renderTasks(tasks);
    } else {
      console.error('Failed to load tasks:', tasks.error);
    }
  } catch (error) {
    console.error('Error loading tasks:', error);
  }
}

function renderTasks(tasks) {
  elements.tasksList.innerHTML = '';
  
  if (tasks.length === 0) {
    elements.tasksList.innerHTML = '<p>No tasks found. Create your first task!</p>';
    return;
  }
  
  tasks.forEach(task => {
    const taskElement = document.createElement('div');
    taskElement.className = `task-item ${task.completed ? 'completed' : ''}`;
    taskElement.innerHTML = `
      <h3>${task.title}</h3>
      <p>${task.description || ''}</p>
      <div class="task-meta">
        ${task.due_date ? `<span>Due: ${new Date(task.due_date).toLocaleString()}</span>` : ''}
        ${task.reminder_time ? `<span>Reminder: ${new Date(task.reminder_time).toLocaleString()}</span>` : ''}
        <span>Status: ${task.completed ? 'Completed' : 'Pending'}</span>
      </div>
      ${task.tags ? `
        <div class="tags">
          ${task.tags.split(',').map(tag => `<span class="tag">${tag.trim()}</span>`).join('')}
        </div>
      ` : ''}
      <button onclick="openEditTaskModal(${task.id})" class="btn-primary" style="margin-top: 0.5rem;">Edit</button>
    `;
    elements.tasksList.appendChild(taskElement);
  });
}

function openAddTaskModal() {
  document.getElementById('task-modal-title').textContent = 'Add Task';
  document.getElementById('task-id').value = '';
  document.getElementById('task-title').value = '';
  document.getElementById('task-description').value = '';
  document.getElementById('task-due-date').value = '';
  document.getElementById('task-reminder').value = '';
  document.getElementById('task-tags').value = '';
  document.getElementById('task-repeat').value = '';
  document.getElementById('task-share').value = '';
  document.getElementById('delete-task-btn').style.display = 'none';
  elements.taskModal.style.display = 'block';
}

function openEditTaskModal(taskId) {
  // In a real implementation, we would fetch the task details and populate the form
  // For this example, we'll just open the modal in edit mode
  document.getElementById('task-modal-title').textContent = 'Edit Task';
  document.getElementById('task-id').value = taskId;
  document.getElementById('delete-task-btn').style.display = 'inline-block';
  elements.taskModal.style.display = 'block';
  
  // Fetch task details to populate the form
  fetch(`/tasks/${taskId}`, {
    headers: {
      'Authorization': `Bearer ${authToken}`
    }
  })
  .then(response => response.json())
  .then(task => {
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-description').value = task.description || '';
    document.getElementById('task-due-date').value = task.due_date ? new Date(task.due_date).toISOString().slice(0, 16) : '';
    document.getElementById('task-reminder').value = task.reminder_time ? new Date(task.reminder_time).toISOString().slice(0, 16) : '';
    document.getElementById('task-tags').value = task.tags || '';
    document.getElementById('task-repeat').value = task.repeat_pattern || '';
    document.getElementById('task-share').value = task.shared_with || '';
  })
  .catch(error => console.error('Error fetching task:', error));
}

function closeTaskModal() {
  elements.taskModal.style.display = 'none';
}

async function handleTaskSubmit(e) {
  e.preventDefault();
  
  const taskId = document.getElementById('task-id').value;
  const isEdit = !!taskId;
  
  const taskData = {
    title: document.getElementById('task-title').value,
    description: document.getElementById('task-description').value,
    due_date: document.getElementById('task-due-date').value,
    reminder_time: document.getElementById('task-reminder').value,
    tags: document.getElementById('task-tags').value,
    repeat_pattern: document.getElementById('task-repeat').value,
    shared_with: document.getElementById('task-share').value
  };
  
  try {
    const url = isEdit ? `/tasks/${taskId}` : '/tasks';
    const method = isEdit ? 'PUT' : 'POST';
    
    const response = await fetch(url, {
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify(taskData)
    });
    
    if (response.ok) {
      closeTaskModal();
      loadTasks(); // Refresh the task list
    } else {
      const error = await response.json();
      alert(error.error || `Failed to ${isEdit ? 'update' : 'create'} task`);
    }
  } catch (error) {
    console.error(`Error ${isEdit ? 'updating' : 'creating'} task:`, error);
    alert(`An error occurred while ${isEdit ? 'updating' : 'creating'} the task`);
  }
}

// AI assistant
async function loadAiConversations() {
  try {
    const response = await fetch('/ai/conversations', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    const conversations = await response.json();
    
    if (response.ok) {
      renderAiConversations(conversations);
    } else {
      console.error('Failed to load AI conversations:', conversations.error);
    }
  } catch (error) {
    console.error('Error loading AI conversations:', error);
  }
}

function renderAiConversations(conversations) {
  elements.aiConversation.innerHTML = '';
  
  if (conversations.length === 0) {
    elements.aiConversation.innerHTML = '<p>No AI conversations yet. Start a conversation!</p>';
    return;
  }
  
  conversations.forEach(conv => {
    const userMessageDiv = document.createElement('div');
    userMessageDiv.className = 'message user';
    userMessageDiv.textContent = conv.message;
    
    elements.aiConversation.appendChild(userMessageDiv);
    
    if (conv.response) {
      const aiResponseDiv = document.createElement('div');
      aiResponseDiv.className = 'message ai';
      aiResponseDiv.textContent = conv.response;
      
      elements.aiConversation.appendChild(aiResponseDiv);
    }
  });
  
  // Scroll to bottom
  elements.aiConversation.scrollTop = elements.aiConversation.scrollHeight;
}

async function sendAiMessage() {
  const message = elements.aiMessage.value.trim();
  if (!message) return;
  
  try {
    const response = await fetch('/ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ message })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      // Clear input and refresh conversations
      elements.aiMessage.value = '';
      loadAiConversations();
    } else {
      alert(data.error || 'Failed to get AI response');
    }
  } catch (error) {
    console.error('Error sending AI message:', error);
    alert('An error occurred while sending your message to AI');
  }
}

// Admin functionality
async function loadUsers() {
  if (currentUser.role !== 'admin') return;
  
  try {
    const response = await fetch('/admin/users', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    const users = await response.json();
    
    if (response.ok) {
      renderUsers(users);
    } else {
      console.error('Failed to load users:', users.error);
    }
  } catch (error) {
    console.error('Error loading users:', error);
  }
}

function renderUsers(users) {
  const tbody = document.getElementById('users-tbody');
  tbody.innerHTML = '';
  
  users.forEach(user => {
    const row = document.createElement('tr');
    
    // Format expiration date
    let expiresAtText = 'Never';
    if (user.expires_at) {
      expiresAtText = new Date(user.expires_at).toLocaleDateString();
    }
    
    row.innerHTML = `
      <td>${user.id}</td>
      <td>${user.username}</td>
      <td>${user.role}</td>
      <td>${expiresAtText}</td>
      <td>${user.max_tasks}</td>
      <td>
        <button onclick="editUser(${user.id})" class="btn-primary">Edit</button>
        <button onclick="deleteUser(${user.id})" class="btn-danger">Delete</button>
      </td>
    `;
    
    tbody.appendChild(row);
  });
}

async function deleteUser(userId) {
  if (!confirm('Are you sure you want to delete this user? This action cannot be undone.')) {
    return;
  }
  
  try {
    const response = await fetch(`/admin/users/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (response.ok) {
      loadUsers(); // Refresh the user list
    } else {
      const error = await response.json();
      alert(error.error || 'Failed to delete user');
    }
  } catch (error) {
    console.error('Error deleting user:', error);
    alert('An error occurred while deleting the user');
  }
}

// Load user data (for current user info)
async function loadUserData() {
  if (!authToken) return;
  
  try {
    const response = await fetch('/profile', {
      headers: {
        'Authorization': `Bearer ${authToken}`
      }
    });
    
    if (response.ok) {
      currentUser = await response.json();
      
      // Update UI if we're on the main app
      if (elements.mainApp.style.display !== 'none') {
        elements.currentUserSpan.textContent = currentUser.username;
        
        // Show admin panel only for admins
        if (currentUser.role === 'admin') {
          elements.adminTab.style.display = 'block';
        } else {
          elements.adminTab.style.display = 'none';
        }
      }
    } else {
      // Token might be invalid, log out user
      handleLogout();
    }
  } catch (error) {
    console.error('Error loading user data:', error);
    // Token might be invalid, log out user
    handleLogout();
  }
}

// Make functions available globally for inline event handlers
window.openEditTaskModal = openEditTaskModal;
window.closeTaskModal = closeTaskModal;
window.deleteUser = deleteUser;