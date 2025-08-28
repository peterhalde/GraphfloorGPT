# Local Development Setup Guide

This guide will help you set up and run this application on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js**: Version 18 or higher (check with `node --version`)
- **npm**: Version 9 or higher (comes with Node.js)
- **PostgreSQL**: Version 14 or higher
- **Git**: For cloning the repository

## Step 1: Clone the Repository

```bash
git clone <your-repository-url>
cd <project-directory>
```

## Step 2: Install Dependencies

```bash
npm install
```

## Step 3: Set Up Environment Variables

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and configure your settings:

   **Required Variables:**
   - `DATABASE_URL`: Your PostgreSQL connection string
     - Format: `postgresql://username:password@localhost:5432/dbname`
     - Example: `postgresql://postgres:mypassword@localhost:5432/myapp`

   **For AI Features (at least one required):**
   - `ANTHROPIC_API_KEY`: Get from [Anthropic Console](https://console.anthropic.com/)
   - `OPENAI_API_KEY`: Get from [OpenAI Platform](https://platform.openai.com/)
   - `AZURE_OPENAI_API_KEY`: For Azure OpenAI (also needs instance and deployment names)

   **Optional Variables:**
   - `NEO4J_URI`, `NEO4J_USERNAME`, `NEO4J_PASSWORD`: For graph database features
   - `GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_CLOUD_STORAGE_BUCKET`: For file storage
   - `SESSION_SECRET`: A random string for session encryption (generate one for production)

## Step 4: Set Up the Database

1. Create a PostgreSQL database:
   ```bash
   createdb myapp_dev
   ```
   
   Or using psql:
   ```sql
   CREATE DATABASE myapp_dev;
   ```

2. Run database migrations:
   ```bash
   npm run db:push
   ```

   If you encounter a data-loss warning and want to force the push:
   ```bash
   npm run db:push -- --force
   ```

## Step 5: Run the Application

Start the development server:
```bash
npm run dev
```

The application will be available at:
- **Application**: http://localhost:5000
- **API Endpoints**: http://localhost:5000/api

## Available Scripts

- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm run start` - Start production server (after building)
- `npm run check` - Run TypeScript type checking
- `npm run db:push` - Push database schema changes

## Troubleshooting

### Database Connection Issues

If you can't connect to the database:
1. Ensure PostgreSQL is running: `pg_ctl status` or `systemctl status postgresql`
2. Check your connection string format in `.env`
3. Verify database exists: `psql -l`
4. Check PostgreSQL logs for errors

### Port Already in Use

If port 5000 is already in use:
1. Change the port in `.env`: `PORT=3000`
2. Or find and stop the process using port 5000:
   ```bash
   # Find process
   lsof -i :5000
   # Kill process (replace PID with actual process ID)
   kill -9 PID
   ```

### Missing Environment Variables

The application will warn you about missing required variables. Check the console output and ensure all required variables in `.env.example` are set in your `.env` file.

### API Key Issues

- **Anthropic**: Ensure your API key starts with `sk-ant-`
- **OpenAI**: Ensure your API key starts with `sk-`
- **Azure OpenAI**: You need the API key, instance name, and deployment name

## Development Tips

1. **Use `.env.local` for local overrides**: Create a `.env.local` file for local-only settings that shouldn't be committed

2. **Database GUI**: Use tools like pgAdmin, TablePlus, or DBeaver to manage your PostgreSQL database

3. **API Testing**: Use tools like Postman, Insomnia, or the VS Code REST Client extension to test API endpoints

4. **Logs**: Check the console output for detailed logs and error messages

## Production Deployment

For production deployment:
1. Set `NODE_ENV=production` in your environment
2. Use a secure `SESSION_SECRET` (generate with `openssl rand -base64 32`)
3. Use environment variables from your hosting provider instead of `.env` files
4. Run `npm run build` before `npm run start`

## Replit Compatibility

This codebase is designed to work seamlessly on both local machines and Replit:
- On Replit: Environment variables are automatically loaded from Replit Secrets
- Locally: Environment variables are loaded from `.env` or `.env.local` files
- The configuration automatically detects the environment and adjusts accordingly

## Getting Help

If you encounter issues:
1. Check the console output for error messages
2. Review the `.env.example` file for required variables
3. Ensure all prerequisites are installed and running
4. Check that your database is accessible and properly configured