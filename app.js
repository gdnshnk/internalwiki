// API Configuration
const API_BASE_URL = 'http://localhost:3000/api';

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

async function handleQuery() {
    const queryInput = document.getElementById('queryInput');
    const query = queryInput.value.trim();
    
    if (!query) return;
    
    // Add user message
    addQueryMessage('user', query);
    queryInput.value = '';
    
    try {
        // Call backend API
        const response = await fetch(`${API_BASE_URL}/query`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                query: query,
                role: 'analyst' // Default role, can be made dynamic
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

// handleQuery moved above - now calls backend API

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

// Query generation now handled by backend API

// Removed complex views - keeping only query interface for Grokipedia-style design

