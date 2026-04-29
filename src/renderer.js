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
    const logs = document.getElementById('logs');
    const statusDisplay = document.getElementById('status');
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
        unary: 'gRPC RPC Type: Unary. Each message is sent as a discrete request/response round-trip — one request in, one response out. The simplest gRPC call pattern, analogous to a traditional REST call. Easier to trace and debug, but incurs per-call overhead (HTTP/2 framing, header compression). Maps to Send (GrpcFeed) or execute (GrpcFeatureService).',
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

    function updateWsFormatTooltip() {
        const wsFormatEl = document.getElementById('ws-format');
        if (!wsFormatEl) return;
        const tooltip = WS_FORMAT_TOOLTIPS[wsFormatEl.value] || WS_FORMAT_TOOLTIPS.delimited;
        wsFormatEl.title = tooltip;
        wsFormatEl.setAttribute('aria-label', tooltip);
    }

    const CONNECTION_MODE_TOOLTIPS = {
        'tcp-server': 'TCP Server — listens on the specified port and accepts incoming TCP connections from clients.',
        'tcp-client': 'TCP Client — connects to a remote TCP server at the specified host and port to receive data.',
        'udp-server': 'UDP Server — binds to the specified port and receives incoming UDP datagrams.',
        'udp-client': 'UDP Client — sends UDP datagrams to the specified host and port.',
        'http-client': 'HTTP Client — sends data via HTTP/HTTPS POST requests to a remote endpoint.',
        'http-server': 'HTTP Server — starts a local HTTP/HTTPS server that accepts POST requests from clients.',
        'ws-client': 'WebSocket Client — connects to a remote WebSocket server (ws:// or wss://) and receives data as text frames.',
        'ws-server': 'WebSocket Server — starts a local WebSocket server that accepts incoming ws:// or wss:// connections.',
        'grpc-server': 'gRPC Server — starts a local gRPC server that accepts incoming RPC calls.',
        'grpc-client': 'gRPC Client — connects to a remote gRPC server using HTTP/2.',
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
    const DEFAULT_PORTS = { tcp: 5565, udp: 5565, grpc: 5565, http: 8443 };
    const HTTP_PORT_TLS_ON = 8443;
    const HTTP_PORT_TLS_OFF = 8080;
    let lastProtocolDefault = 5565;

    function updateGrpcRowVisibility() {
        const isGrpc = connectionTypeSelect.value.startsWith('grpc');
        const isGrpcClient = connectionTypeSelect.value === 'grpc-client';
        const isHttp = connectionTypeSelect.value.startsWith('http');
        const isWs = connectionTypeSelect.value.startsWith('ws');

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
    }

    connectionTypeSelect.addEventListener('change', updateGrpcRowVisibility);

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
            return 'TLS: off — connection is unsecure (plaintext, no encryption)';
        }
        if (/self-signed/i.test(raw)) {
            return 'TLS: self-signed — connection is encrypted but the server certificate is auto-generated and not CA-verified; peer identity is unverified';
        }
        if (/cert verification skipped/i.test(raw)) {
            return 'TLS: self-signed — connection is encrypted but certificate authority verification is skipped; peer identity is unverified';
        }
        if (/mtls|client.*cert|cert.*client/i.test(raw)) {
            return 'TLS: mTLS — mutual TLS; both client and server certificates are verified';
        }
        if (/custom certs/i.test(raw)) {
            return 'TLS: CA-verified — connection is encrypted and the certificate chain is validated against a custom CA';
        }
        if (/tls=on/i.test(raw)) {
            return 'TLS: on — connection is encrypted';
        }
        return raw;
    }

    // The TLS tooltip for the current connection, set on connect and cleared on disconnect.
    let currentTlsTooltip = '';

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
        // 🔐            = mTLS — key icon signals mutual authentication
        // 🔒✓           = TLS on, CA-verified certificate chain
        let trust, iconChar;
        if (/tls.*off|unsecure|plaintext/i.test(tooltip)) {
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
        badge.title = tooltip; // fallback native tooltip
        badge.style.display = 'flex';
        if (icon)    icon.textContent    = iconChar;
        if (content) content.textContent = tooltip;
    }

    // Function to update the application status display
    function setAppStatus(status) {
        const statusState = status.toLowerCase();

        // Update status text
        appStatusText.textContent = status;
        appStatusText.setAttribute('data-state', statusState);
        // Update TLS trust badge: visible when connected with a TLS-capable protocol
        updateTlsBadge(statusState === 'connected' ? currentTlsTooltip : '');

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
        updateConnectionStatusIndicator(state === 'connected');
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
    });

    connectBtn.addEventListener('click', () => {
        if (connectBtn.disabled) return;
        // Immediately update UI to reflect the connecting state
        setAppStatus(Status.CONNECTING);
        setConnectionControls('connecting');

        const connectionType = connectionTypeSelect.value;
        const host = hostInput.value;
        const port = parseInt(portInput.value, 10);

        if (connectionType.startsWith('tcp')) {
            const type = connectionType.split('-')[1];
            statusDisplay.textContent = `Connecting via TCP ${type} to ${host}:${port}...`;
            window.electronAPI.send('connect-tcp', { type, port, host });
        } else if (connectionType.startsWith('udp')) {
            const type = connectionType.split('-')[1];
            statusDisplay.textContent = `Connecting via UDP ${type} to ${host}:${port}...`;
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
            statusDisplay.textContent = `Connecting via gRPC ${type} to ${host}:${port} [${serialization}] ${methodLabel} ${tlsLabel}${headerLabel}...`;
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
            statusDisplay.textContent = `Connecting via HTTP ${type} to ${host}:${port} [${httpFormat}] ${tlsLabel} path=${httpPath}...`;
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
            statusDisplay.textContent = `Connecting via WebSocket ${type} to ${scheme}://${host}:${port}${wsPath} [${wsFormat}]...`;
            window.electronAPI.send('connect-ws', { type, port, host, wsFormat, wsTls, wsTlsCaPath, wsTlsCertPath, wsTlsKeyPath, wsPath, wsSubscriptionMsg, wsIgnoreFirstMsg, wsHeaders });
        }
    });

    disconnectBtn.addEventListener('click', () => {
        if (disconnectBtn.disabled) return;
        const connectionType = connectionTypeSelect.value;
        statusDisplay.textContent = 'Disconnecting...';
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
        }
    });

    saveLogsBtn.addEventListener('click', async () => {
        const logContent = logs.textContent;
        const result = await window.electronAPI.invoke('save-logs', logContent);
        if (result && result.success) {
            statusDisplay.textContent = `Logs saved to ${result.filePath}`;
        } else if (result && result.error) {
            statusDisplay.textContent = `Error saving logs: ${result.error}`;
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
            toggleViewRawBtn.title = 'Show Metadata: ON — connection metadata logged before each message';
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

    const statusElement = document.getElementById('status');

    window.electronAPI.on('tcp-status',  (message) => setStatus(message));
    window.electronAPI.on('udp-status',  (message) => setStatus(message));

    // For TLS-capable protocols, extract the tlsInfo detail (after '\n  ') and cache it as
    // a tooltip for the "Connected" state indicator (Option C). TCP and UDP have no TLS.
    function extractAndCacheTlsTooltip(message) {
        const detailMatch = message && message.match(/\n\s+(.+)/);
        if (detailMatch) {
            currentTlsTooltip = tlsInfoToTooltip(detailMatch[1].trim());
        }
        // Disconnect / close messages carry no tlsInfo — leave currentTlsTooltip intact
        // so the tooltip remains accurate until the connection-state changes to disconnected.
    }

    window.electronAPI.on('grpc-status', (message) => { extractAndCacheTlsTooltip(message); setStatus(message); });
    window.electronAPI.on('http-status', (message) => { extractAndCacheTlsTooltip(message); setStatus(message); });
    window.electronAPI.on('ws-status',   (message) => { extractAndCacheTlsTooltip(message); setStatus(message); });

    window.electronAPI.on('udp-error', (message) => {
        currentTlsTooltip = '';
        showErrorDialog(message);
        setStatus(`Error: ${message}`);
        setAppStatus(Status.ERROR);
        setConnectionControls('disconnected');
    });

    window.electronAPI.on('tcp-error', (message) => {
        currentTlsTooltip = '';
        showErrorDialog(message);
        setStatus(`Error: ${message}`);
        setAppStatus(Status.ERROR);
        setConnectionControls('disconnected');
    });

    window.electronAPI.on('grpc-error', (message) => {
        currentTlsTooltip = '';
        showErrorDialog(message);
        setStatus(`Error: ${message}`);
        setAppStatus(Status.ERROR);
        setConnectionControls('disconnected');
    });

    window.electronAPI.on('http-error', (message) => {
        currentTlsTooltip = '';
        showErrorDialog(message);
        setStatus(`Error: ${message}`);
        setAppStatus(Status.ERROR);
        setConnectionControls('disconnected');
    });

    window.electronAPI.on('ws-error', (message) => {
        currentTlsTooltip = '';
        showErrorDialog(message);
        setStatus(`Error: ${message}`);
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
            statusDisplay.textContent = `Logs saved to ${result.filePath}`;
        } else if (result && result.error) {
            statusDisplay.textContent = `Error saving logs: ${result.error}`;
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

    // Status popover — click to pin open; click anywhere else to dismiss
    const statusWrapper = document.getElementById('status-wrapper');
    if (statusWrapper) {
        statusWrapper.addEventListener('click', (e) => {
            // Only toggle pin when there is detail to show (icon is explicitly visible)
            const icon = document.getElementById('status-info-icon');
            const hasDetail = icon && icon.style.visibility === 'visible';
            if (hasDetail) {
                statusWrapper.classList.toggle('pinned');
                e.stopPropagation(); // prevent document handler from immediately unpinning
            }
        });
        // Clicking inside the pinned popover should not close it
        const popover = document.getElementById('status-popover');
        if (popover) {
            popover.addEventListener('click', (e) => e.stopPropagation());
        }
        document.addEventListener('click', () => {
            statusWrapper.classList.remove('pinned');
        });
    }

    /**
     * Updates the bottom status bar and its hover/click popover.
     *
     * Messages from transports use '\n  ' (newline + indent) to separate the
     * connection summary from secondary detail (e.g. TLS cert info).
     * The status bar shows only the first line; the popover shows all lines
     * with a blank line between the summary and the detail for readability.
     * The ⓘ icon is shown when there is secondary detail OR when the status
     * text is truncated by CSS overflow (scrollWidth > clientWidth).
     */
    function setStatus(message) {
        if (!statusDisplay) return;
        const parts = message ? message.split(/\n\s+/) : [message || ''];
        // Status bar: first part only — CSS ellipsis trims further if needed
        statusDisplay.textContent = parts[0];

        // Popover content: summary line, blank separator, then detail lines
        const content = document.getElementById('status-popover-content');
        if (content) {
            content.textContent = parts.length > 1
                ? parts[0] + '\n\n' + parts.slice(1).join('\n')
                : parts[0];
        }

        // Show ⓘ icon when there is secondary detail OR when text is truncated.
        // Use rAF so the DOM has reflowed and scrollWidth is accurate.
        const icon = document.getElementById('status-info-icon');
        if (icon) {
            requestAnimationFrame(() => {
                const isTruncated = statusDisplay.scrollWidth > statusDisplay.clientWidth;
                const hasDetail = parts.length > 1;
                if (isTruncated || hasDetail) {
                    icon.style.visibility = 'visible';
                } else {
                    icon.style.visibility = 'hidden';
                    // Also unpin if the detail just went away
                    const wrapper = document.getElementById('status-wrapper');
                    if (wrapper) wrapper.classList.remove('pinned');
                }
            });
        }
    }

    // Initialise icon as hidden on load
    const _initIcon = document.getElementById('status-info-icon');
    if (_initIcon) _initIcon.style.visibility = 'hidden';

    // TLS badge click-to-pin handler
    const tlsBadgeEl = document.getElementById('tls-badge');
    if (tlsBadgeEl) {
        tlsBadgeEl.addEventListener('click', (e) => {
            tlsBadgeEl.classList.toggle('pinned');
            e.stopPropagation();
        });
        document.addEventListener('click', () => tlsBadgeEl.classList.remove('pinned'));
        const tlsPopoverEl = document.getElementById('tls-badge-popover');
        if (tlsPopoverEl) {
            tlsPopoverEl.addEventListener('click', (e) => e.stopPropagation());
        }
    }

});

