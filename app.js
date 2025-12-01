// Mock data for demonstration
const mockKnowledgeGraph = {
    nodes: [
        { id: 'policy-001', type: 'policy', label: 'Underwriting Ratio Threshold', x: 200, y: 100 },
        { id: 'procedure-002', type: 'procedure', label: 'Due Diligence Workflow', x: 400, y: 200 },
        { id: 'precedent-003', type: 'precedent', label: 'Mixed-Use Development Case', x: 600, y: 150 },
        { id: 'evidence-004', type: 'evidence', label: 'Regulatory Guidance 2023', x: 300, y: 300 },
        { id: 'policy-005', type: 'policy', label: 'Risk Appetite Framework', x: 500, y: 350 },
    ],
    edges: [
        { source: 'policy-001', target: 'procedure-002', type: 'depends_on' },
        { source: 'procedure-002', target: 'precedent-003', type: 'references' },
        { source: 'policy-001', target: 'evidence-004', type: 'supported_by' },
        { source: 'policy-005', target: 'policy-001', type: 'constrains' },
    ]
};

const mockQueryResponses = {
    'financing proposal': {
        structured: true,
        content: {
            underwritingRatios: 'Loan-to-cost: 70% max, Debt-to-GDV: 60% max',
            jurisdictionalConstraints: 'Planning conditions must be satisfied prior to funding',
            mandatoryCovenants: 'Environmental impact assessment, Site safety certification',
            historicalDeals: '3 similar deals in past 12 months',
            proceduralSteps: ['Initial assessment', 'Due diligence', 'Board approval', 'Contract execution'],
            complianceDeclarations: 'AML check required, Regulatory filing within 30 days'
        }
    },
    'underwriting ratios': {
        structured: true,
        content: {
            loanToCost: 'Maximum 70%',
            debtToGDV: 'Maximum 60%',
            evidence: 'Based on Regulatory Guidance 2023 and Risk Appetite Framework',
            exceptions: 'Senior approval required for ratios above 65%',
            lastReview: '2024-01-15'
        }
    }
};

const mockNodeDetails = {
    'policy-001': {
        title: 'Underwriting Ratio Threshold',
        type: 'Policy',
        status: 'Validated',
        evidence: [
            { source: 'Regulatory Guidance 2023', section: 'Section 4.2', link: '#' },
            { source: 'Risk Appetite Framework', section: 'Chapter 3', link: '#' },
            { source: 'Board Resolution 2023-12', date: '2023-12-15', link: '#' }
        ],
        lineage: {
            author: 'Sarah Chen, Risk Officer',
            created: '2023-11-01',
            lastModified: '2024-01-15',
            modifiedBy: 'Michael Torres, Senior Risk Officer',
            rationale: 'Updated to reflect new regulatory requirements'
        },
        versions: [
            { version: '2.0', date: '2024-01-15', author: 'Michael Torres', changes: 'Updated thresholds' },
            { version: '1.0', date: '2023-11-01', author: 'Sarah Chen', changes: 'Initial creation' }
        ],
        approvals: [
            { step: 'Risk Committee Review', status: 'completed', approver: 'Risk Committee', date: '2024-01-10' },
            { step: 'Board Approval', status: 'completed', approver: 'Board of Directors', date: '2024-01-15' }
        ]
    },
    'procedure-002': {
        title: 'Due Diligence Workflow',
        type: 'Procedure',
        status: 'Pending Review',
        evidence: [
            { source: 'SOP Manual v3.2', section: 'Section 7.1', link: '#' }
        ],
        lineage: {
            author: 'Operations Team',
            created: '2023-08-20',
            lastModified: '2023-11-20',
            modifiedBy: 'Operations Team',
            rationale: 'Streamlined workflow based on feedback'
        },
        versions: [
            { version: '1.2', date: '2023-11-20', author: 'Operations Team', changes: 'Streamlined steps' },
            { version: '1.0', date: '2023-08-20', author: 'Operations Team', changes: 'Initial creation' }
        ],
        approvals: [
            { step: 'Operations Review', status: 'pending', approver: 'Operations Manager', date: null }
        ]
    },
    'precedent-003': {
        title: 'Mixed-Use Development Case',
        type: 'Precedent',
        status: 'Validated',
        evidence: [
            { source: 'Case File MD-2023-045', date: '2023-09-15', link: '#' },
            { source: 'Legal Opinion', author: 'Legal Counsel', date: '2023-09-20', link: '#' }
        ],
        lineage: {
            author: 'Project Team',
            created: '2023-09-15',
            lastModified: '2024-02-01',
            modifiedBy: 'Project Team',
            rationale: 'Updated with final outcomes'
        },
        versions: [
            { version: '2.0', date: '2024-02-01', author: 'Project Team', changes: 'Added final outcomes' },
            { version: '1.0', date: '2023-09-15', author: 'Project Team', changes: 'Initial case documentation' }
        ],
        approvals: [
            { step: 'Legal Review', status: 'completed', approver: 'Legal Counsel', date: '2023-09-20' },
            { step: 'Executive Approval', status: 'completed', approver: 'CEO', date: '2023-09-25' }
        ]
    }
};

