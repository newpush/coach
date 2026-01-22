# Issue Management Guidelines

This document outlines the standards and procedures for creating and managing GitHub issues in the Coach Watts project. Consistent issue reporting ensures efficient tracking, prioritization, and resolution of bugs and features.

## 1. Issue Types

We categorize issues into the following primary types:

- **Bug Report**: Something isn't working as expected.
- **Feature Request**: A suggestion for a new feature or improvement.
- **Maintenance**: Refactoring, technical debt, dependencies, or documentation updates.

## 2. Issue Templates

When creating an issue, please adhere to the following templates.

### 🐛 Bug Report Template

**Title**: `Concise description of the bug`

- _Example_: `Recent activities widget is not clickable`

**Body**:

```markdown
### 📝 Description

A clear and concise description of what the bug is.

### 👣 Steps to Reproduce

1. Go to '...'
2. Click on '...'
3. Scroll down to '...'
4. See error

### 😯 Expected Behavior

A clear and concise description of what you expected to happen.

### 🐛 Actual Behavior

A clear and concise description of what actually happened.

### 🖼️ Screenshots / Logs

If applicable, add screenshots or copy-paste error logs to help explain your problem.

### 💻 Environment

- **Browser/Device**: [e.g. Chrome 120, iPhone 14]
- **OS**: [e.g. macOS Sonoma, iOS 17]
- **User ID (if known)**:
```

### ✨ Feature Request Template

**Title**: `Concise description of the feature`

- _Example_: `Add "Training Availability" section`

**Body**:

```markdown
### 💡 Summary

A clear and concise description of the proposed feature.

### 🤷 Motivation / Use Case

Why is this feature needed? What problem does it solve for the user?

### 📋 Detailed Requirements

- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Requirement 3

### ✅ Acceptance Criteria

- The user can...
- The system should...
```

### 🛠️ Maintenance / Tech Debt

**Title**: `Concise description of the task`

- _Example_: `Update API documentation for v2 endpoints`

**Body**:

```markdown
### 🎯 Goal

What needs to be done?

### ❓ Why

Why is this maintenance necessary?

### 🔄 Tasks

- [ ] Task 1
- [ ] Task 2
```

## 3. Labeling Strategy

We use a specific set of labels to categorize issues. Please apply at least one label from each category where applicable.

### Type Labels

- `bug`: Something isn't working.
- `enhancement`: New feature or request.
- `documentation`: Improvements or additions to documentation.
- `maintenance`: Technical debt, refactoring, dependencies.
- `question`: Further information is requested.

### Priority Labels

- `priority: critical`: Blocker, needs immediate attention.
- `priority: high`: Important functionality is broken or missing.
- `priority: medium`: Standard priority.
- `priority: low`: Nice to have, minor issue.

### Status Labels

- `status: needs-info`: Waiting for user or more details.
- `status: in-progress`: Currently being worked on.
- `status: blocked`: Waiting on something else.
- `status: review`: Pull request submitted.

### Area Labels (Technical)

- `ui/ux`: Visual design, Vue components, and frontend logic.
- `backend`: API endpoints, server-side logic, and authentication.
- `data`: Database schema, ingestion pipelines, and synchronization.
- `infra`: Docker, CI/CD, CLI tools, and environment configuration.
- `ai`: Gemini/LLM prompts, agents, and AI logic.

### Feature Labels (Functional)

- `dashboard`: Main landing page and widgets.
- `activities`: Activities list, calendar, and summary.
- `workouts`: Workout execution, details, and intervals.
- `planning`: Training blocks, weekly plans, and scheduling.
- `wellness`: Sleep, HRV, weight, and readiness metrics.
- `integrations`: External services (Strava, Intervals.icu, etc.).

## 4. Best Practices

1.  **Search First**: Before creating an issue, search existing issues to avoid duplicates.
2.  **Be Specific**: Use clear, unambiguous language.
3.  **One Issue per Topic**: Do not combine multiple unrelated bugs or features into a single issue.
4.  **Keep it Updated**: If you find new information, update the issue comments.
5.  **Reference Code**: If you know where the issue might be in the codebase, link to the file or line number.

---

**Note to AI Agents**: When asked to create issues, always follow these templates and labeling conventions. Do not prefix titles with the area/component, as labels handle categorization.
