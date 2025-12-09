# Coach Watts

An AI-powered endurance coaching platform that aggregates data from multiple fitness tracking services and provides personalized training analysis, recommendations, and coaching insights using Google Gemini AI.

![Coach Watts](./public/og-image.png)

## Overview

Coach Watts is a comprehensive full-stack application designed to help endurance athletes (cyclists, runners, triathletes) optimize their training by:

- **Aggregating Data** from multiple sources (Intervals.icu, Strava, Whoop, Yazio)
- **Analyzing Performance** using AI-powered insights (Google Gemini)
- **Generating Reports** with detailed training analysis and recommendations
- **Creating Training Plans** personalized to your schedule and fitness level
- **Tracking Progress** with comprehensive scoring and trend analysis
- **Providing Daily Coaching** through an interactive AI chat interface

## Key Features

### 🔗 Multi-Platform Integration
- **Intervals.icu** - Training calendar, workouts, power metrics, CTL/ATL fitness tracking
- **Strava** - Activity data, GPS streams, heart rate zones, pacing analysis
- **Whoop** - Recovery scores, HRV, sleep quality, strain tracking
- **Yazio** - Nutrition tracking with macro breakdown and meal logging

### 🤖 AI-Powered Coaching
- **Workout Analysis** - Automated analysis of every workout with performance scores (1-10 scale)
- **Nutrition Analysis** - Daily nutrition quality assessment with improvement suggestions
- **Weekly Reports** - Comprehensive training analysis with chain-of-thought reasoning
- **Training Plans** - AI-generated weekly plans based on availability and fitness level
- **Daily Recommendations** - Smart suggestions for today's training based on recovery status
- **Interactive Chat** - AI assistant with 30+ tools for accessing your training data

### 📊 Comprehensive Scoring System
Track your progress across multiple dimensions:
- **Fitness Score** (1-10) - Current overall fitness level
- **Recovery Capacity Score** (1-10) - Ability to handle training load
- **Nutrition Compliance Score** (1-10) - Diet adherence and quality
- **Training Consistency Score** (1-10) - Training regularity and pattern
- **Workout Scores** - Per-workout ratings for execution, pacing, effort, and technique
- **Nutrition Scores** - Daily scores for macro balance, quality, hydration, and adherence

### 📈 Dashboard & Analytics
- Real-time athlete profile with fitness metrics
- Recent activity timeline
- Training stress balance (CTL/ATL)
- Power curves and heart rate analysis
- 7/14/30/90-day trend visualization
- Recovery readiness indicators

### 🔄 Background Sync & Processing
- Automatic nightly data sync from all connected platforms
- On-demand manual sync capability
- Duplicate workout detection and management
- Retry queue for failed sync operations
- Webhook support for real-time updates

## Technology Stack

| Layer | Technology | Version | Purpose |
|-------|-----------|---------|---------|
| **Frontend** | Nuxt | 4.2.1 | Vue 3 full-stack framework |
| **UI Library** | Nuxt UI | 4.2.1 | Tailwind CSS component library |
| **Database** | PostgreSQL | 16 | Data persistence |
| **ORM** | Prisma | 7.0.1 | Type-safe database client |
| **Authentication** | NuxtAuth | 1.1.1 | Google OAuth integration |
| **Background Jobs** | Trigger.dev | 4.2.0 | Scheduled & event-based processing |
| **AI Engine** | Google Gemini | 2.5 | Pro & Flash models for analysis |
| **Chat UI** | vue-advanced-chat | 2.1.1 | Rich chat interface |
| **Charts** | Chart.js | 4.5.1 | Data visualization |
| **Rich Text** | TipTap | 3.13.0 | Notes editor |
| **Language** | TypeScript | 5.9.3 | Type safety throughout |
| **Package Manager** | pnpm | - | Dependency management |

## Project Structure