// Application State
let currentView = 'query';
let currentRole = 'analyst';
let selectedNode = null;

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
    initializeNavigation();
    initializeQueryInterface();
    initializeGraphExplorer();
    initializeDecisionBuilder();
    initializeReviewView();
    initializeRoleSelector();
});

// Navigation
function initializeNavigation() {
    const navButtons = document.querySelectorAll('.nav-btn');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const view = btn.dataset.view;
            switchView(view);
            
            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function switchView(viewName) {
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
        targetView.classList.add('active');
        currentView = viewName;
        
        // Initialize view-specific features
        if (viewName === 'graph') {
            renderGraph();
        }
    }
}

// Role Selector
function initializeRoleSelector() {
    const roleSelector = document.getElementById('roleSelector');
    roleSelector.addEventListener('change', (e) => {
        currentRole = e.target.value;
        updateRoleBasedUI();
    });
}

function updateRoleBasedUI() {
    // Update UI based on role (7.5 Role-Adaptive Navigation)
    const roleConfig = {
        analyst: { showExceptions: false, showPrecedents: true, showFullLogic: false },
        senior: { showExceptions: true, showPrecedents: true, showFullLogic: true },
        compliance: { showExceptions: false, showPrecedents: false, showFullLogic: true },
        manager: { showExceptions: false, showPrecedents: true, showFullLogic: false }
    };
    
    const config = roleConfig[currentRole];
    // Apply role-based filtering to queries and displays
    console.log('Role changed to:', currentRole, config);
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

function handleQuery() {
    const queryInput = document.getElementById('queryInput');
    const query = queryInput.value.trim();
    
    if (!query) return;
    
    // Add user message
    addQueryMessage('user', query);
    queryInput.value = '';
    
    // Simulate response
    setTimeout(() => {
        const response = generateQueryResponse(query);
        addQueryMessage('bot', null, response);
    }, 500);
}

function addQueryMessage(type, text, structuredResponse = null) {
    const history = document.getElementById('queryHistory');
    const messageDiv = document.createElement('div');
    messageDiv.className = `query-message ${type}`;
    
    if (type === 'user') {
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-icon">👤</span>
                <span class="message-role">You</span>
            </div>
            <div class="message-content">
                <p>${text}</p>
            </div>
        `;
    } else {
        let content = '';
        
        if (structuredResponse && structuredResponse.structured) {
            content = `
                <div class="structured-output">
                    <h4>Structured Institutional Logic</h4>
                    ${Object.entries(structuredResponse.content).map(([key, value]) => {
                        const label = key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
                        return `
                            <div class="structured-item">
                                <strong>${label}:</strong>
                                <span>${Array.isArray(value) ? value.join(', ') : value}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
            `;
        } else {
            content = `<p>${structuredResponse?.text || 'I understand your query. Here is the relevant institutional logic...'}</p>`;
        }
        
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-icon">🤖</span>
                <span class="message-role">System</span>
            </div>
            <div class="message-content">
                ${content}
            </div>
        `;
    }
    
    history.appendChild(messageDiv);
    history.scrollTop = history.scrollHeight;
}

function generateQueryResponse(query) {
    const lowerQuery = query.toLowerCase();
    
    // Check for matching patterns
    for (const [pattern, response] of Object.entries(mockQueryResponses)) {
        if (lowerQuery.includes(pattern)) {
            return response;
        }
    }
    
    // Default response
    return {
        structured: true,
        content: {
            policies: 'Relevant policies found',
            procedures: 'Applicable procedures identified',
            evidence: 'Supporting evidence available',
            note: 'This is a demonstration response. In production, this would query the knowledge graph.'
        }
    };
}

// Graph Explorer (7.2)
function initializeGraphExplorer() {
    const zoomIn = document.getElementById('zoomIn');
    const zoomOut = document.getElementById('zoomOut');
    const resetView = document.getElementById('resetView');
    const filterType = document.getElementById('filterType');
    
    zoomIn.addEventListener('click', () => console.log('Zoom in'));
    zoomOut.addEventListener('click', () => console.log('Zoom out'));
    resetView.addEventListener('click', () => renderGraph());
    filterType.addEventListener('change', (e) => filterGraph(e.target.value));
}

function renderGraph() {
    const svg = document.getElementById('graphSvg');
    svg.innerHTML = '';
    
    const width = svg.clientWidth || 800;
    const height = 600;
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    
    // Render edges
    mockKnowledgeGraph.edges.forEach(edge => {
        const sourceNode = mockKnowledgeGraph.nodes.find(n => n.id === edge.source);
        const targetNode = mockKnowledgeGraph.nodes.find(n => n.id === edge.target);
        
        if (sourceNode && targetNode) {
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', sourceNode.x);
            line.setAttribute('y1', sourceNode.y);
            line.setAttribute('x2', targetNode.x);
            line.setAttribute('y2', targetNode.y);
            line.setAttribute('stroke', '#999');
            line.setAttribute('stroke-width', '2');
            svg.appendChild(line);
        }
    });
    
    // Render nodes
    mockKnowledgeGraph.nodes.forEach(node => {
        const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        
        // Node circle
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        circle.setAttribute('r', 30);
        circle.setAttribute('fill', getNodeColor(node.type));
        circle.setAttribute('stroke', '#000');
        circle.setAttribute('stroke-width', '2');
        circle.style.cursor = 'pointer';
        circle.addEventListener('click', () => selectGraphNode(node.id));
        nodeGroup.appendChild(circle);
        
        // Node label
        const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y + 50);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '12');
        text.setAttribute('fill', '#000');
        text.textContent = node.label.substring(0, 20);
        nodeGroup.appendChild(text);
        
        svg.appendChild(nodeGroup);
    });
}

function getNodeColor(type) {
    const colors = {
        policy: '#4a90e2',
        procedure: '#50c878',
        precedent: '#ff6b6b',
        evidence: '#9b59b6'
    };
    return colors[type] || '#999';
}

function filterGraph(type) {
    renderGraph(); // Re-render with filter applied
    console.log('Filtering by type:', type);
}

function selectGraphNode(nodeId) {
    console.log('Selected node:', nodeId);
    // Could switch to review view and show node details
}

// Decision Builder (7.3)
function initializeDecisionBuilder() {
    const blocks = document.querySelectorAll('.block-item');
    const canvas = document.getElementById('workspaceCanvas');
    
    blocks.forEach(block => {
        block.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', block.dataset.type);
        });
    });
    
    canvas.addEventListener('dragover', (e) => {
        e.preventDefault();
    });
    
    canvas.addEventListener('drop', (e) => {
        e.preventDefault();
        const blockType = e.dataTransfer.getData('text/plain');
        addBlockToCanvas(blockType, e.offsetX, e.offsetY);
    });
}

function addBlockToCanvas(type, x, y) {
    const canvas = document.getElementById('workspaceCanvas');
    const hint = canvas.querySelector('.workspace-hint');
    if (hint) hint.remove();
    
    const block = document.createElement('div');
    block.className = 'workspace-block';
    block.style.position = 'absolute';
    block.style.left = `${x}px`;
    block.style.top = `${y}px`;
    block.dataset.type = type;
    block.textContent = type.charAt(0).toUpperCase() + type.slice(1);
    block.addEventListener('click', () => selectBlock(block));
    
    canvas.appendChild(block);
}

function selectBlock(block) {
    document.querySelectorAll('.workspace-block').forEach(b => b.classList.remove('selected'));
    block.classList.add('selected');
    
    showBlockProperties(block.dataset.type);
}

function showBlockProperties(type) {
    const panel = document.getElementById('propertiesPanel');
    panel.innerHTML = `
        <div class="property-field">
            <label>Type</label>
            <input type="text" value="${type}" readonly>
        </div>
        <div class="property-field">
            <label>Name</label>
            <input type="text" placeholder="Enter name...">
        </div>
        <div class="property-field">
            <label>Value</label>
            <input type="text" placeholder="Enter value...">
        </div>
        <div class="property-field">
            <label>Evidence Reference</label>
            <input type="text" placeholder="Link to evidence...">
        </div>
        <div class="property-field">
            <label>Applicability Conditions</label>
            <textarea placeholder="Define conditions..."></textarea>
        </div>
    `;
}

// Review & Evidence View (7.4)
function initializeReviewView() {
    const nodeItems = document.querySelectorAll('.node-item');
    nodeItems.forEach(item => {
        item.addEventListener('click', () => {
            const nodeId = item.dataset.node;
            selectReviewNode(nodeId);
            
            nodeItems.forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
        });
    });
}

function selectReviewNode(nodeId) {
    selectedNode = nodeId;
    const details = mockNodeDetails[nodeId];
    
    if (!details) {
        document.getElementById('detailTitle').textContent = 'Node details not available';
        return;
    }
    
    document.getElementById('detailTitle').textContent = details.title;
    
    // Render evidence
    const evidenceList = document.getElementById('evidenceList');
    if (details.evidence && details.evidence.length > 0) {
        evidenceList.innerHTML = details.evidence.map(ev => `
            <div class="evidence-item">
                <strong>${ev.source}</strong>
                ${ev.section ? `<span>Section: ${ev.section}</span>` : ''}
                ${ev.date ? `<span>Date: ${ev.date}</span>` : ''}
                ${ev.author ? `<span>Author: ${ev.author}</span>` : ''}
            </div>
        `).join('');
    } else {
        evidenceList.innerHTML = '<p class="empty-state">No evidence references available</p>';
    }
    
    // Render lineage
    const lineageInfo = document.getElementById('lineageInfo');
    lineageInfo.innerHTML = `
        <div class="lineage-item">
            <strong>Author:</strong> ${details.lineage.author}
        </div>
        <div class="lineage-item">
            <strong>Created:</strong> ${details.lineage.created}
        </div>
        <div class="lineage-item">
            <strong>Last Modified:</strong> ${details.lineage.lastModified} by ${details.lineage.modifiedBy}
        </div>
        <div class="lineage-item">
            <strong>Rationale:</strong> ${details.lineage.rationale}
        </div>
    `;
    
    // Render version history
    const versionHistory = document.getElementById('versionHistory');
    if (details.versions && details.versions.length > 0) {
        versionHistory.innerHTML = details.versions.map(v => `
            <div class="version-item">
                <div class="version-info">
                    <strong>Version ${v.version}</strong>
                    <div>${v.changes}</div>
                    <div class="version-date">By ${v.author}</div>
                </div>
                <div class="version-date">${v.date}</div>
            </div>
        `).join('');
    } else {
        versionHistory.innerHTML = '<p class="empty-state">No version history available</p>';
    }
    
    // Render approval workflow
    const approvalWorkflow = document.getElementById('approvalWorkflow');
    if (details.approvals && details.approvals.length > 0) {
        approvalWorkflow.innerHTML = details.approvals.map(a => `
            <div class="approval-step ${a.status}">
                <div>
                    <strong>${a.step}</strong>
                    ${a.approver ? `<div>Approver: ${a.approver}</div>` : ''}
                </div>
                <div>
                    <span class="node-status ${a.status}">${a.status}</span>
                    ${a.date ? `<div class="version-date">${a.date}</div>` : ''}
                </div>
            </div>
        `).join('');
    } else {
        approvalWorkflow.innerHTML = '<p class="empty-state">No approval workflow available</p>';
    }
}

