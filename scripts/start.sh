#!/bin/bash

# start.sh - Start the Food Bill Generator server

# Exit on error
set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source required libraries
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/pid-manager.sh"

# Display help message
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Start the Food Bill Generator server

OPTIONS:
    -h, --help              Show this help message
    -d, --dev               Start in development mode (uses nodemon)
    -p, --port PORT         Override port number
    -e, --env ENV           Set NODE_ENV (production|development|test)
    --check-only            Only perform health check, don't start server
    --force                 Force start even if process appears to be running

EXAMPLES:
    $0                      Start in production mode
    $0 --dev                Start in development mode
    $0 --port 8080          Start on port 8080
    $0 --env development    Start with NODE_ENV=development

EOF
}

# Parse command line arguments
parse_arguments() {
    DEV_MODE=false
    FORCE_START=false
    CHECK_ONLY=false
    OVERRIDE_PORT=""
    OVERRIDE_ENV=""

    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit $EXIT_SUCCESS
                ;;
            -d|--dev)
                DEV_MODE=true
                shift
                ;;
            -p|--port)
                OVERRIDE_PORT="$2"
                if ! [[ "$OVERRIDE_PORT" =~ ^[0-9]+$ ]] || [[ "$OVERRIDE_PORT" -lt 1 ]] || [[ "$OVERRIDE_PORT" -gt 65535 ]]; then
                    log_error "Invalid port number: $OVERRIDE_PORT"
                    exit $EXIT_MISUSE
                fi
                shift 2
                ;;
            -e|--env)
                OVERRIDE_ENV="$2"
                if [[ ! "$OVERRIDE_ENV" =~ ^(production|development|test)$ ]]; then
                    log_error "Invalid environment: $OVERRIDE_ENV. Must be production, development, or test"
                    exit $EXIT_MISUSE
                fi
                shift 2
                ;;
            --check-only)
                CHECK_ONLY=true
                shift
                ;;
            --force)
                FORCE_START=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                log_error "Use --help for usage information"
                exit $EXIT_MISUSE
                ;;
        esac
    done
}

# Setup environment variables
setup_environment() {
    # Load .env file
    load_env

    # Apply command line overrides
    if [[ -n "$OVERRIDE_PORT" ]]; then
        export PORT="$OVERRIDE_PORT"
    fi

    if [[ -n "$OVERRIDE_ENV" ]]; then
        export NODE_ENV="$OVERRIDE_ENV"
    fi

    # Set defaults if not specified
    export NODE_ENV="${NODE_ENV:-$DEFAULT_NODE_ENV}"
    export PORT="${PORT:-$DEFAULT_PORT}"
    export HOST="${HOST:-$DEFAULT_HOST}"

    # Development mode overrides
    if [[ "$DEV_MODE" == "true" ]]; then
        export NODE_ENV="development"
    fi

    log_info "Environment: NODE_ENV=$NODE_ENV, PORT=$PORT, HOST=$HOST"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."

    # Validate environment
    if ! validate_environment; then
        exit $EXIT_ENVIRONMENT_ERROR
    fi

    # Check for package.json and dependencies
    if [[ ! -f "$PROJECT_ROOT/package.json" ]]; then
        log_error "package.json not found in $PROJECT_ROOT"
        exit $EXIT_ENVIRONMENT_ERROR
    fi

    if [[ ! -d "$PROJECT_ROOT/node_modules" ]]; then
        log_warning "node_modules directory not found. You may need to run 'npm install'"
    fi

    # Check if port is available
    if ! is_port_available "$PORT"; then
        log_error "Port $PORT is already in use"
        exit $EXIT_PORT_IN_USE
    fi

    log_success "Prerequisites check passed"
}

# Check if server is already running
check_running_server() {
    if [[ "$FORCE_START" == "true" ]]; then
        log_warning "Force start requested, skipping running server check"
        return $EXIT_SUCCESS
    fi

    # Clean up any stale PID files first
    cleanup_stale_pid

    local running_pid
    if running_pid=$(is_process_running); then
        log_error "Server is already running with PID $running_pid"
        log_info "Use --force to force start, or run stop.sh first"
        exit $EXIT_ALREADY_RUNNING
    fi
}

