/**
 * Copyright 2026 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

document.addEventListener('DOMContentLoaded', () => {
    const connectBtn = document.getElementById('connect-btn');
    const disconnectBtn = document.getElementById('disconnect-btn');
    const clearLogsBtn = document.getElementById('clear-logs-btn');
    const saveLogsBtn = document.getElementById('save-logs-btn');
    const connectionTypeSelect = document.getElementById('connection-type');
    const grpcSerializationSelect = document.getElementById('grpc-serialization');
    const grpcSendMethodSelect = document.getElementById('grpc-send-method');
    const grpcHeaderPathKeyInput = document.getElementById('grpc-header-path-key');
    const grpcHeaderPathInput = document.getElementById('grpc-header-path');
    const grpcTlsCheckbox = document.getElementById('grpc-tls');
    const grpcTlsLabel = document.getElementById('grpc-tls-label');
    const grpcTlsCaInput = document.getElementById('grpc-tls-ca-path');
    const grpcTlsCertInput = document.getElementById('grpc-tls-cert-path');
    const grpcTlsKeyInput = document.getElementById('grpc-tls-key-path');
    const hostInput = document.getElementById('host');
    const portInput = document.getElementById('port');
    const themeSelector = document.getElementById('theme-selector');
    const toggleConnectionLineBtn = document.getElementById('toggle-connection-line');
    const toggleViewRawBtn = document.getElementById('toggle-view-raw-btn');
    const cliBtn = document.getElementById('cli-btn');
    const toggleAutoscrollBtn = document.getElementById('toggle-autoscroll-btn');
    const toggleOrderBtn = document.getElementById('toggle-order-btn');
    const connectionControls = document.querySelector('.connection-controls');
    const grpcOptionsRow = document.querySelector('.grpc-options-row');
    const httpOptionsRow = document.querySelector('.http-options-row');
    const httpFormatSelect = document.getElementById('http-format');
    const httpTlsCheckbox = document.getElementById('http-tls');
    const httpTlsCaInput = document.getElementById('http-tls-ca-path');
    const httpTlsCertInput = document.getElementById('http-tls-cert-path');
    const httpTlsKeyInput = document.getElementById('http-tls-key-path');
    const httpPathInput = document.getElementById('http-path');
    const xmppOptionsRow = document.querySelector('.xmpp-options-row');
    const xmppTlsPolicySelect = document.getElementById('xmpp-tls-policy');
    const xmppConversationSelect = document.getElementById('xmpp-conversation');
    const xmppOptionsSummary = xmppOptionsRow?.querySelector('summary');
    const xmppCopySettingsBtn = document.getElementById('xmpp-copy-settings');
    const xmppCopyPasswordCheckbox = document.getElementById('xmpp-copy-password');
    const xmppReceivingJid = document.getElementById('xmpp-receiving-jid');
    const xmppValidationMessage = document.getElementById('xmpp-validation-message');
    const logs = document.getElementById('logs');
    const statusDisplay = document.getElementById('status');
    const activityStrip = document.getElementById('activity-strip');
    const activityToggleBtn = document.getElementById('activity-toggle-btn');
    const activityPinBtn = document.getElementById('activity-pin-btn');
    const activityConnectionFilterBtn = document.getElementById('activity-connection-filter-btn');
    const statusLineToggleBtn = document.getElementById('toggle-status-line-btn');
    const activityNewestBtn = document.getElementById('activity-newest-btn');
    const activityPreviousBtn = document.getElementById('activity-previous-btn');
    const activityNextBtn = document.getElementById('activity-next-btn');
    const activityOldestBtn = document.getElementById('activity-oldest-btn');
    const activityHistoryPosition = document.getElementById('activity-history-position');
    const activityTime = document.getElementById('activity-time');
    const lineCounter = document.getElementById('line-counter');
    const connectionDot = document.getElementById('connection-dot');
    const connectionText = document.getElementById('connection-text');
    const appStatusDot = document.getElementById('app-status-dot');
    const appStatusText = document.getElementById('app-status-text');

    const GRPC_SERIALIZATION_TOOLTIPS = {
        protobuf: 'gRPC Feature Serialization Format: Protobuf. Uses the ArcGIS Velocity external GrpcFeed protocol (velocity-grpc.proto) with typed Feature messages and google.protobuf.Any-wrapped attributes. Recommended for standard external Velocity gRPC interoperability.',
        kryo: 'gRPC Feature Serialization Format: Kryo. Uses the internal GrpcFeatureService protocol (feature-service.proto) where the bytes field carries raw binary feature payloads. Intended for internal-path compatibility and advanced testing.',
        text: 'gRPC Feature Serialization Format: Text. Uses the internal GrpcFeatureService protocol (feature-service.proto) where the bytes field carries plain UTF-8 text, typically a CSV line. Best for simple human-readable testing.',
    };

    const GRPC_SEND_METHOD_TOOLTIPS = {
        stream: 'gRPC RPC Type: Client Streaming. Opens a persistent client-streaming RPC and multiplexes all messages over a single long-lived HTTP/2 stream. The client writes multiple request messages before the server responds once. Ideal for high-throughput ingestion with minimal per-message overhead. Maps to Stream (GrpcFeed) or executeMulti (GrpcFeatureService).',
        unary: 'gRPC RPC Type: Unary. Each message is sent as a discrete request/response round-trip - one request in, one response out. The simplest gRPC call pattern, analogous to a traditional REST call. Easier to trace and debug, but incurs per-call overhead (HTTP/2 framing, header compression). Maps to Send (GrpcFeed) or execute (GrpcFeatureService).',
    };

    const HTTP_FORMAT_TOOLTIPS = {
        json: 'HTTP Format: JSON (application/json). The standard format for most HTTP feeds. Each request body is a JSON object or array of features.',
        delimited: 'HTTP Format: Delimited / CSV (text/plain). Each line is a comma-separated row of field values. Best for simple tabular data without nested structures.',
        'esri-json': 'HTTP Format: Esri JSON (application/json). Uses the Esri Feature JSON schema with geometry and attributes objects. Use when the Velocity HTTP Receiver expects ArcGIS-native feature format.',
        'geo-json': 'HTTP Format: GeoJSON (application/geo+json). Standard GeoJSON per RFC 7946 with FeatureCollection and Feature objects. Use when the receiver expects standard geospatial interchange format.',
        xml: 'HTTP Format: XML (application/xml). Sends data as XML-formatted payloads. Use when the Velocity HTTP Receiver is configured for XML input.',
    };

    function updateGrpcSerializationTooltip() {
        const tooltip = GRPC_SERIALIZATION_TOOLTIPS[grpcSerializationSelect.value] || GRPC_SERIALIZATION_TOOLTIPS.protobuf;
        grpcSerializationSelect.title = tooltip;
        grpcSerializationSelect.setAttribute('aria-label', tooltip);
    }

    function updateGrpcSendMethodTooltip() {
        const tooltip = GRPC_SEND_METHOD_TOOLTIPS[grpcSendMethodSelect.value] || GRPC_SEND_METHOD_TOOLTIPS.stream;
        grpcSendMethodSelect.title = tooltip;
        grpcSendMethodSelect.setAttribute('aria-label', tooltip);
    }

    function updateHttpFormatTooltip() {
        if (!httpFormatSelect) return;
        const tooltip = HTTP_FORMAT_TOOLTIPS[httpFormatSelect.value] || HTTP_FORMAT_TOOLTIPS.delimited;
        httpFormatSelect.title = tooltip;
        httpFormatSelect.setAttribute('aria-label', tooltip);
    }

    const WS_FORMAT_TOOLTIPS = {
        delimited: 'WebSocket Format: Delimited / CSV (text/plain). Each message is a comma-separated row of field values. Default format for ArcGIS Velocity WebSocket feeds.',
        json: 'WebSocket Format: JSON (application/json). Each message is a JSON object or array of features.',
        'esri-json': 'WebSocket Format: Esri JSON (application/json). Each message uses the Esri Feature JSON schema with geometry and attributes objects.',
        'geo-json': 'WebSocket Format: GeoJSON (application/geo+json). Each message is a GeoJSON FeatureCollection or Feature per RFC 7946.',
        xml: 'WebSocket Format: XML (application/xml). Each message is an XML-formatted payload.',
    };

    const XMPP_TLS_POLICY_TOOLTIPS = {
        required: 'XMPP TLS policy: Require STARTTLS and fail if TLS is unavailable',
        preferred: 'XMPP TLS policy: Prefer STARTTLS, but allow an unsecure connection when TLS is unavailable',
        disabled: 'XMPP TLS policy: Disable STARTTLS and use an unsecure connection',
    };

    const XMPP_CONVERSATION_TOOLTIPS = {
        direct: 'XMPP conversation: Receive direct messages addressed to this Logger',
        muc: 'XMPP conversation: Join and receive messages from a Multi-User Chat room',
    };

    function updateSelectTooltip(select, tooltips, fallback) {
        if (!select) return;
        const tooltip = tooltips[select.value] || tooltips[fallback];
        select.title = tooltip;
        select.dataset.tooltip = tooltip;
        select.setAttribute('aria-label', tooltip);
    }

    function updateXmppTlsPolicyTooltip() {
        updateSelectTooltip(xmppTlsPolicySelect, XMPP_TLS_POLICY_TOOLTIPS, 'required');
    }

    function updateXmppConversationTooltip() {
        updateSelectTooltip(xmppConversationSelect, XMPP_CONVERSATION_TOOLTIPS, 'direct');
    }

    function updateWsFormatTooltip() {
        const wsFormatEl = document.getElementById('ws-format');
        if (!wsFormatEl) return;
        const tooltip = WS_FORMAT_TOOLTIPS[wsFormatEl.value] || WS_FORMAT_TOOLTIPS.delimited;
        wsFormatEl.title = tooltip;
        wsFormatEl.setAttribute('aria-label', tooltip);
    }

    const CONNECTION_MODE_TOOLTIPS = {
        'tcp-server': 'TCP Server - listens on the specified port and accepts incoming TCP connections from clients.',
        'tcp-client': 'TCP Client - connects to a remote TCP server at the specified host and port to receive data.',
        'udp-server': 'UDP Server - binds to the specified port and receives incoming UDP datagrams.',
        'udp-client': 'UDP Client - sends UDP datagrams to the specified host and port.',
        'http-client': 'HTTP Client - sends data via HTTP/HTTPS POST requests to a remote endpoint.',
        'http-server': 'HTTP Server - starts a local HTTP/HTTPS server that accepts POST requests from clients.',
        'ws-client': 'WebSocket Client - connects to a remote WebSocket server (ws:// or wss://) and receives data as text frames.',
        'ws-server': 'WebSocket Server - starts a local WebSocket server that accepts incoming ws:// or wss:// connections.',
        'grpc-server': 'gRPC Server - starts a local gRPC server that accepts incoming RPC calls.',
        'grpc-client': 'gRPC Client - connects to a remote gRPC server using HTTP/2.',
        'xmpp-server': 'XMPP Server - hosts a focused in-process C2S service and receives direct or room message bodies.',
        'xmpp-client': 'XMPP Client - connects to an XMPP service and receives direct or Multi-User Chat message bodies.',
    };

    function updateConnectionModeTooltip() {
        const tooltip = CONNECTION_MODE_TOOLTIPS[connectionTypeSelect.value] || '';
        connectionTypeSelect.title = tooltip;
        connectionTypeSelect.setAttribute('aria-label', tooltip);
    }

    // Show/hide gRPC options row and individual controls based on connection type
    let grpcAutoHideTimer = null;

    function clearGrpcAutoHideTimer() {
        if (grpcAutoHideTimer) {
            clearTimeout(grpcAutoHideTimer);
            grpcAutoHideTimer = null;
        }
    }

    function startGrpcAutoHideTimer() {
        clearGrpcAutoHideTimer();
        grpcAutoHideTimer = setTimeout(() => {
            grpcOptionsRow.classList.add('auto-hidden');
            connectionControls.classList.add('grpc-row-hidden');
        }, 5000);
    }

    function showGrpcRow() {
        clearGrpcAutoHideTimer();
        grpcOptionsRow.classList.remove('auto-hidden');
        connectionControls.classList.remove('grpc-row-hidden');
    }

    // Hover zone: the whole .connection-controls wrapper (both rows)
    connectionControls.addEventListener('mouseenter', () => {
        if (grpcOptionsRow.classList.contains('visible')) {
            showGrpcRow();
        }
    });

    connectionControls.addEventListener('mouseleave', () => {
        if (grpcOptionsRow.classList.contains('visible')) {
            startGrpcAutoHideTimer();
        }
    });

    // Default ports per protocol
    const DEFAULT_PORTS = { tcp: 5565, udp: 5565, grpc: 5565, http: 8443, xmpp: 5222 };
    const HTTP_PORT_TLS_ON = 8443;
    const HTTP_PORT_TLS_OFF = 8080;
    let lastProtocolDefault = 5565;
    let currentAppStatusState = 'disconnected';
    let currentTlsTooltip = '';

    let previousConnectionWasXmpp = connectionTypeSelect.value.startsWith('xmpp');

    function updateGrpcRowVisibility() {
        const isGrpc = connectionTypeSelect.value.startsWith('grpc');
        const isGrpcClient = connectionTypeSelect.value === 'grpc-client';
        const isHttp = connectionTypeSelect.value.startsWith('http');
        const isWs = connectionTypeSelect.value.startsWith('ws');
        const isXmpp = connectionTypeSelect.value.startsWith('xmpp');
        const isXmppServer = connectionTypeSelect.value === 'xmpp-server';

        if (isGrpc) {
            grpcOptionsRow.classList.add('visible');
            connectionControls.classList.add('grpc-active');
            showGrpcRow();           // reset any previous auto-hidden state
            startGrpcAutoHideTimer(); // begin the 5-second countdown immediately
        } else {
            grpcOptionsRow.classList.remove('visible');
            grpcOptionsRow.classList.remove('auto-hidden');
            connectionControls.classList.remove('grpc-active');
            connectionControls.classList.remove('grpc-row-hidden');
            clearGrpcAutoHideTimer();
        }

        // HTTP options row
        if (httpOptionsRow) {
            httpOptionsRow.style.display = isHttp ? '' : 'none';
            if (isHttp) {
                const showTlsCerts = httpTlsCheckbox.checked;
                httpTlsCaInput.style.display = showTlsCerts ? '' : 'none';
                httpTlsCertInput.style.display = showTlsCerts ? '' : 'none';
                httpTlsKeyInput.style.display = showTlsCerts ? '' : 'none';
            }
        }

        // WebSocket options row
        const wsOptionsRow = document.querySelector('.ws-options-row');
        if (wsOptionsRow) {
            wsOptionsRow.style.display = isWs ? '' : 'none';
            if (isWs) {
                const wsTlsEl = document.getElementById('ws-tls');
                const showWsTlsCerts = wsTlsEl && wsTlsEl.checked;
                const wsCaEl = document.getElementById('ws-tls-ca-path');
                const wsCertEl = document.getElementById('ws-tls-cert-path');
                const wsKeyEl = document.getElementById('ws-tls-key-path');
                if (wsCaEl) wsCaEl.style.display = showWsTlsCerts ? '' : 'none';
                if (wsCertEl) wsCertEl.style.display = showWsTlsCerts ? '' : 'none';
                if (wsKeyEl) wsKeyEl.style.display = showWsTlsCerts ? '' : 'none';
                // Show optional controls (always visible when WS is selected)
                const wsSubEl = document.getElementById('ws-subscription-msg');
                const wsIgnoreLabel = document.getElementById('ws-ignore-first-msg-label');
                const wsHeadersEl = document.getElementById('ws-headers');
                if (wsSubEl) wsSubEl.style.display = '';
                if (wsIgnoreLabel) wsIgnoreLabel.style.display = '';
                if (wsHeadersEl) wsHeadersEl.style.display = '';
            }

        }

        if (xmppOptionsRow) {
            xmppOptionsRow.style.display = isXmpp ? '' : 'none';
            if (isXmpp) {
                if (!previousConnectionWasXmpp) xmppOptionsRow.open = true;
                xmppOptionsRow.querySelectorAll('.xmpp-client-only').forEach((element) => {
                    element.style.display = isXmppServer ? 'none' : '';
                });
                xmppOptionsRow.querySelectorAll('.xmpp-server-only').forEach((element) => {
                    element.style.display = isXmppServer ? '' : 'none';
                });
                const isMuc = xmppConversationSelect && xmppConversationSelect.value === 'muc';
                xmppOptionsRow.querySelectorAll('.xmpp-muc-only').forEach((element) => {
                    element.style.display = isMuc ? '' : 'none';
                });
            }
        }
        previousConnectionWasXmpp = isXmpp;

        grpcHeaderPathKeyInput.style.display = isGrpcClient ? '' : 'none';
        grpcHeaderPathInput.style.display = isGrpcClient ? '' : 'none';
        const showTlsCerts = isGrpc && grpcTlsCheckbox.checked;
        grpcTlsCaInput.style.display = showTlsCerts ? '' : 'none';
        grpcTlsCertInput.style.display = showTlsCerts ? '' : 'none';
        grpcTlsKeyInput.style.display = showTlsCerts ? '' : 'none';

        // Smart port switching
        const currentPort = parseInt(portInput.value, 10);
        const protocol = connectionTypeSelect.value.split('-')[0];
        let newDefault;
        if (isHttp || isWs) {
            const tlsEl = isHttp ? httpTlsCheckbox : document.getElementById('ws-tls');
            newDefault = (tlsEl && tlsEl.checked) ? HTTP_PORT_TLS_ON : HTTP_PORT_TLS_OFF;
        } else {
            newDefault = DEFAULT_PORTS[protocol] || 5565;
        }
        if (currentPort === lastProtocolDefault || isNaN(currentPort)) {
            portInput.value = newDefault;
        }
        lastProtocolDefault = newDefault;

        updateGrpcSerializationTooltip();
        updateConnectionModeTooltip();
        updateWsFormatTooltip();
        updateXmppTlsPolicyTooltip();
        updateXmppConversationTooltip();
        refreshTlsBadge();
    }

    connectionTypeSelect.addEventListener('change', updateGrpcRowVisibility);
    if (xmppConversationSelect) {
        xmppConversationSelect.addEventListener('change', () => {
            updateXmppConversationTooltip();
            updateGrpcRowVisibility();
        });
    }
    if (xmppTlsPolicySelect) {
        xmppTlsPolicySelect.addEventListener('change', () => {
            updateXmppTlsPolicyTooltip();
            refreshTlsBadge();
        });
    }
    if (xmppCopySettingsBtn) {
        xmppCopySettingsBtn.addEventListener('click', () => {
            const includePassword = Boolean(xmppCopyPasswordCheckbox?.checked);
            window.electronAPI.invoke('xmpp-copy-client-settings', { includePassword })
                .then((result) => {
                    if (!result?.success) throw new Error(result?.error || 'Could not copy XMPP client settings');
                    if (xmppCopyPasswordCheckbox) xmppCopyPasswordCheckbox.checked = false;
                    setStatus(`XMPP client settings copied${includePassword ? ' with password' : ' without password'}`, { category: 'system' });
                })
                .catch((error) => setStatus(`XMPP Server copy error: ${error.message}`, { category: 'connection' }));
        });
    }
    if (xmppOptionsRow && xmppOptionsSummary) {
        const updateXmppSummaryLabel = () => {
            xmppOptionsSummary.setAttribute('aria-label', `${xmppOptionsRow.open ? 'Collapse' : 'Expand'} XMPP options`);
        };
        xmppOptionsRow.addEventListener('toggle', updateXmppSummaryLabel);
        updateXmppSummaryLabel();
    }

    grpcSerializationSelect.addEventListener('change', updateGrpcSerializationTooltip);
    updateGrpcSerializationTooltip();

    grpcSendMethodSelect.addEventListener('change', updateGrpcSendMethodTooltip);
    updateGrpcSendMethodTooltip();

    if (httpFormatSelect) {
        httpFormatSelect.addEventListener('change', updateHttpFormatTooltip);
        updateHttpFormatTooltip();
    }

    const wsFormatSelect = document.getElementById('ws-format');
    if (wsFormatSelect) {
        wsFormatSelect.addEventListener('change', updateWsFormatTooltip);
        updateWsFormatTooltip();
    }

    connectionTypeSelect.addEventListener('change', updateConnectionModeTooltip);
    updateConnectionModeTooltip();

    grpcTlsCheckbox.addEventListener('change', () => {
        const isGrpc = connectionTypeSelect.value.startsWith('grpc');
        const show = isGrpc && grpcTlsCheckbox.checked;
        grpcTlsCaInput.style.display = show ? '' : 'none';
        grpcTlsCertInput.style.display = show ? '' : 'none';
        grpcTlsKeyInput.style.display = show ? '' : 'none';
        refreshTlsBadge();
    });

    // HTTP TLS checkbox handler
    if (httpTlsCheckbox) {
        httpTlsCheckbox.addEventListener('change', () => {
            const isHttp = connectionTypeSelect.value.startsWith('http');
            const show = isHttp && httpTlsCheckbox.checked;
            if (httpTlsCaInput) httpTlsCaInput.style.display = show ? '' : 'none';
            if (httpTlsCertInput) httpTlsCertInput.style.display = show ? '' : 'none';
            if (httpTlsKeyInput) httpTlsKeyInput.style.display = show ? '' : 'none';
            // Smart port switch between 8080 and 8443
            if (isHttp) {
                const currentPort = parseInt(portInput.value, 10);
                if (httpTlsCheckbox.checked && currentPort === HTTP_PORT_TLS_OFF) {
                    portInput.value = HTTP_PORT_TLS_ON;
                    lastProtocolDefault = HTTP_PORT_TLS_ON;
                } else if (!httpTlsCheckbox.checked && currentPort === HTTP_PORT_TLS_ON) {
                    portInput.value = HTTP_PORT_TLS_OFF;
                    lastProtocolDefault = HTTP_PORT_TLS_OFF;
                }
            }
            refreshTlsBadge();
        });
    }

    // WebSocket TLS checkbox handler
    const wsTlsCheckbox = document.getElementById('ws-tls');
    if (wsTlsCheckbox) {
        wsTlsCheckbox.addEventListener('change', () => {
            const isWs = connectionTypeSelect.value.startsWith('ws');
            const show = isWs && wsTlsCheckbox.checked;
            const wsCaEl = document.getElementById('ws-tls-ca-path');
            const wsCertEl = document.getElementById('ws-tls-cert-path');
            const wsKeyEl = document.getElementById('ws-tls-key-path');
            if (wsCaEl) wsCaEl.style.display = show ? '' : 'none';
            if (wsCertEl) wsCertEl.style.display = show ? '' : 'none';
            if (wsKeyEl) wsKeyEl.style.display = show ? '' : 'none';
            if (isWs) {
                const currentPort = parseInt(portInput.value, 10);
                if (wsTlsCheckbox.checked && currentPort === HTTP_PORT_TLS_OFF) {
                    portInput.value = HTTP_PORT_TLS_ON;
                    lastProtocolDefault = HTTP_PORT_TLS_ON;
                } else if (!wsTlsCheckbox.checked && currentPort === HTTP_PORT_TLS_ON) {
                    portInput.value = HTTP_PORT_TLS_OFF;
                    lastProtocolDefault = HTTP_PORT_TLS_OFF;
                }
            }
            refreshTlsBadge();
        });
    }

    // Apply initial gRPC row state on load (in case a gRPC mode is pre-selected)
    updateGrpcRowVisibility();

    // Helper for toggling connection line button state
    function setToggleConnectionLineState(isEnabled) {
        toggleConnectionLineBtn.dataset.enabled = isEnabled ? 'true' : 'false';
        toggleConnectionLineBtn.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
        const iconSpan = toggleConnectionLineBtn.querySelector('.button-icon');
        if (isEnabled) {
            toggleConnectionLineBtn.classList.add('active');
            connectionControls.classList.remove('hidden');
            if (iconSpan) iconSpan.className = 'button-icon icon-connection-hide';
            toggleConnectionLineBtn.title = 'Hide connection controls';
            toggleConnectionLineBtn.setAttribute('aria-label', 'Hide connection controls');
        } else {
            toggleConnectionLineBtn.classList.remove('active');
            connectionControls.classList.add('hidden');
            if (iconSpan) iconSpan.className = 'button-icon icon-connection-show';
            toggleConnectionLineBtn.title = 'Show connection controls';
            toggleConnectionLineBtn.setAttribute('aria-label', 'Show connection controls');
        }
        // Notify main process of state change to keep context menu synchronized
        window.electronAPI.send('connection-line-state-changed', isEnabled);
    }

    // Set initial state on load
    setToggleConnectionLineState(toggleConnectionLineBtn.dataset.enabled === 'true');

    let autoScroll = true;
    let listOrder = 'ascending'; // 'ascending' | 'descending'
    let logsBuffer = [];
    let headersBuffer = []; // parallel to logsBuffer: metadata line for each entry, or null
    let showMetadata = false; // mirrors the Show Metadata toggle state
    let lineCount = 0;
    // Expose lineCount globally for responsive UI in index.html
    window.lineCount = lineCount;
    let activityPinned = true;
    let activityExpanded = true;
    let activityConnectionFilterEnabled = true;
    let activityHasShown = false;
    let activityHideTimer = null;
    const activityHistory = [];
    let activityHistoryIndex = 0;

    function inferActivityCategory(message) {
        const text = String(message || '').toLowerCase();
        if (/token|auth|sign in|oauth|credential/.test(text)) return 'auth';
        if (/logs saved|saving logs|saved to/.test(text)) return 'system';
        if (/\b(tcp|udp|grpc|http|websocket|ws|wss|tls|ssl|certificate|cert|connect|connecting|connected|disconnect|disconnecting|disconnected|listen|listening|client|server|transport|endpoint|socket|port|host)\b/.test(text)) return 'connection';
        return 'activity';
    }

    function parseActivityMessage(message, options = {}) {
        const parts = message ? String(message).split(/\n\s+/) : [''];
        const category = options.category || inferActivityCategory(message);
        return {
            summary: parts[0] || 'Activity update',
            details: parts.slice(1),
            message: String(message || ''),
            timestamp: new Date(),
            category,
        };
    }

    function isConnectionActivity(item) {
        return Boolean(item && item.category === 'connection');
    }

    function getVisibleActivityHistory() {
        return activityConnectionFilterEnabled
            ? activityHistory.filter(isConnectionActivity)
            : activityHistory;
    }

    function formatActivityTimestamp(timestamp) {
        return {
            inline: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            date: timestamp.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
            time: timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short' }),
            full: timestamp.toLocaleString([], { dateStyle: 'full', timeStyle: 'medium' }),
        };
    }

    function getActivityVisualState(item) {
        const text = `${item.summary}\n${item.details.join('\n')}`;
        if (/error|failed|cannot/i.test(text)) return { icon: '⚠', kind: 'error' };
        if (/token|auth|velocity/i.test(text)) return { icon: '🔑', kind: 'auth' };
        if (/connected|saved|applied|enabled/i.test(text)) return { icon: '✓', kind: 'success' };
        return { icon: 'ⓘ', kind: 'info' };
    }

    function buildActivityTooltip(item) {
        const timestamp = formatActivityTimestamp(item.timestamp);
        const lines = [
            'Activity Strip',
            `Status: ${item.summary}`,
            `Date: ${timestamp.date}`,
            `Time: ${timestamp.time}`,
        ];
        if (item.details.length) {
            lines.push('---', 'Details:');
            item.details.forEach((detail) => lines.push(`- ${detail}`));
        }
        return lines.join('\n');
    }

    function isActivityVisible() {
        return Boolean(activityStrip && activityHasShown && !activityStrip.classList.contains('hidden'));
    }

    function updateStatusLineToggleState() {
        if (!statusLineToggleBtn) return;
        const hasActivity = activityHistory.length > 0;
        const visible = isActivityVisible();
        statusLineToggleBtn.disabled = !hasActivity;
        statusLineToggleBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
        statusLineToggleBtn.setAttribute('aria-label', visible ? 'Hide Activity Strip' : 'Show Activity Strip');
        statusLineToggleBtn.dataset.tooltip = visible ? 'Hide Activity Strip' : 'Show Activity Strip';
        statusLineToggleBtn.dataset.tooltipIcon = '▤';
        statusLineToggleBtn.dataset.tooltipKind = 'info';
    }

    function updateActivityHistoryControls() {
        const visibleHistory = getVisibleActivityHistory();
        const count = visibleHistory.length;
        const canGoNewer = count > 0 && activityHistoryIndex > 0;
        const canGoOlder = count > 0 && activityHistoryIndex < count - 1;

        if (activityNewestBtn) activityNewestBtn.disabled = !canGoNewer;
        if (activityPreviousBtn) activityPreviousBtn.disabled = !canGoNewer;
        if (activityNextBtn) activityNextBtn.disabled = !canGoOlder;
        if (activityOldestBtn) activityOldestBtn.disabled = !canGoOlder;
        if (activityHistoryPosition) {
            activityHistoryPosition.textContent = count ? `${activityHistoryIndex + 1} / ${count}` : '0 / 0';
            activityHistoryPosition.setAttribute('aria-label', count
                ? `Showing ${activityConnectionFilterEnabled ? 'connection ' : ''}activity ${activityHistoryIndex + 1} of ${count}, newest first`
                : (activityConnectionFilterEnabled ? 'No connection activity history yet' : 'No activity history yet'));
        }
    }

    function renderActivityHistoryItem() {
        const visibleHistory = getVisibleActivityHistory();
        if (activityHistoryIndex >= visibleHistory.length) activityHistoryIndex = Math.max(0, visibleHistory.length - 1);
        const item = visibleHistory[activityHistoryIndex];
        if (!item || !statusDisplay) {
            const emptySummary = activityConnectionFilterEnabled && activityHistory.length
                ? 'No connection activity yet'
                : 'No activity yet';
            if (statusDisplay) {
                statusDisplay.textContent = emptySummary;
                statusDisplay.dataset.tooltip = `Activity Strip\nStatus: ${emptySummary}\nFilter: ${activityConnectionFilterEnabled ? 'Connection activity only' : 'All activity'}`;
                statusDisplay.dataset.tooltipIcon = '🔌';
                statusDisplay.dataset.tooltipKind = 'info';
                statusDisplay.setAttribute('aria-label', emptySummary);
            }
            if (activityTime) activityTime.textContent = '';
            const content = document.getElementById('status-popover-content');
            if (content) content.textContent = '';
            if (activityStrip) activityStrip.classList.toggle('has-detail', false);
            const icon = document.getElementById('status-info-icon');
            if (icon) icon.textContent = '🔌';
            updateActivityHistoryControls();
            updateActivityStripState();
            updateStatusLineToggleState();
            return;
        }

        const hasDetail = item.details.length > 0;
        const timestamp = formatActivityTimestamp(item.timestamp);
        const visualState = getActivityVisualState(item);
        const activityTooltip = buildActivityTooltip(item);
        statusDisplay.textContent = item.summary;
        statusDisplay.dataset.tooltip = activityTooltip;
        statusDisplay.dataset.tooltipIcon = visualState.icon;
        statusDisplay.dataset.tooltipKind = visualState.kind;
        statusDisplay.setAttribute('aria-label', activityTooltip.replace(/\n+/g, ' '));
        if (activityTime) {
            activityTime.textContent = timestamp.inline;
            activityTime.dataset.tooltip = `Activity Time\nDate: ${timestamp.date}\nTime: ${timestamp.time}`;
            activityTime.dataset.tooltipIcon = '🕒';
            activityTime.dataset.tooltipKind = 'info';
            activityTime.setAttribute('aria-label', `Activity time ${timestamp.full}`);
        }
        const content = document.getElementById('status-popover-content');
        if (content) {
            content.textContent = hasDetail ? item.details.join('\n') : '';
        }
        if (activityStrip) {
            activityStrip.classList.toggle('has-detail', hasDetail);
        }
        const icon = document.getElementById('status-info-icon');
        if (icon) {
            icon.textContent = visualState.icon;
        }
        updateActivityHistoryControls();
        updateActivityStripState();
        updateStatusLineToggleState();
    }

    function showActivityHistory(index) {
        const visibleHistory = getVisibleActivityHistory();
        if (!activityHistory.length) return;
        activityHistoryIndex = visibleHistory.length
            ? Math.max(0, Math.min(index, visibleHistory.length - 1))
            : 0;
        if (activityStrip) activityStrip.classList.remove('hidden');
        activityHasShown = true;
        renderActivityHistoryItem();
        scheduleActivityAutoHide();
    }

    function updateActivityStripState() {
        if (!activityStrip) return;
        const isVisible = activityHasShown && !activityStrip.classList.contains('hidden');
        activityStrip.classList.toggle('pinned', activityPinned);
        activityStrip.classList.toggle('collapsed', !activityExpanded);
        activityStrip.classList.toggle('expanded', activityExpanded);
        document.body.classList.toggle('activity-strip-visible', isVisible);
        const hasDetail = activityStrip.classList.contains('has-detail');
        document.body.classList.toggle('activity-strip-collapsed', isVisible && (!activityExpanded || !hasDetail));

        if (activityToggleBtn) {
            activityToggleBtn.disabled = !hasDetail;
            activityToggleBtn.textContent = activityExpanded ? '⌃' : '⌄';
            activityToggleBtn.setAttribute('aria-expanded', activityExpanded ? 'true' : 'false');
            activityToggleBtn.setAttribute('aria-label', activityExpanded ? 'Collapse activity strip details' : 'Expand activity strip details');
            activityToggleBtn.dataset.tooltip = activityExpanded
                ? (hasDetail ? 'Collapse activity strip details and keep only the summary visible.' : 'No additional activity details are available for this update.')
                : 'Expand activity strip details.';
            activityToggleBtn.dataset.tooltipIcon = activityExpanded ? '⌃' : '⌄';
            activityToggleBtn.dataset.tooltipKind = 'info';
        }

        if (activityPinBtn) {
            const icon = activityPinBtn.querySelector('.button-icon');
            activityPinBtn.classList.toggle('active', activityPinned);
            if (icon) {
                icon.className = `button-icon ${activityPinned ? 'icon-activity-pin' : 'icon-activity-pin-off'}`;
            }
            activityPinBtn.setAttribute('aria-pressed', activityPinned ? 'true' : 'false');
            activityPinBtn.setAttribute('aria-label', activityPinned ? 'Unpin activity strip' : 'Pin activity strip');
            activityPinBtn.dataset.tooltip = activityPinned
                ? 'Activity strip is pinned and will stay visible. Click to auto-hide future activity updates.'
                : 'Activity strip will auto-hide after updates. Click to keep it pinned open.';
            activityPinBtn.dataset.tooltipIcon = activityPinned ? '📌' : '📍';
            activityPinBtn.dataset.tooltipKind = 'info';
        }

        if (activityConnectionFilterBtn) {
            const icon = activityConnectionFilterBtn.querySelector('.button-icon');
            activityConnectionFilterBtn.classList.toggle('active', activityConnectionFilterEnabled);
            if (icon) {
                icon.className = `button-icon ${activityConnectionFilterEnabled ? 'icon-activity-connection-filter' : 'icon-activity-connection-filter-off'}`;
            }
            activityConnectionFilterBtn.setAttribute('aria-pressed', activityConnectionFilterEnabled ? 'true' : 'false');
            activityConnectionFilterBtn.setAttribute('aria-label', activityConnectionFilterEnabled ? 'Show all activity lines' : 'Show connection activity only');
            activityConnectionFilterBtn.dataset.tooltip = activityConnectionFilterEnabled
                ? 'Connection activity filter is on. Only connection, transport, and TLS status lines are shown. Click to show all activity lines.'
                : 'Connection activity filter is off. All Activity Strip lines are shown. Click to show only connection, transport, and TLS status lines.';
            activityConnectionFilterBtn.dataset.tooltipIcon = activityConnectionFilterEnabled ? '🔌' : '☰';
            activityConnectionFilterBtn.dataset.tooltipKind = 'info';
        }
        updateActivityHistoryControls();
        updateStatusLineToggleState();
    }

    function scheduleActivityAutoHide() {
        clearTimeout(activityHideTimer);
        if (!activityStrip || activityPinned) return;
        activityHideTimer = setTimeout(() => {
            if (activityPinned) return;
            activityStrip.classList.add('hidden');
            updateActivityStripState();
        }, 5200);
    }

    function revealActivityStrip() {
        if (!activityStrip) return;
        activityHasShown = true;
        activityStrip.classList.remove('hidden');
        updateActivityStripState();
        scheduleActivityAutoHide();
    }

    function setActivityPinned(pinned) {
        activityPinned = Boolean(pinned);
        if (activityPinned && activityStrip) {
            clearTimeout(activityHideTimer);
            activityHasShown = true;
            activityStrip.classList.remove('hidden');
        }
        updateActivityStripState();
        scheduleActivityAutoHide();
    }

    function setActivityExpanded(expanded) {
        activityExpanded = Boolean(expanded);
        if (activityStrip && activityHasShown) activityStrip.classList.remove('hidden');
        updateActivityStripState();
    }

    function setActivityConnectionFilter(enabled) {
        activityConnectionFilterEnabled = Boolean(enabled);
        activityHistoryIndex = 0;
        renderActivityHistoryItem();
        if (activityStrip && activityHasShown) activityStrip.classList.remove('hidden');
        updateActivityStripState();
    }

    // Define application statuses
    const Status = {
        CONNECTED: 'Connected',
        DISCONNECTED: 'Disconnected',
        CONNECTING: 'Connecting',
        DISCONNECTING: 'Disconnecting',
        ERROR: 'Error',
    };

    // Map statuses to corresponding emoji characters
    const stateEmojis = {
        'disconnected': '🔴',
        'connected': '🟢',
        'connecting': '🟡',
        'disconnecting': '🟠',
        'error': '⚠️'
    };

    /**
     * Converts a raw tlsInfo string (from transport connect results) into a concise,
     * human-readable tooltip for the status bar "connected" indicator.
     * @param {string} raw - The raw tlsInfo string
     * @returns {string}
     */
    function tlsInfoToTooltip(raw) {
        if (!raw) return '';
        if (/tls=off/i.test(raw)) {
            return 'TLS Off — this connection is plaintext and unsecure.\nEncryption: No.\nCertificate trust: Not applicable.\nAuthentication is shown separately by the key badge.';
        }
        if (/self-signed/i.test(raw)) {
            return 'TLS Self-Signed — traffic is encrypted, but the certificate is not CA-verified.\nEncryption: Yes.\nCertificate trust: Self-signed or local-only; peer identity is not fully verified.\nUse this for development/testing, not production.';
        }
        if (/cert verification skipped/i.test(raw)) {
            return 'TLS Verification Skipped — traffic is encrypted, but certificate authority checks are disabled.\nEncryption: Yes.\nCertificate trust: Not verified; peer identity is unverified.\nUse this only for development or trusted private networks.';
        }
        if (/mtls|client.*cert|cert.*client/i.test(raw)) {
            return 'Mutual TLS — encrypted connection with certificate-based client authentication.\nEncryption: Yes.\nCertificate trust: Client and server certificates are used.\nToken authentication is shown separately by the key badge.';
        }
        if (/custom certs/i.test(raw)) {
            return 'TLS Verified — encrypted connection with a certificate chain validated by a custom CA.\nEncryption: Yes.\nCertificate trust: Verified against the configured CA certificate.\nAuthentication is shown separately by the key badge.';
        }
        if (/tls=on/i.test(raw)) {
            return 'TLS On — traffic is encrypted.\nEncryption: Yes.\nCertificate trust: Uses the OS trust store or configured TLS options.\nAuthentication is shown separately by the key badge.';
        }
        return raw;
    }

    function getSelectedTlsControl() {
        const value = connectionTypeSelect.value || '';
        const mode = value.endsWith('-server') ? 'Server' : 'Client';
        if (value.startsWith('grpc')) {
            return { checkbox: grpcTlsCheckbox, protocol: 'gRPC', mode, secureName: 'TLS', unsecureName: 'unsecure gRPC' };
        }
        if (value.startsWith('http')) {
            return { checkbox: httpTlsCheckbox, protocol: 'HTTP', mode, secureName: 'HTTPS', unsecureName: 'HTTP' };
        }
        if (value.startsWith('ws')) {
            return { checkbox: wsTlsCheckbox, protocol: 'WebSocket', mode, secureName: 'WSS', unsecureName: 'WS' };
        }
        if (value.startsWith('xmpp')) {
            return {
                protocol: 'XMPP',
                mode,
                secureName: 'STARTTLS',
                unsecureName: 'unsecure XMPP',
                enabled: xmppTlsPolicySelect?.value !== 'disabled',
                toggle() {
                    xmppTlsPolicySelect.value = this.enabled ? 'disabled' : 'required';
                    xmppTlsPolicySelect.dispatchEvent(new Event('change'));
                },
            };
        }
        return null;
    }

    function isSelectedTlsEnabled(selected) {
        return selected?.checkbox ? selected.checkbox.checked : Boolean(selected?.enabled);
    }

    function canToggleTlsFromFooter() {
        return currentAppStatusState === 'disconnected' || currentAppStatusState === 'error';
    }

    function getConfiguredTlsTooltip() {
        const selected = getSelectedTlsControl();
        if (!selected) return '';

        const enabled = isSelectedTlsEnabled(selected);
        const canToggle = canToggleTlsFromFooter();
        const endpoint = `${hostInput.value || 'host'}:${portInput.value || 'port'}`;
        const action = canToggle
            ? `Click to turn TLS ${enabled ? 'off' : 'on'} for ${selected.protocol} ${selected.mode}.`
            : `Disconnect before changing TLS for this ${selected.protocol} ${selected.mode} connection.`;

        if (selected.protocol === 'XMPP' && xmppTlsPolicySelect?.value === 'preferred') {
            return `STARTTLS Opportunistic — XMPP ${selected.mode} will prefer encryption but may continue unsecure.\nScope: New XMPP connections only.\nEncryption: Not guaranteed.\nCertificate trust: Checked only when STARTTLS is established.\nEndpoint: ${endpoint}.\nAction: ${action}\nAuth: XMPP account credentials are configured separately.`;
        }
        if (enabled) {
            return `TLS Configured — ${selected.protocol} ${selected.mode} will use ${selected.secureName} on the next connection.\nScope: New ${selected.protocol} connections only.\nEncryption: Enabled in the UI.\nCertificate trust: Checked after connection.\nEndpoint: ${endpoint}.\nAction: ${action}\nAuth: Token status is shown separately by the key badge.`;
        }

        return `TLS Off — ${selected.protocol} ${selected.mode} will use ${selected.unsecureName} / plaintext on the next connection.\nScope: New ${selected.protocol} connections only.\nEncryption: No.\nCertificate trust: Not applicable.\nEndpoint: ${endpoint}.\nAction: ${action}\nAuth: Token status is shown separately by the key badge.`;
    }

    function getTlsBadgeTooltipForStatus(statusState) {
        if (statusState === 'connected' && currentTlsTooltip && getSelectedTlsControl()) return currentTlsTooltip;
        return getConfiguredTlsTooltip();
    }

    function refreshTlsBadge() {
        updateTlsBadge(getTlsBadgeTooltipForStatus(currentAppStatusState));
    }

    const velocityAuthUtils = window.VelocityAuthUtils || {};
    const shouldSendVelocityTokenByDefault = velocityAuthUtils.shouldSendVelocityTokenByDefault || (() => false);
    const describeVelocityAuthType = velocityAuthUtils.describeVelocityAuthType || ((authType) => authType || 'not specified');
    let velocityAuthState = {
        hasToken: false,
        tokenSendingEnabled: false,
        contextLabel: 'No output selected',
        authType: 'token',
        expires: 0,
        error: '',
    };

    function formatTokenExpiry(expires) {
        if (!expires) return 'Unknown';
        const date = new Date(expires);
        if (Number.isNaN(date.getTime())) return 'Unknown';
        return date.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
    }

    function updateAuthBadge(nextState = {}) {
        velocityAuthState = { ...velocityAuthState, ...nextState };
        const wrapper = document.getElementById('auth-badge-wrapper');
        const badge = document.getElementById('auth-badge');
        const icon = document.getElementById('auth-badge-icon');
        const label = document.getElementById('auth-badge-label');
        const content = document.getElementById('auth-badge-content');
        if (!badge) return;

        if (!velocityAuthState.hasToken && !velocityAuthState.error) {
            if (wrapper) wrapper.style.display = 'none';
            badge.style.display = 'none';
            badge.classList.remove('pinned');
            return;
        }

        const isError = Boolean(velocityAuthState.error);
        const isOn = velocityAuthState.hasToken && velocityAuthState.tokenSendingEnabled && !isError;
        const state = isError ? 'error' : (isOn ? 'on' : 'off');
        const iconText = isError ? '⚠' : (isOn ? '🔑' : '◇');
        const labelText = isError ? 'Token Error' : (isOn ? 'Token On' : 'Token Off');
        const actionText = isOn
            ? 'Click to turn token sending off for new client connections.'
            : 'Click to turn token sending on for new client connections.';
        const tooltip = isError
            ? `Token Error — Velocity token refresh failed.\nToken: Hidden for security.\nStatus: ${velocityAuthState.error}\nAction: Sign in again if reconnecting fails.`
            : `${labelText} — ${isOn ? 'Velocity token will be sent with new gRPC, HTTP, and WebSocket client connections.' : 'A Velocity token is available, but it will not be sent with new client connections.'}\nScope: New client connections only.\nToken: Hidden for security.\nSelected output: ${velocityAuthState.contextLabel}.\nAuth type: ${describeVelocityAuthType(velocityAuthState.authType)}.\nExpires: ${formatTokenExpiry(velocityAuthState.expires)}.\nAction: ${actionText}`;

        badge.dataset.authState = state;
        badge.dataset.tooltip = tooltip;
        badge.dataset.tooltipIcon = isError ? '⚠' : '🔑';
        badge.dataset.tooltipKind = isError ? 'error' : 'auth';
        badge.setAttribute('aria-label', tooltip.replace(/\n+/g, ' '));
        badge.setAttribute('aria-pressed', isOn ? 'true' : 'false');
        if (wrapper) wrapper.style.display = 'flex';
        badge.style.display = 'flex';
        if (icon) icon.textContent = iconText;
        if (label) label.textContent = labelText;
        if (content) content.textContent = tooltip;
    }

    function setVelocityTokenSending(enabled, logChange = true) {
        updateAuthBadge({ tokenSendingEnabled: enabled, error: '' });
        window.electronAPI.send('velocity:set-token-sending', enabled);
        if (logChange) {
            setStatus(enabled
                ? '🔑 Velocity token sending enabled for new client connections'
                : '◇ Velocity token sending disabled for new client connections', { category: 'auth' });
        }
    }

    function updateAuthFromVelocityItem(item) {
        const tokenSendingEnabled = shouldSendVelocityTokenByDefault(item);
        updateAuthBadge({
            hasToken: true,
            tokenSendingEnabled,
            contextLabel: item.tokenOnly ? 'Custom connection settings (no output selected)' : (item.label || item.id || 'Selected output'),
            authType: item.authType || (tokenSendingEnabled ? 'token' : 'none'),
            error: '',
        });
    }

    /**
     * Updates the TLS trust badge in the status bar center.
     * Shows a lock icon whose colour reflects the trust level, with a hover/click popover.
     * Pass '' to hide the badge (disconnected / no-TLS protocols).
     * @param {string} tooltip - The human-readable TLS tooltip, or '' to hide
     */
    function updateTlsBadge(tooltip) {
        const badge   = document.getElementById('tls-badge');
        const icon    = document.getElementById('tls-badge-icon');
        const content = document.getElementById('tls-badge-content');
        if (!badge) return;

        if (!tooltip) {
            badge.style.display = 'none';
            badge.classList.remove('pinned');
            return;
        }

        // Each trust level gets a visually distinct icon so it is distinguishable
        // without relying on colour alone (colour-blindness accessibility).
        // 🔓 open lock  = no TLS (plaintext)
        // 🔒⚠          = TLS on, self-signed / cert-chain not verified
        // 🔐            = mTLS - key icon signals mutual authentication
        // 🔒✓           = TLS on, CA-verified certificate chain
        let trust, iconChar;
        if (/opportunistic|not guaranteed/i.test(tooltip)) {
            trust = 'opportunistic'; iconChar = '⚠';
        } else if (/tls configured|enabled in the ui|checked after connection/i.test(tooltip)) {
            trust = 'configured';  iconChar = '🔒…';
        } else if (/tls.*off|unsecure|plaintext/i.test(tooltip)) {
            trust = 'off';         iconChar = '🔓';
        } else if (/self-signed|verification.*skip/i.test(tooltip)) {
            trust = 'self-signed'; iconChar = '🔒⚠';
        } else if (/mtls|mutual/i.test(tooltip)) {
            trust = 'mtls';        iconChar = '🔐';
        } else if (/ca-verified|custom ca/i.test(tooltip)) {
            trust = 'ca-verified'; iconChar = '🔒✓';
        } else {
            trust = 'on';          iconChar = '🔒';
        }

        badge.dataset.trust = trust;
        badge.dataset.tlsToggleable = canToggleTlsFromFooter() && getSelectedTlsControl() ? 'true' : 'false';
        badge.dataset.tooltip = tooltip;
        badge.dataset.tooltipIcon = iconChar;
        badge.dataset.tooltipKind = ['off', 'self-signed', 'opportunistic'].includes(trust) ? 'warning' : 'secure';
        badge.setAttribute('aria-label', tooltip.replace(/\n+/g, ' '));
        const selected = getSelectedTlsControl();
        badge.setAttribute('aria-pressed', isSelectedTlsEnabled(selected) ? 'true' : 'false');
        badge.style.display = 'flex';
        if (icon)    icon.textContent    = iconChar;
        if (content) content.textContent = tooltip;
    }

    // Function to update the application status display
    function setAppStatus(status) {
        const statusState = status.toLowerCase();
        currentAppStatusState = statusState;

        // Update status text
        appStatusText.textContent = status;
        appStatusText.setAttribute('data-state', statusState);
        // Update TLS badge: configured state while disconnected, actual trust when connected.
        refreshTlsBadge();

        // Update status emoji
        appStatusDot.textContent = stateEmojis[statusState] || '⭐'; // Default to a star if state is unknown
        appStatusDot.setAttribute('data-state', statusState);
    }

    // Initialize app status on load
    setAppStatus(Status.DISCONNECTED);

    // Error Dialog Elements
    const errorDialog = document.getElementById('error-dialog');
    const errorMessage = document.getElementById('error-message');
    const errorCloseBtn = document.getElementById('error-close-btn');

    function setConnectionControls(state) {
        if (state === 'connected') {
            connectBtn.disabled = true;
            disconnectBtn.disabled = false;
            connectionTypeSelect.disabled = true;
            grpcSerializationSelect.disabled = true;
            grpcSendMethodSelect.disabled = true;
            grpcHeaderPathKeyInput.disabled = true;
            grpcHeaderPathInput.disabled = true;
            grpcTlsCheckbox.disabled = true;
            grpcTlsCaInput.disabled = true;
            grpcTlsCertInput.disabled = true;
            grpcTlsKeyInput.disabled = true;
            hostInput.disabled = true;
            portInput.disabled = true;
        } else if (state === 'connecting') {
            connectBtn.disabled = true;
            disconnectBtn.disabled = false; // Allow user to cancel
            connectionTypeSelect.disabled = true;
            grpcSerializationSelect.disabled = true;
            grpcSendMethodSelect.disabled = true;
            grpcHeaderPathKeyInput.disabled = true;
            grpcHeaderPathInput.disabled = true;
            grpcTlsCheckbox.disabled = true;
            grpcTlsCaInput.disabled = true;
            grpcTlsCertInput.disabled = true;
            grpcTlsKeyInput.disabled = true;
            hostInput.disabled = true;
            portInput.disabled = true;
        } else if (state === 'disconnecting') {
            connectBtn.disabled = true;
            disconnectBtn.disabled = true; // Prevent multiple disconnect attempts
            connectionTypeSelect.disabled = true;
            grpcSerializationSelect.disabled = true;
            grpcSendMethodSelect.disabled = true;
            grpcHeaderPathKeyInput.disabled = true;
            grpcHeaderPathInput.disabled = true;
            grpcTlsCheckbox.disabled = true;
            grpcTlsCaInput.disabled = true;
            grpcTlsCertInput.disabled = true;
            grpcTlsKeyInput.disabled = true;
            hostInput.disabled = true;
            portInput.disabled = true;
        } else { // disconnected, error
            connectBtn.disabled = false;
            disconnectBtn.disabled = true;
            connectionTypeSelect.disabled = false;
            grpcSerializationSelect.disabled = false;
            grpcSendMethodSelect.disabled = false;
            grpcHeaderPathKeyInput.disabled = false;
            grpcHeaderPathInput.disabled = false;
            grpcTlsCheckbox.disabled = false;
            grpcTlsCaInput.disabled = false;
            grpcTlsCertInput.disabled = false;
            grpcTlsKeyInput.disabled = false;
            hostInput.disabled = false;
            portInput.disabled = false;
        }
        if (xmppOptionsRow) {
            xmppOptionsRow.querySelectorAll('input:not(#xmpp-copy-password), select, button:not(#xmpp-copy-settings)').forEach((control) => {
                control.disabled = state !== 'disconnected' && state !== 'error';
            });
        }
        const canCopyXmppSettings = state === 'connected' && connectionTypeSelect.value === 'xmpp-server';
        if (xmppCopySettingsBtn) xmppCopySettingsBtn.disabled = !canCopyXmppSettings;
        if (xmppCopyPasswordCheckbox) xmppCopyPasswordCheckbox.disabled = !canCopyXmppSettings;
        updateConnectionStatusIndicator(state === 'connected');
    }

    function clearXmppValidation() {
        if (!xmppOptionsRow) return;
        xmppOptionsRow.querySelectorAll('[aria-invalid="true"]').forEach((element) => {
            element.setAttribute('aria-invalid', 'false');
        });
        hostInput.setAttribute('aria-invalid', 'false');
        portInput.setAttribute('aria-invalid', 'false');
        if (xmppValidationMessage) {
            xmppValidationMessage.hidden = true;
            xmppValidationMessage.textContent = '';
        }
    }

    function validateXmppConnection(type, host, port) {
        clearXmppValidation();
        const required = [
            ['xmpp-domain', 'Domain'],
            ...(type === 'server'
                ? [['xmpp-external-username', 'External user'], ['xmpp-external-password', 'External password']]
                : [['xmpp-username', 'Username'], ['xmpp-password', 'Password']]),
            ...(xmppConversationSelect?.value === 'muc'
                ? [['xmpp-room', 'Room'], ['xmpp-nickname', 'Nickname']]
                : []),
        ];
        let invalidElement = null;
        let message = '';
        for (const [id, label] of required) {
            const element = document.getElementById(id);
            if (!element?.value) {
                element?.setAttribute('aria-invalid', 'true');
                invalidElement ||= element;
                message ||= `${label} is required for XMPP ${type === 'server' ? 'Server' : 'Client'} mode.`;
            }
        }
        if (!host) {
            hostInput.setAttribute('aria-invalid', 'true');
            invalidElement ||= hostInput;
            message ||= 'Host is required for XMPP.';
        }
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
            portInput.setAttribute('aria-invalid', 'true');
            invalidElement ||= portInput;
            message ||= 'Port must be an integer from 1 through 65535 for XMPP.';
        }
        const cert = document.getElementById('xmpp-tls-cert-path')?.value;
        const key = document.getElementById('xmpp-tls-key-path')?.value;
        if (type === 'server' && Boolean(cert) !== Boolean(key)) {
            const missing = cert ? document.getElementById('xmpp-tls-key-path') : document.getElementById('xmpp-tls-cert-path');
            missing?.setAttribute('aria-invalid', 'true');
            invalidElement ||= missing;
            message ||= 'Certificate and Key must be provided together for XMPP Server TLS.';
        }
        const allowRemote = document.getElementById('xmpp-allow-remote');
        const normalizedHost = String(host || '').trim().replace(/^\[|\]$/g, '').toLowerCase();
        const isLoopback = normalizedHost === 'localhost' ||
            normalizedHost === '::1' ||
            normalizedHost.startsWith('127.');
        if (type === 'server' && host && !isLoopback && !allowRemote?.checked) {
            allowRemote?.setAttribute('aria-invalid', 'true');
            invalidElement ||= allowRemote;
            message ||= 'Enable Allow remote to bind the XMPP Server Host outside loopback.';
        }
        if (invalidElement) {
            xmppOptionsRow.open = true;
            if (xmppValidationMessage) {
                xmppValidationMessage.textContent = message;
                xmppValidationMessage.hidden = false;
            }
            setStatus(`XMPP validation error: ${message}`, { category: 'connection' });
            invalidElement.focus();
            return false;
        }
        return true;
    }

    function updateConnectionStatusIndicator(isConnected) {
        if (isConnected) {
            connectionDot.classList.add('connected');
            connectionText.textContent = 'Connected';
        } else {
            connectionDot.classList.remove('connected');
            connectionText.textContent = 'Disconnected';
        }
    }

    function showErrorDialog(message) {
        errorMessage.textContent = message;
        if (errorDialog) {
            errorDialog.style.display = 'flex';
        }
    }

    function hideErrorDialog() {
        if (errorDialog) {
            errorDialog.style.display = 'none';
        }
    }

    // Close error dialog on Escape and when clicking outside content
    window.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && errorDialog && errorDialog.style.display !== 'none') {
            hideErrorDialog();
        }
    });

    if (errorDialog) {
        errorDialog.addEventListener('click', (e) => {
            if (e.target === errorDialog) {
                hideErrorDialog();
            }
        });
    }

    function applyFontSettings(font) {
      if (font && font.size) {
        logs.style.fontSize = font.size;
      }
      if (font && font.family) {
        logs.style.fontFamily = font.family;
      }
    }

    // Load saved theme from config
    window.electronAPI.on('load-saved-theme', (theme) => {
        if (window.themeLoader) {
            window.themeLoader.loadTheme(theme);
        } else {
            // Fallback to old method if theme loader is not available
            document.body.className = `theme-${theme}`;
        }
        themeSelector.value = theme;
    });

    // Load saved font settings
    window.electronAPI.on('load-saved-font', (font) => {
      applyFontSettings(font);
    });

    // Apply CLI presets for UI prepopulation
    window.electronAPI.on('cli-presets', (presets) => {
        if (!presets) return;
        if (presets.protocol || presets.mode) {
            const p = (presets.protocol || 'tcp').toLowerCase();
            const m = (presets.mode || 'server').toLowerCase();
            connectionTypeSelect.value = `${p}-${m}`;
            connectionTypeSelect.dispatchEvent(new Event('change'));
        }
        if (presets.ip !== undefined) hostInput.value = presets.ip;
        if (presets.port !== undefined) portInput.value = presets.port;
        if (presets.grpcSerialization !== undefined) grpcSerializationSelect.value = presets.grpcSerialization;
        if (presets.grpcSendMethod !== undefined) grpcSendMethodSelect.value = presets.grpcSendMethod;
        if (presets.grpcHeaderPathKey !== undefined) grpcHeaderPathKeyInput.value = presets.grpcHeaderPathKey;
        if (presets.grpcHeaderPath !== undefined) grpcHeaderPathInput.value = presets.grpcHeaderPath;
        if (presets.useTls !== undefined) {
            grpcTlsCheckbox.checked = presets.useTls === true || presets.useTls === 'true';
            grpcTlsCheckbox.dispatchEvent(new Event('change'));
        }
        if (presets.tlsCaPath) grpcTlsCaInput.value = presets.tlsCaPath;
        if (presets.tlsCertPath) grpcTlsCertInput.value = presets.tlsCertPath;
        if (presets.tlsKeyPath) grpcTlsKeyInput.value = presets.tlsKeyPath;

        // HTTP presets
        if (presets.httpFormat !== undefined && httpFormatSelect) {
            httpFormatSelect.value = presets.httpFormat;
            httpFormatSelect.dispatchEvent(new Event('change'));
        }
        if (presets.httpTls !== undefined && httpTlsCheckbox) {
            httpTlsCheckbox.checked = presets.httpTls === true || presets.httpTls === 'true';
            httpTlsCheckbox.dispatchEvent(new Event('change'));
        }
        if (presets.httpPath !== undefined && httpPathInput) httpPathInput.value = presets.httpPath;
        if (presets.httpTlsCaPath && httpTlsCaInput) httpTlsCaInput.value = presets.httpTlsCaPath;
        if (presets.httpTlsCertPath && httpTlsCertInput) httpTlsCertInput.value = presets.httpTlsCertPath;
        if (presets.httpTlsKeyPath && httpTlsKeyInput) httpTlsKeyInput.value = presets.httpTlsKeyPath;

        // WebSocket presets
        const wsFormatEl = document.getElementById('ws-format');
        const wsTlsEl = document.getElementById('ws-tls');
        const wsPathEl = document.getElementById('ws-path');
        const wsTlsCaEl = document.getElementById('ws-tls-ca-path');
        const wsTlsCertEl = document.getElementById('ws-tls-cert-path');
        const wsTlsKeyEl = document.getElementById('ws-tls-key-path');
        const wsSubMsgEl = document.getElementById('ws-subscription-msg');
        const wsIgnoreEl = document.getElementById('ws-ignore-first-msg');
        const wsHeadersEl = document.getElementById('ws-headers');
        if (presets.wsFormat !== undefined && wsFormatEl) {
            wsFormatEl.value = presets.wsFormat;
            wsFormatEl.dispatchEvent(new Event('change'));
        }
        if (presets.wsTls !== undefined && wsTlsEl) {
            wsTlsEl.checked = presets.wsTls === true || presets.wsTls === 'true';
            wsTlsEl.dispatchEvent(new Event('change'));
        }
        if (presets.wsPath !== undefined && wsPathEl) wsPathEl.value = presets.wsPath;
        if (presets.wsTlsCaPath && wsTlsCaEl) wsTlsCaEl.value = presets.wsTlsCaPath;
        if (presets.wsTlsCertPath && wsTlsCertEl) wsTlsCertEl.value = presets.wsTlsCertPath;
        if (presets.wsTlsKeyPath && wsTlsKeyEl) wsTlsKeyEl.value = presets.wsTlsKeyPath;
        if (presets.wsSubscriptionMsg !== undefined && wsSubMsgEl) wsSubMsgEl.value = presets.wsSubscriptionMsg;
        if (presets.wsIgnoreFirstMsg !== undefined && wsIgnoreEl) {
            wsIgnoreEl.checked = presets.wsIgnoreFirstMsg === true || presets.wsIgnoreFirstMsg === 'true';
        }
        if (presets.wsHeaders !== undefined && wsHeadersEl) wsHeadersEl.value = presets.wsHeaders;
        const xmppPresetIds = {
            xmppDomain: 'xmpp-domain', xmppUsername: 'xmpp-username', xmppPassword: 'xmpp-password',
            xmppResource: 'xmpp-resource', xmppLocalJid: 'xmpp-local-jid',
            xmppExternalUsername: 'xmpp-external-username', xmppExternalPassword: 'xmpp-external-password',
            xmppTlsPolicy: 'xmpp-tls-policy', xmppTlsCaPath: 'xmpp-tls-ca-path',
            xmppTlsCertPath: 'xmpp-tls-cert-path', xmppTlsKeyPath: 'xmpp-tls-key-path',
            xmppConversation: 'xmpp-conversation', xmppRoom: 'xmpp-room', xmppNickname: 'xmpp-nickname',
            xmppRoomPassword: 'xmpp-room-password', xmppConnectTimeoutMs: 'xmpp-connect-timeout',
            xmppReplyTimeoutMs: 'xmpp-reply-timeout',
            xmppPingIntervalMs: 'xmpp-ping-interval', xmppReconnectDelayMs: 'xmpp-reconnect-delay',
        };
        Object.entries(xmppPresetIds).forEach(([key, id]) => {
            if (presets[key] !== undefined && document.getElementById(id)) document.getElementById(id).value = presets[key];
        });
        if (presets.xmppAllowUnverifiedTls !== undefined) {
            document.getElementById('xmpp-allow-unverified').checked = presets.xmppAllowUnverifiedTls === true || presets.xmppAllowUnverifiedTls === 'true';
        }
        if (presets.xmppAllowRemote !== undefined) {
            document.getElementById('xmpp-allow-remote').checked = presets.xmppAllowRemote === true || presets.xmppAllowRemote === 'true';
        }
        updateGrpcRowVisibility();
    });

    connectBtn.addEventListener('click', () => {
        if (connectBtn.disabled) return;
        const connectionType = connectionTypeSelect.value;
        const host = hostInput.value;
        const port = parseInt(portInput.value, 10);
        if (connectionType.startsWith('xmpp')) {
            const type = connectionType.split('-')[1];
            if (!validateXmppConnection(type, host, port)) return;
        }
        setAppStatus(Status.CONNECTING);
        setConnectionControls('connecting');

        if (connectionType.startsWith('tcp')) {
            const type = connectionType.split('-')[1];
            setStatus(`Connecting via TCP ${type} to ${host}:${port}...`, { category: 'connection' });
            window.electronAPI.send('connect-tcp', { type, port, host });
        } else if (connectionType.startsWith('udp')) {
            const type = connectionType.split('-')[1];
            setStatus(`Connecting via UDP ${type} to ${host}:${port}...`, { category: 'connection' });
            window.electronAPI.send('connect-udp', { type, port, host });
        } else if (connectionType.startsWith('grpc')) {
            const type = connectionType.split('-')[1];
            const serialization = grpcSerializationSelect.value;
            const grpcSendMethod = grpcSendMethodSelect.value;
            const headerPathKey = grpcHeaderPathKeyInput.value;
            const headerPath = grpcHeaderPathInput.value;
            const useTls = grpcTlsCheckbox.checked;
            const tlsCaPath = grpcTlsCaInput.value || undefined;
            const tlsCertPath = grpcTlsCertInput.value || undefined;
            const tlsKeyPath = grpcTlsKeyInput.value || undefined;
            const tlsLabel = useTls ? 'tls=on' : 'tls=off';
            const methodLabel = grpcSendMethod === 'unary' ? 'unary' : 'streaming';
            const headerLabel = type === 'client' ? ` ${headerPathKey}=${headerPath}` : '';
            setStatus(`Connecting via gRPC ${type} to ${host}:${port} [${serialization}] ${methodLabel} ${tlsLabel}${headerLabel}...`, { category: 'connection' });
            window.electronAPI.send('connect-grpc', { type, port, host, grpcSerialization: serialization, grpcSendMethod, headerPathKey, headerPath, useTls, tlsCaPath, tlsCertPath, tlsKeyPath });
        } else if (connectionType.startsWith('http')) {
            const type = connectionType.split('-')[1];
            const httpFormat = httpFormatSelect ? httpFormatSelect.value : 'json';
            const httpTls = httpTlsCheckbox ? httpTlsCheckbox.checked : true;
            const httpTlsCaPath = httpTlsCaInput ? httpTlsCaInput.value || undefined : undefined;
            const httpTlsCertPath = httpTlsCertInput ? httpTlsCertInput.value || undefined : undefined;
            const httpTlsKeyPath = httpTlsKeyInput ? httpTlsKeyInput.value || undefined : undefined;
            const httpPath = httpPathInput ? httpPathInput.value || '/' : '/';
            const tlsLabel = httpTls ? 'tls=on' : 'tls=off';
            setStatus(`Connecting via HTTP ${type} to ${host}:${port} [${httpFormat}] ${tlsLabel} path=${httpPath}...`, { category: 'connection' });
            window.electronAPI.send('connect-http', { type, port, host, httpFormat, httpTls, httpTlsCaPath, httpTlsCertPath, httpTlsKeyPath, httpPath });
        } else if (connectionType.startsWith('ws')) {
            const type = connectionType.split('-')[1];
            const wsFormatEl = document.getElementById('ws-format');
            const wsTlsEl = document.getElementById('ws-tls');
            const wsFormat = wsFormatEl ? wsFormatEl.value : 'delimited';
            const wsTls = wsTlsEl ? wsTlsEl.checked : true;
            const wsTlsCaPath = (document.getElementById('ws-tls-ca-path') || {}).value || undefined;
            const wsTlsCertPath = (document.getElementById('ws-tls-cert-path') || {}).value || undefined;
            const wsTlsKeyPath = (document.getElementById('ws-tls-key-path') || {}).value || undefined;
            const wsPath = (document.getElementById('ws-path') || {}).value || '/';
            const wsSubscriptionMsg = (document.getElementById('ws-subscription-msg') || {}).value || undefined;
            const wsIgnoreFirstMsg = (document.getElementById('ws-ignore-first-msg') || {}).checked || false;
            const wsHeaders = (document.getElementById('ws-headers') || {}).value || undefined;
            const scheme = wsTls ? 'wss' : 'ws';
            setStatus(`Connecting via WebSocket ${type} to ${scheme}://${host}:${port}${wsPath} [${wsFormat}]...`, { category: 'connection' });
            window.electronAPI.send('connect-ws', { type, port, host, wsFormat, wsTls, wsTlsCaPath, wsTlsCertPath, wsTlsKeyPath, wsPath, wsSubscriptionMsg, wsIgnoreFirstMsg, wsHeaders });
        } else if (connectionType.startsWith('xmpp')) {
            const type = connectionType.split('-')[1];
            const value = (id) => document.getElementById(id)?.value || '';
            const checked = (id) => Boolean(document.getElementById(id)?.checked);
            const xmppOptions = {
                type, host, port,
                xmppDomain: value('xmpp-domain'),
                xmppUsername: value('xmpp-username'),
                xmppPassword: value('xmpp-password'),
                xmppResource: value('xmpp-resource'),
                xmppLocalJid: value('xmpp-local-jid'),
                xmppExternalUsername: value('xmpp-external-username'),
                xmppExternalPassword: value('xmpp-external-password'),
                xmppTlsPolicy: value('xmpp-tls-policy'),
                xmppTlsCaPath: value('xmpp-tls-ca-path'),
                xmppTlsCertPath: value('xmpp-tls-cert-path'),
                xmppTlsKeyPath: value('xmpp-tls-key-path'),
                xmppAllowUnverifiedTls: checked('xmpp-allow-unverified'),
                xmppAllowRemote: checked('xmpp-allow-remote'),
                xmppConversation: value('xmpp-conversation'),
                xmppRoom: value('xmpp-room'),
                xmppNickname: value('xmpp-nickname'),
                xmppRoomPassword: value('xmpp-room-password'),
                xmppConnectTimeoutMs: Number(value('xmpp-connect-timeout') || 30000),
                xmppReplyTimeoutMs: Number(value('xmpp-reply-timeout') || 15000),
                xmppPingIntervalMs: Number(value('xmpp-ping-interval') || 60000),
                xmppReconnectDelayMs: Number(value('xmpp-reconnect-delay') || 60000),
            };
            setStatus(`Connecting via XMPP ${type} at ${host}:${port} domain=${xmppOptions.xmppDomain} ${xmppOptions.xmppTlsPolicy}...`, { category: 'connection' });
            window.electronAPI.send('connect-xmpp', xmppOptions);
        }
    });

    disconnectBtn.addEventListener('click', () => {
        if (disconnectBtn.disabled) return;
        const connectionType = connectionTypeSelect.value;
        setStatus('Disconnecting...', { category: 'connection' });
        setAppStatus(Status.DISCONNECTING);
        if (connectionType.startsWith('tcp')) {
            window.electronAPI.send('disconnect-tcp');
        } else if (connectionType.startsWith('udp')) {
            window.electronAPI.send('disconnect-udp');
        } else if (connectionType.startsWith('grpc')) {
            window.electronAPI.send('disconnect-grpc');
        } else if (connectionType.startsWith('http')) {
            window.electronAPI.send('disconnect-http');
        } else if (connectionType.startsWith('ws')) {
            window.electronAPI.send('disconnect-ws');
        } else if (connectionType.startsWith('xmpp')) {
            window.electronAPI.send('disconnect-xmpp');
        }
    });

    saveLogsBtn.addEventListener('click', async () => {
        const logContent = logs.textContent;
        const result = await window.electronAPI.invoke('save-logs', logContent);
        if (result && result.success) {
            setStatus(`Logs saved to ${result.filePath}`, { category: 'system' });
        } else if (result && result.error) {
            setStatus(`Error saving logs: ${result.error}`, { category: 'system' });
            setAppStatus(Status.ERROR);
        }
    });

    function clearLogsContent() {
        logs.textContent = '';
        logsBuffer = [];
        headersBuffer = [];
        lineCount = 0;
        window.lineCount = lineCount;
        lineCounter.textContent = 'Lines Received: 0';
    }

    clearLogsBtn.addEventListener('click', clearLogsContent);

    themeSelector.addEventListener('change', async () => {
        const selectedTheme = themeSelector.value;
        if (window.themeLoader) {
            window.themeLoader.loadTheme(selectedTheme);
        } else {
            // Fallback to old method if theme loader is not available
            document.body.className = `theme-${selectedTheme}`;
        }
        window.electronAPI.send('save-theme', selectedTheme);
    });

    // Toggle Connection Line functionality
    toggleConnectionLineBtn.addEventListener('click', () => {
        const isEnabled = toggleConnectionLineBtn.dataset.enabled === 'true';
        setToggleConnectionLineState(!isEnabled);
    });

    // --- Show Metadata ---
    // When enabled, logs connection/call metadata before each incoming message for all
    // modes: TCP server, TCP client, UDP server, UDP client, gRPC server (gRPC call
    // metadata), and gRPC client.

    function setShowMetadataState(isEnabled) {
        if (!toggleViewRawBtn) return;
        showMetadata = isEnabled;
        toggleViewRawBtn.dataset.enabled = isEnabled ? 'true' : 'false';
        toggleViewRawBtn.setAttribute('aria-pressed', isEnabled ? 'true' : 'false');
        const iconSpan = toggleViewRawBtn.querySelector('.button-icon');
        if (isEnabled) {
            toggleViewRawBtn.classList.add('active');
            if (iconSpan) iconSpan.className = 'button-icon icon-view-raw-on';
            toggleViewRawBtn.title = 'Show Metadata: ON - connection metadata logged before each message';
            toggleViewRawBtn.setAttribute('aria-label', 'Show Metadata: ON');
        } else {
            toggleViewRawBtn.classList.remove('active');
            if (iconSpan) iconSpan.className = 'button-icon icon-view-raw-off';
            toggleViewRawBtn.title = 'Show Metadata: log connection/call metadata before each incoming message';
            toggleViewRawBtn.setAttribute('aria-label', 'Toggle Show Metadata');
        }
        window.electronAPI.send('show-metadata-state-changed', isEnabled);
        // Re-render to show or hide all stored metadata retroactively
        renderFromBuffer();
    }

    if (toggleViewRawBtn) {
        toggleViewRawBtn.addEventListener('click', () => {
            const isEnabled = toggleViewRawBtn.dataset.enabled === 'true';
            setShowMetadataState(!isEnabled);
        });
    }

    // Listen for context/main menu toggle
    window.electronAPI.on('toggle-show-metadata-menu', (checked) => {
        setShowMetadataState(checked);
    });

    // Open the Command Line Interface dialog (toolbar button).
    if (cliBtn) {
        cliBtn.addEventListener('click', () => {
            window.electronAPI.send('show-cli-dialog');
        });
    }

    // ─── Velocity Login / Output Picker ─────────────────────────────────────
    const velocityLoginBtn = document.getElementById('velocity-login-btn');
    const authBadge = document.getElementById('auth-badge');
    if (velocityLoginBtn) {
        velocityLoginBtn.addEventListener('click', () => {
            window.electronAPI.openVelocityLogin();
        });
    }

    if (authBadge) {
        const toggleAuthBadge = (event) => {
            event.stopPropagation();
            if (!velocityAuthState.hasToken || velocityAuthState.error) return;
            setVelocityTokenSending(!velocityAuthState.tokenSendingEnabled);
        };
        authBadge.addEventListener('click', toggleAuthBadge);
        authBadge.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                toggleAuthBadge(event);
            }
        });
        const authPopover = document.getElementById('auth-badge-popover');
        if (authPopover) {
            authPopover.addEventListener('click', (event) => event.stopPropagation());
        }
    }

    window.electronAPI.on('velocity:output-applied', (item) => {
        if (!item) return;
        updateAuthFromVelocityItem(item);

        // Token-only mode: authenticate without changing connection settings
        if (item.tokenOnly) {
            setStatus('🔑 Velocity token applied — using your own connection settings', { category: 'auth' });
            return;
        }

        const type = item.outputType || '';
        let appliedXmppCredentialsRequired = false;
        const connectionType = document.getElementById('connection-type');
        const hostInput = document.getElementById('host');
        const portInput = document.getElementById('port');

        if (type === 'grpc') {
            connectionType.value = 'grpc-client';
            connectionType.dispatchEvent(new Event('change'));
            if (item.url) {
                hostInput.value = item.url.replace(/^https?:\/\//, '').split(':')[0].split('/')[0];
                portInput.value = '443';
            }
            const headerPathInput = document.getElementById('grpc-header-path');
            if (headerPathInput && item.headerPath) headerPathInput.value = item.headerPath;
            const grpcTls = document.getElementById('grpc-tls');
            if (grpcTls) { grpcTls.checked = true; grpcTls.dispatchEvent(new Event('change')); }
        } else if (type === 'http') {
            connectionType.value = 'http-client';
            connectionType.dispatchEvent(new Event('change'));
            if (item.url) {
                try {
                    const u = new URL(item.url);
                    hostInput.value = u.hostname;
                    portInput.value = u.port || (u.protocol === 'https:' ? '443' : '80');
                    if (httpPathInput) httpPathInput.value = u.pathname || '/';
                    if (httpTlsCheckbox) httpTlsCheckbox.checked = u.protocol === 'https:';
                } catch (_) { hostInput.value = item.url; }
            }
        } else if (type === 'websocket') {
            connectionType.value = 'ws-client';
            connectionType.dispatchEvent(new Event('change'));
            if (item.url) {
                try {
                    const u = new URL(item.url);
                    hostInput.value = u.hostname;
                    portInput.value = u.port || (u.protocol === 'wss:' ? '443' : '80');
                    const wsPathInput = document.getElementById('ws-path');
                    const wsTlsCheckbox = document.getElementById('ws-tls');
                    if (wsPathInput) wsPathInput.value = u.pathname || '/';
                    if (wsTlsCheckbox) wsTlsCheckbox.checked = u.protocol === 'wss:';
                } catch (_) { hostInput.value = item.url; }
            }
        } else if (type === 'tcp') {
            connectionType.value = 'tcp-client';
            connectionType.dispatchEvent(new Event('change'));
            if (item.host) hostInput.value = item.host;
            if (item.port) portInput.value = item.port;
        } else if (type === 'xmpp') {
            appliedXmppCredentialsRequired = true;
            connectionType.value = 'xmpp-client';
            connectionType.dispatchEvent(new Event('change'));
            hostInput.value = item.host || item.domain || 'localhost';
            portInput.value = item.port || 5222;
            const setValue = (id, value) => {
                const element = document.getElementById(id);
                if (element && value !== undefined && value !== null && value !== '') element.value = value;
            };
            setValue('xmpp-domain', item.domain);
            setValue('xmpp-username', item.username);
            setValue('xmpp-resource', item.resource);
            setValue('xmpp-local-jid', item.localJid);
            setValue('xmpp-conversation', item.conversation === 'muc' ? 'muc' : 'direct');
            setValue('xmpp-room', item.room);
            setValue('xmpp-nickname', item.nickname);
            setValue('xmpp-connect-timeout', item.connectTimeoutMs || 30000);
            setValue('xmpp-reply-timeout', item.replyTimeoutMs || 15000);
            setValue('xmpp-ping-interval', item.pingIntervalMs || 60000);
            setValue('xmpp-reconnect-delay', item.reconnectDelayMs || 60000);
            setValue('xmpp-tls-policy', item.tlsPolicy || 'required');
            const accountPassword = document.getElementById('xmpp-password');
            const roomPassword = document.getElementById('xmpp-room-password');
            if (accountPassword) accountPassword.value = '';
            if (roomPassword) roomPassword.value = '';
            updateGrpcRowVisibility();
            if (xmppOptionsRow) xmppOptionsRow.open = true;
            const firstMissing = [
                document.getElementById('xmpp-username'),
                accountPassword,
                ...(item.conversation === 'muc'
                    ? [document.getElementById('xmpp-room'), document.getElementById('xmpp-nickname')]
                    : []),
            ].find((element) => !element?.value);
            if (firstMissing) {
                firstMissing.setAttribute('aria-invalid', 'true');
                firstMissing.focus();
            }
            if (xmppValidationMessage) {
                xmppValidationMessage.textContent = 'Enter the XMPP account credentials required by this output before connecting. Stored secrets cannot be recovered.';
                xmppValidationMessage.hidden = false;
            }
            setStatus('XMPP output applied; enter the required XMPP account credentials before connecting. Stored secrets cannot be recovered.', { category: 'auth' });
        }

        addLog(appliedXmppCredentialsRequired
            ? `✓ XMPP output applied - credentials required before connecting (${item.label || item.id})`
            : `✓ Output applied - ready to connect (${item.label || item.id})`);
    });

    window.electronAPI.on('velocity:token-refreshed', (state) => {
        updateAuthBadge({ hasToken: true, expires: state && state.expires ? state.expires : velocityAuthState.expires, error: '' });
        setStatus('Velocity token refreshed', { category: 'auth' });
    });

    window.electronAPI.on('velocity:token-state', (state) => {
        if (!state) return;
        updateAuthBadge({
            hasToken: Boolean(state.hasToken),
            tokenSendingEnabled: Boolean(state.tokenSendingEnabled),
            expires: state.expires || velocityAuthState.expires,
        });
    });

    window.electronAPI.on('velocity:token-error', (msg) => {
        updateAuthBadge({ hasToken: true, error: msg || 'Unknown token refresh error' });
        addLog(`⚠️ Velocity token refresh failed: ${msg}`);
    });

    // Listen for context menu toggle connection line
    window.electronAPI.on('toggle-connection-line-menu', (checked) => {
        setToggleConnectionLineState(checked);
    });

    errorCloseBtn.addEventListener('click', hideErrorDialog);

    function updateAutoScrollButtonState() {
        if (!toggleAutoscrollBtn) return;
        toggleAutoscrollBtn.dataset.enabled = autoScroll ? 'true' : 'false';
        toggleAutoscrollBtn.setAttribute('aria-pressed', autoScroll ? 'true' : 'false');
        if (autoScroll) {
            toggleAutoscrollBtn.classList.add('active');
        } else {
            toggleAutoscrollBtn.classList.remove('active');
        }
    }

    // Initialize auto-scroll toggle button state
    updateAutoScrollButtonState();

    function addLog(message) {
        if (!message) return;
        const lines = String(message).split('\n').filter((l) => l.length > 0);
        if (!lines.length) return;
        // Status-style logs: no transport metadata pairing; do not affect line counter.
        logsBuffer.push(...lines);
        for (let i = 0; i < lines.length; i++) headersBuffer.push(null);
        renderFromBuffer();
    }

    function renderFromBuffer() {
        if (!logs) return;
        const entries = listOrder === 'ascending' ? logsBuffer : [...logsBuffer].reverse();
        const entriesHeaders = listOrder === 'ascending' ? headersBuffer : [...headersBuffer].reverse();
        const lines = [];
        for (let i = 0; i < entries.length; i++) {
            if (showMetadata && entriesHeaders[i]) {
                lines.push(entriesHeaders[i]);
            }
            lines.push(entries[i]);
        }
        logs.textContent = lines.join('\n');
        if (lines.length) logs.textContent += '\n';
        if (autoScroll) {
            logs.scrollTop = listOrder === 'ascending' ? logs.scrollHeight : 0;
        }
    }

    // Toggle Auto-Scroll via button
    if (toggleAutoscrollBtn) {
        toggleAutoscrollBtn.addEventListener('click', () => {
            autoScroll = toggleAutoscrollBtn.dataset.enabled !== 'true';
            updateAutoScrollButtonState();
            // If turning on, snap to bottom immediately
            if (autoScroll && logs) {
                logs.scrollTop = logs.scrollHeight;
            }
        });
    }

    // Update order button icon and dataset
    function updateOrderButtonState() {
        if (!toggleOrderBtn) return;
        toggleOrderBtn.dataset.order = listOrder;
        const iconSpan = toggleOrderBtn.querySelector('.button-icon');
        if (iconSpan) {
            iconSpan.className = `button-icon ${listOrder === 'ascending' ? 'icon-ascending' : 'icon-descending'}`;
        }
        toggleOrderBtn.setAttribute('title', `Order: ${listOrder === 'ascending' ? 'Ascending' : 'Descending'}`);
        toggleOrderBtn.setAttribute('aria-label', `Set list order to ${listOrder === 'ascending' ? 'Descending' : 'Ascending'}`);
    }

    updateOrderButtonState();

    if (toggleOrderBtn) {
        toggleOrderBtn.addEventListener('click', () => {
            listOrder = listOrder === 'ascending' ? 'descending' : 'ascending';
            updateOrderButtonState();
            // Re-render logs with the new order
            if (logsBuffer.length) {
                const previousTargetScroll = listOrder === 'ascending' ? logs.scrollHeight : 0;
                renderFromBuffer();
                // Maintain auto-scroll target after re-render
                if (autoScroll) {
                    if (listOrder === 'ascending') {
                        logs.scrollTop = logs.scrollHeight;
                    } else {
                        logs.scrollTop = 0;
                    }
                }
            }
        });
    }

    // Disable auto-scroll if user scrolls away from target; re-enable when near target
    if (logs) {
        logs.addEventListener('scroll', () => {
            const distanceFromBottom = logs.scrollHeight - logs.scrollTop - logs.clientHeight;
            const nearTarget = listOrder === 'ascending' ? (distanceFromBottom < 32) : (logs.scrollTop < 32);
            if (!nearTarget && autoScroll) {
                autoScroll = false;
                updateAutoScrollButtonState();
            } else if (nearTarget && !autoScroll) {
                autoScroll = true;
                updateAutoScrollButtonState();
            }
        }, { passive: true });
    }

    // Keyboard shortcuts: Cmd/Ctrl+Shift+A (auto-scroll), Cmd/Ctrl+Shift+O (order)
    document.addEventListener('keydown', (e) => {
        const isMac = navigator.platform.toUpperCase().includes('MAC');
        const hasPrimary = isMac ? e.metaKey : e.ctrlKey;
        const isEditable = ['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target && e.target.tagName) || '');
        if (isEditable) return; // don't intercept typing in form fields

        if (hasPrimary && e.shiftKey) {
            const key = e.key.toLowerCase();
            if (key === 'a') {
                e.preventDefault();
                autoScroll = !autoScroll;
                updateAutoScrollButtonState();
                if (autoScroll && logs) {
                    if (listOrder === 'ascending') {
                        logs.scrollTop = logs.scrollHeight;
                    } else {
                        logs.scrollTop = 0;
                    }
                }
            } else if (key === 'o') {
                e.preventDefault();
                listOrder = listOrder === 'ascending' ? 'descending' : 'ascending';
                updateOrderButtonState();
                renderFromBuffer();
                if (autoScroll && logs) {
                    if (listOrder === 'ascending') {
                        logs.scrollTop = logs.scrollHeight;
                    } else {
                        logs.scrollTop = 0;
                    }
                }
            }
        }
    });

    // Pending metadata: the most recently received log-metadata, to be paired with the next log-data
    let pendingHeader = null;

    window.electronAPI.on('log-metadata', (metadataLine) => {
        // Stash until the next log-data arrives
        pendingHeader = metadataLine;
    });

    window.electronAPI.on('log-data', (data) => {
        const lines = data.split('\n').filter(line => line.length > 0);
        if (lines.length) {
            // Pair the pending metadata with the first line of this batch; remaining lines get null
            logsBuffer.push(...lines);
            headersBuffer.push(pendingHeader);
            for (let i = 1; i < lines.length; i++) headersBuffer.push(null);
            pendingHeader = null;
        }
        lineCount += lines.length;
        window.lineCount = lineCount;
        lineCounter.textContent = `Lines Received: ${lineCount}`;

        if (listOrder === 'ascending') {
            if (lines.length) {
                if (showMetadata && headersBuffer[headersBuffer.length - lines.length]) {
                    // Full re-render needed when metadata is shown to interleave correctly
                    renderFromBuffer();
                } else {
                    logs.textContent += lines.join('\n') + '\n';
                }
            }
            if (autoScroll) logs.scrollTop = logs.scrollHeight;
        } else {
            renderFromBuffer();
        }
    });

    window.electronAPI.on('system-theme-changed', (theme) => {
        if (themeSelector.value === 'system') {
            if (window.themeLoader) {
                window.themeLoader.loadTheme(theme);
            } else {
                // Fallback to old method if theme loader is not available
                document.body.className = `theme-${theme}`;
            }
        }
    });

    window.electronAPI.on('font-size-changed', (fontSize) => {
      logs.style.fontSize = fontSize;
    });

    window.electronAPI.on('font-family-changed', (fontFamily) => {
      logs.style.fontFamily = fontFamily;
    });

    window.electronAPI.on('tcp-status',  (message) => setStatus(message, { category: 'connection' }));
    window.electronAPI.on('udp-status',  (message) => setStatus(message, { category: 'connection' }));

    // For TLS-capable protocols, extract the tlsInfo detail (after '\n  ') and cache it as
    // a tooltip for the "Connected" state indicator (Option C). TCP and UDP have no TLS.
    function extractAndCacheTlsTooltip(message) {
        const detailMatch = message && message.match(/\n\s+(.+)/);
        if (detailMatch) {
            currentTlsTooltip = tlsInfoToTooltip(detailMatch[1].trim());
        }
        // Disconnect / close messages carry no tlsInfo - leave currentTlsTooltip intact
        // so the tooltip remains accurate until the connection-state changes to disconnected.
    }

    window.electronAPI.on('grpc-status', (message) => { extractAndCacheTlsTooltip(message); setStatus(message, { category: 'connection' }); });
    window.electronAPI.on('http-status', (message) => { extractAndCacheTlsTooltip(message); setStatus(message, { category: 'connection' }); });
    window.electronAPI.on('ws-status',   (message) => { extractAndCacheTlsTooltip(message); setStatus(message, { category: 'connection' }); });
    window.electronAPI.on('xmpp-status', (message) => { extractAndCacheTlsTooltip(message); setStatus(message, { category: 'connection' }); });
    window.electronAPI.on('xmpp-warning', (message) => {
        setStatus(message, { category: 'connection' });
    });
    window.electronAPI.on('xmpp-server-settings', (settings) => {
        if (!xmppReceivingJid) return;
        xmppReceivingJid.textContent = settings?.receivingJid
            ? `Receiving JID: ${settings.receivingJid}`
            : 'Receiving JID: available after the server starts';
    });

    window.electronAPI.on('udp-error', (message) => {
        currentTlsTooltip = '';
        showErrorDialog(message);
        setStatus(`Error: ${message}`, { category: 'connection' });
        setAppStatus(Status.ERROR);
        setConnectionControls('disconnected');
    });

    window.electronAPI.on('tcp-error', (message) => {
        currentTlsTooltip = '';
        showErrorDialog(message);
        setStatus(`Error: ${message}`, { category: 'connection' });
        setAppStatus(Status.ERROR);
        setConnectionControls('disconnected');
    });

    window.electronAPI.on('grpc-error', (message) => {
        currentTlsTooltip = '';
        showErrorDialog(message);
        setStatus(`Error: ${message}`, { category: 'connection' });
        setAppStatus(Status.ERROR);
        setConnectionControls('disconnected');
    });

    window.electronAPI.on('http-error', (message) => {
        currentTlsTooltip = '';
        showErrorDialog(message);
        setStatus(`Error: ${message}`, { category: 'connection' });
        setAppStatus(Status.ERROR);
        setConnectionControls('disconnected');
    });

    window.electronAPI.on('ws-error', (message) => {
        currentTlsTooltip = '';
        showErrorDialog(message);
        setStatus(`Error: ${message}`, { category: 'connection' });
        setAppStatus(Status.ERROR);
        setConnectionControls('disconnected');
    });
    window.electronAPI.on('xmpp-error', (message) => {
        currentTlsTooltip = '';
        showErrorDialog(message);
        setStatus(`Error: ${message}`, { category: 'connection' });
        setAppStatus(Status.ERROR);
        setConnectionControls('disconnected');
    });


    window.electronAPI.on('udp-set-connect-enabled', (enabled) => {
        connectBtn.disabled = !enabled;
    });

    window.electronAPI.on('udp-set-disconnect-enabled', (enabled) => {
        disconnectBtn.disabled = !enabled;
    });

    window.electronAPI.on('udp-set-inputs-enabled', (enabled) => {
        connectionTypeSelect.disabled = !enabled;
        hostInput.disabled = !enabled;
        portInput.disabled = !enabled;
    });

    window.electronAPI.on('udp-connection-state', (state) => {
        if (state !== 'connected') currentTlsTooltip = '';
        setConnectionControls(state);
        if (state === 'connected') {
            setAppStatus(Status.CONNECTED);
        } else if (state === 'connecting') {
            setAppStatus(Status.CONNECTING);
        } else if (state === 'disconnecting') {
            setAppStatus(Status.DISCONNECTING);
        } else {
            setAppStatus(Status.DISCONNECTED);
        }
    });

    window.electronAPI.on('tcp-set-connect-enabled', (enabled) => {
        connectBtn.disabled = !enabled;
    });

    window.electronAPI.on('tcp-set-disconnect-enabled', (enabled) => {
        disconnectBtn.disabled = !enabled;
    });

    window.electronAPI.on('tcp-connection-state', (state) => {
        if (state !== 'connected') currentTlsTooltip = '';
        setConnectionControls(state);
        if (state === 'connected') {
            setAppStatus(Status.CONNECTED);
        } else if (state === 'connecting') {
            setAppStatus(Status.CONNECTING);
        } else if (state === 'disconnecting') {
            setAppStatus(Status.DISCONNECTING);
        } else {
            setAppStatus(Status.DISCONNECTED);
        }
    });

    // Handle keyboard shortcut for saving logs
    window.electronAPI.on('trigger-save-logs', async () => {
        const logContent = logs.textContent;
        const result = await window.electronAPI.invoke('save-logs', logContent);
        if (result && result.success) {
            setStatus(`Logs saved to ${result.filePath}`, { category: 'system' });
        } else if (result && result.error) {
            setStatus(`Error saving logs: ${result.error}`, { category: 'system' });
            setAppStatus(Status.ERROR);
        }
    });

    window.electronAPI.on('trigger-clear-logs', clearLogsContent);

    // --- Inspect Element pick mode ---
    // Activated by the "Inspect Element Mode" menu item (checkbox): changes cursor to a
    // crosshair and on the next click sends the coordinates to the main process, which calls
    // webContents.inspectElement(x, y) to highlight the element in DevTools.
    // Deactivated by toggling the menu item again, pressing Escape, or completing a pick.
    let pickCleanup = null;

    function cancelPickMode() {
      if (!pickCleanup) return;
      pickCleanup();
      pickCleanup = null;
      document.body.style.cursor = '';
      window.electronAPI.send('inspect-element-done');
    }

    const onEscapeCancel = (e) => {
      if (e.key === 'Escape') cancelPickMode();
    };

    window.electronAPI.on('enter-inspect-mode', () => {
      document.body.style.cursor = 'crosshair';

      const onPick = (e) => {
        document.body.style.cursor = '';
        pickCleanup = null;
        document.removeEventListener('keydown', onEscapeCancel, { capture: true });
        window.electronAPI.send('inspect-element', { x: e.clientX, y: e.clientY });
        e.stopImmediatePropagation();
        e.preventDefault();
      };

      pickCleanup = () => {
        document.removeEventListener('click', onPick, { capture: true });
        document.removeEventListener('keydown', onEscapeCancel, { capture: true });
      };

      document.addEventListener('click', onPick, { capture: true, once: true });
      document.addEventListener('keydown', onEscapeCancel, { capture: true });
    });

    // Main process toggled the checkbox off while pick mode was still pending
    window.electronAPI.on('cancel-inspect-mode', () => {
      if (pickCleanup) {
        pickCleanup();
        pickCleanup = null;
        document.body.style.cursor = '';
      }
    });

    // Activity strip controls: explicit expand/collapse and pin/unpin.
    const statusWrapper = document.getElementById('status-wrapper');
    if (activityToggleBtn) {
        activityToggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setActivityExpanded(!activityExpanded);
        });
    }
    if (activityPinBtn) {
        activityPinBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setActivityPinned(!activityPinned);
        });
    }
    if (activityConnectionFilterBtn) {
        activityConnectionFilterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setActivityConnectionFilter(!activityConnectionFilterEnabled);
        });
    }
    if (statusLineToggleBtn) {
        statusLineToggleBtn.addEventListener('click', () => {
            if (!activityHistory.length || !activityStrip) return;
            if (activityStrip.classList.contains('hidden')) {
                showActivityHistory(activityHistoryIndex);
            } else {
                activityStrip.classList.add('hidden');
                updateActivityStripState();
            }
        });
    }
    if (activityNewestBtn) activityNewestBtn.addEventListener('click', () => showActivityHistory(0));
    if (activityPreviousBtn) activityPreviousBtn.addEventListener('click', () => showActivityHistory(activityHistoryIndex - 1));
    if (activityNextBtn) activityNextBtn.addEventListener('click', () => showActivityHistory(activityHistoryIndex + 1));
    if (activityOldestBtn) activityOldestBtn.addEventListener('click', () => showActivityHistory(getVisibleActivityHistory().length - 1));
    if (statusWrapper) {
        statusWrapper.addEventListener('mouseenter', () => clearTimeout(activityHideTimer));
        statusWrapper.addEventListener('mouseleave', scheduleActivityAutoHide);
    }
    updateActivityStripState();

    /**
     * Stores an activity update and renders it in the activity strip.
     *
     * Messages from transports use '\n  ' (newline + indent) to separate the
     * connection summary from secondary detail (e.g. TLS cert info).
     * History is newest-first. New activity always jumps to the top/newest item.
     */
    function setStatus(message, options = {}) {
        if (!statusDisplay || !message) return;
        const item = parseActivityMessage(message, options);
        activityHistory.unshift(item);

        if (!activityConnectionFilterEnabled || isConnectionActivity(item)) {
            activityHistoryIndex = 0;
            renderActivityHistoryItem();
            revealActivityStrip();
            return;
        }

        if (!getVisibleActivityHistory().length) {
            activityHistoryIndex = 0;
            renderActivityHistoryItem();
            revealActivityStrip();
            return;
        }

        updateActivityHistoryControls();
        updateActivityStripState();
        updateStatusLineToggleState();
    }

    // TLS badge: click toggles TLS when disconnected; otherwise click pins details.
    const tlsBadgeEl = document.getElementById('tls-badge');
    if (tlsBadgeEl) {
        const handleTlsBadgeActivation = (e) => {
            e.stopPropagation();
            const selected = getSelectedTlsControl();
            if (!selected) return;
            if (!canToggleTlsFromFooter()) {
                tlsBadgeEl.classList.toggle('pinned');
                return;
            }
            if (selected.checkbox) {
                selected.checkbox.checked = !selected.checkbox.checked;
                selected.checkbox.dispatchEvent(new Event('change'));
            } else {
                selected.toggle();
                selected.enabled = !selected.enabled;
            }
            addLog(isSelectedTlsEnabled(selected)
                ? `🔒 TLS enabled for ${selected.protocol} ${selected.mode}`
                : `🔓 TLS disabled for ${selected.protocol} ${selected.mode}`);
            refreshTlsBadge();
        };
        tlsBadgeEl.addEventListener('click', handleTlsBadgeActivation);
        tlsBadgeEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleTlsBadgeActivation(e);
            }
        });
        document.addEventListener('click', () => tlsBadgeEl.classList.remove('pinned'));
        const tlsPopoverEl = document.getElementById('tls-badge-popover');
        if (tlsPopoverEl) {
            tlsPopoverEl.addEventListener('click', (e) => e.stopPropagation());
        }
    }

});
