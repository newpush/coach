---
name: report-bug
description: Automatically generate and post detailed bug reports to GitHub Issues for the active project repository. This skill should be used when documenting bugs discovered during development, creating professionally formatted GitHub Issues with reproduction steps, technical insights, and recommended E2E tests.
---

# Report Bug Skill

Automatically generate comprehensive, professional bug reports and post them directly to the GitHub repository associated with the current working directory.

## Purpose

This skill automates the creation of detailed bug reports that include:
- Clear, concise issue titles
- Step-by-step reproduction instructions
- Technical analysis and root cause insights
- Recommended E2E test specifications
- Professional formatting suitable for team collaboration

## When to Use This Skill

Use this skill when:
- Documenting a bug discovered during development or testing
- Creating a GitHub Issue to track a problem
- Generating a professional bug report with reproduction steps
- Providing E2E test recommendations for verification
- Ensuring consistent bug reporting standards across the team

## Workflow

### 1. Repository Detection

Detect the Git repository in the current working directory:
- Extract the repository owner and name from the remote origin URL
- Validate that the repository is a GitHub repository
- Handle both HTTPS and SSH remote URL formats

### 2. Bug Report Generation

Create a comprehensive bug report following this structure:

**Issue Title**: Clear, concise summary (max 80 characters)

**Issue Body**:

```markdown
## Summary
[Clear description of the issue including what went wrong and expected behavior]

## Reproduction Steps
1. [First step to reproduce]
2. [Second step to reproduce]
3. [Third step to reproduce]
...

## Environment
- **OS**: [Operating system and version]
- **Browser/Runtime**: [Browser or Node.js version]
- **Version**: [Application or package version]

## Technical Details
- **Component**: [Affected component/module/file]
- **Severity**: [Critical/High/Medium/Low]
- **Affected Users**: [Scope of impact]

## Findings and Insights

### Root Cause Analysis
[Detailed technical analysis from the debugging session, explaining why the bug occurs]

### Code Locations
[Specific files, functions, and line numbers where the issue manifests]

### Potential Impact
[Description of how this bug affects users and system behavior]

### Dependencies Affected
[Other components or systems that may be impacted]

## Recommended E2E Test

```typescript
describe('Bug Fix Verification', () => {
  it('should [expected behavior after fix]', async () => {
    // Arrange: Set up test conditions

    // Act: Execute the action that previously triggered the bug

    // Assert: Verify the bug is fixed
  });
});
```

## Additional Context

### Error Messages
```
[Relevant error messages from logs or console]
```

### Stack Trace
```
[Stack trace if available]
```

### Related Issues
[Links to related GitHub issues if applicable]

### Screenshots/Logs
[Additional context like screenshots or log snippets]
```

### 3. GitHub Issue Creation

Use the `scripts/create_issue.sh` script to create the GitHub issue:

```bash
scripts/create_issue.sh "<title>" "<body>" "<labels>"
```

The script:
- Authenticates using GitHub CLI (`gh`)
- Validates repository permissions
- Creates the issue with specified labels
- Returns the issue number and URL

### 4. Result Presentation

Display the created issue information:
- Issue number
- Direct link to the GitHub Issue
- Confirmation of successful creation
- Applied labels

## Authentication Requirements

This skill requires GitHub CLI (`gh`) for authentication:

1. **Installation**: Ensure `gh` is installed on the system
   - macOS: `brew install gh`
   - Other platforms: https://cli.github.com

2. **Authentication**: User must be authenticated
   - Run: `gh auth login`
   - Follow the authentication flow
   - Ensure `repo` scope is included

3. **Permissions**: User must have write access to the target repository

## Using the Scripts

### create_issue.sh

The main script for creating GitHub issues:

```bash
scripts/create_issue.sh "<issue-title>" "<issue-body>" "bug,priority:high"
```

**Parameters:**
- `title`: Issue title (required, max 80 characters recommended)
- `body`: Full issue body in markdown format (required)
- `labels`: Comma-separated list of labels (optional, defaults to "bug")

**Features:**
- Validates `gh` CLI installation and authentication
- Detects repository information automatically
- Handles both SSH and HTTPS remote URLs
- Creates temporary files for issue body
- Returns issue URL and number on success
- Provides colored output for better visibility

**Error Handling:**
- Checks for `gh` CLI installation
- Verifies GitHub authentication status
- Confirms Git repository presence
- Validates GitHub remote URL

