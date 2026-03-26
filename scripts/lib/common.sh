#!/bin/bash

# common.sh - Common variables and utility functions for start/stop scripts

# Prevent multiple sourcing
if [[ -n "${_COMMON_SH_LOADED:-}" ]]; then
    return 0
fi
readonly _COMMON_SH_LOADED=1

# Exit codes
readonly EXIT_SUCCESS=0
readonly EXIT_GENERAL_ERROR=1
readonly EXIT_MISUSE=2
readonly EXIT_PORT_IN_USE=3
readonly EXIT_PERMISSION_DENIED=4
readonly EXIT_ALREADY_RUNNING=5
readonly EXIT_HEALTH_CHECK_FAILED=6
readonly EXIT_ENVIRONMENT_ERROR=10

# Application configuration
readonly APP_NAME="food-bill-generator"
readonly SERVER_SCRIPT="server.js"
readonly HEALTH_ENDPOINT="/api/health"

# Directories
if [[ -z "${SCRIPT_DIR:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fi
if [[ -z "${PROJECT_ROOT:-}" ]]; then
    readonly PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
fi
if [[ -z "${LOG_DIR:-}" ]]; then
    readonly LOG_DIR="${PROJECT_ROOT}/logs"
fi
if [[ -z "${PID_DIR:-}" ]]; then
    readonly PID_DIR="${PROJECT_ROOT}/pids"
fi
if [[ -z "${PID_FILE:-}" ]]; then
    readonly PID_FILE="${PID_DIR}/${APP_NAME}.pid"
fi

# Default configuration values
readonly DEFAULT_PORT=3000
readonly DEFAULT_HOST="localhost"
readonly DEFAULT_NODE_ENV="production"
readonly DEFAULT_SHUTDOWN_TIMEOUT=30
readonly DEFAULT_HEALTH_CHECK_TIMEOUT=5
readonly DEFAULT_HEALTH_CHECK_INTERVAL=30

# Colors for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
readonly NC='\033[0m' # No Color

# Load environment variables if .env file exists
load_env() {
    local env_file="${PROJECT_ROOT}/.env"
    if [[ -f "$env_file" ]]; then
        # Source .env file but only export variables that start with uppercase
        while IFS='=' read -r key value; do
            # Skip empty lines and comments
            [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue

            # Only export valid variable names
            if [[ "$key" =~ ^[A-Z][A-Z0-9_]*$ ]]; then
                export "$key"="$value"
            fi
        done < "$env_file"
    fi
}

# Get configuration value with fallback
get_config() {
    local var_name="$1"
    local default_value="$2"
    local value="${!var_name:-$default_value}"
    echo "$value"
}

# Utility functions for output
log_info() {
    echo -e "${BLUE}[INFO]${NC} $*"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $*"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $*"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $*" >&2
}

# Validate required directories exist
ensure_directories() {
    for dir in "$LOG_DIR" "$PID_DIR"; do
        if [[ ! -d "$dir" ]]; then
            if ! mkdir -p "$dir" 2>/dev/null; then
                log_error "Failed to create directory: $dir"
                return $EXIT_PERMISSION_DENIED
            fi
        fi
    done
}

# Check if port is available
is_port_available() {
    local port="$1"
    if command -v netstat >/dev/null 2>&1; then
        ! netstat -tuln 2>/dev/null | grep -q ":${port} "
    elif command -v ss >/dev/null 2>&1; then
        ! ss -tuln 2>/dev/null | grep -q ":${port} "
    else
        # Fallback: try to bind to port
        if command -v nc >/dev/null 2>&1; then
            ! nc -z localhost "$port" 2>/dev/null
        else
            # Last resort: assume available
            return 0
        fi
    fi
}

# Validate environment
validate_environment() {
    # Check if we're in the right directory
    if [[ ! -f "${PROJECT_ROOT}/${SERVER_SCRIPT}" ]]; then
        log_error "Server script not found: ${PROJECT_ROOT}/${SERVER_SCRIPT}"
        return $EXIT_ENVIRONMENT_ERROR
    fi

    # Check if Node.js is available
    if ! command -v node >/dev/null 2>&1; then
        log_error "Node.js is not installed or not in PATH"
        return $EXIT_ENVIRONMENT_ERROR
    fi

    # Ensure required directories exist
    ensure_directories

    return $EXIT_SUCCESS
}

# Check if running as root and warn
check_root_warning() {
    if [[ $EUID -eq 0 ]]; then
        log_warning "Running as root is not recommended for security reasons"
        log_warning "Consider running as a non-root user"
    fi
}

# Get the base URL for health checks
get_base_url() {
    local host="${1:-$(get_config HOST $DEFAULT_HOST)}"
    local port="${2:-$(get_config PORT $DEFAULT_PORT)}"
    echo "http://${host}:${port}"
}

# Validate PID is numeric
is_valid_pid() {
    local pid="$1"
    [[ "$pid" =~ ^[0-9]+$ ]] && [[ "$pid" -gt 0 ]]
}

# Check if process exists
process_exists() {
    local pid="$1"
    if is_valid_pid "$pid"; then
        kill -0 "$pid" 2>/dev/null
    else
        return 1
    fi
}