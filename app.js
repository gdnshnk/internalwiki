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
    initializeQueryInterface();
});

// Simplified - no navigation needed for Grokipedia-style design

// Query Interface
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
    
    const now = new Date();
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
            content = `
                <p class="message-text">${text}</p>
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
            content = `<p class="message-text">${structuredResponse?.text || 'I understand your query. Here is the relevant institutional logic...'}</p>`;
        }
        
        messageDiv.innerHTML = `
            <div class="message-content">
                ${content}
                <p class="message-meta">Response generated</p>
            </div>
            <div class="message-time">${timeStr}</div>
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

// Removed complex views - keeping only query interface for Grokipedia-style design

