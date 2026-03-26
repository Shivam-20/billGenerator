#!/bin/bash

# dev.sh - Start Food Bill Generator server in development mode

# Exit on error
set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source required libraries
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/logging.sh"

# Display help message
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Start the Food Bill Generator server in development mode

This script provides a convenient way to start the server in development mode
with appropriate settings for local development.

Features:
- Uses nodemon for automatic restarts on file changes
- Sets NODE_ENV=development
- Enhanced logging and debugging
- Watches for file changes in the project directory

OPTIONS:
    -h, --help              Show this help message
    -p, --port PORT         Override port number (default: 3000)
    --no-watch              Disable file watching (use regular node)
    --watch-only PATTERN    Watch only specific file patterns (comma-separated)
    --ignore PATTERN        Ignore specific file patterns (comma-separated)
    --delay SECONDS         Delay before restart (default: 1 second)

EXAMPLES:
    $0                      Start in development mode with nodemon
    $0 --port 8080          Start on port 8080
    $0 --no-watch           Start without file watching
    $0 --watch-only "*.js"  Watch only JavaScript files
    $0 --ignore "logs/*"    Ignore changes in logs directory

EOF
}

# Parse command line arguments
parse_arguments() {
    USE_NODEMON=true
    DEV_PORT=""
    WATCH_PATTERNS=""
    IGNORE_PATTERNS="logs/*,pids/*,node_modules/*,*.log"
    RESTART_DELAY="1"

    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit $EXIT_SUCCESS
                ;;
            -p|--port)
                DEV_PORT="$2"
                if ! [[ "$DEV_PORT" =~ ^[0-9]+$ ]] || [[ "$DEV_PORT" -lt 1 ]] || [[ "$DEV_PORT" -gt 65535 ]]; then
                    log_error "Invalid port number: $DEV_PORT"
                    exit $EXIT_MISUSE
                fi
                shift 2
                ;;
            --no-watch)
                USE_NODEMON=false
                shift
                ;;
            --watch-only)
                WATCH_PATTERNS="$2"
                shift 2
                ;;
            --ignore)
                IGNORE_PATTERNS="$2"
                shift 2
                ;;
            --delay)
                RESTART_DELAY="$2"
                if ! [[ "$RESTART_DELAY" =~ ^[0-9]+([.][0-9]+)?$ ]]; then
                    log_error "Invalid delay: $RESTART_DELAY"
                    exit $EXIT_MISUSE
                fi
                shift 2
                ;;
            *)
                log_error "Unknown option: $1"
                log_error "Use --help for usage information"
                exit $EXIT_MISUSE
                ;;
        esac
    done
}

# Setup development environment
setup_dev_environment() {
    # Load any existing .env file
    load_env

    # Set development-specific environment variables
    export NODE_ENV="development"
    export DEBUG="${DEBUG:-*}"  # Enable debug logging if not set

    # Override port if specified
    if [[ -n "$DEV_PORT" ]]; then
        export PORT="$DEV_PORT"
    fi

    # Use default port if not set
    export PORT="${PORT:-$DEFAULT_PORT}"
    export HOST="${HOST:-$DEFAULT_HOST}"

    log_info "Development environment:"
    log_info "  NODE_ENV: $NODE_ENV"
    log_info "  PORT: $PORT"
    log_info "  DEBUG: ${DEBUG:-not set}"
}

# Check development prerequisites
check_dev_prerequisites() {
    log_info "Checking development prerequisites..."

    # Basic environment validation
    if ! validate_environment; then
        exit $EXIT_ENVIRONMENT_ERROR
    fi

    # Check if nodemon is available
    if [[ "$USE_NODEMON" == "true" ]]; then
        if ! command -v nodemon >/dev/null 2>&1; then
            log_warning "nodemon not found in PATH"
            log_info "Checking local node_modules..."

            if [[ -x "$PROJECT_ROOT/node_modules/.bin/nodemon" ]]; then
                log_success "Found local nodemon installation"
                NODEMON_CMD="$PROJECT_ROOT/node_modules/.bin/nodemon"
            else
                log_warning "nodemon not available, falling back to regular node"
                log_info "To install nodemon: npm install -g nodemon or npm install --save-dev nodemon"
                USE_NODEMON=false
            fi
        else
            NODEMON_CMD="nodemon"
        fi
    fi

    # Check port availability
    if ! is_port_available "$PORT"; then
        log_error "Port $PORT is already in use"
        log_info "You can use --port to specify a different port"
        exit $EXIT_PORT_IN_USE
    fi

    log_success "Development prerequisites check passed"
}

