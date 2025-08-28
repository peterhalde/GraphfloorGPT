# GraphfloorGPT Deployment Guide

## 🚀 GitHub Repository Setup

### Option 1: Manual Upload (Recommended)

1. **Create GitHub Repository**
   - Go to https://github.com/new
   - Repository name: `GraphfloorGPT` (or your preferred name)
   - Description: `AI-powered knowledge graph platform transforming PDFs into intelligent graphs`
   - Set to Public or Private as preferred
   - **Do NOT** initialize with README, .gitignore, or license

2. **Download Project Files from Replit**
   - In Replit, go to the three-dot menu (⋯) 
   - Select "Download as ZIP"
   - Extract the ZIP file on your local computer

3. **Upload to GitHub**
   - In your new GitHub repository, click "uploading an existing file"
   - Drag and drop all extracted files or upload them
   - Commit message: "Initial commit: Complete GraphfloorGPT implementation"
   - Click "Commit changes"

### Option 2: Using Git CLI (If Available)

```bash
# Clone your empty GitHub repository
git clone https://github.com/YOUR_USERNAME/GraphfloorGPT.git
cd GraphfloorGPT

# Copy all files from Replit project
# (You'll need to manually copy files from Replit)

# Add and commit files
git add .
git commit -m "Initial commit: Complete GraphfloorGPT implementation"
git push origin main
```

## 📋 Files to Include in Repository

### Essential Project Files
```
✅ Include These Files:
├── client/                    # Complete React frontend
├── server/                    # Complete Express backend  
├── shared/                    # Shared TypeScript schemas
├── package.json              # Dependencies and scripts
├── package-lock.json         # Lock file for reproducible builds
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite build configuration
├── tailwind.config.ts        # Tailwind CSS configuration
├── postcss.config.js         # PostCSS configuration
├── drizzle.config.ts         # Database ORM configuration
├── components.json           # shadcn/ui configuration
├── .gitignore                # Git ignore rules
├── GITHUB_README.md          # Rename to README.md
├── DEPLOYMENT.md             # This file
├── replit.md                 # Project documentation
└── attached_assets/          # Project assets (if any are needed)

❌ Exclude These (Already in .gitignore):
├── node_modules/             # Dependencies (installed via npm)
├── uploads/                  # Temporary upload files
├── dist/                     # Build output
├── *.log                     # Log files  
├── .env*                     # Environment variables
├── debug_*.js                # Debug scripts
├── force_*.js                # Force scripts
├── test_*.html               # Test files
└── graphfloorgpt-complete.tar.gz  # Archive file
```

## 🔧 Environment Setup for Deployment

### Required Environment Variables

Create a `.env` file (locally) with these variables:

```env
# Database Configuration
DATABASE_URL="postgresql://username:password@hostname:5432/database"

# AI Service Configuration  
ANTHROPIC_API_KEY="your_anthropic_api_key_here"

# Google Cloud Storage (Optional)
GOOGLE_CLOUD_PROJECT_ID="your_project_id"
GOOGLE_CLOUD_STORAGE_BUCKET="your_bucket_name"
GOOGLE_APPLICATION_CREDENTIALS="path/to/service-account.json"

# Neo4j Graph Database (Optional)
NEO4J_URI="bolt://localhost:7687"
NEO4J_USERNAME="neo4j" 
NEO4J_PASSWORD="your_neo4j_password"

# Session Configuration
SESSION_SECRET="your_secure_session_secret_here"

# Application Configuration
NODE_ENV="production"
PORT="5000"
```

### Service Setup Requirements

1. **Neon Database** (PostgreSQL)
   - Sign up at https://neon.tech
   - Create a new database
   - Copy connection string to `DATABASE_URL`

2. **Anthropic Claude API**
   - Get API key from https://console.anthropic.com
   - Add to `ANTHROPIC_API_KEY`

3. **Google Cloud Storage** (Optional)
   - Create project at https://console.cloud.google.com
   - Enable Cloud Storage API
   - Create service account with Storage Admin role
   - Download JSON key file

4. **Neo4j Database** (Optional)
   - Install locally or use Neo4j Aura cloud service
   - Configure connection details

## 🚀 Deployment Platforms

### Vercel Deployment

1. **Connect GitHub Repository**
   ```bash
   npm install -g vercel
   vercel --prod
   ```

2. **Configure Build Settings**
   - Build Command: `npm run build`
   - Output Directory: `dist`
   - Install Command: `npm install`

3. **Environment Variables**
   - Add all required environment variables in Vercel dashboard

### Railway Deployment

1. **Connect Repository**
   - Go to https://railway.app
   - Connect GitHub repository
   - Select GraphfloorGPT repository

2. **Configure Services**
   - Add PostgreSQL database service
   - Configure environment variables
   - Deploy automatically on commits

### Replit Deployment

1. **Use Existing Replit**
   - Your current Replit is already configured
   - Click "Deploy" button in Replit interface
   - Configure custom domain if needed

2. **Environment Variables**
   - Set in Replit Secrets tab
   - Use exact variable names from .env template

## 🔍 Post-Deployment Verification

### Health Checks

1. **Backend API**
   ```bash
   curl https://your-domain.com/api/health
   ```

2. **Database Connection**
   - Check application logs for database connection success
   - Verify tables are created with `npm run db:push`

3. **File Upload**
   - Test PDF upload functionality
   - Verify file processing pipeline

4. **AI Integration**
   - Test entity extraction with sample document
   - Verify Claude API responses

### Performance Monitoring

- **Response Times**: Monitor API endpoint performance
- **Error Rates**: Track 4xx/5xx HTTP responses  
- **Database Performance**: Monitor query execution times
- **Memory Usage**: Track Node.js memory consumption

## 🐛 Common Deployment Issues

### Database Connection Errors
```bash
# Check database URL format
echo $DATABASE_URL

# Test connection
npm run db:push
```

### Missing Environment Variables
```bash
# Verify all required variables are set
env | grep -E "(DATABASE_URL|ANTHROPIC_API_KEY)"
```

### Build Failures
```bash
# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install
npm run build
```

### File Upload Issues
- Verify upload directory permissions
- Check storage service configuration
- Confirm file size limits

## 📞 Support and Troubleshooting

### Logs and Debugging
- Check application logs for error messages
- Use browser developer tools for frontend issues
- Monitor network requests for API problems

### Performance Optimization
- Enable gzip compression
- Implement caching strategies
- Optimize database queries
- Use CDN for static assets

### Security Considerations
- Keep dependencies updated
- Use HTTPS in production
- Validate all user inputs
- Implement rate limiting
- Secure environment variables

---

## Next Steps After Deployment

1. **Test Core Functionality**
   - Upload sample PDF
   - Verify entity extraction
   - Test knowledge graph visualization

2. **Monitor Performance**
   - Set up logging and monitoring
   - Configure alerts for errors
   - Track user engagement metrics

3. **Documentation**
   - Update README with live demo URL
   - Create user guides and tutorials
   - Document API endpoints

4. **Continuous Integration**
   - Set up automated testing
   - Configure deployment pipelines
   - Enable automated dependency updates

Your GraphfloorGPT application is now ready for production use! 🎉