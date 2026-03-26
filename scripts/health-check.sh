#!/bin/bash

# health-check.sh - Continuous health monitoring for Food Bill Generator server

# Exit on error
set -e

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Source required libraries
source "$SCRIPT_DIR/lib/common.sh"
source "$SCRIPT_DIR/lib/logging.sh"
source "$SCRIPT_DIR/lib/pid-manager.sh"

# Global variables for monitoring
MONITOR_RUNNING=false
MONITOR_PID=""

# Display help message
show_help() {
    cat << EOF
Usage: $0 [OPTIONS]

Continuous health monitoring for Food Bill Generator server

This script performs periodic health checks and can send notifications
when the server status changes.

OPTIONS:
    -h, --help                  Show this help message
    -i, --interval SECONDS      Check interval (default: 30 seconds)
    -t, --timeout SECONDS       Health check timeout (default: 5 seconds)
    -l, --log FILE             Log file for health check results
    -d, --daemon               Run as daemon in background
    -o, --once                 Perform single health check and exit
    -f, --failure-threshold N   Failures before alert (default: 3)
    -s, --success-threshold N   Successes to clear alert (default: 2)
    --webhook URL               Webhook URL for notifications
    --email ADDRESS            Email address for notifications
    -q, --quiet                Quiet mode (minimal output)

DAEMON CONTROL:
    --stop                     Stop running daemon
    --status                   Check daemon status
    --reload                   Reload daemon configuration

EXAMPLES:
    $0                         Run health checks every 30 seconds
    $0 --interval 60           Check every minute
    $0 --daemon                Run as background daemon
    $0 --once                  Single health check
    $0 --stop                  Stop monitoring daemon

EOF
}

# Parse command line arguments
parse_arguments() {
    CHECK_INTERVAL="${HEALTH_CHECK_INTERVAL:-$DEFAULT_HEALTH_CHECK_INTERVAL}"
    CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-$DEFAULT_HEALTH_CHECK_TIMEOUT}"
    LOG_FILE=""
    DAEMON_MODE=false
    ONCE_MODE=false
    FAILURE_THRESHOLD=3
    SUCCESS_THRESHOLD=2
    WEBHOOK_URL="${WEBHOOK_URL:-}"
    EMAIL_ADDRESS=""
    QUIET_MODE=false
    STOP_DAEMON=false
    STATUS_DAEMON=false
    RELOAD_DAEMON=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit $EXIT_SUCCESS
                ;;
            -i|--interval)
                CHECK_INTERVAL="$2"
                if ! [[ "$CHECK_INTERVAL" =~ ^[0-9]+$ ]] || [[ "$CHECK_INTERVAL" -lt 1 ]]; then
                    log_error "Invalid interval: $CHECK_INTERVAL"
                    exit $EXIT_MISUSE
                fi
                shift 2
                ;;
            -t|--timeout)
                CHECK_TIMEOUT="$2"
                if ! [[ "$CHECK_TIMEOUT" =~ ^[0-9]+$ ]] || [[ "$CHECK_TIMEOUT" -lt 1 ]]; then
                    log_error "Invalid timeout: $CHECK_TIMEOUT"
                    exit $EXIT_MISUSE
                fi
                shift 2
                ;;
            -l|--log)
                LOG_FILE="$2"
                shift 2
                ;;
            -d|--daemon)
                DAEMON_MODE=true
                shift
                ;;
            -o|--once)
                ONCE_MODE=true
                shift
                ;;
            -f|--failure-threshold)
                FAILURE_THRESHOLD="$2"
                if ! [[ "$FAILURE_THRESHOLD" =~ ^[0-9]+$ ]] || [[ "$FAILURE_THRESHOLD" -lt 1 ]]; then
                    log_error "Invalid failure threshold: $FAILURE_THRESHOLD"
                    exit $EXIT_MISUSE
                fi
                shift 2
                ;;
            -s|--success-threshold)
                SUCCESS_THRESHOLD="$2"
                if ! [[ "$SUCCESS_THRESHOLD" =~ ^[0-9]+$ ]] || [[ "$SUCCESS_THRESHOLD" -lt 1 ]]; then
                    log_error "Invalid success threshold: $SUCCESS_THRESHOLD"
                    exit $EXIT_MISUSE
                fi
                shift 2
                ;;
            --webhook)
                WEBHOOK_URL="$2"
                shift 2
                ;;
            --email)
                EMAIL_ADDRESS="$2"
                shift 2
                ;;
            -q|--quiet)
                QUIET_MODE=true
                shift
                ;;
            --stop)
                STOP_DAEMON=true
                shift
                ;;
            --status)
                STATUS_DAEMON=true
                shift
                ;;
            --reload)
                RELOAD_DAEMON=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                log_error "Use --help for usage information"
                exit $EXIT_MISUSE
                ;;
        esac
    done

    # Set default log file if not specified
    if [[ -z "$LOG_FILE" ]]; then
        LOG_FILE="$LOG_DIR/health-check.log"
    fi
}

# Health monitoring daemon PID file
get_monitor_pid_file() {
    echo "$PID_DIR/health-monitor.pid"
}

