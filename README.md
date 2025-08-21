# GraphfloorGPT - AI Knowledge Graph Platform

Transform PDF documents into intelligent, queryable knowledge graphs using Claude Sonnet 4.

## 🚀 Quick Start

```bash
npm install
npm run db:push
npm run dev
```

## 🛠 Tech Stack

- **Frontend**: React + TypeScript, Radix UI, TailwindCSS
- **Backend**: Node.js + Express, Drizzle ORM
- **Database**: PostgreSQL (Neon) + Neo4j
- **AI**: Claude Sonnet 4 for entity extraction
- **Storage**: Google Cloud Storage

## 📋 Features

✅ PDF document processing and text extraction
✅ AI-powered entity and relationship extraction
✅ Interactive knowledge graph visualization
✅ Intelligent duplicate detection and merging
✅ Natural language chat interface
✅ User authentication and document management

## 🔧 Environment Setup

```env
DATABASE_URL=postgresql://...
ANTHROPIC_API_KEY=sk-...
NEO4J_URI=neo4j+s://...
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=...
```

## 🐛 Known Issues

- Exact duplicate matching needs refinement for identical node names
- Deduplication threshold logic creates noise candidates
- Frontend state management improvements needed

## 📁 Project Structure

```
├── client/src/        # React frontend
├── server/           # Express backend
├── shared/           # Shared schemas and types
└── uploads/          # File storage
```

See `PROJECT_EXPORT.md` for detailed documentation.