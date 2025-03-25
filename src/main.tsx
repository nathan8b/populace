import './createPost.tsx';
import { Devvit, useState, useWebView } from '@devvit/public-api';
import type { DevvitMessage, WebViewMessage } from './message.js';
import * as simulation from './simulation.js';

// 🔐 Define the OpenAI API key as a secret
Devvit.addSettings([
  {
    name: 'open-ai-api-key',
    label: 'OpenAI API Key',
    type: 'string',
    isSecret: true,
    scope: 'app',
  },
]);

Devvit.configure({
  redditAPI: true,
  redis: true,
});

// Add a custom post type for the r/populace Simulator.
Devvit.addCustomPostType({
  name: 'r/populace Simulator',
  height: 'tall',
  render: (context) => {
    // Retrieve the current authenticated username.
    const [username] = useState(async () => {
      return (await context.reddit.getCurrentUsername()) ?? 'anon';
    });

    // Assign a role based on the username.
    const [role] = useState(async () => {
      const currentUser = await context.reddit.getCurrentUsername();
      // Hard-code admin assignment for the two specified usernames.
      if (currentUser === 'ban8_' || currentUser === 'PlanktonOk3398') {
        return 'admin';
      }
      // You can insert additional logic here to assign president, senator, etc.
      return 'citizen';
    });

    // Load or initialize the game state from Redis.
    const [gameState, setGameState] = useState(async () => {
      const storedState = await context.redis.get('gameState');
      if (storedState) {
        return JSON.parse(storedState);
      } else {
        const defaultState = simulation.getDefaultState();
        await context.redis.set('gameState', JSON.stringify(defaultState));
        return defaultState;
      }
    });

    // Set up the web view.
    const webView = useWebView<WebViewMessage, DevvitMessage>({
      url: 'page.html',
      async onMessage(message, webView) {
        let updatedState;
        switch (message.type) {
          case 'webViewReady':
            webView.postMessage({
              type: 'initialData',
              data: { username, role, gameState },
            });
            break;
          case 'getGameState':
            webView.postMessage({
              type: 'updateGameState',
              data: { username, role, gameState },
            });
            break;
          case 'simulateEvent':
            updatedState = await simulation.simulateEvent(context.redis, gameState);
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { username, role, gameState: updatedState },
            });
            break;
          case 'draftLaw':
            updatedState = await simulation.draftLaw(context.redis, gameState, message.data.law);
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { username, role, gameState: updatedState },
            });
            break;
          case 'voteOnLaw':
            updatedState = await simulation.voteOnLaw(
              context.redis,
              gameState,
              username,
              message.data.lawId,
              message.data.vote
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { username, role, gameState: updatedState },
            });
            break;
          case 'voteSenator':
            updatedState = await simulation.voteSenator(
              context.redis,
              gameState,
              username,
              message.data.candidate
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { username, role, gameState: updatedState },
            });
            break;
          case 'votePresident':
            updatedState = await simulation.votePresident(
              context.redis,
              gameState,
              username,
              message.data.candidate
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { username, role, gameState: updatedState },
            });
            break;
          case 'voteImpeach':
            updatedState = await simulation.voteToImpeach(
              context.redis,
              gameState,
              username,
              message.data.vote
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { username, role, gameState: updatedState },
            });
            break;
          case 'passLawByPresident':
            updatedState = await simulation.passLawByPresident(
              context.redis,
              gameState,
              username,
              message.data.lawId
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { username, role, gameState: updatedState },
            });
            break;
          case 'vetoLawByPresident':
            updatedState = await simulation.vetoLawByPresident(
              context.redis,
              gameState,
              username,
              message.data.lawId
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { username, role, gameState: updatedState },
            });
            break;
          case 'executiveOrder':
            updatedState = await simulation.executiveOrder(
              context.redis,
              gameState,
              username,
              message.data
            );
            setGameState(updatedState);
            webView.postMessage({
              type: 'updateGameState',
              data: { username, role, gameState: updatedState },
            });
            break;
          default:
            throw new Error(`Unknown message type: ${message.type}`);
        }
      },
      onUnmount() {
        context.ui.showToast('r/populace Simulator closed!');
      },
    });
    
    // Render the custom post type UI.
    return (
      <vstack grow padding="small">
        <vstack grow alignment="middle center">
          <text size="xlarge" weight="bold">
            r/populace Simulator
          </text>
          <spacer />
          <vstack alignment="start middle">
            <hstack>
              <text size="medium">Username:</text>
              <text size="medium" weight="bold"> {username ?? ''}</text>
            </hstack>
            <hstack>
              <text size="medium">Role:</text>
              <text size="medium" weight="bold"> {role ?? ''}</text>
            </hstack>
          </vstack>
          <spacer />
          <button onPress={() => webView.mount()}>Launch Simulator</button>
        </vstack>
      </vstack>
    );
  },
});

export default Devvit;