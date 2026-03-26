#!/bin/bash

# status.sh - Check status of the Food Bill Generator server

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

Check status of the Food Bill Generator server

OPTIONS:
    -h, --help              Show this help message
    -v, --verbose           Show detailed information
    -j, --json              Output status in JSON format
    -q, --quiet             Minimal output (exit code only)
    --health-only           Only perform health check
    --process-only          Only check process status

EXAMPLES:
    $0                      Show basic status
    $0 --verbose            Show detailed status information
    $0 --json               Output status as JSON
    $0 --health-only        Check only health endpoint

EXIT CODES:
    0  - Server is running and healthy
    1  - Server is not running
    6  - Server is running but health check failed

EOF
}

# Parse command line arguments
parse_arguments() {
    VERBOSE_MODE=false
    JSON_OUTPUT=false
    QUIET_MODE=false
    HEALTH_ONLY=false
    PROCESS_ONLY=false

    while [[ $# -gt 0 ]]; do
        case $1 in
            -h|--help)
                show_help
                exit $EXIT_SUCCESS
                ;;
            -v|--verbose)
                VERBOSE_MODE=true
                shift
                ;;
            -j|--json)
                JSON_OUTPUT=true
                shift
                ;;
            -q|--quiet)
                QUIET_MODE=true
                shift
                ;;
            --health-only)
                HEALTH_ONLY=true
                shift
                ;;
            --process-only)
                PROCESS_ONLY=true
                shift
                ;;
            *)
                log_error "Unknown option: $1"
                log_error "Use --help for usage information"
                exit $EXIT_MISUSE
                ;;
        esac
    done

    # Validate option combinations
    if [[ "$HEALTH_ONLY" == "true" && "$PROCESS_ONLY" == "true" ]]; then
        log_error "Cannot use --health-only and --process-only together"
        exit $EXIT_MISUSE
    fi
}

# Get process status information
get_process_status() {
    local result=""

    # Clean up stale PID files first
    cleanup_stale_pid

    local running_pid
    if running_pid=$(is_process_running); then
        local process_info
        if process_info=$(get_process_info "$running_pid" 2>/dev/null); then
            result="RUNNING"
            [[ "$VERBOSE_MODE" == "true" || "$JSON_OUTPUT" == "true" ]] && {
                PROCESS_PID="$running_pid"
                PROCESS_INFO="$process_info"

                # Get additional process details if available
                if command -v ps >/dev/null 2>&1; then
                    local start_time
                    start_time=$(ps -p "$running_pid" -o lstart= 2>/dev/null | sed 's/^ *//' || echo "unknown")
                    PROCESS_START_TIME="$start_time"

                    local cpu_usage
                    cpu_usage=$(ps -p "$running_pid" -o %cpu= 2>/dev/null | sed 's/^ *//' || echo "0.0")
                    PROCESS_CPU="$cpu_usage"

                    local memory_kb
                    memory_kb=$(ps -p "$running_pid" -o rss= 2>/dev/null | sed 's/^ *//' || echo "0")
                    PROCESS_MEMORY_MB=$(( memory_kb / 1024 ))
                fi
            }
        else
            result="RUNNING"
            PROCESS_PID="$running_pid"
            PROCESS_INFO="Process running (details unavailable)"
        fi
    else
        result="NOT_RUNNING"
    fi

    echo "$result"
}

# Perform health check
perform_health_check() {
    load_env
    local base_url="$(get_base_url)"
    local health_url="${base_url}${HEALTH_ENDPOINT}"
    local timeout="${HEALTH_CHECK_TIMEOUT:-$DEFAULT_HEALTH_CHECK_TIMEOUT}"

    local health_status="UNKNOWN"
    local health_response=""
    local response_time=0

    if command -v curl >/dev/null 2>&1; then
        local start_time
        start_time=$(date +%s%N 2>/dev/null || date +%s)

        if health_response=$(curl -s --max-time "$timeout" --fail "$health_url" 2>/dev/null); then
            local end_time
            end_time=$(date +%s%N 2>/dev/null || date +%s)

            # Calculate response time in milliseconds
            if [[ "$start_time" =~ N ]]; then
                # nanoseconds available
                response_time=$(( (end_time - start_time) / 1000000 ))
            else
                # only seconds available
                response_time=$(( (end_time - start_time) * 1000 ))
            fi

            if echo "$health_response" | grep -q '"success".*true'; then
                health_status="HEALTHY"
            else
                health_status="UNHEALTHY"
            fi
        else
            health_status="UNREACHABLE"
        fi
    else
        health_status="CURL_UNAVAILABLE"
    fi

    HEALTH_STATUS="$health_status"
    HEALTH_RESPONSE="$health_response"
    HEALTH_RESPONSE_TIME="$response_time"
    HEALTH_URL="$health_url"

    echo "$health_status"
}

