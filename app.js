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
    const height = svg.clientHeight || 600;
    
    // Filter nodes
    const nodes = filterType === 'all' 
        ? data.nodes 
        : data.nodes.filter(n => n.type === filterType);
    
    if (nodes.length === 0) {
        svg.innerHTML = `
            <text x="${width/2}" y="${height/2}" text-anchor="middle" fill="var(--text-tertiary)" font-size="14px">
                No nodes to display
            </text>
        `;
        return;
    }
    
    // Filter edges to only include filtered nodes
    const nodeIds = new Set(nodes.map(n => n.id));
    const edges = data.edges.filter(e => 
        nodeIds.has(e.source) && nodeIds.has(e.target)
    );
    
    // Improved force-directed layout with better spacing
    const positions = {};
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = Math.min(width, height) / 3.5;
    
    nodes.forEach((node, i) => {
        const angle = (2 * Math.PI * i) / nodes.length;
        positions[node.id] = {
            x: centerX + radius * Math.cos(angle) * graphZoom + graphOffset.x,
            y: centerY + radius * Math.sin(angle) * graphZoom + graphOffset.y
        };
    });
    
    // Draw edges with better styling
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
            line.setAttribute('stroke-dasharray', edge.type === 'depends_on' ? '4,4' : 'none');
            svg.appendChild(line);
        }
    });
    
    // Draw nodes with better visual design
    nodes.forEach(node => {
        const pos = positions[node.id];
        if (pos) {
            // Outer glow circle
            const glow = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            glow.setAttribute('cx', pos.x);
            glow.setAttribute('cy', pos.y);
            glow.setAttribute('r', 26);
            glow.setAttribute('fill', getNodeColor(node.type));
            glow.setAttribute('opacity', '0.1');
            svg.appendChild(glow);
            
            // Main node circle
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', pos.x);
            circle.setAttribute('cy', pos.y);
            circle.setAttribute('r', 22);
            circle.setAttribute('class', 'graph-node');
            circle.setAttribute('fill', getNodeColor(node.type));
            circle.setAttribute('stroke', '#ffffff');
            circle.setAttribute('stroke-width', '2');
            circle.setAttribute('data-node-id', node.id);
            
            circle.addEventListener('click', () => {
                selectedNode = node;
                switchView('review');
                loadNodeDetails(node.id);
            });
            
            circle.addEventListener('mouseenter', () => {
                circle.setAttribute('r', '26');
            });
            
            circle.addEventListener('mouseleave', () => {
                circle.setAttribute('r', '22');
            });
            
            svg.appendChild(circle);
            
            // Add label with background
            const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            const labelText = node.label.substring(0, 20);
            labelBg.setAttribute('x', pos.x - 40);
            labelBg.setAttribute('y', pos.y + 32);
            labelBg.setAttribute('width', 80);
            labelBg.setAttribute('height', 18);
            labelBg.setAttribute('rx', 4);
            labelBg.setAttribute('fill', 'rgba(255, 255, 255, 0.95)');
            labelBg.setAttribute('stroke', 'var(--border-color)');
            labelBg.setAttribute('stroke-width', '1');
            svg.appendChild(labelBg);
            
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', pos.x);
            text.setAttribute('y', pos.y + 44);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '11px');
            text.setAttribute('fill', 'var(--text-primary)');
            text.setAttribute('font-weight', '500');
            text.textContent = labelText;
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
        workspace.classList.add('drag-over');
    });
    
    workspace.addEventListener('dragleave', () => {
        workspace.classList.remove('drag-over');
    });
    
    workspace.addEventListener('drop', (e) => {
        e.preventDefault();
        workspace.classList.remove('drag-over');
        const blockType = e.dataTransfer.getData('block-type');
        if (blockType) {
            const rect = workspace.getBoundingClientRect();
            addBlockToWorkspace(blockType, e.clientX - rect.left, e.clientY - rect.top);
        }
    });
}

function addBlockToWorkspace(type, x, y) {
    const workspace = document.getElementById('builderWorkspace');
    const emptyState = workspace.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    workspace.classList.remove('drag-over');
    
    const block = document.createElement('div');
    block.className = 'block-item';
    block.style.position = 'absolute';
    block.style.left = `${x - 50}px`;
    block.style.top = `${y - 20}px`;
    block.style.cursor = 'move';
    block.style.width = 'auto';
    block.style.minWidth = '120px';
    block.innerHTML = `
        <span class="block-icon"></span>
        <span>${type.charAt(0).toUpperCase() + type.slice(1)}</span>
    `;
    block.dataset.block = type;
    
    block.addEventListener('click', () => {
        showBlockProperties(type);
    });
    
    // Add animation
    block.style.opacity = '0';
    block.style.transform = 'scale(0.8)';
    workspace.appendChild(block);
    
    setTimeout(() => {
        block.style.transition = 'all 0.3s ease';
        block.style.opacity = '1';
        block.style.transform = 'scale(1)';
    }, 10);
}

function showBlockProperties(type) {
    const properties = document.getElementById('builderProperties');
    const emptyState = properties.querySelector('.empty-state');
    if (emptyState) {
        emptyState.remove();
    }
    
    properties.innerHTML = `
        <h3 class="sidebar-title">Properties</h3>
        <div class="detail-section" style="margin-bottom: var(--spacing-md); padding-bottom: var(--spacing-md); border-bottom: 1px solid var(--border-color);">
            <label style="display: block; margin-bottom: var(--spacing-sm); font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Block Type</label>
            <input type="text" value="${type.charAt(0).toUpperCase() + type.slice(1)}" style="width: 100%; padding: var(--spacing-sm); border: 1px solid var(--border-color); border-radius: 6px; font-family: var(--font-body); font-size: 0.875rem; background: var(--bg-primary); color: var(--text-primary);" readonly>
        </div>
        <div class="detail-section" style="margin-bottom: var(--spacing-md);">
            <label style="display: block; margin-bottom: var(--spacing-sm); font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Description</label>
            <textarea style="width: 100%; padding: var(--spacing-sm); border: 1px solid var(--border-color); border-radius: 6px; min-height: 120px; font-family: var(--font-body); font-size: 0.875rem; background: var(--bg-primary); color: var(--text-primary); resize: vertical;" placeholder="Enter block description..."></textarea>
        </div>
        <div class="detail-section">
            <label style="display: block; margin-bottom: var(--spacing-sm); font-size: 0.8125rem; font-weight: 600; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">Configuration</label>
            <input type="text" style="width: 100%; padding: var(--spacing-sm); border: 1px solid var(--border-color); border-radius: 6px; font-family: var(--font-body); font-size: 0.875rem; background: var(--bg-primary); color: var(--text-primary);" placeholder="Configure parameters...">
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
