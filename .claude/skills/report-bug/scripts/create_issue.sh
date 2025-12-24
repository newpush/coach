#!/bin/bash

# Bug Report GitHub Issue Creator
# This script handles the technical aspects of creating a GitHub issue
# Used by the report-bug Claude Agent Skill

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_error() {
    echo -e "${RED}❌ Error: $1${NC}" >&2
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

# Check if gh CLI is installed
check_gh_installed() {
    if ! command -v gh &> /dev/null; then
        print_error "GitHub CLI (gh) is not installed"
        print_info "Install it with: brew install gh"
        print_info "Or visit: https://cli.github.com"
        exit 1
    fi
}

# Check if gh is authenticated
check_gh_auth() {
    if ! gh auth status &> /dev/null; then
        print_error "Not authenticated with GitHub CLI"
        print_info "Run: gh auth login"
        exit 1
    fi
}

# Get repository information
get_repo_info() {
    if ! git rev-parse --git-dir &> /dev/null; then
        print_error "Not in a Git repository"
        exit 1
    fi

    # Get remote URL
    local remote_url=$(git config --get remote.origin.url 2>/dev/null || echo "")

    if [ -z "$remote_url" ]; then
        print_error "No remote origin configured"
        exit 1
    fi

    # Extract owner/repo from URL
    # Handles both HTTPS and SSH URLs
    if [[ $remote_url == git@github.com:* ]]; then
        # SSH format: git@github.com:owner/repo.git
        REPO_FULL=$(echo "$remote_url" | sed 's/git@github.com://; s/.git$//')
    elif [[ $remote_url == https://github.com/* ]]; then
        # HTTPS format: https://github.com/owner/repo.git
        REPO_FULL=$(echo "$remote_url" | sed 's|https://github.com/||; s/.git$//')
    else
        print_error "Not a GitHub repository"
        exit 1
    fi

    echo "$REPO_FULL"
}

# Create the GitHub issue
create_issue() {
    local title="$1"
    local body="$2"
    local labels="${3:-bug}"
    local repo="$4"

    print_info "Creating issue in $repo..."

    # Create temporary file for issue body
    local temp_file=$(mktemp)
    echo "$body" > "$temp_file"

    # Create the issue
    local issue_url=$(gh issue create \
        --repo "$repo" \
        --title "$title" \
        --body-file "$temp_file" \
        --label "$labels" 2>&1)

    # Clean up temp file
    rm -f "$temp_file"

    if [[ $issue_url == https://github.com/* ]]; then
        print_success "Bug report created successfully!"
        echo ""
        echo "$issue_url"

        # Extract issue number
        local issue_number=$(echo "$issue_url" | grep -oE '[0-9]+$')
        echo ""
        print_success "Issue #$issue_number created"
    else
        print_error "Failed to create issue"
        echo "$issue_url"
        exit 1
    fi
}

# Main execution
main() {
    print_info "Bug Report Issue Creator"
    echo ""

    # Perform checks
    check_gh_installed
    check_gh_auth

    # Get repository info
    REPO=$(get_repo_info)
    print_success "Repository detected: $REPO"

    # Arguments
    local title="${1:-}"
    local body="${2:-}"
    local labels="${3:-bug}"

    if [ -z "$title" ] || [ -z "$body" ]; then
        print_error "Usage: $0 <title> <body> [labels]"
        exit 1
    fi

    # Create the issue
    create_issue "$title" "$body" "$labels" "$REPO"
}

# Run main function if script is executed directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
