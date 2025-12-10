#!/bin/bash

# PostgreSQL Docker Database Restore Script
# Restores database from backup files created by backup-database.sh

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

# Print usage
usage() {
    echo "Usage: $0 [OPTIONS] <backup_file>"
    echo ""
    echo "Options:"
    echo "  -c, --container NAME    Docker container name (default: watts-postgres)"
    echo "  -d, --database NAME     Target database name (default: from .env)"
    echo "  --drop-existing         Drop and recreate database before restore"
    echo "  -h, --help             Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 backups/watts_20231210_153045.dump"
    echo "  $0 --drop-existing backups/watts_20231210_153045.dump"
    echo "  $0 -c my-postgres-container backups/watts_20231210_153045.sql"
    exit 1
}

# Parse command line arguments
DROP_EXISTING=false
TARGET_DB=""
BACKUP_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -c|--container)
            CONTAINER_NAME="$2"
            shift 2
            ;;
        -d|--database)
            TARGET_DB="$2"
            shift 2
            ;;
        --drop-existing)
            DROP_EXISTING=true
            shift
            ;;
        -h|--help)
            usage
            ;;
        -*)
            echo -e "${RED}Error: Unknown option $1${NC}"
            usage
            ;;
        *)
            BACKUP_FILE="$1"
            shift
            ;;
    esac
done

# Check if backup file was provided
if [ -z "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not specified${NC}"
    echo ""
    echo "Available backups:"
    ls -lht "$BACKUP_DIR" 2>/dev/null || echo "  No backups found in $BACKUP_DIR"
    echo ""
    usage
fi

# Check if backup file exists
if [ ! -e "$BACKUP_FILE" ]; then
    echo -e "${RED}Error: Backup file not found: $BACKUP_FILE${NC}"
    exit 1
fi

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

# Parse DATABASE_URL
DB_USER=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
DB_PASSWORD=$(echo "$DATABASE_URL" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')
DB_HOST=$(echo "$DATABASE_URL" | sed -n 's/.*@\([^:]*\):.*/\1/p')
DB_PORT=$(echo "$DATABASE_URL" | sed -n 's/.*:\([0-9]*\)\/.*/\1/p')
DB_NAME=$(echo "$DATABASE_URL" | sed -n 's/.*\/\([^?]*\).*/\1/p')

# Use target database if specified, otherwise use DB_NAME from .env
if [ -z "$TARGET_DB" ]; then
    TARGET_DB="$DB_NAME"
fi

# Validate parsed values
if [ -z "$DB_USER" ] || [ -z "$TARGET_DB" ]; then
    echo -e "${RED}Error: Failed to parse DATABASE_URL${NC}"
    exit 1
fi

# Check if Docker container is running
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo -e "${RED}Error: Docker container '$CONTAINER_NAME' is not running${NC}"
    echo "Available containers:"
    docker ps --format "  - {{.Names}}"
    exit 1
fi

# Detect backup format from file extension
BACKUP_EXT="${BACKUP_FILE##*.}"
case $BACKUP_EXT in
    sql)
        RESTORE_CMD="psql"
        FORMAT_DESC="Plain SQL"
        ;;
    dump)
        RESTORE_CMD="pg_restore"
        FORMAT_FLAG="-Fc"
        FORMAT_DESC="Custom"
        ;;
    tar)
        RESTORE_CMD="pg_restore"
        FORMAT_FLAG="-Ft"
        FORMAT_DESC="Tar"
        ;;
    dir)
        RESTORE_CMD="pg_restore"
        FORMAT_FLAG="-Fd"
        FORMAT_DESC="Directory"
        ;;
    *)
        echo -e "${YELLOW}Warning: Unknown backup format '.$BACKUP_EXT', attempting to restore as custom format${NC}"
        RESTORE_CMD="pg_restore"
        FORMAT_FLAG="-Fc"
        FORMAT_DESC="Custom (assumed)"
        ;;
esac

echo -e "${GREEN}=== PostgreSQL Database Restore ===${NC}"
echo "Container:    $CONTAINER_NAME"
echo "Database:     $TARGET_DB"
echo "User:         $DB_USER"
echo "Backup file:  $BACKUP_FILE"
echo "Format:       $FORMAT_DESC"
echo ""

# Confirm before proceeding
if [ "$DROP_EXISTING" = true ]; then
    echo -e "${YELLOW}WARNING: This will DROP and RECREATE the database '$TARGET_DB'${NC}"
else
    echo -e "${YELLOW}WARNING: This will restore data into the existing database '$TARGET_DB'${NC}"
fi

read -p "Are you sure you want to continue? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Restore cancelled"
    exit 0
fi

echo ""
echo -e "${YELLOW}Starting restore...${NC}"

# Drop and recreate database if requested
if [ "$DROP_EXISTING" = true ]; then
    echo "Dropping database '$TARGET_DB'..."
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        psql -U "$DB_USER" -h localhost -d postgres -c "DROP DATABASE IF EXISTS $TARGET_DB;" 2>&1

    echo "Creating database '$TARGET_DB'..."
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        psql -U "$DB_USER" -h localhost -d postgres -c "CREATE DATABASE $TARGET_DB;" 2>&1
fi

# Perform restore
if [ "$RESTORE_CMD" = "psql" ]; then
    # For plain SQL files
    cat "$BACKUP_FILE" | docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        psql -U "$DB_USER" -h localhost -d "$TARGET_DB"
elif [ "$BACKUP_EXT" = "dir" ]; then
    # For directory format, copy to container first
    TEMP_DIR="/tmp/restore_$(date +%s)"
    docker cp "$BACKUP_FILE" "$CONTAINER_NAME:$TEMP_DIR"
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        pg_restore -U "$DB_USER" -h localhost "$FORMAT_FLAG" -d "$TARGET_DB" --clean --if-exists "$TEMP_DIR"
    docker exec "$CONTAINER_NAME" rm -rf "$TEMP_DIR"
else
    # For custom and tar formats
    cat "$BACKUP_FILE" | docker exec -i -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        pg_restore -U "$DB_USER" -h localhost "$FORMAT_FLAG" -d "$TARGET_DB" --clean --if-exists
fi

# Check if restore was successful
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Restore completed successfully${NC}"

    # Show database size
    echo ""
    echo "Database information:"
    docker exec -e PGPASSWORD="$DB_PASSWORD" "$CONTAINER_NAME" \
        psql -U "$DB_USER" -h localhost -d "$TARGET_DB" -c "\l+ $TARGET_DB" | grep "$TARGET_DB"
else
    echo -e "${RED}✗ Restore failed${NC}"
    exit 1
fi