```
coach-wattz/
├── app/                          # Nuxt frontend application
│   ├── pages/                    # 27 route pages
│   │   ├── index.vue            # Landing page
│   │   ├── dashboard.vue        # Main dashboard
│   │   ├── chat.vue             # AI chat interface
│   │   ├── plan.vue             # Training plan generator
│   │   ├── reports.vue          # Report management
│   │   ├── workouts/            # Workout pages
│   │   ├── nutrition/           # Nutrition tracking
│   │   ├── profile/             # Profile & settings
│   │   └── ...                  # More pages
│   ├── components/              # Reusable Vue components
│   ├── layouts/                 # Layout templates
│   ├── middleware/              # Route middleware
│   └── assets/                  # Static assets
│
├── server/                       # Nuxt backend
│   ├── api/                     # 64+ API endpoints
│   │   ├── auth/                # Authentication
│   │   ├── integrations/        # External service connections
│   │   ├── workouts/            # Workout management
│   │   ├── nutrition/           # Nutrition tracking
│   │   ├── reports/             # Report generation
│   │   ├── scores/              # Scoring & trends
│   │   ├── chat/                # Chat system
│   │   └── ...                  # More endpoints
│   └── utils/                   # Server utilities
│       ├── db.ts                # Prisma client
│       ├── gemini.ts            # AI integration
│       ├── intervals.ts         # Intervals.icu client
│       ├── strava.ts            # Strava client
│       ├── whoop.ts             # Whoop client
│       └── yazio.ts             # Yazio client
│
├── trigger/                      # Background jobs (24 jobs)
│   ├── ingest-*.ts              # Data ingestion jobs
│   ├── analyze-*.ts             # AI analysis jobs
│   ├── generate-*.ts            # Report & plan generation
│   └── ...                      # More jobs
│
├── prisma/                       # Database
│   ├── schema.prisma            # 40+ data models
│   └── migrations/              # Database migrations
│
├── docs/                         # Documentation (34 files)
│   ├── README.md                # Documentation hub
│   ├── architecture.md          # System design
│   ├── database-schema.md       # DB documentation
│   ├── implementation-guide.md  # Build instructions
│   └── ...                      # Feature-specific docs
│
├── public/                       # Static files
├── types/                        # TypeScript types
├── nuxt.config.ts               # Nuxt configuration
├── prisma.config.ts             # Prisma config
├── trigger.config.ts            # Trigger.dev config
├── docker-compose.yml           # Local PostgreSQL
└── package.json                 # Dependencies
```

## Prerequisites

### Required
- **Node.js** 18+ (20+ recommended)
- **pnpm** (or npm/yarn)
- **PostgreSQL** 16+ (via Docker or managed service)
- **Google Cloud Account** (for Gemini API key)
- **Google OAuth** credentials (for authentication)

### Optional (for full functionality)
- **Intervals.icu** account (for workout data)
- **Strava** developer app (for activity sync)
- **Whoop** developer account (for recovery data)
- **Yazio** account (for nutrition tracking)
- **Trigger.dev** account (for production background jobs)

## Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/yourusername/coach-wattz.git
cd coach-wattz
```

### 2. Install Dependencies
```bash
pnpm install
```

### 3. Start PostgreSQL Database
```bash
# Using Docker Compose (recommended for local development)
docker-compose up -d

# This starts PostgreSQL on port 5439
# Database: coach_watts
# User: postgres
# Password: postgres
```

### 4. Configure Environment Variables
Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://postgres:postgres@localhost:5439/coach_watts"

# Authentication (NuxtAuth)
NUXT_AUTH_SECRET="your-random-secret-key-min-32-chars"
NUXT_AUTH_ORIGIN="http://localhost:3099/api/auth"

# Google OAuth
GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="your-google-client-secret"

# Google Gemini AI
GEMINI_API_KEY="your-gemini-api-key"

# Intervals.icu Integration
INTERVALS_CLIENT_ID="your-intervals-client-id"
INTERVALS_CLIENT_SECRET="your-intervals-client-secret"

# Strava Integration
STRAVA_CLIENT_ID="your-strava-client-id"
STRAVA_CLIENT_SECRET="your-strava-client-secret"
STRAVA_REDIRECT_URI="http://localhost:3099/api/integrations/strava/callback"

# Whoop Integration
WHOOP_CLIENT_ID="your-whoop-client-id"
WHOOP_CLIENT_SECRET="your-whoop-client-secret"
WHOOP_REDIRECT_URI="http://localhost:3099/api/integrations/whoop/callback"

# Trigger.dev (optional for local development)
TRIGGER_API_KEY="your-trigger-api-key"
TRIGGER_PROJECT_REF="your-project-ref"
TRIGGER_SECRET_KEY="your-trigger-secret"

# Site Configuration
NUXT_PUBLIC_SITE_URL="http://localhost:3099"
```

### 5. Run Database Migrations
```bash
# Generate Prisma client
pnpm prisma:generate

# Run migrations
npx prisma migrate dev
```

### 6. Start Development Servers

**Terminal 1 - Nuxt Dev Server:**
```bash
pnpm dev
# Runs on http://localhost:3099
```

**Terminal 2 - Trigger.dev (Background Jobs):**
```bash
pnpm dev:trigger
# Starts local Trigger.dev development server
```

