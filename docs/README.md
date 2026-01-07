# Coach Watts Documentation

Welcome to the Coach Watts documentation. This comprehensive guide covers the system architecture, database design, project structure, and step-by-step implementation instructions for building an AI-powered cycling coach application.

## 📚 Documentation Overview

The documentation is now organized into the following sections. Please refer to the [Index](./INDEX.md) for a complete list of documents.

### [Architecture](./01-architecture/system-overview.md)

**System design and technical decisions**

Learn about the high-level system architecture, including:

- Technology stack and component selection
- Core functional modules (Data Ingestion, AI Agents)
- Data flow and background job processing
- Authentication and security strategies
- Report generation pipeline
- Scalability considerations

**Read this first** to understand the overall system design and how different components work together.

### [Database Schema](./01-architecture/database-schema.md)

**Complete database structure and design**

Detailed documentation of the PostgreSQL database schema:

- All tables and relationships
- Field descriptions and data types
- Indexes and performance optimization
- Query patterns and examples
- Data integrity rules
- Migration strategy
- Security considerations

**Essential reading** for understanding data models and database interactions.

### [Chat Feature](./02-features/chat/overview.md)

**AI Chat System Architecture**

Guide to the chat implementation:

- Architecture and components
- Database schema for chat
- API endpoints and data flow
- Frontend integration with vue-advanced-chat
- AI integration details

### [Project Structure](./01-architecture/project-structure.md)

**File organization and code conventions**

Complete guide to the project's file system organization:

- Directory structure with explanations
- Naming conventions
- File locations for different components
- Import path aliases
- Development workflow
- Configuration files
- Best practices

**Reference this** when creating new files or organizing code.

### [Implementation Guide](./04-guides/implementation-guide.md)

**Step-by-step build instructions**

Sequential implementation guide with detailed prompts:

- Phase 1: Scaffold & Database
- Phase 2: Authentication
- Phase 3: Integration Logic
- Phase 4: AI Processing
- Phase 5: Frontend Dashboard
- Phase 6: Polish

Each phase includes:

- Clear goals and objectives
- Detailed code examples
- Commands to execute
- Validation checklists
- Troubleshooting tips

**Follow this** to build the application from scratch.

## 🚀 Quick Start

### For Developers New to the Project

1. **Read** [Architecture](./01-architecture/system-overview.md) to understand the system
2. **Review** [Database Schema](./01-architecture/database-schema.md) to understand data models
3. **Reference** [Project Structure](./01-architecture/project-structure.md) for file organization
4. **Follow** [Implementation Guide](./04-guides/implementation-guide.md) to build features

### For Experienced Developers

1. **Skim** [Architecture](./01-architecture/system-overview.md) for key decisions
2. **Bookmark** [Database Schema](./01-architecture/database-schema.md) for quick reference
3. **Use** [Project Structure](./01-architecture/project-structure.md) as needed
4. **Jump to** relevant sections in [Implementation Guide](./04-guides/implementation-guide.md)

## 🏗️ System Architecture at a Glance

```mermaid
graph TB
    subgraph Frontend
        A[Nuxt 3 Pages] --> B[Vue Components]
        B --> C[API Client]
    end

    subgraph Backend
        C --> D[Nuxt API Routes]
        D --> E[Prisma ORM]
        E --> F[(PostgreSQL)]
    end

    subgraph Background
        G[Trigger.dev Jobs] --> H[Data Ingestion]
        G --> I[AI Processing]
        H --> F
        I --> J[Google Gemini]
        I --> F
    end

    subgraph External
        K[Intervals.icu] --> H
        L[Whoop] --> H
        M[Google OAuth] --> D
    end

    style A fill:#e1f5ff
    style D fill:#ffe1e1
    style G fill:#e1ffe1
    style F fill:#f0e1ff
```

## 🎯 Key Features

### Data Ingestion

- **Intervals.icu Integration:** Workout data, power metrics, training calendar
- **Whoop Integration:** Recovery scores, HRV, sleep tracking
- **Automatic Sync:** Background jobs keep data fresh
- **Normalized Storage:** Unified data format from multiple sources

