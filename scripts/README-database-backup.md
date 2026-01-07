# Database Backup & Restore Scripts

Scripts for backing up and restoring the PostgreSQL database running in Docker.

## Prerequisites

- Docker container running PostgreSQL (default: `watts-postgres`)
- `.env` file with `DATABASE_URL` in the project root
- Bash shell

## Backup Script

### Basic Usage

```bash
# Create a backup with default settings
./scripts/backup-database.sh

# Specify a different container
./scripts/backup-database.sh --container my-postgres-container

# Use plain SQL format
./scripts/backup-database.sh --format plain

# Custom output directory
./scripts/backup-database.sh --output /path/to/backups
```

### Options

- `-c, --container NAME` - Docker container name (default: `watts-postgres`)
- `-o, --output DIR` - Backup output directory (default: `./backups`)
- `-f, --format FORMAT` - Backup format: `plain`, `custom`, `directory`, `tar` (default: `custom`)
- `-h, --help` - Show help message

### Environment Variables

- `POSTGRES_CONTAINER` - Override default container name

### Backup Formats

- **custom** (`.dump`) - Compressed custom format, best for most use cases
- **plain** (`.sql`) - Plain SQL text, human-readable
- **directory** (`.dir`) - Directory of files, allows parallel restore
- **tar** (`.tar`) - Tar archive

### Features

- Reads database credentials from `.env` automatically
- Creates timestamped backups
- Automatically keeps only the last 7 backups
- Validates container is running before backup
- Shows backup size and location after completion

### Examples

```bash
# Standard backup (custom format)
./scripts/backup-database.sh

# Plain SQL backup for version control or manual inspection
./scripts/backup-database.sh --format plain

# Backup to a specific location
./scripts/backup-database.sh --output ~/my-backups
```

## Restore Script

### Basic Usage

```bash
# Restore from a backup file
./scripts/restore-database.sh backups/watts_20231210_153045.dump

# Drop and recreate database before restore
./scripts/restore-database.sh --drop-existing backups/watts_20231210_153045.dump

# Restore to a different database
./scripts/restore-database.sh --database watts_test backups/watts_20231210_153045.dump
```

### Options

- `-c, --container NAME` - Docker container name (default: `watts-postgres`)
- `-d, --database NAME` - Target database name (default: from `.env`)
- `--drop-existing` - Drop and recreate database before restore
- `-h, --help` - Show help message

### Features

- Automatically detects backup format from file extension
- Reads database credentials from `.env`
- Prompts for confirmation before restore
- Supports all backup formats (custom, plain, directory, tar)
- Shows database size after restore

### Examples

```bash
# List available backups
ls -lht backups/

# Restore the latest backup
./scripts/restore-database.sh backups/watts_20231210_153045.dump

# Fresh restore (drop and recreate)
./scripts/restore-database.sh --drop-existing backups/watts_20231210_153045.dump

# Restore to a test database
./scripts/restore-database.sh --database watts_test backups/watts_20231210_153045.dump
```

## Automated Backups

### Using Cron

Add to your crontab (`crontab -e`):

```bash
# Daily backup at 2 AM
0 2 * * * cd /Users/hdkiller/Develop/coach-wattz && ./scripts/backup-database.sh

# Backup every 6 hours
0 */6 * * * cd /Users/hdkiller/Develop/coach-wattz && ./scripts/backup-database.sh
```

### Using launchd (macOS)

Create a plist file at `~/Library/LaunchAgents/com.wattz.dbbackup.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.wattz.dbbackup</string>
    <key>ProgramArguments</key>
    <array>
        <string>/Users/hdkiller/Develop/coach-wattz/scripts/backup-database.sh</string>
    </array>
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>2</integer>
        <key>Minute</key>
        <integer>0</integer>
    </dict>
    <key>StandardOutPath</key>
    <string>/tmp/wattz-backup.log</string>
    <key>StandardErrorPath</key>
    <string>/tmp/wattz-backup-error.log</string>
</dict>
</plist>
```

Load the job:

```bash
launchctl load ~/Library/LaunchAgents/com.wattz.dbbackup.plist
```

## Troubleshooting

### Container not found

If you get "Docker container not running" error:

```bash
# List running containers
docker ps

# Update the container name
./scripts/backup-database.sh --container <actual-container-name>
```

### Permission denied

Make sure scripts are executable:

```bash
chmod +x scripts/backup-database.sh
chmod +x scripts/restore-database.sh
```

### DATABASE_URL not found

Ensure your `.env` file contains:

```
DATABASE_URL="postgresql://user:password@localhost:5439/dbname?connection_limit=20"
```

### Backup directory

Backups are stored in `./backups` by default. This directory is automatically created if it doesn't exist.

## Backup Location

Default: `./backups/` (relative to project root)

Backup files follow the naming pattern: `{database}_{timestamp}.{extension}`

Example: `watts_20231210_153045.dump`

## Security Notes

- The `.env` file contains sensitive credentials and should never be committed to version control
- Backup files may contain sensitive data and should be stored securely
- Consider encrypting backups for long-term storage
- Add `backups/` to `.gitignore` to prevent accidental commits
