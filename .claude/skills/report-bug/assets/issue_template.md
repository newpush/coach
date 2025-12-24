# Bug Report Template

## Summary
{{SUMMARY}}

## Reproduction Steps
{{REPRODUCTION_STEPS}}

## Environment
- **OS**: {{OS}}
- **Browser/Runtime**: {{RUNTIME}}
- **Version**: {{VERSION}}

## Technical Details
- **Component**: {{COMPONENT}}
- **Severity**: {{SEVERITY}}
- **Affected Users**: {{AFFECTED_USERS}}

## Findings and Insights

### Root Cause Analysis
{{ROOT_CAUSE}}

### Code Locations
{{CODE_LOCATIONS}}

### Potential Impact
{{IMPACT}}

### Dependencies Affected
{{DEPENDENCIES}}

## Recommended E2E Test

```{{TEST_LANGUAGE}}
describe('{{TEST_SUITE_NAME}}', () => {
  it('{{TEST_DESCRIPTION}}', async () => {
    {{TEST_IMPLEMENTATION}}
  });
});
```

## Additional Context

### Error Messages
```
{{ERROR_MESSAGES}}
```

### Stack Trace
```
{{STACK_TRACE}}
```

### Related Issues
{{RELATED_ISSUES}}

### Screenshots/Logs
{{ADDITIONAL_CONTEXT}}

---

**Reporter**: @{{GITHUB_USERNAME}}
**Date**: {{TIMESTAMP}}
**Session**: {{SESSION_ID}}