### 7. Open the Application
Navigate to **http://localhost:3099** and log in with Google.

## Development Workflow

### Database Management
```bash
# Open Prisma Studio (Database GUI)
npx prisma studio

# Create a new migration
npx prisma migrate dev --name your_migration_name

# Reset database (WARNING: deletes all data)
npx prisma migrate reset

# Generate Prisma client after schema changes
npx prisma generate
```

### Running Background Jobs
Background jobs handle data ingestion and AI analysis:

```bash
# Start Trigger.dev dev server
pnpm dev:trigger

# Deploy jobs to production
npx trigger.dev@latest deploy
```

Available jobs:
- `ingest-intervals` - Fetch workouts from Intervals.icu
- `ingest-strava` - Fetch activities from Strava
- `ingest-whoop` - Fetch recovery data from Whoop
- `ingest-yazio` - Fetch nutrition data from Yazio
- `analyze-workout` - AI analysis of individual workout
- `analyze-nutrition` - AI analysis of daily nutrition
- `generate-weekly-report` - Comprehensive training report
- `generate-athlete-profile` - Calculate athlete scores
- `generate-weekly-plan` - AI training plan generation
- `recommend-today-activity` - Daily recommendation

### API Development
API routes are in `server/api/`:
```bash
# Example: Test an endpoint
curl http://localhost:3099/api/profile/index

# With authentication (get token from browser devtools)
curl -H "Cookie: next-auth.session-token=YOUR_TOKEN" \
  http://localhost:3099/api/workouts/index
```

### Frontend Development
Pages and components are in `app/`:
- Hot module replacement enabled
- TypeScript support
- Auto-imported components
- Auto-imported composables

## Getting API Keys & Credentials

### Google OAuth
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Enable Google+ API
4. Create OAuth 2.0 credentials
5. Add authorized redirect URI: `http://localhost:3099/api/auth/callback/google`
6. Copy Client ID and Secret to `.env`

