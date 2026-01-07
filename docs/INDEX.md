# Coach Watts Documentation Index

Welcome to the comprehensive documentation for the Coach Watts project.

## 🏗️ 01. Architecture

Core system design, database schemas, and infrastructure.

- [**System Overview**](./01-architecture/system-overview.md) - High-level architecture, tech stack, and core modules.
- [**Database Schema**](./01-architecture/database-schema.md) - Complete database structure (Prisma).
- [**Project Structure**](./01-architecture/project-structure.md) - File organization and conventions.
- [**Task Dependency System**](./01-architecture/task-dependency-system.md) - Orchestration of data processing tasks.
- [**Queue Concurrency**](./01-architecture/trigger-queue-concurrency.md) - How Trigger.dev queues are managed per user.

## 🚀 02. Features

Detailed documentation for specific application features.

### Chat & AI Coach

- [**Chat System Overview**](./02-features/chat/overview.md) - Architecture of the AI chat feature.
- [**Tool Calling Spec**](./02-features/chat/tool-calling-spec.md) - How the AI fetches data (workouts, nutrition, etc.).

### Training Planning

- [**Goal-Driven Training**](./02-features/goal-driven-training.md) - Periodized AI training plans and adaptation logic.
- [**Training Plan Integration**](./02-features/chat/training-plan-integration.md) - Managing training plans via chat.

### Analytics & Scoring

- [**Scoring System**](./02-features/analytics/scoring-system.md) - The 1-10 scoring logic for workouts and nutrition.
- [**Training Stress Metrics**](./02-features/analytics/training-stress-metrics.md) - TSS, CTL, ATL, and TSB calculations.
- [**Advanced Analytics**](./02-features/analytics/advanced-analytics.md) - W' Balance, Efficiency Factor, and Power Profiling.
- [**Performance Page**](./02-features/analytics/performance-page.md) - Documentation for the performance dashboard.
- [**Workout Type Awareness**](./02-features/analytics/workout-type-awareness.md) - How analysis adapts to Run vs Ride vs Gym.

### Goals

- [**Goals Feature**](./02-features/goals/overview.md) - System for tracking user goals.
- [**AI Goal Suggestions**](./02-features/goals/ai-suggestions.md) - How AI generates personalized goals.

### Data Management

- [**Batch Ingestion**](./02-features/data-management/batch-ingestion.md) - Syncing all sources efficiently.
- [**Workout Deduplication**](./02-features/data-management/workout-deduplication.md) - Automatic duplicate handling logic.
- [**Manual Deduplication**](./02-features/data-management/manual-deduplication.md) - User interface for merging activities.

### Recommendations

- [**Activity Recommendations**](./02-features/recommendations/activity-recommendations.md) - AI-powered daily workout advice.

## 🔌 03. Integrations

External service connections and data sources.

### Strava

- [**Overview**](./03-integrations/strava/overview.md) - Setup and general data sync.
- [**Quick Start Guide**](./03-integrations/strava/quick-start.md) - Quick start for Strava pacing features.
- [**Pacing Data Implementation**](./03-integrations/strava/pacing-implementation.md) - Stream ingestion for pacing metrics.
- [**Pacing Usage Guide**](./03-integrations/strava/pacing-usage.md) - How to use pacing features.
- [**HR Stream Ingestion**](./03-integrations/strava/hr-stream-ingestion.md) - Heart rate data handling.
- [**Limitations**](./03-integrations/strava/limitations.md) - Known API limitations.

### WHOOP

- [**Overview**](./03-integrations/whoop/overview.md) - Connection and data sync.
- [**AI Integration**](./03-integrations/whoop/ai-integration.md) - Using WHOOP recovery data in AI analysis.

### Intervals.icu

- [**Profile Data**](./03-integrations/intervals/profile-data.md) - Fetching athlete profile and fitness settings.

### Yazio

- [**Overview**](./03-integrations/yazio/overview.md) - Nutrition data synchronization.

## 📘 04. Guides

Instructional documents for developers.

- [**Implementation Guide**](./04-guides/implementation-guide.md) - Step-by-step build instructions.
- [**Deployment Guide**](./04-guides/deployment.md) - Environment setup and deployment checklist.
- [**Issue Management**](./04-guides/issue-management.md) - Guidelines for creating and managing GitHub issues.
- [**TSS Calculation**](./04-guides/tss-calculation.md) - How TSS is calculated from stream data.
- [**Score Explanations**](./04-guides/score-explanations.md) - Guide to implementing score explanation features.

## 📦 05. Archive

Historical documents, incident reports, and past status updates.

### Bug Fix Reports

- [**Account Query Error**](./05-archive/bug-fixes/account-query-error.md)
- [**Chat Tool Calling Fixes**](./05-archive/bug-fixes/chat-tool-calling-fixes.md)
- [**Strava Training Load Fix**](./05-archive/bug-fixes/strava-training-load-fix.md)
- [**Yazio AI Food Fix**](./05-archive/bug-fixes/yazio-ai-food-fix.md)
- [**Yazio Sync Cleanup**](./05-archive/bug-fixes/yazio-sync-cleanup.md)

### Status & Proposals

- [**Implementation Status**](./05-archive/status/implementation-status.md)
- [**Training Stress Status**](./05-archive/status/training-stress-status.md)
- [**Design Audit**](./05-archive/proposals/design-audit.md)
- [**Recommended Workout Fields**](./05-archive/proposals/recommended-workout-fields.md)
- [**Chat Training Plan Integration**](./05-archive/proposals/chat-training-plan-summary.md)

## 🔮 06. Plans

Future feature specifications and improvement plans.

- [**Advanced Analytics**](./06-plans/advanced-analytics.md) - Specifications for W' balance, EF, and power profiling.
- [**Coaching Feature**](./06-plans/coaching-feature.md) - Plans for the AI coaching system.
- [**Workout Timeline Enhancements**](./06-plans/enhance-workout-timeline.md) - Improvements for the activity feed.
- [**HR Intensity Distribution Fix**](./06-plans/fix-hr-intensity-distribution.md) - Addressing heart rate zone calculation issues.
- [**Frontend Refactor**](./06-plans/frontend-refactor.md) - Plans for cleaning up and optimizing the UI codebase.
- [**Mobile Review Report**](./06-plans/mobile_review_report.md) - Assessment of the mobile user experience.
- [**Performance Page Upgrade**](./06-plans/performance-page-upgrade.md) - Next steps for the performance dashboard.
- [**Strava Compliance**](./06-plans/strava_compliance_response.md) - Ensuring adherence to Strava API policies.
- [**Withings Integration**](./06-plans/withings-enhancements.md) - Plans for adding smart scale data.