## Using the Assets

### issue_template.md

Template for generating consistent bug report bodies. Use this template to structure bug reports before passing them to the script.

The template includes placeholders for:
- `{{SUMMARY}}`: Brief description of the bug
- `{{REPRODUCTION_STEPS}}`: Numbered steps to reproduce
- `{{OS}}`, `{{RUNTIME}}`, `{{VERSION}}`: Environment details
- `{{COMPONENT}}`, `{{SEVERITY}}`, `{{AFFECTED_USERS}}`: Technical metadata
- `{{ROOT_CAUSE}}`: Root cause analysis
- `{{CODE_LOCATIONS}}`: Affected files and functions
- `{{IMPACT}}`: Potential impact description
- `{{DEPENDENCIES}}`: Affected dependencies
- `{{TEST_LANGUAGE}}`, `{{TEST_SUITE_NAME}}`, `{{TEST_DESCRIPTION}}`, `{{TEST_IMPLEMENTATION}}`: Test specification
- `{{ERROR_MESSAGES}}`, `{{STACK_TRACE}}`: Error details
- `{{RELATED_ISSUES}}`, `{{ADDITIONAL_CONTEXT}}`: Extra context

To use the template:
1. Read the template from `assets/issue_template.md`
2. Replace placeholders with actual values
3. Pass the formatted body to `scripts/create_issue.sh`

## Best Practices

1. **Provide Context**: Include relevant session information, code snippets, or error logs in the bug report
2. **Be Specific**: Use precise language for reproduction steps that anyone can follow
3. **Test Scripts**: Always include E2E test recommendations to verify the fix
4. **Severity Assessment**: Accurately assess bug severity based on impact:
   - **Critical**: System down, data loss, security breach
   - **High**: Major functionality broken, affects many users
   - **Medium**: Feature partially broken, workaround available
   - **Low**: Minor issue, cosmetic problem, edge case
5. **Labels**: Apply appropriate GitHub labels (bug, priority:high, component:auth, etc.)
6. **Screenshots**: Reference externally hosted screenshots if visual context is needed

## Example Usage

**Simple invocation:**
```
Use the report-bug skill to create an issue for the login button not responding to clicks
```

**Detailed invocation:**
```
Use report-bug to document the memory leak in the UserProfile component.
Include the findings from today's debugging session about the event listener not being cleaned up.
Recommend a test that validates proper cleanup on component unmount.
```

**With specific severity:**
```
Use report-bug to create a critical issue for the payment processing failure.
Include the error logs and stack trace from the production incident.
```

## Error Handling and Troubleshooting

### Common Issues

**"gh: command not found"**
- Install GitHub CLI: `brew install gh` (macOS) or visit https://cli.github.com
- Verify installation: `gh --version`

**"authentication required"**
- Run: `gh auth login`
- Follow the authentication flow
- Ensure the `repo` scope is granted

**"permission denied"**
- Verify write access to the repository
- Check GitHub authentication scope includes `repo`
- Confirm repository ownership or collaborator status

**"not a git repository"**
- Ensure execution from within a Git repository directory
- Run `git remote -v` to verify remote is configured
- Check for `.git` directory in current or parent directories

**Issue creation fails**
- Check GitHub API rate limits: `gh api rate_limit`
- Verify network connectivity to GitHub
- Ensure issue title is not empty and body is valid markdown
- Check repository settings allow issue creation

## Output Format

After successful creation, the skill returns:

```
✅ Bug report created successfully!

Issue #123: Login button unresponsive on mobile devices
🔗 https://github.com/owner/repo/issues/123

The issue has been posted with:
- Reproduction steps (4 steps)
- Technical analysis
- Recommended E2E test
- Labels: bug, priority:high
```

## Technical Notes

- Uses `gh issue create` command for GitHub API interaction
- Respects repository's issue templates if configured
- Automatically detects project-specific labels available in the repository
- Handles rate limiting gracefully with clear error messages
- Supports both public and private repositories
- Maximum issue body size: 65,536 characters (GitHub limitation)
- Creates temporary files for issue body to handle special characters

## Integration

This skill integrates with:
- **Git**: Repository detection and remote URL parsing
- **GitHub CLI**: Issue creation and authentication
- **Claude Code**: Session context and findings extraction
- **Markdown**: Professional formatting and code blocks
- **Bash**: Script execution for automation