# Check port availability
check_port_status() {
    load_env
    local port="${PORT:-$DEFAULT_PORT}"

    if is_port_available "$port"; then
        PORT_STATUS="AVAILABLE"
    else
        PORT_STATUS="IN_USE"
    fi

    PORT_NUMBER="$port"
}

# Get log file information
get_log_info() {
    local app_log="$(get_app_log)"
    local error_log="$(get_error_log)"
    local startup_log="$(get_startup_log)"

    # App log info
    if [[ -f "$app_log" ]]; then
        APP_LOG_SIZE=$(stat -f%z "$app_log" 2>/dev/null || stat -c%s "$app_log" 2>/dev/null || echo "0")
        APP_LOG_MODIFIED=$(stat -f%m "$app_log" 2>/dev/null || stat -c%Y "$app_log" 2>/dev/null || echo "0")
        APP_LOG_EXISTS=true
    else
        APP_LOG_SIZE=0
        APP_LOG_MODIFIED=0
        APP_LOG_EXISTS=false
    fi

    # Error log info
    if [[ -f "$error_log" ]]; then
        ERROR_LOG_SIZE=$(stat -f%z "$error_log" 2>/dev/null || stat -c%s "$error_log" 2>/dev/null || echo "0")
        ERROR_LOG_LINES=$(wc -l < "$error_log" 2>/dev/null || echo "0")
        ERROR_LOG_EXISTS=true
    else
        ERROR_LOG_SIZE=0
        ERROR_LOG_LINES=0
        ERROR_LOG_EXISTS=false
    fi
}

# Calculate uptime
calculate_uptime() {
    if [[ -n "$PROCESS_START_TIME" ]] && command -v date >/dev/null 2>&1; then
        local start_epoch
        start_epoch=$(date -d "$PROCESS_START_TIME" +%s 2>/dev/null || echo "0")
        if [[ "$start_epoch" -gt 0 ]]; then
            local current_epoch
            current_epoch=$(date +%s)
            local uptime_seconds=$((current_epoch - start_epoch))

            local days=$((uptime_seconds / 86400))
            local hours=$(( (uptime_seconds % 86400) / 3600))
            local minutes=$(( (uptime_seconds % 3600) / 60))
            local seconds=$((uptime_seconds % 60))

            UPTIME_SECONDS="$uptime_seconds"
            UPTIME_DISPLAY="${days}d ${hours}h ${minutes}m ${seconds}s"
        fi
    fi
}

