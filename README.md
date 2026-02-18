# Multi-Sync Planner

A multi-platform synchronized planner built on Cloudflare Workers with advanced features including task management, sharing, notifications, and user administration.

## Features

- **Task Management**: Create, modify, delete tasks with due dates, descriptions, and tags
- **Time Reminders**: Automatic reminders based on task deadlines
- **Tag System**: Organize tasks with custom tags
- **Recurring Tasks**: Support for daily, weekly, monthly recurring tasks
- **Gotify Integration**: Push notifications via Gotify
- **Multi-User Support**: Username/password authentication system
- **Task Sharing**: Share specific tasks between users (view/edit permissions)
- **Admin Controls**: User management, permission settings, account limits
- **Responsive UI**: Beautiful interface optimized for all devices
- **Encrypted Storage**: Secure password hashing and verification
- **Account Management**: Set account expiration dates and task limits

## Quick Deploy

[![Deploy to Cloudflare Workers](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/deploy?accountId=your-account-id&zoneId=your-zone-id&template=https://github.com/your-username/multi-sync-planner)

## Manual Deployment

1. Fork this repository
2. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
3. Navigate to Workers & Pages > Create Application
4. Select "Connect to Git" and find your forked repository
5. Configure build settings:
   - Framework preset: None
   - Build command: `npm install && npm run deploy`
   - Build output directory: `dist`
   - Environment variables: Add the required variables listed below
6. Click "Deploy"

## Required Environment Variables

The application requires the following environment variables to be set in your Cloudflare Workers configuration:

- `ADMIN_USERNAME`: The username for the initial admin account (default: admin)
- `ADMIN_PASSWORD`: The password for the initial admin account (default: admin123)
- `GOTIFY_URL`: URL of your Gotify server (optional)
- `GOTIFY_TOKEN`: Gotify application token for sending notifications (optional)

## Database Setup

This application uses Cloudflare D1 for database storage. During deployment:

1. You'll need to create a D1 database in your Cloudflare dashboard
2. Update the `database_id` in `wrangler.toml` with your actual database ID
3. Run `npx wrangler d1 execute` to initialize the database schema

## Usage

1. After deployment, access your application at the provided URL
2. Log in with the admin credentials (admin/admin123 by default)
3. Create additional users through the admin panel
4. Set user permissions, expiration dates, and task limits
5. Create and manage tasks with due dates and tags
6. Share tasks with other users as needed

## Security

- Passwords are encrypted using SHA-256 before storage
- Authentication tokens are generated for session management
- Admin users have elevated privileges for user management
- Account expiration dates can be set to limit access

## Architecture

- Frontend: HTML/CSS/JavaScript served from Workers
- Backend: Cloudflare Worker with Hono framework
- Database: Cloudflare D1 (SQLite)
- Authentication: JWT-based session management
- File Storage: R2 for attachments (optional)

## Contributing

Feel free to submit issues and pull requests for improvements or bug fixes.