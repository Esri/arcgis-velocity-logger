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

/**
 * @file velocity-login-renderer.js
 * @description Renderer-side logic for the Velocity Login / Output Picker dialog (Logger).
 * Communicates with the main process via window.velocityApi (exposed by preload).
 */

document.addEventListener('DOMContentLoaded', () => {
  if (window.themeLoader) {
    const params = new URLSearchParams(window.location.search);
    window.themeLoader.loadTheme(params.get('theme') || 'dark', params.get('themeHref') || '');
    if (window.velocityApi.onLoadSavedTheme) {
      window.velocityApi.onLoadSavedTheme((theme) => window.themeLoader.loadTheme(theme));
    }
  }
  // ─── Element References ────────────────────────────────────────────────────
  const tabs = document.querySelectorAll('.auth-tab');
  const formPassword = document.getElementById('auth-form-password');
  const formOAuth = document.getElementById('auth-form-oauth');
  const signInBtn = document.getElementById('sign-in-btn');
  const statusBanner = document.getElementById('status-banner');
  const statusBannerIcon = document.getElementById('status-banner-icon');
  const statusBannerText = document.getElementById('status-banner-text');
  const statusBannerDismiss = document.getElementById('status-banner-dismiss');
  const pickerSection = document.getElementById('picker-section');
  const itemTypeSelect = document.getElementById('item-type-select');
  const itemSelect = document.getElementById('item-select');
  const infoPanel = document.getElementById('info-panel');
  const applyBtn = document.getElementById('apply-btn');
  const closeBtn = document.getElementById('close-btn');
  const useTokenBtn = document.getElementById('use-token-btn');
  const refreshBtn = document.getElementById('refresh-btn');
  const scopeMyBtn = document.getElementById('scope-my');
  const scopeOrgBtn = document.getElementById('scope-org');
  const filterSupportedBtn = document.getElementById('filter-supported-btn');
  const filterAllBtn = document.getElementById('filter-all-btn');

  // Info fields
  const infoLabel = document.getElementById('info-label');
  const infoId = document.getElementById('info-id');
  const infoType = document.getElementById('info-type');
  const infoUrl = document.getElementById('info-url');
  const infoAuth = document.getElementById('info-auth');
  const infoFormat = document.getElementById('info-format');
  const infoSchema = document.getElementById('info-schema');
  const infoServer = document.getElementById('info-server');
  const infoAnalytic = document.getElementById('info-analytic');
  const infoAnalyticId = document.getElementById('info-analytic-id');
  const infoAvailability = document.getElementById('info-availability');

  let currentTab = 'password';
  let allItems = [];
  let selectedItem = null;
  let listRevision = 0;
  let selectionRevision = 0;
  let loading = false;
  let detailsPending = false;
  let selectedRevision = null;
  let listedRevision = null;
  let useAdminScope = true; // default: org outputs
  let showUnsupported = false; // default: show supported only

  const endpoint = window.VelocityEndpointUI.create({
    document,
    api: window.velocityApi,
    onInvalidate: invalidateItems,
    onChange: syncActions,
    onLoadItems: () => refreshItems('Loading outputs…'),
    setStatus,
  });

  function tooltip(control, text) {
    control.dataset.tooltip = text;
    control.setAttribute('aria-label', text);
  }

  // Existing title tooltips are migrated by the shared tooltip utility.
  document.querySelectorAll('button, input, select, label').forEach(control => {
    const target = control.htmlFor && document.getElementById(control.htmlFor);
    const text = control.dataset.tooltip || control.getAttribute('title')
      || (target && (target.dataset.tooltip || target.getAttribute('title')));
    if (text) tooltip(control, text);
  });

  function syncActions() {
    const unavailable = !endpoint.canBrowse || loading || Boolean(endpoint.busy);
    [refreshBtn, scopeMyBtn, scopeOrgBtn, itemSelect, itemTypeSelect,
      filterSupportedBtn, filterAllBtn].forEach(control => { control.disabled = unavailable; });
    const canApply = !unavailable && !detailsPending && selectedItem && selectedItem.supported
      && !selectedItem.detailRequired && selectedRevision === endpoint.session.revision;
    applyBtn.disabled = !canApply;
    const reason = selectedItem && selectedItem.unsupportedReason;
    tooltip(applyBtn, !endpoint.canBrowse
      ? 'Sign in or apply the pending endpoint before applying an output.'
      : detailsPending ? 'Loading output details before applying connection settings.'
      : reason ? `Cannot apply — ${reason}`
      : selectedItem && !selectedItem.supported ? 'Cannot apply — this output has no supported data subscription.'
      : "Apply the selected output's connection settings to the main window.");
  }

  function clearSelection() {
    selectionRevision++;
    selectedItem = null;
    selectedRevision = null;
    detailsPending = false;
    infoPanel.classList.add('hidden');
    applyBtn.disabled = true;
  }

  function invalidateItems() {
    listRevision++;
    loading = false;
    listedRevision = null;
    allItems = [];
    clearSelection();
    itemSelect.replaceChildren();
    itemTypeSelect.replaceChildren();
    pickerSection.classList.add('hidden');
    setStatus('');
  }

  // ─── Type icons and colors ─────────────────────────────────────────────────
  const TYPE_META = {
    'grpc':       { icon: '\u2B21', label: 'gRPC',      color: '#7c4dff' },
    'http':       { icon: '\u25A0', label: 'HTTP',       color: '#0097a7' },
    'websocket':  { icon: '\u25C6', label: 'WebSocket',  color: '#00897b' },
    'stream-lyr-new': { icon: '\u25C6', label: 'Stream Layer', color: '#00897b' },
    'xmpp':       { icon: '\u25CF', label: 'XMPP',       color: '#5e35b1' },
    'tcp':        { icon: '\u25D7', label: 'TCP',        color: '#546e7a' },
    'kafka':      { icon: '\u25B2', label: 'Kafka',      color: '#e53935' },
    'mqtt':       { icon: '\u25CE', label: 'MQTT',       color: '#f57c00' },
    'file':       { icon: '\u25A3', label: 'File',       color: '#8d6e63' },
    'azure-event-hub':   { icon: '\u2756', label: 'Azure Event Hub',  color: '#0078d4' },
    'azure-service-bus': { icon: '\u2756', label: 'Azure Svc Bus',    color: '#0062ad' },
  };
  function typeMeta(typeKey) {
    return TYPE_META[typeKey] || { icon: '\u25EF', label: typeKey, color: '#888' };
  }

  // ─── Show/Hide Unsupported Toggle (radio-style) ───────────────────────────
  function syncFilterBtns() {
    if (filterSupportedBtn) filterSupportedBtn.classList.toggle('active', !showUnsupported);
    if (filterAllBtn) filterAllBtn.classList.toggle('active', showUnsupported);
  }

  if (filterSupportedBtn) {
    filterSupportedBtn.addEventListener('click', () => {
      if (showUnsupported) {
        showUnsupported = false;
        syncFilterBtns();
        populateTypeDropdown();
        if (listedRevision !== null) reportListStatus();
      }
    });
  }

  if (filterAllBtn) {
    filterAllBtn.addEventListener('click', () => {
      if (!showUnsupported) {
        showUnsupported = true;
        syncFilterBtns();
        populateTypeDropdown();
        if (listedRevision !== null) reportListStatus();
      }
    });
  }

  syncFilterBtns(); // set initial state

  // ─── Scope Toggle ──────────────────────────────────────────────────────────
  function setScope(admin) {
    useAdminScope = admin;
    if (scopeMyBtn) scopeMyBtn.classList.toggle('active', !admin);
    if (scopeOrgBtn) scopeOrgBtn.classList.toggle('active', admin);
  }

  setScope(true); // default to Org Outputs

  if (scopeMyBtn) scopeMyBtn.addEventListener('click', async () => {
    if (useAdminScope && endpoint.canBrowse && !loading) {
      setScope(false);
      await refreshItems('Loading my outputs…');
    }
  });

  if (scopeOrgBtn) scopeOrgBtn.addEventListener('click', async () => {
    if (!useAdminScope && endpoint.canBrowse && !loading) {
      setScope(true);
      await refreshItems('Loading org outputs…');
    }
  });

  // ─── Tab Switching ─────────────────────────────────────────────────────────
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      formPassword.classList.toggle('hidden', currentTab !== 'password');
      formOAuth.classList.toggle('hidden', currentTab !== 'oauth');
    });
  });

  // ─── Sign In ───────────────────────────────────────────────────────────────
  signInBtn.addEventListener('click', () => endpoint.signIn(currentTab));

  // ─── Refresh Button ────────────────────────────────────────────────────────
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      if (endpoint.canBrowse) await refreshItems('Refreshing outputs…');
    });
  }

  // ─── Load Items ────────────────────────────────────────────────────────────
  async function refreshItems(message) {
    if (!endpoint.canBrowse) return;
    const epoch = endpoint.generation;
    const revision = endpoint.session.revision;
    const request = ++listRevision;
    clearSelection();
    allItems = [];
    listedRevision = null;
    endpoint.setListErrors([]);
    pickerSection.classList.add('hidden');
    loading = true;
    syncActions();
    setStatus('info', message);
    try {
      const response = await window.velocityApi.listItems({
        adminScope: useAdminScope, revision, serverId: endpoint.session.selectedServerId,
      });
      if (epoch !== endpoint.generation || request !== listRevision) return;
      if (response && response.error) throw new Error(response.error);
      if (!response || response.revision !== revision || !Array.isArray(response.items)
        || !Array.isArray(response.errors) || response.errors.some(error => !error
          || typeof error.serverId !== 'string' || typeof error.message !== 'string')) {
        throw new Error('The output list response is invalid. Check the effective API URL and try again.');
      }
      const { items, errors } = response;
      if (!Array.isArray(items) || items.some(item => !item || typeof item !== 'object' || Array.isArray(item)
        || typeof item.outputType !== 'string' || !item.outputType
        || typeof item.label !== 'string' || typeof item.supported !== 'boolean')) {
        throw new Error('The output list response is invalid. Check the effective API URL and try again.');
      }
      const keys = new Set();
      allItems = items.map(item => {
        const key = item.id;
        if (typeof key !== 'string' || !key || keys.has(key)) throw new Error('The output list contains missing or duplicate identities.');
        keys.add(String(key));
        return { ...item, key: String(key) };
      });
      listedRevision = response.revision;
      endpoint.setListErrors(errors);
      populateTypeDropdown();
      pickerSection.classList.remove('hidden');
      reportListStatus();
    } catch (error) {
      if (epoch === endpoint.generation && request === listRevision) {
        allItems = [];
        setStatus('error', error.message || 'Could not load outputs.');
      }
    } finally {
      if (epoch === endpoint.generation && request === listRevision) {
        loading = false;
        syncActions();
      }
    }
  }

  function reportListStatus() {
    const supported = allItems.filter(item => item.supported).length;
    const unsupportedOnly = supported === 0 && allItems.length > 0 && !showUnsupported;
    const count = `${supported} supported of ${allItems.length} outputs.`;
    const hint = unsupportedOnly ? ' Choose All beside Supported to view unsupported outputs.' : '';
    const errors = endpoint.listErrorMessage;
    setStatus(errors ? 'warning' : unsupportedOnly ? 'info' : 'success', errors
      ? `${count}${hint} Some Velocity servers could not be queried. ${errors}` : `${count}${hint}`);
  }

  function populateTypeDropdown() {
    const visibleItems = showUnsupported ? allItems : allItems.filter(i => i.supported || i.detailRequired);
    const types = [...new Set(visibleItems.map(i => i.outputType))].sort();
    itemTypeSelect.innerHTML = '<option value="" title="Show all output types">All Types</option>';
    types.forEach(type => {
      const opt = document.createElement('option');
      opt.value = type;
      const supported = allItems.some(i => i.outputType === type && (i.supported || i.detailRequired));
      const meta = typeMeta(type);
      opt.textContent = supported ? `${meta.icon} ${meta.label}` : `\u26A0 ${meta.label}`;
      opt.style.color = supported ? meta.color : '#f5a623';
      if (!supported) opt.classList.add('type-option-unsupported');
      opt.title = supported ? `Show ${meta.label} outputs` : `${meta.label} - not yet supported by the Logger`;
      itemTypeSelect.appendChild(opt);
    });
    populateItemDropdown();
  }

  function populateItemDropdown() {
    const filterType = itemTypeSelect.value;
    const visibleItems = showUnsupported ? allItems : allItems.filter(i => i.supported || i.detailRequired);
    const filtered = filterType ? visibleItems.filter(i => i.outputType === filterType) : visibleItems;
    itemSelect.innerHTML = '<option value="" title="Select an output to view its details">- Select -</option>';
    filtered.forEach((item) => {
      const opt = document.createElement('option');
      opt.value = item.key;
      const analyticLabel = item.analyticId
        ? `${item.label} — ${item.analyticName || item.analyticId} (${item.analyticKind || 'analytic'}: ${item.analyticId})`
        : item.label;
      const label = item.serverId ? `${analyticLabel} — ${sourceServerLabel(item)}` : analyticLabel;
      const meta = typeMeta(item.outputType);
      const available = item.supported || item.detailRequired;
      opt.textContent = available
        ? `${meta.icon} ${label}  [${meta.label}]`
        : `\u26A0 ${label}  [${meta.label}]`;
      opt.style.color = available ? meta.color : '#f5a623';
      if (!available) opt.classList.add('item-option-unsupported');
      opt.title = available
        ? `${label} - ${meta.label} output`
        : `${label} - ${item.unsupportedReason || 'No supported data subscription'}`;
      itemSelect.appendChild(opt);
    });
    clearSelection();
    syncSelectTooltip(itemTypeSelect);
    syncSelectTooltip(itemSelect);
    syncActions();
  }

  function syncSelectTooltip(select) {
    const option = select.selectedOptions[0];
    if (option) tooltip(select, option.dataset.tooltip || option.title || select.getAttribute('aria-label'));
  }

  // ─── Dropdown Events ───────────────────────────────────────────────────────
  itemTypeSelect.addEventListener('change', populateItemDropdown);

  itemSelect.addEventListener('change', async () => {
    clearSelection();
    syncSelectTooltip(itemSelect);
    if (!endpoint.canBrowse || loading || endpoint.busy) return;
    const opt = itemSelect.selectedOptions[0];
    if (!opt || opt.value === '') return;
    const item = allItems.find(candidate => candidate.key === opt.value);
    if (!item) return;
    selectedItem = item;
    selectedRevision = listedRevision;
    detailsPending = !!item.detailRequired;
    showInfo(item);
    syncActions();
    if (!detailsPending) return;
    const epoch = endpoint.generation;
    const selection = selectionRevision;
    const stillCurrent = () => epoch === endpoint.generation && selection === selectionRevision;
    setStatus('info', 'Loading output subscription details…');
    try {
      const detail = await window.velocityApi.getItemDetails({
        id: item.id, revision: selectedRevision,
      });
      if (!stillCurrent()) return;
      if (detail && detail.error) throw new Error(detail.error);
      if (!detail || typeof detail !== 'object' || Array.isArray(detail)
        || detail.detailRequired || typeof detail.supported !== 'boolean'
        || detail.id !== item.id
        || (detail.key && String(detail.key) !== item.key)
        || ['serverId', 'analyticKind', 'analyticId', 'outputId', 'id'].some(key => item[key] != null
          && detail[key] != null && detail[key] !== item[key])) {
        throw new Error('The output detail response is invalid or does not match the selected output.');
      }
      selectedItem = { ...item, ...detail, key: item.key, detailRequired: false };
      detailsPending = false;
      showInfo(selectedItem);
      setStatus(selectedItem.supported ? 'success' : 'error',
        selectedItem.supported ? 'Output subscription details loaded.' : selectedItem.unsupportedReason || 'This output has no supported data subscription.');
    } catch (error) {
      if (!stillCurrent()) return;
      detailsPending = false;
      selectedItem = { ...item, supported: false, unsupportedReason: error.message };
      showInfo(selectedItem);
      setStatus('error', error.message);
    } finally {
      if (stillCurrent()) syncActions();
    }
  });

  // ─── Info Panel ────────────────────────────────────────────────────────────
  function showInfo(item) {
    const meta = typeMeta(item.outputType || '');
    const badge = document.getElementById('info-type-badge');
    if (badge) {
      badge.textContent = meta.icon + ' ';
      badge.style.color = meta.color;
      badge.title = meta.label;
    }
    infoLabel.textContent = item.label || '-';
    infoId.textContent = item.outputId || item.id || '-';
    infoServer.textContent = sourceServerLabel(item);
    infoAnalytic.textContent = item.analyticName || '-';
    infoAnalyticId.textContent = item.analyticId || '-';
    infoType.textContent = meta.label || item.outputType || '-';
    infoUrl.textContent = visibleEndpoint(item.url || item.host);
    infoAuth.textContent = item.authType || 'none';
    infoFormat.textContent = item.format || '-';
    const schemaFields = Array.isArray(item.schema) ? item.schema.map(f => f && (f.name || f.fieldName || f)).join(', ') : '-';
    infoSchema.textContent = schemaFields || '-';
    infoAvailability.textContent = item.unsupportedReason
      || (detailsPending ? 'Resolving subscription details…'
        : item.supported ? 'Supported data subscription' : 'No supported data subscription');
    infoPanel.classList.remove('hidden');
  }

  function visibleEndpoint(value) {
    if (!value) return '-';
    try {
      const url = new URL(value);
      url.username = '';
      url.password = '';
      url.search = '';
      url.hash = '';
      return url.href;
    } catch (_) { return String(value).split(/[?#]/)[0].replace(/^.*@/, ''); }
  }

  function sourceServerLabel(item) {
    return item.serverName && item.serverId
      ? `${item.serverName} (${item.serverId})`
      : item.serverName || item.serverId || '-';
  }

  // ─── Apply ─────────────────────────────────────────────────────────────────
  applyBtn.addEventListener('click', () => applySelection(false));

  // ─── Use Token Only ───────────────────────────────────────────────────────
  if (useTokenBtn) {
    useTokenBtn.addEventListener('click', () => applySelection(true));
  }

  async function applySelection(tokenOnly) {
    if (!endpoint.session || endpoint.busy || (tokenOnly ? !endpoint.session.authenticated
      : !endpoint.canBrowse || loading || !selectedItem || !selectedItem.supported || selectedItem.detailRequired
        || detailsPending || selectedRevision !== endpoint.session.revision)) return;
    const selection = selectionRevision;
    await endpoint.applyItem({
      ...(tokenOnly ? { tokenOnly: true } : { id: selectedItem.id }),
      revision: tokenOnly ? endpoint.session.revision : selectedRevision,
    }, () => tokenOnly || selection === selectionRevision);
  }

  // ─── Close ─────────────────────────────────────────────────────────────────
  closeBtn.addEventListener('click', () => endpoint.close());

  // ─── Enter key in password / secret fields triggers Sign In ────────────────
  function handleEnterKey(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      signInBtn.click();
    }
  }
  const passwordInput = document.getElementById('password');
  const clientSecretInput = document.getElementById('client-secret');
  if (passwordInput) passwordInput.addEventListener('keydown', handleEnterKey);
  if (clientSecretInput) clientSecretInput.addEventListener('keydown', handleEnterKey);

  // ─── Password Visibility Toggle ────────────────────────────────────────────
  const EYE_OPEN_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>';
  const EYE_CLOSED_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46A11.8 11.8 0 001 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/></svg>';

  function setupPasswordToggle(toggleId, inputId) {
    const toggle = document.getElementById(toggleId);
    const input = document.getElementById(inputId);
    if (!toggle || !input) return;
    toggle.addEventListener('click', () => {
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      toggle.innerHTML = visible ? EYE_OPEN_SVG : EYE_CLOSED_SVG;
      const name = inputId === 'client-secret' ? 'client secret' : 'password';
      tooltip(toggle, `${visible ? 'Show' : 'Hide'} ${name}`);
    });
  }
  setupPasswordToggle('toggle-password', 'password');
  setupPasswordToggle('toggle-client-secret', 'client-secret');

  // ─── Status Helper ─────────────────────────────────────────────────────────
  function setStatus(type, message) {
    statusBanner.className = 'status-banner';
    if (type === 'signing-in') {
      statusBanner.classList.add('info');
      statusBannerIcon.innerHTML = '<span class="spinner"></span>';
      statusBannerText.textContent = 'Signing in…';
      statusBannerDismiss.classList.add('hidden');
      statusBanner.classList.remove('hidden');
    } else if (type === 'error') {
      statusBanner.classList.add('error');
      statusBannerIcon.textContent = '✕';
      statusBannerText.textContent = message;
      statusBannerDismiss.classList.remove('hidden');
      statusBanner.classList.remove('hidden');
    } else if (type === 'success') {
      statusBanner.classList.add('success');
      statusBannerIcon.textContent = '✓';
      statusBannerText.textContent = message;
      statusBannerDismiss.classList.remove('hidden');
      statusBanner.classList.remove('hidden');
    } else if (type === 'warning') {
      statusBanner.classList.add('warning');
      statusBannerIcon.textContent = '!';
      statusBannerText.textContent = message;
      statusBannerDismiss.classList.remove('hidden');
      statusBanner.classList.remove('hidden');
    } else if (type === 'info') {
      statusBanner.classList.add('info');
      statusBannerIcon.innerHTML = '<span class="spinner"></span>';
      statusBannerText.textContent = message;
      statusBannerDismiss.classList.remove('hidden');
      statusBanner.classList.remove('hidden');
    } else {
      statusBanner.classList.add('hidden');
    }
  }

  statusBannerDismiss.addEventListener('click', () => {
    statusBanner.classList.add('hidden');
  });
  endpoint.initialize();
});