### AI Coaching

- **Retrospective Analysis:** Deep weekly/monthly reports using Gemini Pro
- **Prescriptive Guidance:** Daily workout suggestions using Gemini Flash
- **Chain-of-Thought Reasoning:** Comprehensive analysis of training trends
- **Structured Recommendations:** JSON-formatted actionable advice

### User Experience

- **Dashboard:** Real-time readiness and activity overview
- **Reports:** Markdown-formatted analysis with PDF export
- **Settings:** Profile management and integration connections
- **Responsive Design:** Works on desktop and mobile

## 🛠️ Technology Stack

| Layer          | Technology        | Purpose                    |
| -------------- | ----------------- | -------------------------- |
| **Frontend**   | Nuxt 3            | Full-stack framework       |
| **UI Library** | Nuxt UI           | Component library          |
| **Database**   | PostgreSQL        | Data persistence           |
| **ORM**        | Prisma            | Type-safe database access  |
| **Auth**       | NuxtAuth          | Authentication & sessions  |
| **Jobs**       | Trigger.dev       | Background processing      |
| **AI**         | Google Gemini 2.5 | Analysis & recommendations |
| **Language**   | TypeScript        | Type safety throughout     |

## 📋 Prerequisites

Before starting development, ensure you have:

### Required

- Node.js 18+
- pnpm, npm, or yarn
- PostgreSQL database
- Google Cloud account (for Gemini API)
- Google OAuth credentials

### Optional (for full functionality)

- Intervals.icu account and API access
- Whoop account and API access
- Trigger.dev account

## 🔧 Environment Setup

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/coach_watts"

# Authentication
AUTH_SECRET="your-random-secret"
GOOGLE_CLIENT_ID="your-client-id"
GOOGLE_CLIENT_SECRET="your-client-secret"

# External APIs
INTERVALS_CLIENT_ID="your-intervals-client-id"
INTERVALS_CLIENT_SECRET="your-intervals-client-secret"
WHOOP_CLIENT_ID="your-whoop-client-id"
WHOOP_CLIENT_SECRET="your-whoop-client-secret"

# AI
GEMINI_API_KEY="your-gemini-api-key"

# Background Jobs
TRIGGER_API_KEY="your-trigger-api-key"
```

See [Implementation Guide](./04-guides/implementation-guide.md) for detailed setup instructions.

## 📖 Development Workflow

### Starting Development

```bash
# Install dependencies
pnpm install

# Run database migrations
npx prisma migrate dev

# Start dev server (port 3000)
pnpm dev

# In another terminal, start Trigger.dev
npx trigger.dev@latest dev
```

### Creating New Features

1. **Plan:** Review architecture and determine component placement
2. **Database:** Update schema if needed, run migration
3. **Backend:** Create API routes and server utilities
4. **Frontend:** Build components and pages
5. **Jobs:** Add background jobs if needed
6. **Test:** Validate functionality
7. **Document:** Update relevant documentation

### Common Commands

```bash
# Database
npx prisma studio              # Open database GUI
npx prisma migrate dev         # Create and apply migration
npx prisma generate            # Regenerate Prisma Client

# Development
pnpm dev                       # Start dev server
pnpm build                     # Build for production
pnpm preview                   # Preview production build