### Google Gemini API
1. Go to [Google AI Studio](https://makersuite.google.com/app/apikey)
2. Create API key
3. Copy to `.env` as `GEMINI_API_KEY`

### Intervals.icu
1. Visit [Intervals.icu API](https://intervals.icu/api)
2. Request API access (requires active subscription)
3. Create OAuth application
4. Copy Client ID and Secret to `.env`

### Strava
1. Go to [Strava API Settings](https://www.strava.com/settings/api)
2. Create an application
3. Set Authorization Callback Domain: `localhost`
4. Copy Client ID and Secret to `.env`

### Whoop
1. Visit [Whoop Developer Portal](https://developer.whoop.com/)
2. Create developer account and application
3. Configure OAuth redirect URI
4. Copy credentials to `.env`

### Trigger.dev
1. Sign up at [Trigger.dev](https://trigger.dev/)
2. Create a new project
3. Copy API credentials to `.env`

## Core Features & Usage

### Connecting Integrations
1. Log in to the dashboard
2. Navigate to **Settings** → **Integrations**
3. Connect each service:
   - **Intervals.icu** - Enter API key from your profile
   - **Strava** - Click "Connect" and authorize
   - **Whoop** - Click "Connect" and authorize
   - **Yazio** - Enter username/password

### Syncing Data
Data sync happens automatically:
- **Nightly sync** - All integrations sync at midnight
- **Manual sync** - Click "Sync Now" in Data Management page
- **Webhooks** - Real-time updates (when configured)

### Generating Reports
1. Go to **Reports** page
2. Click "Generate New Report"
3. Select report type:
   - Last 3 Workouts
   - Last 7 Days
   - Last 30 Days
   - Custom Date Range
4. AI generates comprehensive analysis with:
   - Performance summary
   - Training load analysis
   - Recovery assessment
   - Recommendations

### Creating Training Plans
1. Navigate to **Plan** page
2. Set your training availability:
   - Days of the week
   - Time slots (morning/afternoon/evening)
   - Indoor/outdoor preferences
   - Equipment access
3. Click "Generate Plan"
4. Review AI-generated weekly plan
5. Accept or modify workouts
6. Sync to Intervals.icu (optional)

### Using AI Chat
1. Go to **Chat** page
2. Ask questions about your training:
   - "How was my last workout?"
   - "Show me my nutrition for this week"
   - "Am I recovering well?"
   - "Generate a training plan for next week"
3. AI responds using 30+ tools to access your data

### Viewing Performance Trends
1. Visit **Performance** page
2. View trends for:
   - Workout scores (7/14/30/90 days)
   - Nutrition scores (7/14/30/90 days)
   - Fitness progression
   - Recovery patterns
3. Click any score for detailed explanation

## Database Schema

The application uses PostgreSQL with 40+ Prisma models organized into:

### Authentication & Users
- `User` - User profile with coaching parameters and scores
- `Account` - OAuth account linking
- `Session` - Authentication sessions
- `VerificationToken` - Email verification

### Integrations
- `Integration` - Connected external services with sync status

### Fitness Data
- `Workout` - Normalized workout data with AI analysis and scores
- `WorkoutStream` - Time-series pacing/heart rate data
- `PlannedWorkout` - Scheduled workouts from training calendar
- `DailyMetric` - Recovery metrics (HRV, sleep, resting HR)
- `Wellness` - Detailed daily wellness data from Intervals.icu

### Nutrition
- `Nutrition` - Daily nutrition tracking with AI analysis
- `YazioProductCache` - Food product cache for performance

### AI Outputs
- `Report` - Generated training reports with analysis
- `ActivityRecommendation` - Daily training recommendations
- `ScoreTrendExplanation` - Pre-generated score explanations
- `WeeklyTrainingPlan` - AI-generated training plans
- `LlmUsage` - LLM API call tracking for cost monitoring

### Communication
- `ChatRoom` - Chat conversation threads
- `ChatParticipant` - User participation in chat rooms
- `ChatMessage` - Chat messages (user and AI)

### System
- `SyncQueue` - Retry queue for failed operations

See [docs/database-schema.md](./docs/database-schema.md) for complete schema documentation.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Nuxt)                       │
│  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐ │
│  │  Landing   │  │ Dashboard  │  │  Chat / Reports / Plan │ │
│  └────────────┘  └────────────┘  └────────────────────────┘ │
└────────────────────────┬────────────────────────────────────┘
                         │ API Calls
┌────────────────────────▼────────────────────────────────────┐
│                    API Routes (Nuxt Server)                  │
│  ┌──────────────┐ ┌──────────────┐ ┌────────────────────┐  │
│  │ Auth & Profile│ │ Integrations │ │ Workouts & Nutrition│ │
│  └──────────────┘ └──────────────┘ └────────────────────┘  │
└────────────────────────┬────────────────────────────────────┘
                         │ Prisma ORM
┌────────────────────────▼────────────────────────────────────┐
│                    PostgreSQL Database                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────┐  │
│  │  Users   │ │ Workouts │ │ Nutrition│ │  AI Analysis │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────┘  │
└─────────────────────────────────────────────────────────────┘
                         ▲
                         │ Data Ingestion & Processing
┌────────────────────────┴────────────────────────────────────┐
│                  Trigger.dev Background Jobs                 │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────────────────┐│
│  │  Ingest     │ │   Analyze   │ │  Generate Reports/Plans││
│  │  (Nightly)  │ │  (On-demand)│ │      (Scheduled)       ││
│  └─────────────┘ └─────────────┘ └────────────────────────┘│
└────────────────────────────────────────────────────────────┘
         │                    │                    │
         ▼                    ▼                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│ Intervals.icu│    │    Strava    │    │  Google Gemini   │
│    Whoop     │    │    Yazio     │    │   (AI Analysis)  │
└──────────────┘    └──────────────┘    └──────────────────┘
```

For detailed architecture documentation, see [docs/architecture.md](./docs/architecture.md).

## Documentation

Comprehensive documentation is available in the `/docs` folder:

- **[docs/README.md](./docs/README.md)** - Documentation hub
- **[docs/architecture.md](./docs/architecture.md)** - System design & technical decisions
- **[docs/database-schema.md](./docs/database-schema.md)** - Complete database documentation
- **[docs/project-structure.md](./docs/project-structure.md)** - File organization guide
- **[docs/implementation-guide.md](./docs/implementation-guide.md)** - Step-by-step build instructions
- **[docs/chat-feature.md](./docs/chat-feature.md)** - AI chat system architecture
- **[docs/scoring-system.md](./docs/scoring-system.md)** - Scoring logic & calculations

### Integration-Specific Docs
- [docs/strava-integration.md](./docs/strava-integration.md)
- [docs/whoop-integration.md](./docs/whoop-integration.md)
- [docs/yazio-integration.md](./docs/yazio-integration.md)
- [docs/intervals-profile-data.md](./docs/intervals-profile-data.md)

### Feature Docs
- [docs/activity-recommendations-feature.md](./docs/activity-recommendations-feature.md)
- [docs/workout-deduplication.md](./docs/workout-deduplication.md)
- [docs/strava-pacing-data-implementation.md](./docs/strava-pacing-data-implementation.md)
- [docs/chat-training-plan-integration.md](./docs/chat-training-plan-integration.md)

## Production Deployment

### Recommended Hosting Providers

**Frontend & API:**
- [Vercel](https://vercel.com/) - Nuxt native support
- [Netlify](https://www.netlify.com/) - Full-stack hosting
- [Railway](https://railway.app/) - Easy deployment with database

**Database:**
- [Neon](https://neon.tech/) - Serverless PostgreSQL
- [Supabase](https://supabase.com/) - PostgreSQL with extras
- [Railway](https://railway.app/) - Managed PostgreSQL

**Background Jobs:**
- [Trigger.dev Cloud](https://trigger.dev/) - Recommended for production

### Deployment Steps

1. **Build the application:**
   ```bash
   pnpm build
   ```

2. **Set environment variables** on your hosting platform

3. **Run database migrations:**
   ```bash
   npx prisma migrate deploy
   ```

4. **Deploy background jobs:**
   ```bash
   npx trigger.dev@latest deploy
   ```

5. **Configure OAuth redirect URIs** for production domain

6. **Set up monitoring** (Sentry, LogRocket, etc.)

### Environment Variables for Production
```env
# Use production values
NUXT_PUBLIC_SITE_URL="https://yourdomain.com"
NUXT_AUTH_ORIGIN="https://yourdomain.com/api/auth"
DATABASE_URL="postgresql://..."  # Production database
# ... other credentials
```

## Performance Optimization

### Database
- Indexes on frequently queried fields (userId, date, status)
- Connection pooling via Prisma
- Efficient queries with proper `include` and `select`

### API
- Server-side caching for expensive queries
- Rate limiting on AI endpoints
- Batch processing for bulk operations

### Frontend
- Lazy loading for components
- Image optimization
- Code splitting
- API response caching

### Background Jobs
- Queue-based processing with concurrency limits
- Exponential backoff for retries
- Batch ingestion for efficiency

## Security

### Authentication
- Google OAuth 2.0 only (no passwords)
- Secure session management via NuxtAuth
- HTTPS required in production
- CSRF protection enabled

### Data Protection
- OAuth tokens encrypted at rest
- Sensitive environment variables never committed
- SQL injection prevention via Prisma
- Input validation on all endpoints

### API Security
- Authentication required on all protected routes
- User-scoped data queries (no cross-user access)
- Rate limiting on expensive operations
- Error messages don't leak sensitive info

## Troubleshooting

### Common Issues

**Database Connection Error**
```bash
# Verify PostgreSQL is running
docker ps

# Check DATABASE_URL is correct
echo $DATABASE_URL

# Test connection
npx prisma db pull
```

**Prisma Client Out of Sync**
```bash
npx prisma generate
```

**OAuth Login Fails**
- Verify redirect URIs match exactly (including http/https)
- Check Google OAuth credentials in `.env`
- Ensure `NUXT_AUTH_ORIGIN` is correct

**Background Jobs Not Running**
```bash
# Check Trigger.dev is running
pnpm dev:trigger

# View job logs in Trigger.dev dashboard
```

**AI Analysis Fails**
- Verify `GEMINI_API_KEY` is valid
- Check API quota hasn't been exceeded
- Review error logs in `LlmUsage` table

## Contributing

Contributions are welcome! Please follow these guidelines:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests and linting
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Guidelines
- Follow existing code style and conventions
- Update documentation for new features
- Add tests for new functionality
- Keep commits focused and descriptive

## License

[MIT License](LICENSE) - feel free to use this project for personal or commercial purposes.

## Support & Community

- **Documentation:** [/docs](./docs)
- **Issues:** [GitHub Issues](https://github.com/yourusername/coach-wattz/issues)
- **Discussions:** [GitHub Discussions](https://github.com/yourusername/coach-wattz/discussions)

## Acknowledgments

Built with these amazing technologies:
- [Nuxt](https://nuxt.com/) - The Intuitive Vue Framework
- [Prisma](https://www.prisma.io/) - Next-generation ORM
- [Trigger.dev](https://trigger.dev/) - Background Jobs Made Easy
- [Google Gemini](https://ai.google.dev/) - Advanced AI Models
- [Intervals.icu](https://intervals.icu/) - Training Analysis Platform
- [Strava](https://www.strava.com/) - Social Network for Athletes
- [Whoop](https://www.whoop.com/) - Human Performance Optimization
- [Yazio](https://www.yazio.com/) - Nutrition Tracking

---

**Made with ❤️ for endurance athletes**

For detailed technical documentation, visit [/docs](./docs)
