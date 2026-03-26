#!/bin/bash

# logging.sh - Logging utilities for start/stop scripts

# Prevent multiple sourcing
if [[ -n "${_LOGGING_SH_LOADED:-}" ]]; then
    return 0
fi
readonly _LOGGING_SH_LOADED=1

# Source common functions
if [[ -z "${_COMMON_SH_LOADED:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "$SCRIPT_DIR/common.sh"
fi

# Log file paths
readonly APP_LOG="${LOG_DIR}/app.log"
readonly ERROR_LOG="${LOG_DIR}/error.log"
readonly STARTUP_LOG="${LOG_DIR}/startup.log"
readonly ACCESS_LOG="${LOG_DIR}/access.log"

# Initialize log files
init_logs() {
    ensure_directories || return $?

    # Create log files if they don't exist
    for log_file in "$APP_LOG" "$ERROR_LOG" "$STARTUP_LOG" "$ACCESS_LOG"; do
        if [[ ! -f "$log_file" ]]; then
            touch "$log_file" 2>/dev/null || {
                log_error "Failed to create log file: $log_file"
                return $EXIT_PERMISSION_DENIED
            }
        fi
    done
}

# Get timestamp in ISO format
get_timestamp() {
    date '+%Y-%m-%d %H:%M:%S'
}

# Log to startup log with timestamp
log_startup() {
    local message="$*"
    echo "[$(get_timestamp)] $message" >> "$STARTUP_LOG"
}

# Log to application log with timestamp
log_app() {
    local message="$*"
    echo "[$(get_timestamp)] $message" >> "$APP_LOG"
}

# Log error with timestamp to error log
log_error_to_file() {
    local message="$*"
    echo "[$(get_timestamp)] ERROR: $message" >> "$ERROR_LOG"
    log_error "$message"  # Also log to console
}

# Setup file descriptors for logging
setup_logging() {
    init_logs || return $?

    # Log script start
    log_startup "Script started: $0 $*"

    # Return success
    return $EXIT_SUCCESS
}

# Cleanup logging
cleanup_logging() {
    log_startup "Script completed: $0"
}

# Rotate log files if they get too large
rotate_logs() {
    local max_size_mb="${1:-10}"  # Default 10MB
    local max_size_bytes=$((max_size_mb * 1024 * 1024))

    for log_file in "$APP_LOG" "$ERROR_LOG" "$STARTUP_LOG" "$ACCESS_LOG"; do
        if [[ -f "$log_file" ]]; then
            local file_size=$(stat -f%z "$log_file" 2>/dev/null || stat -c%s "$log_file" 2>/dev/null || echo "0")

            if [[ "$file_size" -gt "$max_size_bytes" ]]; then
                local backup_file="${log_file}.$(date +%Y%m%d_%H%M%S)"

                if mv "$log_file" "$backup_file" 2>/dev/null; then
                    log_info "Rotated log file: $(basename "$log_file") -> $(basename "$backup_file")"

                    # Compress the backup
                    if command -v gzip >/dev/null 2>&1; then
                        gzip "$backup_file" &
                    fi

                    # Create new log file
                    touch "$log_file"
                else
                    log_warning "Failed to rotate log file: $log_file"
                fi
            fi
        fi
    done
}

# Archive old logs
archive_old_logs() {
    local days_to_keep="${1:-30}"  # Default 30 days
    local archived_dir="${LOG_DIR}/archived"

    # Create archived directory if it doesn't exist
    if [[ ! -d "$archived_dir" ]]; then
        mkdir -p "$archived_dir" 2>/dev/null || {
            log_warning "Failed to create archived directory: $archived_dir"
            return 1
        }
    fi

    # Find and move old log files
    find "$LOG_DIR" -maxdepth 1 -type f -name "*.log.*" -mtime +"$days_to_keep" 2>/dev/null | while read -r old_file; do
        if mv "$old_file" "$archived_dir/" 2>/dev/null; then
            log_info "Archived old log: $(basename "$old_file")"
        fi
    done
}

# Get log file paths
get_app_log() {
    echo "$APP_LOG"
}

get_error_log() {
    echo "$ERROR_LOG"
}

get_startup_log() {
    echo "$STARTUP_LOG"
}

get_access_log() {
    echo "$ACCESS_LOG"
}

# Setup trap for cleanup on script exit
setup_log_cleanup_trap() {
    trap 'cleanup_logging' EXIT
}