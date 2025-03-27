/** @typedef {import('../src/message.js').DevvitMessage} DevvitMessage */
/** @typedef {import('../src/message.js').WebViewMessage} WebViewMessage */

class App {
  constructor() {
    // Cache static UI elements
    this.usernameLabel = document.getElementById('username');
    this.militaryEl = document.getElementById('military');
    this.economyEl = document.getElementById('economy');
    this.healthcareEl = document.getElementById('healthcare');
    this.welfareEl = document.getElementById('welfare');
    this.educationEl = document.getElementById('education');
    this.technologyEl = document.getElementById('technology');
    this.overallEl = document.getElementById('overall');
    this.eventHistoryEl = document.getElementById('eventHistory');
    this.lawHistoryEl = document.getElementById('lawHistory');
    this.executiveOrderHistoryEl = document.getElementById('executiveOrderHistory');
    this.proposedLawListEl = document.getElementById('proposedLawList');
    this.pollResultsEl = document.getElementById('pollResults');
    this.messageOutput = document.getElementById('messageOutput');

    // Navigation setup: attach click listeners to nav links
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.getAttribute('data-page');
        this.showPage(page);
      });
    });
    
    // Initially show Dashboard
    this.showPage('dashboard');
    
    // Button handlers for Dashboard and Laws pages.
    const simulateEventBtn = document.getElementById('simulateEvent');
    if (simulateEventBtn) {
      simulateEventBtn.addEventListener('click', () => {
        postWebViewMessage({ type: 'simulateEvent' });
      });
    }
    const draftLawBtn = document.getElementById('draftLaw');
    if (draftLawBtn) {
      draftLawBtn.addEventListener('click', () => {
        const lawInput = document.getElementById('lawInput');
        const law = lawInput ? lawInput.value : "";
        if (law) {
          postWebViewMessage({ type: 'draftLaw', data: { law } });
        }
      });
    }
    const passLawBtn = document.getElementById('passLaw');
    if (passLawBtn) {
      passLawBtn.addEventListener('click', () => {
        const lawIdInput = document.getElementById('lawIdInput');
        const lawId = lawIdInput ? lawIdInput.value : "";
        if (lawId) {
          postWebViewMessage({ type: 'passLawByPresident', data: { lawId } });
        }
      });
    }
    const vetoLawBtn = document.getElementById('vetoLaw');
    if (vetoLawBtn) {
      vetoLawBtn.addEventListener('click', () => {
        const lawIdInput = document.getElementById('lawIdInput');
        const lawId = lawIdInput ? lawIdInput.value : "";
        if (lawId) {
          postWebViewMessage({ type: 'vetoLawByPresident', data: { lawId } });
        }
      });
    }
    const issueExecOrderBtn = document.getElementById('issueExecOrder');
    if (issueExecOrderBtn) {
      issueExecOrderBtn.addEventListener('click', () => {
        const orderInput = document.getElementById('execOrderInput');
        const effectsInput = document.getElementById('execOrderEffects');
        let effects;
        try {
          effects = JSON.parse(effectsInput.value);
        } catch (e) {
          alert("Please enter valid JSON for effects.");
          return;
        }
        const description = orderInput.value;
        if (description && effects) {
          postWebViewMessage({ type: 'executiveOrder', data: { description, effects } });
        }
      });
    }
    
    // Listen for messages from Devvit
    window.addEventListener('message', this.onMessage.bind(this));
    
    // When window loads, notify Devvit and start polling for updates
    window.addEventListener('load', () => {
      postWebViewMessage({ type: 'webViewReady' });
      setInterval(() => {
        postWebViewMessage({ type: 'getGameState' });
      }, 5000);
    });
  }
  
  // Show only the requested page section.
  showPage(page) {
    document.querySelectorAll('.page-section').forEach(section => {
      section.style.display = 'none';
    });
    const activeSection = document.getElementById(page);
    if (activeSection) {
      activeSection.style.display = 'block';
    }
  }
  
  onMessage(ev) {
    if (ev.data.type !== 'devvit-message') return;
    const { message } = ev.data.data;
    this.outputMessage(JSON.stringify(message, null, 2));
    if (message.type === 'initialData' || message.type === 'updateGameState') {
      // Expecting initial data to include a 'role' property.
      this.updateUI(message.data.gameState, message.data.username, message.data.role);
    }
  }
  
  /**
   * Updates UI based on the game state, username, and user role.
   * Role-based visibility is applied here.
   */
  updateUI(state, username, role) {
    if (username) {
      this.usernameLabel.innerText = username;
    }
    if (this.militaryEl) this.militaryEl.innerText = state.statistics.military;
    if (this.economyEl) this.economyEl.innerText = state.statistics.economy;
    if (this.healthcareEl) this.healthcareEl.innerText = state.statistics.healthcare;
    if (this.welfareEl) this.welfareEl.innerText = state.statistics.welfare;
    if (this.educationEl) this.educationEl.innerText = state.statistics.education;
    if (this.technologyEl) this.technologyEl.innerText = state.statistics.technology;
    
    const stats = Object.values(state.statistics);
    const overall = Math.round(stats.reduce((a, b) => a + b, 0) / stats.length);
    if (this.overallEl) this.overallEl.innerText = overall;
    if (this.eventHistoryEl) {
      this.eventHistoryEl.innerHTML = state.eventHistory.map(e => `<p>${e}</p>`).join('');
    }
    // Update finalized law history (visible to all roles).
    if (this.lawHistoryEl) {
      this.lawHistoryEl.innerHTML = state.lawHistory.map(l => `<p>${l}</p>`).join('');
    }
    
    // Update executive order history (visible to all roles).
    if (this.executiveOrderHistoryEl) {
      const executiveOrders = state.eventHistory.filter(e => e.startsWith("[EXECUTIVE ORDER]"));
      this.executiveOrderHistoryEl.innerHTML = executiveOrders.map(e => `<p>${e}</p>`).join('');
    }
    
    // Update proposed laws list (only visible to senators and admins).
    if (this.proposedLawListEl) {
      if (role === "senator" || role === "admin") {
        const proposedLaws = state.laws.filter(law =>
          law.status === "pending" || law.status === "awaiting_president"
        );
        this.proposedLawListEl.innerHTML = proposedLaws.map(law => {
          return `
            <div class="law-item" style="border-bottom: 1px solid #ddd; padding: 0.5rem 0;">
              <p>
                <strong>ID:</strong> ${law.id}<br>
                <strong>Text:</strong> ${law.text}<br>
                <strong>Status:</strong> ${law.status}<br>
                <strong>Votes For:</strong> ${law.votesFor} &nbsp; 
                <strong>Votes Against:</strong> ${law.votesAgainst}
              </p>
              <button class="vote-law-yes" data-law-id="${law.id}">Vote Yes</button>
              <button class="vote-law-no" data-law-id="${law.id}">Vote No</button>
            </div>
          `;
        }).join('');
        // Attach vote handlers
        document.querySelectorAll('.vote-law-yes').forEach(button => {
          button.addEventListener('click', () => {
            const lawId = button.getAttribute('data-law-id');
            postWebViewMessage({ type: 'voteOnLaw', data: { lawId, vote: true } });
          });
        });
        document.querySelectorAll('.vote-law-no').forEach(button => {
          button.addEventListener('click', () => {
            const lawId = button.getAttribute('data-law-id');
            postWebViewMessage({ type: 'voteOnLaw', data: { lawId, vote: false } });
          });
        });
        // Show the proposal section.
        document.getElementById('proposalSection').style.display = "block";
      } else {
        // For President and Citizens, hide proposed law list.
        this.proposedLawListEl.innerHTML = "";
        document.getElementById('proposalSection').style.display = "none";
      }
    }
    
    // Role-based visibility for presidential actions.
    if (document.getElementById('presidentLawActions')) {
      if (role === "president" || role === "admin") {
        document.getElementById('presidentLawActions').style.display = "block";
      } else {
        document.getElementById('presidentLawActions').style.display = "none";
      }
    }
    
    // Role-based visibility for executive order controls.
    if (document.getElementById('execOrderControls')) {
      if (role === "president" || role === "admin") {
        document.getElementById('execOrderControls').style.display = "block";
      } else {
        document.getElementById('execOrderControls').style.display = "none";
      }
    }
    
    // Polls section remains unchanged.
    if (this.pollResultsEl) {
      let pollsHtml = '<h3>Senator Votes</h3>';
      for (const [name, votes] of Object.entries(state.polls.senatorVotes)) {
        pollsHtml += `<p>${name}: ${votes}</p>`;
      }
      pollsHtml += '<h3>President Votes</h3>';
      for (const [name, votes] of Object.entries(state.polls.presidentVotes)) {
        pollsHtml += `<p>${name}: ${votes}</p>`;
      }
      this.pollResultsEl.innerHTML = pollsHtml;
    }
  }
  
  outputMessage(msg) {
    if (this.messageOutput) this.messageOutput.innerText = msg;
  }
}

function postWebViewMessage(msg) {
  parent.postMessage(msg, '*');
}

// Initialize the app after the DOM is fully loaded.
document.addEventListener('DOMContentLoaded', () => {
  new App();
});