# Perform health check
perform_health_check() {
    local base_url="$(get_base_url)"
    local health_url="${base_url}${HEALTH_ENDPOINT}"
    local timeout="${HEALTH_CHECK_TIMEOUT:-$DEFAULT_HEALTH_CHECK_TIMEOUT}"

    log_info "Performing health check: $health_url"

    if command -v curl >/dev/null 2>&1; then
        local response
        if response=$(curl -s --max-time "$timeout" --fail "$health_url" 2>/dev/null); then
            if echo "$response" | grep -q '"success".*true'; then
                log_success "Health check passed"
                return $EXIT_SUCCESS
            else
                log_warning "Health check returned unexpected response: $response"
                return 1
            fi
        else
            log_warning "Health check failed: unable to connect to $health_url"
            return 1
        fi
    else
        log_warning "curl not available, skipping health check"
        return $EXIT_SUCCESS
    fi
}

# Start the server
start_server() {
    log_info "Starting Food Bill Generator server..."

    # Change to project directory
    cd "$PROJECT_ROOT"

    # Determine node command
    local node_cmd="node"
    if [[ "$DEV_MODE" == "true" ]]; then
        if command -v nodemon >/dev/null 2>&1; then
            node_cmd="nodemon"
            log_info "Using nodemon for development mode"
        else
            log_warning "nodemon not found, falling back to node"
        fi
    fi

    # Setup log rotation before starting
    rotate_logs

    # Start the server
    log_info "Executing: $node_cmd $SERVER_SCRIPT"
    log_startup "Starting server: $node_cmd $SERVER_SCRIPT (PID: $$)"

    # Start server in background and capture PID
    if [[ "$DEV_MODE" == "true" ]]; then
        # In development mode, don't redirect output so we can see logs
        $node_cmd "$SERVER_SCRIPT" &
        local server_pid=$!
    else
        # In production mode, redirect output to log files
        $node_cmd "$SERVER_SCRIPT" \
            >> "$(get_app_log)" 2>> "$(get_error_log)" &
        local server_pid=$!
    fi

    # Save PID
    if ! write_pid "$server_pid"; then
        log_error "Failed to write PID file"
        # Try to kill the server we just started
        kill "$server_pid" 2>/dev/null || true
        exit $EXIT_PERMISSION_DENIED
    fi

    log_info "Server started with PID $server_pid"

    # Wait a moment for server to initialize
    sleep 2

    # Check if process is still running
    if ! process_exists "$server_pid"; then
        log_error "Server process exited immediately"
        remove_pid
        exit $EXIT_GENERAL_ERROR
    fi

    # Perform health check
    local health_attempts=0
    local max_health_attempts=10
    local health_interval=2

    while [[ $health_attempts -lt $max_health_attempts ]]; do
        if perform_health_check; then
            break
        fi

        ((health_attempts++))
        if [[ $health_attempts -lt $max_health_attempts ]]; then
            log_info "Health check attempt $health_attempts/$max_health_attempts failed, retrying in ${health_interval}s..."
            sleep $health_interval
        fi
    done

    if [[ $health_attempts -eq $max_health_attempts ]]; then
        log_error "Health check failed after $max_health_attempts attempts"
        log_error "Server may have started but is not responding correctly"
        # Don't kill the server, just warn the user
        exit $EXIT_HEALTH_CHECK_FAILED
    fi

    # Success
    log_success "Food Bill Generator started successfully"
    log_success "Server is running on $(get_base_url)"
    log_success "Health check: $(get_base_url)${HEALTH_ENDPOINT}"

    if [[ "$DEV_MODE" != "true" ]]; then
        log_info "Application logs: $(get_app_log)"
        log_info "Error logs: $(get_error_log)"
        log_info "Startup logs: $(get_startup_log)"
    fi

    log_startup "Server started successfully (PID: $server_pid)"
}

# Main function
main() {
    # Setup logging and traps
    setup_logging "$@" || exit $?
    setup_log_cleanup_trap

    # Show root warning
    check_root_warning

    # Parse arguments
    parse_arguments "$@"

    # If only checking health, do that and exit
    if [[ "$CHECK_ONLY" == "true" ]]; then
        setup_environment
        if perform_health_check; then
            log_success "Server is healthy"
            exit $EXIT_SUCCESS
        else
            log_error "Server health check failed"
            exit $EXIT_HEALTH_CHECK_FAILED
        fi
    fi

    log_info "Food Bill Generator - Start Script"
    log_info "======================================"

    # Setup environment
    setup_environment

    # Check prerequisites
    check_prerequisites

    # Check if already running
    check_running_server

    # Start the server
    start_server

    log_success "Start script completed successfully"
}

# Run main function
main "$@"