// API Configuration
const API_BASE_URL = 'http://localhost:3000/api';

// Application State
let currentView = 'query';
let currentRole = 'analyst';
let selectedNode = null;
let graphData = null;
let graphZoom = 1;
let graphOffset = { x: 0, y: 0 };

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation();
    initializeQueryInterface();
    initializeGraphExplorer();
    initializeDecisionBuilder();
    initializeReviewView();
    initializeRoleSelector();
    loadNodeCount();
});

// Navigation
function initializeNavigation() {
    const navTabs = document.querySelectorAll('.nav-tab');
    navTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            const view = tab.dataset.view;
            switchView(view);
        });
    });
}

function switchView(viewName) {
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.view === viewName);
    });
    
    // Update active view
    document.querySelectorAll('.view').forEach(view => {
        view.classList.toggle('active', view.id === `${viewName}-view`);
    });
    
    currentView = viewName;
    
    // Load view-specific data
    if (viewName === 'graph') {
        loadGraphData();
    } else if (viewName === 'review') {
        loadNodeList();
    }
}

// Query Interface (7.1)
function initializeQueryInterface() {
    const queryInput = document.getElementById('queryInput');
    const querySubmit = document.getElementById('querySubmit');
    
    querySubmit.addEventListener('click', handleQuery);
    queryInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleQuery();
        }
    });
}