# Check if monitoring daemon is running
is_monitor_running() {
    local monitor_pid_file
    monitor_pid_file="$(get_monitor_pid_file)"

    if [[ -f "$monitor_pid_file" ]]; then
        local pid
        pid=$(cat "$monitor_pid_file" 2>/dev/null || echo "")
        if is_valid_pid "$pid" && process_exists "$pid"; then
            echo "$pid"
            return $EXIT_SUCCESS
        else
            # Stale PID file
            rm -f "$monitor_pid_file" 2>/dev/null
            return 1
        fi
    fi
    return 1
}

# Stop monitoring daemon
stop_monitor_daemon() {
    local running_pid
    if running_pid=$(is_monitor_running); then
        log_info "Stopping health monitoring daemon (PID: $running_pid)..."
        if kill -TERM "$running_pid" 2>/dev/null; then
            # Wait for graceful shutdown
            local timeout=10
            local elapsed=0
            while process_exists "$running_pid" && [[ $elapsed -lt $timeout ]]; do
                sleep 1
                ((elapsed++))
            done

            if process_exists "$running_pid"; then
                log_warning "Daemon didn't stop gracefully, force killing..."
                kill -KILL "$running_pid" 2>/dev/null || true
            fi

            rm -f "$(get_monitor_pid_file)" 2>/dev/null
            log_success "Health monitoring daemon stopped"
        else
            log_error "Failed to stop monitoring daemon"
            return $EXIT_GENERAL_ERROR
        fi
    else
        log_info "Health monitoring daemon is not running"
    fi
}

# Show daemon status
show_daemon_status() {
    local running_pid
    if running_pid=$(is_monitor_running); then
        log_success "Health monitoring daemon is running (PID: $running_pid)"

        # Show process info if available
        if command -v ps >/dev/null 2>&1; then
            log_info "Process info:"
            ps -p "$running_pid" -o pid,ppid,etime,args 2>/dev/null | while IFS= read -r line; do
                log_info "  $line"
            done
        fi

        # Show recent log entries if log file exists
        if [[ -f "$LOG_FILE" ]]; then
            log_info "Recent health check results:"
            tail -5 "$LOG_FILE" 2>/dev/null | while IFS= read -r line; do
                log_info "  $line"
            done
        fi
    else
        log_warning "Health monitoring daemon is not running"
        return 1
    fi
}

# Perform single health check
perform_health_check() {
    load_env
    local base_url="$(get_base_url)"
    local health_url="${base_url}${HEALTH_ENDPOINT}"

    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    local health_status="UNKNOWN"
    local response_time=0
    local error_message=""

    if command -v curl >/dev/null 2>&1; then
        local start_time
        start_time=$(date +%s%N 2>/dev/null || date +%s)

        local response
        if response=$(curl -s --max-time "$CHECK_TIMEOUT" --fail "$health_url" 2>&1); then
            local end_time
            end_time=$(date +%s%N 2>/dev/null || date +%s)

            # Calculate response time
            if [[ "$start_time" =~ N ]]; then
                response_time=$(( (end_time - start_time) / 1000000 ))
            else
                response_time=$(( (end_time - start_time) * 1000 ))
            fi

            if echo "$response" | grep -q '"success".*true'; then
                health_status="HEALTHY"
            else
                health_status="UNHEALTHY"
                error_message="Unexpected response format"
            fi
        else
            health_status="FAILED"
            error_message="$response"
        fi
    else
        health_status="CURL_UNAVAILABLE"
        error_message="curl command not available"
    fi

    # Log the result
    local log_message="[$timestamp] Status: $health_status, Response time: ${response_time}ms, URL: $health_url"
    if [[ -n "$error_message" ]]; then
        log_message="$log_message, Error: $error_message"
    fi

    echo "$log_message" >> "$LOG_FILE"

    if [[ "$QUIET_MODE" != "true" ]]; then
        case "$health_status" in
            "HEALTHY")
                log_success "Health check passed (${response_time}ms)"
                ;;
            "UNHEALTHY")
                log_warning "Health check failed: $error_message"
                ;;
            "FAILED")
                log_error "Health check failed: $error_message"
                ;;
            *)
                log_warning "Health check status: $health_status"
                ;;
        esac
    fi

    # Return appropriate exit code
    case "$health_status" in
        "HEALTHY")
            return 0
            ;;
        *)
            return 1
            ;;
    esac
}

# Send notification
send_notification() {
    local status="$1"
    local message="$2"
    local timestamp
    timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    # Webhook notification
    if [[ -n "$WEBHOOK_URL" ]] && command -v curl >/dev/null 2>&1; then
        local payload
        payload=$(cat << EOF
{
  "timestamp": "$timestamp",
  "service": "Food Bill Generator",
  "status": "$status",
  "message": "$message",
  "hostname": "$(hostname)",
  "environment": "${NODE_ENV:-production}"
}
EOF
)

        if curl -s --max-time 10 -X POST -H "Content-Type: application/json" -d "$payload" "$WEBHOOK_URL" >/dev/null 2>&1; then
            log_info "Webhook notification sent"
        else
            log_warning "Failed to send webhook notification"
        fi
    fi

    # Email notification (requires mail command)
    if [[ -n "$EMAIL_ADDRESS" ]] && command -v mail >/dev/null 2>&1; then
        local subject="Food Bill Generator - $status"
        local body="$timestamp: $message"

        if echo "$body" | mail -s "$subject" "$EMAIL_ADDRESS" 2>/dev/null; then
            log_info "Email notification sent to $EMAIL_ADDRESS"
        else
            log_warning "Failed to send email notification"
        fi
    fi
}

