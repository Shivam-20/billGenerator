#!/bin/bash

# stop.sh - Stop the Food Bill Generator server

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

Stop the Food Bill Generator server

OPTIONS:
    -h, --help              Show this help message
    -f, --force             Force kill server immediately (SIGKILL)
    -t, --timeout SECONDS   Graceful shutdown timeout (default: $DEFAULT_SHUTDOWN_TIMEOUT)
    --check-only            Only check if server is running, don't stop

EXAMPLES:
    $0                      Stop server gracefully
    $0 --force              Force stop server immediately
    $0 --timeout 60         Wait up to 60 seconds for graceful shutdown

EOF
}

# Parse command line arguments
parse_arguments() {
    FORCE_KILL=false
    CHECK_ONLY=false
    SHUTDOWN_TIMEOUT="$DEFAULT_SHUTDOWN_TIMEOUT"

    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit $EXIT_SUCCESS
                ;;
            -f|--force)
                FORCE_KILL=true
                shift
                ;;
            -t|--timeout)
                SHUTDOWN_TIMEOUT="$2"
                if ! [[ "$SHUTDOWN_TIMEOUT" =~ ^[0-9]+$ ]] || [[ "$SHUTDOWN_TIMEOUT" -lt 1 ]]; then
                    log_error "Invalid timeout: $SHUTDOWN_TIMEOUT. Must be a positive integer"
                    exit $EXIT_MISUSE
                fi
                shift 2
                ;;
            --check-only)
                CHECK_ONLY=true
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

# Check if server is running
check_server_status() {
    local running_pid
    if running_pid=$(is_process_running); then
        log_info "Server is running with PID $running_pid"
        echo "$running_pid"
        return $EXIT_SUCCESS
    else
        log_info "Server is not running"
        return 1
    fi
}

# Perform final cleanup
cleanup_resources() {
    log_info "Performing cleanup..."

    # Remove PID file
    remove_pid

    # Archive old logs if configured
    local log_archive_days
    log_archive_days=$(get_config LOG_ARCHIVE_DAYS 30)
    if [[ "$log_archive_days" -gt 0 ]]; then
        archive_old_logs "$log_archive_days"
    fi

    log_success "Cleanup completed"
}

# Stop the server
stop_server() {
    local server_pid="$1"

    log_info "Stopping Food Bill Generator server (PID: $server_pid)..."
    log_startup "Stopping server (PID: $server_pid)"

    # If force kill is requested, skip graceful shutdown
    if [[ "$FORCE_KILL" == "true" ]]; then
        log_warning "Force kill requested, sending SIGKILL immediately"
        if force_kill "$server_pid"; then
            cleanup_resources
            log_success "Server force stopped"
            log_startup "Server force stopped successfully"
            return $EXIT_SUCCESS
        else
            log_error "Failed to force kill server"
            return $EXIT_GENERAL_ERROR
        fi
    fi

    # Attempt graceful shutdown
    log_info "Attempting graceful shutdown..."
    if graceful_shutdown "$server_pid" "$SHUTDOWN_TIMEOUT"; then
        cleanup_resources
        log_success "Server stopped gracefully"
        log_startup "Server stopped gracefully"
        return $EXIT_SUCCESS
    else
        log_warning "Graceful shutdown failed or timed out"

        # Ask user if they want to force kill
        if command -v tty >/dev/null 2>&1 && tty -s; then
            # Interactive mode
            echo
            read -p "Force kill the server? [y/N]: " -r
            if [[ $REPLY =~ ^[Yy]$ ]]; then
                log_info "User confirmed force kill"
                if force_kill "$server_pid"; then
                    cleanup_resources
                    log_success "Server force stopped"
                    log_startup "Server force stopped after timeout"
                    return $EXIT_SUCCESS
                else
                    log_error "Failed to force kill server"
                    return $EXIT_GENERAL_ERROR
                fi
            else
                log_info "User declined force kill, leaving process running"
                log_error "Server shutdown failed - process is still running"
                return $EXIT_GENERAL_ERROR
            fi
        else
            # Non-interactive mode, don't force kill automatically
            log_error "Graceful shutdown failed and running in non-interactive mode"
            log_error "Use --force option to force kill the server"
            return $EXIT_GENERAL_ERROR
        fi
    fi
}

# Verify server is stopped
verify_stopped() {
    local server_pid="$1"

    # Wait a moment for process to fully exit
    sleep 1

    # Check if process still exists
    if process_exists "$server_pid"; then
        log_warning "Process $server_pid is still running after stop attempt"
        return 1
    fi

    # Check PID file is removed
    if [[ -f "$PID_FILE" ]]; then
        log_warning "PID file still exists: $PID_FILE"
        return 1
    fi

    log_success "Server stop verified - process and PID file cleaned up"
    return $EXIT_SUCCESS
}

# Main function
main() {
    # Setup logging and traps
    setup_logging "$@" || exit $?
    setup_log_cleanup_trap

    # Parse arguments
    parse_arguments "$@"

    log_info "Food Bill Generator - Stop Script"
    log_info "====================================="

    # Clean up any stale PID files first
    cleanup_stale_pid

    # Check server status
    local server_pid
    if ! server_pid=$(check_server_status); then
        if [[ "$CHECK_ONLY" == "true" ]]; then
            log_info "Check complete: server is not running"
            exit $EXIT_SUCCESS
        fi

        log_warning "No running server found"

        # Check for stale PID file
        if [[ -f "$PID_FILE" ]]; then
            log_info "Removing stale PID file: $PID_FILE"
            remove_pid
        fi

        log_success "Nothing to stop"
        exit $EXIT_SUCCESS
    fi

    # If only checking status, exit here
    if [[ "$CHECK_ONLY" == "true" ]]; then
        log_info "Check complete: server is running with PID $server_pid"
        exit $EXIT_SUCCESS
    fi

    # Display process information
    log_info "Process information:"
    get_process_info "$server_pid" | while IFS= read -r line; do
        log_info "  $line"
    done

    # Stop the server
    if stop_server "$server_pid"; then
        # Verify the server is actually stopped
        if verify_stopped "$server_pid"; then
            log_success "Food Bill Generator stopped successfully"
        else
            log_warning "Server stop may not have completed successfully"
            exit $EXIT_GENERAL_ERROR
        fi
    else
        log_error "Failed to stop server"
        exit $EXIT_GENERAL_ERROR
    fi

    log_success "Stop script completed successfully"
}

# Run main function
main "$@"