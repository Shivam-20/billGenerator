#!/bin/bash

# restart.sh - Restart the Food Bill Generator server

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

Restart the Food Bill Generator server

This script stops the server (if running) and then starts it again.
All options are passed to both the stop and start scripts.

OPTIONS:
    -h, --help              Show this help message
    -d, --dev               Restart in development mode
    -p, --port PORT         Override port number
    -e, --env ENV           Set NODE_ENV (production|development|test)
    -f, --force             Force stop if graceful shutdown fails
    -t, --timeout SECONDS   Graceful shutdown timeout

EXAMPLES:
    $0                      Restart server
    $0 --dev                Restart in development mode
    $0 --port 8080          Restart on port 8080
    $0 --force              Force restart (kills server if needed)

EOF
}

# Parse command line arguments to extract help
for arg in "$@"; do
    if [[ "$arg" == "-h" || "$arg" == "--help" ]]; then
        show_help
        exit $EXIT_SUCCESS
    fi
done

# Main function
main() {
    # Setup minimal logging
    setup_logging "$@" || exit $?
    setup_log_cleanup_trap

    log_info "Food Bill Generator - Restart Script"
    log_info "======================================"

    # Extract arguments for stop and start scripts
    STOP_ARGS=()
    START_ARGS=()

    # Parse arguments and route them appropriately
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--force|-t|--timeout)
                # These options are for stop script
                STOP_ARGS+=("$1")
                if [[ "$1" == "-t" || "$1" == "--timeout" ]]; then
                    STOP_ARGS+=("$2")
                    START_ARGS+=("$1" "$2")  # Timeout also applies to start
                    shift 2
                else
                    shift
                fi
                ;;
            -d|--dev|-p|--port|-e|--env)
                # These options are for start script
                START_ARGS+=("$1")
                if [[ "$1" == "-p" || "$1" == "--port" || "$1" == "-e" || "$1" == "--env" ]]; then
                    START_ARGS+=("$2")
                    shift 2
                else
                    shift
                fi
                ;;
            *)
                # Unknown option, pass to both scripts
                log_warning "Unknown option '$1', passing to both stop and start scripts"
                STOP_ARGS+=("$1")
                START_ARGS+=("$1")
                shift
                ;;
        esac
    done

    # Step 1: Stop the server
    log_info "Step 1: Stopping server..."
    if [[ -x "$SCRIPT_DIR/stop.sh" ]]; then
        if "$SCRIPT_DIR/stop.sh" "${STOP_ARGS[@]}"; then
            log_success "Server stopped successfully"
        else
            local stop_exit_code=$?
            if [[ $stop_exit_code -eq $EXIT_SUCCESS ]]; then
                # Server wasn't running, that's okay
                log_info "Server was not running"
            else
                log_error "Failed to stop server (exit code: $stop_exit_code)"
                exit $stop_exit_code
            fi
        fi
    else
        log_error "Stop script not found: $SCRIPT_DIR/stop.sh"
        exit $EXIT_ENVIRONMENT_ERROR
    fi

    # Brief pause between stop and start
    log_info "Waiting 2 seconds before restart..."
    sleep 2

    # Step 2: Start the server
    log_info "Step 2: Starting server..."
    if [[ -x "$SCRIPT_DIR/start.sh" ]]; then
        if "$SCRIPT_DIR/start.sh" "${START_ARGS[@]}"; then
            log_success "Server started successfully"
        else
            local start_exit_code=$?
            log_error "Failed to start server (exit code: $start_exit_code)"
            exit $start_exit_code
        fi
    else
        log_error "Start script not found: $SCRIPT_DIR/start.sh"
        exit $EXIT_ENVIRONMENT_ERROR
    fi

    log_success "Food Bill Generator restarted successfully"
    log_info "Use 'status.sh' to check server status"
}

# Run main function
main "$@"