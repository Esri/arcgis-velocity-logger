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

    function updateGrpcRowVisibility() {
        const isGrpc = connectionTypeSelect.value.startsWith('grpc');
        const isGrpcClient = connectionTypeSelect.value === 'grpc-client';

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

        grpcHeaderPathKeyInput.style.display = isGrpcClient ? '' : 'none';
        grpcHeaderPathInput.style.display = isGrpcClient ? '' : 'none';
        const showTlsCerts = isGrpc && grpcTlsCheckbox.checked;
        grpcTlsCaInput.style.display = showTlsCerts ? '' : 'none';
        grpcTlsCertInput.style.display = showTlsCerts ? '' : 'none';
        grpcTlsKeyInput.style.display = showTlsCerts ? '' : 'none';
        updateGrpcSerializationTooltip();
    }

    connectionTypeSelect.addEventListener('change', updateGrpcRowVisibility);

    grpcSerializationSelect.addEventListener('change', updateGrpcSerializationTooltip);
    updateGrpcSerializationTooltip();

    grpcSendMethodSelect.addEventListener('change', updateGrpcSendMethodTooltip);
    updateGrpcSendMethodTooltip();

    grpcTlsCheckbox.addEventListener('change', () => {
        const isGrpc = connectionTypeSelect.value.startsWith('grpc');
        const show = isGrpc && grpcTlsCheckbox.checked;
        grpcTlsCaInput.style.display = show ? '' : 'none';
        grpcTlsCertInput.style.display = show ? '' : 'none';
        grpcTlsKeyInput.style.display = show ? '' : 'none';
    });

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

    // Function to update the application status display
    function setAppStatus(status) {
        const statusState = status.toLowerCase();
        
        // Update status text
        appStatusText.textContent = status;
        appStatusText.setAttribute('data-state', statusState);

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

    window.electronAPI.on('tcp-status', (message) => {
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.title = message;
        }
        if (statusDisplay) {
            statusDisplay.textContent = message;
        }
    });

    window.electronAPI.on('udp-status', (message) => {
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.title = message;
        }
        if (statusDisplay) {
            statusDisplay.textContent = message;
        }
    });

    window.electronAPI.on('udp-error', (message) => {
        showErrorDialog(message);
        statusDisplay.textContent = `Error: ${message}`;
        setAppStatus(Status.ERROR);
    });

    window.electronAPI.on('tcp-error', (message) => {
        showErrorDialog(message);
        statusDisplay.textContent = `Error: ${message}`;
        setAppStatus(Status.ERROR);
    });

    window.electronAPI.on('grpc-status', (message) => {
        if (statusElement) {
            statusElement.textContent = message;
            statusElement.title = message;
        }
        if (statusDisplay) {
            statusDisplay.textContent = message;
        }
    });

    window.electronAPI.on('grpc-error', (message) => {
        showErrorDialog(message);
        statusDisplay.textContent = `Error: ${message}`;
        setAppStatus(Status.ERROR);
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


});