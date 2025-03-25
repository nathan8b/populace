/** @typedef {import('../src/message.js').DevvitMessage} DevvitMessage */
/** @typedef {import('../src/message.js').WebViewMessage} WebViewMessage */

class App {
  constructor() {
    // Cache UI elements
    this.usernameLabel = document.querySelector('#username');
    this.militaryEl = document.querySelector('#military');
    this.economyEl = document.querySelector('#economy');
    this.healthcareEl = document.querySelector('#healthcare');
    this.welfareEl = document.querySelector('#welfare');
    this.educationEl = document.querySelector('#education');
    this.technologyEl = document.querySelector('#technology');
    this.overallEl = document.querySelector('#overall');
    this.eventHistoryEl = document.querySelector('#eventHistory');
    this.lawHistoryEl = document.querySelector('#lawHistory');
    this.pollResultsEl = document.querySelector('#pollResults');
    this.messageOutput = document.querySelector('#messageOutput');

    // Button handlers
    document.querySelector('#simulateEvent').addEventListener('click', () => {
      postWebViewMessage({ type: 'simulateEvent' });
    });
    document.querySelector('#draftLaw').addEventListener('click', () => {
      const law = document.querySelector('#lawInput').value;
      if (law) {
        postWebViewMessage({ type: 'draftLaw', data: { law } });
      }
    });
    document.querySelector('#voteLawYes').addEventListener('click', () => {
      const lawId = document.querySelector('#lawIdInput').value;
      if (lawId) {
        postWebViewMessage({ type: 'voteOnLaw', data: { lawId, vote: true } });
      }
    });
    document.querySelector('#voteLawNo').addEventListener('click', () => {
      const lawId = document.querySelector('#lawIdInput').value;
      if (lawId) {
        postWebViewMessage({ type: 'voteOnLaw', data: { lawId, vote: false } });
      }
    });
    document.querySelector('#voteSenator').addEventListener('click', () => {
      const candidate = document.querySelector('#senatorInput').value;
      if (candidate) {
        postWebViewMessage({ type: 'voteSenator', data: { candidate } });
      }
    });
    document.querySelector('#votePresident').addEventListener('click', () => {
      const candidate = document.querySelector('#presidentInput').value;
      if (candidate) {
        postWebViewMessage({ type: 'votePresident', data: { candidate } });
      }
    });
    document.querySelector('#protest').addEventListener('click', () => {
      postWebViewMessage({ type: 'protest', data: { protestAmount: 10 } });
    });
    document.querySelector('#coup').addEventListener('click', () => {
      postWebViewMessage({ type: 'joinCoup', data: { coupAmount: 20 } });
    });

    // Navigation handling: show/hide page sections based on nav clicks
    document.querySelectorAll('.nav-link').forEach(link => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const page = link.getAttribute('data-page');
        this.showPage(page);
      });
    });
    
    // Initially show the dashboard
    this.showPage('dashboard');

    // Listen for messages from Devvit
    addEventListener('message', this.onMessage.bind(this));

    // Notify Devvit that the web view is ready and start polling for updates
    window.addEventListener('load', () => {
      postWebViewMessage({ type: 'webViewReady' });
      setInterval(() => {
        postWebViewMessage({ type: 'getGameState' });
      }, 5000);
    });
  }

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
      this.updateUI(message.data.gameState, message.data.username);
    }
  }
  
  updateUI(state, username) {
    if (username) {
      this.usernameLabel.innerText = username;
    }
    this.militaryEl.innerText = state.statistics.military;
    this.economyEl.innerText = state.statistics.economy;
    this.healthcareEl.innerText = state.statistics.healthcare;
    this.welfareEl.innerText = state.statistics.welfare;
    this.educationEl.innerText = state.statistics.education;
    this.technologyEl.innerText = state.statistics.technology;
    const stats = Object.values(state.statistics);
    const overall = Math.round(stats.reduce((a, b) => a + b, 0) / stats.length);
    this.overallEl.innerText = overall;
    this.eventHistoryEl.innerHTML = state.eventHistory.map(e => `<p>${e}</p>`).join('');
    this.lawHistoryEl.innerHTML = state.lawHistory.map(l => `<p>${l}</p>`).join('');
    
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
  
  outputMessage(msg) {
    this.messageOutput.innerText = msg;
  }
}

function postWebViewMessage(msg) {
  parent.postMessage(msg, '*');
}

new App();