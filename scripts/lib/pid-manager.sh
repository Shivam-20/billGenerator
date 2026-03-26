#!/bin/bash

# pid-manager.sh - PID file management utilities for start/stop scripts

# Prevent multiple sourcing
if [[ -n "${_PID_MANAGER_SH_LOADED:-}" ]]; then
    return 0
fi
readonly _PID_MANAGER_SH_LOADED=1

# Source common functions
if [[ -z "${_COMMON_SH_LOADED:-}" ]]; then
    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    source "$SCRIPT_DIR/common.sh"
fi

# Read PID from PID file
read_pid() {
    if [[ -f "$PID_FILE" ]]; then
        local pid=$(cat "$PID_FILE" 2>/dev/null || echo "")
        if is_valid_pid "$pid"; then
            echo "$pid"
        else
            return 1
        fi
    else
        return 1
    fi
}

# Write PID to PID file
write_pid() {
    local pid="$1"

    if ! is_valid_pid "$pid"; then
        return $EXIT_GENERAL_ERROR
    fi

    # Ensure PID directory exists
    ensure_directories || return $?

    # Write PID atomically
    local temp_file="${PID_FILE}.tmp"
    if echo "$pid" > "$temp_file" && mv "$temp_file" "$PID_FILE"; then
        # Set secure permissions on PID file
        chmod 600 "$PID_FILE" 2>/dev/null
        return $EXIT_SUCCESS
    else
        rm -f "$temp_file" 2>/dev/null
        return $EXIT_PERMISSION_DENIED
    fi
}

# Remove PID file
remove_pid() {
    if [[ -f "$PID_FILE" ]]; then
        rm -f "$PID_FILE"
        return $?
    fi
    return $EXIT_SUCCESS
}

# Check if process is running based on PID file
is_process_running() {
    local pid
    pid=$(read_pid) || return 1

    if process_exists "$pid"; then
        echo "$pid"
        return $EXIT_SUCCESS
    else
        return 1
    fi
}

# Clean up stale PID file
cleanup_stale_pid() {
    local pid
    pid=$(read_pid) || {
        # No PID file or invalid PID
        return $EXIT_SUCCESS
    }

    if ! process_exists "$pid"; then
        log_warning "Found stale PID file with PID $pid, removing..."
        remove_pid
        return $EXIT_SUCCESS
    fi

    # Process exists, check if it's our process
    if is_our_process "$pid"; then
        return $EXIT_SUCCESS  # Valid running process
    else
        log_warning "PID file contains PID $pid which belongs to a different process, removing..."
        remove_pid
        return $EXIT_SUCCESS
    fi
}

# Check if PID belongs to our application
is_our_process() {
    local pid="$1"

    if ! process_exists "$pid"; then
        return 1
    fi

    # Check if process command line contains our server script
    if command -v ps >/dev/null 2>&1; then
        local cmd_line
        cmd_line=$(ps -p "$pid" -o args= 2>/dev/null || echo "")
        if [[ "$cmd_line" == *"$SERVER_SCRIPT"* ]]; then
            return $EXIT_SUCCESS
        fi
    fi

    # If we can't determine, assume it's not our process
    return 1
}

# Get process info for display
get_process_info() {
    local pid="$1"

    if ! process_exists "$pid"; then
        return 1
    fi

    if command -v ps >/dev/null 2>&1; then
        # Get process information including start time, memory usage
        ps -p "$pid" -o pid,ppid,etime,rss,args 2>/dev/null || echo "PID $pid (process info unavailable)"
    else
        echo "PID $pid (running)"
    fi
}

# Wait for process to exit with timeout
wait_for_process_exit() {
    local pid="$1"
    local timeout="${2:-$DEFAULT_SHUTDOWN_TIMEOUT}"
    local elapsed=0

    while process_exists "$pid" && [[ $elapsed -lt $timeout ]]; do
        sleep 1
        ((elapsed++))
    done

    if process_exists "$pid"; then
        return 1  # Timeout exceeded
    else
        return $EXIT_SUCCESS  # Process exited
    fi
}

# Send signal to process
send_signal() {
    local pid="$1"
    local signal="${2:-TERM}"

    if ! process_exists "$pid"; then
        return $EXIT_GENERAL_ERROR
    fi

    if kill -"$signal" "$pid" 2>/dev/null; then
        return $EXIT_SUCCESS
    else
        return $EXIT_GENERAL_ERROR
    fi
}

# Graceful shutdown with timeout
graceful_shutdown() {
    local pid="$1"
    local timeout="${2:-$DEFAULT_SHUTDOWN_TIMEOUT}"

    if ! process_exists "$pid"; then
        log_info "Process $pid is not running"
        return $EXIT_SUCCESS
    fi

    log_info "Sending SIGTERM to process $pid..."
    if ! send_signal "$pid" "TERM"; then
        log_error "Failed to send SIGTERM to process $pid"
        return $EXIT_GENERAL_ERROR
    fi

    log_info "Waiting up to $timeout seconds for graceful shutdown..."
    if wait_for_process_exit "$pid" "$timeout"; then
        log_success "Process $pid exited gracefully"
        return $EXIT_SUCCESS
    else
        log_warning "Process $pid did not exit within $timeout seconds"
        return 1
    fi
}

# Force kill process
force_kill() {
    local pid="$1"

    if ! process_exists "$pid"; then
        return $EXIT_SUCCESS
    fi

    log_warning "Force killing process $pid..."
    if send_signal "$pid" "KILL"; then
        sleep 2  # Give it a moment
        if ! process_exists "$pid"; then
            log_success "Process $pid force killed"
            return $EXIT_SUCCESS
        else
            log_error "Failed to force kill process $pid"
            return $EXIT_GENERAL_ERROR
        fi
    else
        log_error "Failed to send SIGKILL to process $pid"
        return $EXIT_GENERAL_ERROR
    fi
}