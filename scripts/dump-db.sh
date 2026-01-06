#!/bin/bash

# Database Dump Script
# Usage: ./scripts/dump-db.sh [DATABASE_URL_VAR_NAME]
# Default: DATABASE_URL

set -e

VAR_NAME=${1:-DATABASE_URL}
BACKUP_DIR="backups/db"

# Load environment variables from .env
if [ -f ".env" ]; then
    set -a
    source .env
    set +a
fi

# Get the connection string from the variable name
DB_URL="${!VAR_NAME}"

# Strip quotes if they exist
DB_URL=$(echo "$DB_URL" | sed 's/^"//; s/"$//')

# Strip query parameters for pg_dump
DB_URL_CLEAN=$(echo "$DB_URL" | cut -d '?' -f1)

if [ -z "$DB_URL_CLEAN" ]; then
    echo "❌ Error: $VAR_NAME is not set in .env"
    exit 1
fi

# Create backup directory
mkdir -p "$BACKUP_DIR"

# Generate filename
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
if [ "$VAR_NAME" == "DATABASE_URL_PROD" ]; then
    LABEL="prod"
else
    LABEL="local"
fi
FILENAME="$BACKUP_DIR/${LABEL}_$TIMESTAMP.dump"

echo "📂 Dumping database to: $FILENAME"
# echo "DEBUG: URL is $DB_URL_CLEAN"

# Run pg_dump
if [ "$LABEL" == "local" ] && command -v docker >/dev/null && docker ps | grep -q "watts-postgres"; then
    echo "🐳 Using Docker container (watts-postgres) for dump..."
    # Extract components from URL
    # Format: postgresql://user:pass@host:port/dbname
    DB_NAME=$(echo "$DB_URL_CLEAN" | rev | cut -d '/' -f1 | rev)
    DB_USER=$(echo "$DB_URL_CLEAN" | sed -n 's/.*:\/\/\([^:]*\):.*/\1/p')
    DB_PASS=$(echo "$DB_URL_CLEAN" | sed -n 's/.*:\/\/[^:]*:\([^@]*\)@.*/\1/p')

    if docker exec -e PGPASSWORD="$DB_PASS" watts-postgres pg_dump -U "$DB_USER" -Fc "$DB_NAME" > "$FILENAME"; then
        echo "✅ Dump successful via Docker"
    else
        echo "❌ Docker dump failed"
        rm -f "$FILENAME"
        exit 1
    fi
else
    echo "🐘 Using local pg_dump..."
    if pg_dump "$DB_URL_CLEAN" -Fc > "$FILENAME"; then
        echo "✅ Dump successful via local pg_dump"
    else
        echo "❌ Local dump failed"
        rm -f "$FILENAME"
        exit 1
    fi
fi

if [ -s "$FILENAME" ]; then
    SIZE=$(du -h "$FILENAME" | cut -f1)
    echo "💾 File: $FILENAME ($SIZE)"
else
    echo "❌ Dump file is empty"
    rm -f "$FILENAME"
    exit 1
fi