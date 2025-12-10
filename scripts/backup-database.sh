#!/bin/bash

# PostgreSQL Docker Database Backup Script
# Reads database connection from .env file and creates timestamped backups

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env"
BACKUP_DIR="$PROJECT_ROOT/backups"
CONTAINER_NAME="${POSTGRES_CONTAINER:-watts-postgres}"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Print usage
usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -c, --container NAME    Docker container name (default: watts-postgres)"
    echo "  -o, --output DIR        Backup output directory (default: ./backups)"
    echo "  -f, --format FORMAT     Backup format: plain|custom|directory|tar (default: custom)"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Environment variables:"
    echo "  POSTGRES_CONTAINER      Override default container name"
    exit 1
}

# Parse command line arguments
BACKUP_FORMAT="custom"
while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--container)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        -o|--output)
            BACKUP_DIR="$2"
            shift 2
            ;;
        -f|--format)
            BACKUP_FORMAT="$2"
            shift 2
            ;;
        -h|--help)
            usage
            ;;
        *)
            echo -e "${RED}Error: Unknown option $1${NC}"
            usage
            ;;
    esac
done

# Check if .env file exists
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error: .env file not found at $ENV_FILE${NC}"
    exit 1
fi

# Read DATABASE_URL from .env file
DATABASE_URL=$(grep "^DATABASE_URL=" "$ENV_FILE" | cut -d '=' -f2- | tr -d '"')

if [ -z "$DATABASE_URL" ]; then
    echo -e "${RED}Error: DATABASE_URL not found in .env file${NC}"
    exit 1
fi

# Parse DATABASE_URL (postgresql://user:password@host:port/dbname?params)
# Extract components using parameter expansion and sed
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

# Validate parsed values
if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
    echo -e "${RED}Error: Failed to parse DATABASE_URL${NC}"
    echo "DATABASE_URL: $DATABASE_URL"
    exit 1
fi

# Check if Docker container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}Error: Docker container '$CONTAINER_NAME' is not running${NC}"
    echo "Available containers:"
    docker ps --format "  - {{.Names}}"
    exit 1
fi

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Set backup file extension based on format
case $BACKUP_FORMAT in
    plain)
        BACKUP_EXT="sql"
        FORMAT_FLAG="-Fp"
        ;;
    custom)
        BACKUP_EXT="dump"
        FORMAT_FLAG="-Fc"
        ;;
    directory)
        BACKUP_EXT="dir"
        FORMAT_FLAG="-Fd"
        ;;
    tar)
        BACKUP_EXT="tar"
        FORMAT_FLAG="-Ft"
        ;;
    *)
        echo -e "${RED}Error: Invalid format '$BACKUP_FORMAT'${NC}"
        echo "Valid formats: plain, custom, directory, tar"
        exit 1
        ;;
esac

BACKUP_FILE="$BACKUP_DIR/${DB_NAME}_${TIMESTAMP}.${BACKUP_EXT}"

echo -e "${GREEN}=== PostgreSQL Database Backup ===${NC}"
echo "Container:    $CONTAINER_NAME"
echo "Database:     $DB_NAME"
echo "User:         $DB_USER"
echo "Format:       $BACKUP_FORMAT"
echo "Backup file:  $BACKUP_FILE"
echo ""

# Perform backup using docker exec
echo -e "${YELLOW}Starting backup...${NC}"

if [ "$BACKUP_FORMAT" = "directory" ]; then
    # For directory format, create a temp directory in container and copy out
    TEMP_DIR="/tmp/backup_${TIMESTAMP}"
    docker exec "$CONTAINER_NAME" mkdir -p "$TEMP_DIR"
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        pg_dump -U "$DB_USER" -h localhost "$FORMAT_FLAG" -f "$TEMP_DIR" "$DB_NAME"

    # Copy directory from container to host
    docker cp "$CONTAINER_NAME:$TEMP_DIR" "$BACKUP_FILE"
    docker exec "$CONTAINER_NAME" rm -rf "$TEMP_DIR"
else
    # For other formats, stream the backup
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        pg_dump -U "$DB_USER" -h localhost "$FORMAT_FLAG" "$DB_NAME" > "$BACKUP_FILE"
fi

# Check if backup was successful
if [ $? -eq 0 ] && [ -s "$BACKUP_FILE" ]; then
    BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
    echo -e "${GREEN}✓ Backup completed successfully${NC}"
    echo "File: $BACKUP_FILE"
    echo "Size: $BACKUP_SIZE"

    # Keep only the last 7 backups
    echo ""
    echo "Cleaning up old backups (keeping last 7)..."
    ls -t "$BACKUP_DIR/${DB_NAME}"*.{dump,sql,tar,dir} 2>/dev/null | tail -n +8 | xargs -r rm -rf

    echo -e "${GREEN}✓ Cleanup completed${NC}"

    # List recent backups
    echo ""
    echo "Recent backups:"
    ls -lht "$BACKUP_DIR" | head -n 8
else
    echo -e "${RED}✗ Backup failed${NC}"
    rm -f "$BACKUP_FILE"
    exit 1
fi