# Start development server
start_dev_server() {
    log_info "Starting Food Bill Generator in development mode..."

    # Change to project directory
    cd "$PROJECT_ROOT"

    # Clean up any existing PID file (dev mode doesn't use PID files typically)
    cleanup_stale_pid

    if [[ "$USE_NODEMON" == "true" ]]; then
        # Build nodemon command
        local nodemon_args=("$SERVER_SCRIPT")

        # Add ignore patterns
        if [[ -n "$IGNORE_PATTERNS" ]]; then
            IFS=',' read -ra patterns <<< "$IGNORE_PATTERNS"
            for pattern in "${patterns[@]}"; do
                # Trim whitespace
                pattern=$(echo "$pattern" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                nodemon_args+=("--ignore" "$pattern")
            done
        fi

        # Add watch patterns if specified
        if [[ -n "$WATCH_PATTERNS" ]]; then
            IFS=',' read -ra patterns <<< "$WATCH_PATTERNS"
            for pattern in "${patterns[@]}"; do
                # Trim whitespace
                pattern=$(echo "$pattern" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
                nodemon_args+=("--watch" "$pattern")
            done
        fi

        # Add restart delay
        nodemon_args+=("--delay" "${RESTART_DELAY}s")

        # Add verbose mode for better development experience
        nodemon_args+=("--verbose")

        log_info "Starting with nodemon..."
        log_info "Command: $NODEMON_CMD ${nodemon_args[*]}"
        log_info ""
        log_info "Development server will automatically restart when files change"
        log_info "Press Ctrl+C to stop the server"
        log_info "----------------------------------------"

        # Execute nodemon (this will not return until stopped)
        exec "$NODEMON_CMD" "${nodemon_args[@]}"

    else
        # Fallback to regular node
        log_info "Starting with regular node..."
        log_info "Command: node $SERVER_SCRIPT"
        log_info ""
        log_warning "File watching is disabled - you'll need to restart manually"
        log_info "Press Ctrl+C to stop the server"
        log_info "----------------------------------------"

        # Execute node (this will not return until stopped)
        exec node "$SERVER_SCRIPT"
    fi
}

# Display development tips
show_dev_tips() {
    cat << EOF

===== Development Mode Tips =====

1. File Watching:
   - The server will automatically restart when you modify files
   - Ignored patterns: $IGNORE_PATTERNS
   - To disable watching: use --no-watch

2. Environment:
   - NODE_ENV is set to 'development'
   - Debug logging is enabled by default
   - Port: $PORT (change with --port)

3. Useful commands:
   - Check server status: ./scripts/status.sh
   - View logs: tail -f logs/app.log
   - Stop server: Ctrl+C or ./scripts/stop.sh

4. API endpoints available at:
   - Health check: http://localhost:$PORT/api/health
   - Generate invoice: http://localhost:$PORT/api/generate-invoice
   - Web interface: http://localhost:$PORT/

==================================

EOF
}

# Main function
main() {
    # Parse arguments
    parse_arguments "$@"

    # Show development tips unless running quietly
    if [[ "$QUIET_MODE" != "true" ]]; then
        echo "Food Bill Generator - Development Mode"
        echo "======================================"
        echo
    fi

    # Setup development environment
    setup_dev_environment

    # Check prerequisites
    check_dev_prerequisites

    # Show development tips
    if [[ "$QUIET_MODE" != "true" ]]; then
        show_dev_tips
    fi

    # Start the development server (this function does not return)
    start_dev_server
}

# Run main function
main "$@"