async function handleQuery() {
    const queryInput = document.getElementById('queryInput');
    const query = queryInput.value.trim();
    
    if (!query) return;
    
    addQueryMessage('user', query);
    queryInput.value = '';
    
    try {
        const response = await fetch(`${API_BASE_URL}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: query,
                role: currentRole
            })
        });
        
        const data = await response.json();
        addQueryMessage('bot', null, data);
    } catch (error) {
        console.error('Query error:', error);
        addQueryMessage('bot', null, {
            structured: true,
            content: {
                error: 'Unable to connect to backend. Please ensure the API server is running.'
            }
        });
    }
}

function addQueryMessage(type, text, structuredResponse = null) {
    const history = document.getElementById('queryHistory');
    const messageDiv = document.createElement('div');
    messageDiv.className = `query-message ${type}`;
    
    const timeStr = 'Just now';
    
    if (type === 'user') {
        messageDiv.innerHTML = `
            <div class="message-content">
                <p class="message-text">${text}</p>
            </div>
            <div class="message-time">${timeStr}</div>
        `;
    } else {
        let content = '';
        
        if (structuredResponse && structuredResponse.structured) {
            const contentObj = structuredResponse.content;
            if (contentObj.error) {
                content = `<p class="message-text">${contentObj.error}</p>`;
            } else {
                content = `<p class="message-text">Here is the relevant institutional logic:</p>`;
                content += '<div class="structured-output">';
                
                for (const [key, value] of Object.entries(contentObj)) {
                    if (Array.isArray(value)) {
                        content += `<div class="structured-item"><strong>${key}</strong><span>${value.join(', ')}</span></div>`;
                    } else {
                        content += `<div class="structured-item"><strong>${key}</strong><span>${value}</span></div>`;
                    }
                }
                
                content += '</div>';
            }
        } else {
            content = `<p class="message-text">${text || 'I understand your query.'}</p>`;
        }
        
        messageDiv.innerHTML = `
            <div class="message-content">
                ${content}
            </div>
            <div class="message-time">${timeStr}</div>
        `;
    }
    
    history.appendChild(messageDiv);
    history.scrollTop = history.scrollHeight;
}

// Graph Explorer (7.2)
function initializeGraphExplorer() {
    document.getElementById('nodeTypeFilter').addEventListener('change', (e) => {
        if (graphData) {
            renderGraph(graphData, e.target.value);
        }
    });
    
    document.getElementById('zoomIn').addEventListener('click', () => {
        graphZoom = Math.min(graphZoom * 1.2, 3);
        if (graphData) renderGraph(graphData);
    });
    
    document.getElementById('zoomOut').addEventListener('click', () => {
        graphZoom = Math.max(graphZoom / 1.2, 0.3);
        if (graphData) renderGraph(graphData);
    });
    
    document.getElementById('resetZoom').addEventListener('click', () => {
        graphZoom = 1;
        graphOffset = { x: 0, y: 0 };
        if (graphData) renderGraph(graphData);
    });
}

async function loadGraphData() {
    try {
        const response = await fetch(`${API_BASE_URL}/graph`);
        const data = await response.json();
        graphData = data;
        renderGraph(data);
    } catch (error) {
        console.error('Failed to load graph:', error);
    }
}

function renderGraph(data, filterType = 'all') {
    const svg = document.getElementById('graphCanvas');
    svg.innerHTML = '';
    
    const width = svg.clientWidth || 800;
    const height = svg.clientHeight || 500;
    
    // Filter nodes
    const nodes = filterType === 'all' 
        ? data.nodes 
        : data.nodes.filter(n => n.type === filterType);
    
    // Filter edges to only include filtered nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = data.edges.filter(e => 
        nodeIds.has(e.source) && nodeIds.has(e.target)
    );
    
    // Simple force-directed layout
    const positions = {};
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 3;
    
    nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodes.length;
        positions[node.id] = {
            x: centerX + radius * Math.cos(angle) * graphZoom + graphOffset.x,
            y: centerY + radius * Math.sin(angle) * graphZoom + graphOffset.y
        };
    });
    
    // Draw edges
    edges.forEach(edge => {
        const source = positions[edge.source];
        const target = positions[edge.target];
        if (source && target) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', source.x);
            line.setAttribute('y1', source.y);
            line.setAttribute('x2', target.x);
            line.setAttribute('y2', target.y);
            line.setAttribute('class', 'graph-edge');
            svg.appendChild(line);
        }
    });
    
    // Draw nodes
    nodes.forEach(node => {
        const pos = positions[node.id];
        if (pos) {
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', pos.x);
            circle.setAttribute('cy', pos.y);
            circle.setAttribute('r', 20);
            circle.setAttribute('class', 'graph-node');
            circle.setAttribute('fill', getNodeColor(node.type));
            circle.setAttribute('data-node-id', node.id);
            
            circle.addEventListener('click', () => {
                selectedNode = node;
                switchView('review');
                loadNodeDetails(node.id);
            });
            
            svg.appendChild(circle);
            
            // Add label
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', pos.x);
            text.setAttribute('y', pos.y + 35);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '12px');
            text.setAttribute('fill', 'var(--text-primary)');
            text.textContent = node.label.substring(0, 15);
            svg.appendChild(text);
        }
    });
}

function getNodeColor(type) {
    const colors = {
        'Policy': '#4a90e2',
        'Procedure': '#50c878',
        'Precedent': '#f5a623',
        'Evidence': '#9012fe'
    };
    return colors[type] || '#666666';
}

// Decision Builder (7.3)
function initializeDecisionBuilder() {
    const blocks = document.querySelectorAll('.block-item');
    const workspace = document.getElementById('builderWorkspace');
    
    blocks.forEach(block => {
        block.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('block-type', block.dataset.block);
        });
    });
    
    workspace.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    workspace.addEventListener('drop', (e) => {
        e.preventDefault();
        const blockType = e.dataTransfer.getData('block-type');
        if (blockType) {
            addBlockToWorkspace(blockType, e.offsetX, e.offsetY);
        }
    });
}

function addBlockToWorkspace(type, x, y) {
    const workspace = document.getElementById('builderWorkspace');
    const emptyState = workspace.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    const block = document.createElement('div');
    block.className = 'block-item';
    block.style.position = 'absolute';
    block.style.left = `${x}px`;
    block.style.top = `${y}px`;
    block.style.cursor = 'move';
    block.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    block.dataset.block = type;
    
    block.addEventListener('click', () => {
        showBlockProperties(type);
    });
    
    workspace.appendChild(block);
}

function showBlockProperties(type) {
    const properties = document.getElementById('builderProperties');
    const emptyState = properties.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    properties.innerHTML = `
        <h3 class="sidebar-title">Properties</h3>
        <div class="detail-section">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem;">Block Type</label>
            <input type="text" value="${type}" style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px;" readonly>
        </div>
        <div class="detail-section">
            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.875rem;">Description</label>
            <textarea style="width: 100%; padding: 0.5rem; border: 1px solid var(--border-color); border-radius: 4px; min-height: 100px;"></textarea>
        </div>
    `;
}

// Review & Evidence View (7.4)
function initializeReviewView() {
    // Node selection handled in loadNodeList
}

async function loadNodeList() {
    try {
        const response = await fetch(`${API_BASE_URL}/nodes`);
        const data = await response.json();
        const nodeList = document.getElementById('nodeList');
        nodeList.innerHTML = '';
        
        data.nodes.forEach(node => {
            const item = document.createElement('div');
            item.className = 'node-list-item';
            item.innerHTML = `
                <div class="node-list-item-title">${node.label}</div>
                <div class="node-list-item-meta">${node.type} • ${node.metadata.validationState}</div>
            `;
            item.addEventListener('click', () => {
                document.querySelectorAll('.node-list-item').forEach(i => i.classList.remove('active'));
                item.classList.add('active');
                loadNodeDetails(node.id);
            });
            nodeList.appendChild(item);
        });
    } catch (error) {
        console.error('Failed to load nodes:', error);
    }
}

async function loadNodeDetails(nodeId) {
    try {
        const response = await fetch(`${API_BASE_URL}/nodes/${nodeId}`);
        const node = await response.json();
        
        const details = document.getElementById('reviewDetails');
        details.innerHTML = `
            <div class="detail-section">
                <h2 class="view-title">${node.label}</h2>
                <p class="detail-content">${node.description || 'No description available'}</p>
            </div>
            
            <div class="detail-section">
                <h3 class="detail-section-title">Metadata</h3>
                <div class="detail-content">
                    <p><strong>Type:</strong> ${node.type}</p>
                    <p><strong>Author:</strong> ${node.metadata.author}</p>
                    <p><strong>Created:</strong> ${new Date(node.metadata.createdAt).toLocaleDateString()}</p>
                    <p><strong>Last Modified:</strong> ${new Date(node.metadata.lastModified).toLocaleDateString()}</p>
                    <p><strong>Version:</strong> ${node.metadata.version}</p>
                    <p><strong>Status:</strong> ${node.metadata.validationState}</p>
                </div>
            </div>
            
            <div class="detail-section">
                <h3 class="detail-section-title">Evidence References</h3>
                <div class="evidence-list">
                    ${node.metadata.evidenceReferences.length > 0 
                        ? node.metadata.evidenceReferences.map(ref => `
                            <div class="evidence-item">
                                <div class="evidence-item-source">${ref}</div>
                                <div class="evidence-item-meta">Evidence reference</div>
                            </div>
                        `).join('')
                        : '<p class="detail-content">No evidence references</p>'
                    }
                </div>
            </div>
            
            <div class="detail-section">
                <h3 class="detail-section-title">Lineage</h3>
                <div class="detail-content">
                    <p><strong>Author:</strong> ${node.metadata.author}</p>
                    ${node.metadata.modifiedBy ? `<p><strong>Last Modified By:</strong> ${node.metadata.modifiedBy}</p>` : ''}
                    ${node.metadata.jurisdiction ? `<p><strong>Jurisdiction:</strong> ${node.metadata.jurisdiction}</p>` : ''}
                </div>
            </div>
        `;
    } catch (error) {
        console.error('Failed to load node details:', error);
    }
}

// Role-Adaptive Navigation (7.5)
function initializeRoleSelector() {
    const roleSelector = document.getElementById('roleSelector');
    roleSelector.addEventListener('change', (e) => {
        currentRole = e.target.value;
        // Role changes can trigger view updates
        if (currentView === 'query') {
            // Re-query with new role if needed
        }
    });
}

// Load node count for footer
async function loadNodeCount() {
    try {
        const response = await fetch(`${API_BASE_URL}/nodes`);
        const data = await response.json();
        document.getElementById('nodeCount').textContent = data.nodes.length;
    } catch (error) {
        console.error('Failed to load node count:', error);
    }
}