# Background Jobs
npx trigger.dev@latest dev     # Start Trigger.dev
npx trigger.dev@latest deploy  # Deploy jobs to production
```

## 🎨 Code Style Guidelines

### TypeScript

- Use explicit types for function parameters and return values
- Leverage type inference where obvious
- Prefer interfaces over type aliases for object shapes
- Use enums for fixed sets of values

### Vue Components

- Use `<script setup>` syntax
- Co-locate related logic
- Keep components focused and reusable
- Use composables for shared logic

### API Design

- Follow RESTful conventions
- Return consistent response formats
- Use proper HTTP status codes
- Include error messages

### Naming Conventions

- Components: `PascalCase.vue`
- Files: `kebab-case.ts`
- Functions: `camelCase`
- Constants: `UPPER_SNAKE_CASE`
- Composables: `useCamelCase()`

## 🧪 Testing Strategy

### Unit Tests

- Utilities and calculations
- Pure functions
- Data transformations

### Integration Tests

- API endpoints
- Database operations
- External API clients

### E2E Tests

- Critical user flows
- Authentication
- Report generation

## 📊 Performance Considerations

### Frontend

- Lazy load components
- Optimize images
- Use pagination for lists
- Cache API responses

### Backend

- Database indexes on frequently queried fields
- Connection pooling
- API rate limiting
- Query optimization

### Background Jobs

- Batch processing where possible
- Efficient data fetching
- Proper error handling
- Retry strategies

## 🔒 Security Best Practices

### Authentication

- Secure session management
- HTTPS everywhere
- CSRF protection
- Rate limiting

### Data Protection

- Encrypt sensitive tokens
- Sanitize user input
- Use parameterized queries
- Regular security audits

### API Security

- Authentication required for protected routes
- Authorization checks
- Input validation
- Output sanitization

## 📈 Monitoring and Observability

### Application Monitoring

- Error tracking (Sentry)
- Performance monitoring
- User analytics
- API metrics

### Background Jobs

- Trigger.dev dashboard
- Job execution logs
- Failure alerts
- Performance metrics

## 🚢 Deployment

### Recommended Hosting

- **Frontend/API:** Vercel, Netlify, or Railway
- **Database:** Neon, Supabase, or managed PostgreSQL
- **Background Jobs:** Trigger.dev cloud

### Deployment Checklist

- [ ] Environment variables configured
- [ ] Database migrations applied
- [ ] SSL certificates configured
- [ ] Monitoring tools set up
- [ ] Backup strategy implemented
- [ ] CI/CD pipeline configured

## 🤝 Contributing

### Adding New Features

1. Review existing documentation
2. Plan database changes if needed
3. Implement backend logic
4. Build frontend interface
5. Add background jobs if necessary
6. Write tests
7. Update documentation

### Documentation Updates

When updating documentation:

- Keep examples current
- Update diagrams if architecture changes
- Maintain consistent formatting
- Add new sections as needed

## 🐛 Troubleshooting

### Common Issues

**Database Connection Fails**

```bash
# Check DATABASE_URL is correct
echo $DATABASE_URL

# Test connection
npx prisma db pull
```

**Prisma Client Out of Sync**

```bash
npx prisma generate
```

**Background Jobs Not Running**

```bash
# Check Trigger.dev is running
npx trigger.dev@latest dev

# Check for errors in dashboard
```

**OAuth Callback Fails**

- Verify redirect URIs match exactly
- Check client ID and secret
- Ensure proper scopes requested

## 📞 Support

### Resources

- [Nuxt Documentation](https://nuxt.com/docs)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Trigger.dev Documentation](https://trigger.dev/docs)
- [Google Gemini API](https://ai.google.dev/docs)

### Community

- GitHub Issues (for bug reports)
- GitHub Discussions (for questions)
- Discord Server (for real-time help)

## 🗺️ Roadmap

### Phase 1 (MVP)

- [x] Architecture design
- [x] Database schema
- [x] Documentation
- [ ] Basic authentication
- [ ] Data ingestion
- [ ] AI analysis
- [ ] Dashboard UI

### Phase 2

- [ ] Advanced analytics
- [ ] Race preparation mode
- [ ] Training plan builder
- [ ] Mobile-responsive design

### Phase 3

- [ ] Strava integration
- [ ] Garmin integration
- [ ] Community features
- [ ] Coach marketplace

## 📜 License

[Specify your license here]

## 🙏 Acknowledgments

- Nuxt team for the amazing framework
- Prisma team for excellent database tooling
- Google for Gemini AI
- Intervals.icu and Whoop for API access

---

**Last Updated:** December 2025  
**Version:** 1.0.0  
**Documentation Status:** Complete

For questions or contributions, please refer to the individual documentation files or contact the development team.
