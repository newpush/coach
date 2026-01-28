# Coach Watts

<div align="center">
  <p align="center">
    <strong>Your Open Source AI-Powered Endurance Coach</strong>
  </p>

  <p align="center">
    <a href="https://nuxt.com"><img src="https://img.shields.io/badge/Nuxt-4.2-00DC82?style=flat-square&logo=nuxt.js&logoColor=white" alt="Nuxt 4" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-5.0-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript" /></a>
    <a href="https://trigger.dev"><img src="https://img.shields.io/badge/Trigger.dev-Background_Jobs-4F46E5?style=flat-square" alt="Trigger.dev" /></a>
    <a href="https://ai.google.dev/"><img src="https://img.shields.io/badge/Gemini-AI-8E75B2?style=flat-square" alt="Google Gemini" /></a>
    <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="License" /></a>
  </p>

  <p align="center">
    <a href="#key-features">Key Features</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#integrations">Integrations</a> •
    <a href="./docs/INDEX.md">Documentation</a> •
    <a href="./public/content/releases">Release Notes</a> •
    <a href="./ACKNOWLEDGEMENTS.md">Acknowledgements</a>
  </p>
</div>

---

## 🚀 Overview

**Coach Watts** is a comprehensive, self-hosted endurance coaching platform designed for cyclists, runners, and triathletes. It acts as your "Digital Twin," aggregating data from your favorite fitness platforms and using **Google Gemini AI** to provide professional-level analysis, personalized training plans, and daily recommendations.

Unlike static dashboards, Coach Watts understands context—analyzing not just your power numbers, but your recovery, sleep, nutrition, and life stress to guide you toward peak performance.

<p align="center">
  <img src="docs/assets/images/dashboard_full.png" alt="Coach Watts Dashboard" width="100%">
</p>

## ✨ Key Features

- **🔗 Unified Data Hub:** Syncs automatically with multiple fitness platforms to create a 360° view of your athlete profile.
- **🤖 AI Coach:**
  - **Workout Analysis:** Detailed breakdown of every session with execution scores.
  - **Daily Recommendations:** Smart suggestions ("Push hard" vs "Rest") based on HRV and sleep.
  - **Interactive Chat:** Ask questions like _"How is my fatigue compared to last month?"_ and get data-backed answers.
- **📈 Advanced Analytics:** Track Fitness (CTL), Fatigue (ATL), Form (TSB), and Power Curves with intuitive visualizations.
- **🥗 Nutrition Tracking:** AI analysis of your macro intake vs. training demands.
- **📅 Smart Planning:** Generate adaptive training plans that fit your schedule and goals.

## 🖼️ Visual Tour

|                                  **Performance Analytics**                                   |                                  **Training Calendar**                                  |
| :------------------------------------------------------------------------------------------: | :-------------------------------------------------------------------------------------: |
| <img src="docs/assets/images/performance_full.png" alt="Performance Analytics" width="100%"> | <img src="docs/assets/images/activities_full.png" alt="Activity Calendar" width="100%"> |

|                                 **AI Workout Analysis**                                  |                             **Adaptive Planning**                             |
| :--------------------------------------------------------------------------------------: | :---------------------------------------------------------------------------: |
| <img src="docs/assets/images/workout_detail_complex.png" alt="AI Analysis" width="100%"> | <img src="docs/assets/images/plan_full.png" alt="Training Plan" width="100%"> |

|                                     **Planned Workouts**                                     |                               **AI Coach Settings**                                |
| :------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------: |
| <img src="docs/assets/images/planned_workout_detail.png" alt="Planned Workout" width="100%"> | <img src="docs/assets/images/ai_settings_full.png" alt="AI Settings" width="100%"> |

## 🔌 Integrations

Coach Watts connects seamlessly with:

| Platform          | Features Synced                                    |
| ----------------- | -------------------------------------------------- |
| **Intervals.icu** | Workouts, Calendar, Power Metrics, Fitness/Fatigue |
| **Strava**        | Activity Data, GPS Streams, Heart Rate             |
| **Whoop**         | Recovery, HRV, Sleep, Strain                       |
| **Yazio**         | Nutrition Logs, Macros, Hydration                  |
| **Withings**      | Body Composition (Weight, Fat %), Sleep, Wellness  |
| **Hevy**          | Strength Training, Exercises, Sets & Reps          |

## ⚡ Quick Start

### Prerequisites

- Node.js 20+
- Docker (for PostgreSQL)
- Google Cloud Account (for Auth & Gemini API)

### 1. Clone & Install

```bash
git clone https://github.com/newpush/coach.git
cd coach
cp .env.example .env
pnpm install
```

### 2. Start Database

```bash
docker-compose up -d
# Starts PostgreSQL on port 5439
```

```MacOS
Run Docker.app via Spotlight
```

### 3. Configure Environment

If you haven't already, copy the example env file (./coach/env.example) and edit to fill in your own API keys (see below):

```bash
vim ~/.env (or on MacOS: open -a TextEdit ~/.env)
```

> **Note:** You will need API keys for Google (Auth & Gemini), and optionally Intervals.icu, Strava, etc. See [Getting Credentials](./docs/04-guides/implementation-guide.md#prerequisites).

### 4. Run Migrations

```bash
pnpm prisma:generate
npx prisma migrate dev
```

### 5. Launch Development Server

```bash
pnpm dev
```

Visit `http://localhost:3099` and log in!

## 📚 Documentation

We have extensive documentation available in the [`docs/`](./docs) directory:

- [**Architecture**](./docs/01-architecture/system-overview.md): System design and data flow.
- [**Database Schema**](./docs/01-architecture/database-schema.md): Detailed Prisma models.
- [**Release Notes**](./public/content/releases): Detailed change logs for each version.
- **Feature Guides**:
  - [AI Chat System](./docs/02-features/chat/overview.md)
  - [Scoring System](./docs/02-features/analytics/scoring-system.md)
  - [Integration Guides](./docs/INDEX.md#03-integrations)

## 🤝 Contributing

We welcome contributions! Whether it's fixing bugs, improving documentation, or suggesting new features.

1. Fork the repo.
2. Create a branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes.
4. Push to the branch.
5. Open a Pull Request.

## 📄 License

Distributed under the MIT License. See [`LICENSE`](./LICENSE) for more information. Acknowledgements of third-party assets and contributors can be found in [`ACKNOWLEDGEMENTS.md`](./ACKNOWLEDGEMENTS.md).

## ❤️ Community & Support

- **Discord:** [Join our Server](https://discord.gg/dPYkzg49T9)
- **GitHub:** [Star us on GitHub](https://github.com/newpush/coach)
- **Issues:** [Report a Bug](https://github.com/newpush/coach/issues)

---

<p align="center">
  Made with ❤️ for endurance athletes.
</p>