# Output results in JSON format
output_json() {
    cat << EOF
{
  "status": {
    "overall": "$OVERALL_STATUS",
    "process": "$PROCESS_STATUS",
    "health": "$HEALTH_STATUS"
  },
  "process": {
    "running": $([ "$PROCESS_STATUS" = "RUNNING" ] && echo "true" || echo "false"),
    "pid": ${PROCESS_PID:-null},
    "uptime_seconds": ${UPTIME_SECONDS:-null},
    "uptime_display": "${UPTIME_DISPLAY:-null}",
    "start_time": "${PROCESS_START_TIME:-null}",
    "cpu_percent": ${PROCESS_CPU:-null},
    "memory_mb": ${PROCESS_MEMORY_MB:-null}
  },
  "health": {
    "endpoint": "$HEALTH_URL",
    "status": "$HEALTH_STATUS",
    "response_time_ms": ${HEALTH_RESPONSE_TIME:-null},
    "response": ${HEALTH_RESPONSE:-null}
  },
  "network": {
    "port": ${PORT_NUMBER:-null},
    "port_status": "$PORT_STATUS"
  },
  "logs": {
    "app_log": {
      "exists": $APP_LOG_EXISTS,
      "size_bytes": $APP_LOG_SIZE,
      "path": "$(get_app_log)"
    },
    "error_log": {
      "exists": $ERROR_LOG_EXISTS,
      "size_bytes": $ERROR_LOG_SIZE,
      "lines": $ERROR_LOG_LINES,
      "path": "$(get_error_log)"
    }
  },
  "timestamp": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
EOF
}

# Output results in human-readable format
output_text() {
    if [[ "$QUIET_MODE" == "true" ]]; then
        # Minimal output
        echo "$OVERALL_STATUS"
        return
    fi

    echo "Food Bill Generator - Server Status"
    echo "====================================="
    echo

    # Overall status
    case "$OVERALL_STATUS" in
        "HEALTHY")
            log_success "Server is running and healthy"
            ;;
        "UNHEALTHY")
            log_error "Server is running but unhealthy"
            ;;
        "NOT_RUNNING")
            log_warning "Server is not running"
            ;;
        *)
            log_warning "Server status: $OVERALL_STATUS"
            ;;
    esac
    echo

    # Process information
    if [[ "$PROCESS_ONLY" != "true" ]] || [[ "$VERBOSE_MODE" == "true" ]]; then
        echo "Process Information:"
        if [[ "$PROCESS_STATUS" == "RUNNING" ]]; then
            echo "  Status: Running (PID: $PROCESS_PID)"
            [[ -n "$UPTIME_DISPLAY" ]] && echo "  Uptime: $UPTIME_DISPLAY"
            [[ -n "$PROCESS_START_TIME" ]] && echo "  Started: $PROCESS_START_TIME"
            [[ -n "$PROCESS_CPU" ]] && echo "  CPU Usage: ${PROCESS_CPU}%"
            [[ -n "$PROCESS_MEMORY_MB" ]] && echo "  Memory: ${PROCESS_MEMORY_MB}MB"
        else
            echo "  Status: Not running"
        fi
        echo
    fi

    # Health information
    if [[ "$HEALTH_ONLY" == "true" ]] || [[ "$VERBOSE_MODE" == "true" ]] || [[ "$PROCESS_STATUS" == "RUNNING" && "$PROCESS_ONLY" != "true" ]]; then
        echo "Health Check:"
        echo "  Endpoint: $HEALTH_URL"
        echo "  Status: $HEALTH_STATUS"
        [[ "$HEALTH_STATUS" != "CURL_UNAVAILABLE" && -n "$HEALTH_RESPONSE_TIME" ]] && echo "  Response Time: ${HEALTH_RESPONSE_TIME}ms"
        echo
    fi

    # Network information
    if [[ "$VERBOSE_MODE" == "true" ]]; then
        echo "Network:"
        echo "  Port: $PORT_NUMBER ($PORT_STATUS)"
        echo
    fi

    # Log information
    if [[ "$VERBOSE_MODE" == "true" ]]; then
        echo "Logs:"
        echo "  Application: $(get_app_log) (${APP_LOG_SIZE} bytes, exists: $APP_LOG_EXISTS)"
        echo "  Error: $(get_error_log) (${ERROR_LOG_SIZE} bytes, ${ERROR_LOG_LINES} lines, exists: $ERROR_LOG_EXISTS)"
        echo "  Startup: $(get_startup_log)"
    fi
}

# Main function
main() {
    # Parse arguments
    parse_arguments "$@"

    # Initialize globals
    PROCESS_STATUS=""
    HEALTH_STATUS=""
    OVERALL_STATUS=""

    # Don't setup full logging for status checks unless verbose
    if [[ "$VERBOSE_MODE" != "true" && "$JSON_OUTPUT" != "true" ]]; then
        # Minimal logging setup
        true
    else
        setup_logging "$@" >/dev/null 2>&1 || true
    fi

    # Get process status
    if [[ "$HEALTH_ONLY" != "true" ]]; then
        PROCESS_STATUS=$(get_process_status)
    fi

    # Get health status
    if [[ "$PROCESS_ONLY" != "true" ]]; then
        HEALTH_STATUS=$(perform_health_check)
    fi

    # Get additional information for verbose/JSON output
    if [[ "$VERBOSE_MODE" == "true" || "$JSON_OUTPUT" == "true" ]]; then
        check_port_status
        get_log_info
        calculate_uptime
    fi

    # Determine overall status
    if [[ "$HEALTH_ONLY" == "true" ]]; then
        OVERALL_STATUS="$HEALTH_STATUS"
    elif [[ "$PROCESS_ONLY" == "true" ]]; then
        OVERALL_STATUS="$PROCESS_STATUS"
    elif [[ "$PROCESS_STATUS" == "RUNNING" && "$HEALTH_STATUS" == "HEALTHY" ]]; then
        OVERALL_STATUS="HEALTHY"
    elif [[ "$PROCESS_STATUS" == "RUNNING" && "$HEALTH_STATUS" != "HEALTHY" ]]; then
        OVERALL_STATUS="UNHEALTHY"
    else
        OVERALL_STATUS="NOT_RUNNING"
    fi

    # Output results
    if [[ "$JSON_OUTPUT" == "true" ]]; then
        output_json
    else
        output_text
    fi

    # Set exit code
    case "$OVERALL_STATUS" in
        "HEALTHY"|"RUNNING")
            exit $EXIT_SUCCESS
            ;;
        "UNHEALTHY")
            exit $EXIT_HEALTH_CHECK_FAILED
            ;;
        "NOT_RUNNING")
            exit 1
            ;;
        *)
            exit $EXIT_GENERAL_ERROR
            ;;
    esac
}

# Run main function
main "$@"