# Continuous monitoring loop
monitor_health() {
    local consecutive_failures=0
    local consecutive_successes=0
    local alert_state=false

    log_info "Starting health monitoring (interval: ${CHECK_INTERVAL}s, timeout: ${CHECK_TIMEOUT}s)"
    log_info "Failure threshold: $FAILURE_THRESHOLD, Success threshold: $SUCCESS_THRESHOLD"

    # Trap signals for graceful shutdown
    trap 'MONITOR_RUNNING=false; log_info "Received shutdown signal"' TERM INT

    MONITOR_RUNNING=true

    while [[ "$MONITOR_RUNNING" == "true" ]]; do
        if perform_health_check; then
            # Health check passed
            consecutive_failures=0
            ((consecutive_successes++))

            # Clear alert if we've had enough successes
            if [[ "$alert_state" == "true" && "$consecutive_successes" -ge "$SUCCESS_THRESHOLD" ]]; then
                alert_state=false
                local message="Service recovered after $consecutive_successes consecutive successful health checks"
                send_notification "RECOVERED" "$message"
                log_success "$message"
            fi
        else
            # Health check failed
            consecutive_successes=0
            ((consecutive_failures++))

            # Send alert if we've reached the failure threshold
            if [[ "$alert_state" != "true" && "$consecutive_failures" -ge "$FAILURE_THRESHOLD" ]]; then
                alert_state=true
                local message="Service unhealthy after $consecutive_failures consecutive failed health checks"
                send_notification "ALERT" "$message"
                log_error "$message"
            fi
        fi

        # Sleep for the specified interval
        local elapsed=0
        while [[ "$MONITOR_RUNNING" == "true" && "$elapsed" -lt "$CHECK_INTERVAL" ]]; do
            sleep 1
            ((elapsed++))
        done
    done

    log_info "Health monitoring stopped"
}

# Start monitoring as daemon
start_daemon() {
    # Check if already running
    if is_monitor_running >/dev/null; then
        log_error "Health monitoring daemon is already running"
        exit $EXIT_ALREADY_RUNNING
    fi

    log_info "Starting health monitoring daemon..."

    # Start monitoring in background
    (
        # Redirect output to log file
        exec > "$LOG_FILE" 2>&1

        # Save PID
        echo "$$" > "$(get_monitor_pid_file)"

        # Set trap to clean up PID file
        trap 'rm -f "$(get_monitor_pid_file)"' EXIT

        # Start monitoring
        monitor_health
    ) &

    # Give it a moment to start
    sleep 2

    # Verify it started
    local daemon_pid
    if daemon_pid=$(is_monitor_running); then
        log_success "Health monitoring daemon started (PID: $daemon_pid)"
        log_info "Log file: $LOG_FILE"
    else
        log_error "Failed to start health monitoring daemon"
        exit $EXIT_GENERAL_ERROR
    fi
}

# Main function
main() {
    # Parse arguments
    parse_arguments "$@"

    # Handle daemon control commands first
    if [[ "$STOP_DAEMON" == "true" ]]; then
        stop_monitor_daemon
        exit $?
    fi

    if [[ "$STATUS_DAEMON" == "true" ]]; then
        show_daemon_status
        exit $?
    fi

    if [[ "$RELOAD_DAEMON" == "true" ]]; then
        log_info "Reloading monitoring daemon..."
        stop_monitor_daemon
        sleep 2
        start_daemon
        exit $?
    fi

    # Setup logging
    setup_logging "$@" || exit $?
    ensure_directories || exit $?

    # Initialize log file
    if [[ ! -f "$LOG_FILE" ]]; then
        touch "$LOG_FILE" 2>/dev/null || {
            log_error "Cannot create log file: $LOG_FILE"
            exit $EXIT_PERMISSION_DENIED
        }
    fi

    # Handle different modes
    if [[ "$ONCE_MODE" == "true" ]]; then
        # Single health check
        if perform_health_check; then
            exit $EXIT_SUCCESS
        else
            exit $EXIT_HEALTH_CHECK_FAILED
        fi
    elif [[ "$DAEMON_MODE" == "true" ]]; then
        # Start as daemon
        start_daemon
    else
        # Interactive monitoring
        if [[ "$QUIET_MODE" != "true" ]]; then
            echo "Food Bill Generator - Health Monitor"
            echo "===================================="
            echo "Press Ctrl+C to stop monitoring"
            echo
        fi
        monitor_health
    fi
}

# Run main function
main "$@"